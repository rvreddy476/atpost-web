/**
 * What the search box offers while somebody types, as data.
 *
 * Pure — no React, no network, no DOM — because every rule here is one that
 * fails silently: a suggestion list that shows the same word twice, a keyboard
 * index that walks off the end, a debounce that fires for a query the person
 * has already replaced. ./suggest.test.ts is the assertion.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE SERVER ACTUALLY SUGGESTS, AND WHAT IT DOES NOT
 *
 * `GET /v1/search/autocomplete?q=&limit=&kinds=` is search-service's, and it
 * is worth being precise about what comes back, because it is NOT what a video
 * app's box suggests on other platforms:
 *
 *     {"data":{"results":[{kind, user_id, username, display_name,
 *                          hashtag, community_id, handle, name}]}}
 *
 * `kind` is "user", "hashtag" or "community". There are NO video titles in
 * this index and no channel index behind it either — `searchVideos` in
 * ../tube/channelApi.ts records that `/v1/search?types=channels` answers empty
 * for every query on this stack, which is why the results page asks
 * post-service directly.
 *
 * So a suggestion here is a WORD, not a destination. Choosing one runs the
 * ordinary Tube search for that word, which does hit videos and channels. A
 * suggestion that jumped straight to a user's profile would take somebody out
 * of Tube on a keystroke, and a suggestion that pretended to be a video would
 * be a promise the index cannot keep. `TubeSuggestion.kind` is carried so the
 * list can SAY which is which, which is the honest middle.
 *
 * Two more facts about that endpoint that shape the client:
 *
 *   · it is rate limited to 60 requests a minute per caller and FAILS CLOSED
 *     on a Redis error — a 429 with `Retry-After: 60`. So the box debounces
 *     hard, does not ask for one or two characters, and treats a failure as
 *     "no suggestions" rather than as an error worth a red box.
 *   · it is PUBLIC. Suggestions work signed out; only the recent-search list
 *     needs a session.
 *
 * ── Recent searches, and the delete that is not there ─────────────────────
 * `GET /v1/search/history?limit=` answers `{"data":{"items":[{id, user_id,
 * query, searched_at}]}}`, capped at 20 by the server whatever is asked for.
 * `DELETE /v1/search/history` clears the WHOLE list; there is no per-row
 * delete — `DELETE /v1/search/saved/{id}` is a different feature (saved
 * searches, which this app does not have). So the list offers "Clear" and not
 * a cross on each row, because a cross that wiped nineteen other rows would be
 * the worst possible way to learn that. Flagged in the handover.
 */

/** One row of the autocomplete response. Every field optional on the wire. */
export interface AutocompleteRow {
  kind?: string
  user_id?: string
  username?: string
  display_name?: string
  hashtag?: string
  community_id?: string
  handle?: string
  name?: string
}

/** One row of the search-history response. */
export interface SearchHistoryRow {
  id?: string
  query?: string
  searched_at?: string
}

export type SuggestionKind = "recent" | "user" | "hashtag" | "community"

export interface TubeSuggestion {
  /** React key, and the only thing that has to be unique. */
  key: string
  /** The words that go in the box and onto the wire. */
  text: string
  kind: SuggestionKind
  /** The short word beside it — "Recent", "Channel", "Tag". Never null. */
  badge: string
}

/** The word shown beside a suggestion, so the list says what each row is. */
export function badgeFor(kind: SuggestionKind): string {
  switch (kind) {
    case "recent":
      return "Recent"
    case "user":
      // "Creator" and not "User": in Tube's vocabulary the thing you search
      // for is somebody who publishes. ../tube/video.ts keeps the same rule
      // about channel-before-author.
      return "Creator"
    case "hashtag":
      return "Tag"
    case "community":
      return "Community"
  }
}

/**
 * The text of one autocomplete row, or null when there is nothing to offer.
 *
 * The field to read depends on `kind`, and the order within each kind is the
 * one a person would recognise: a display name before a username, a
 * community's name before its handle. A row whose every candidate field is
 * empty is dropped rather than rendered blank — a suggestion with no words is
 * a row that does nothing when pressed.
 *
 * A hashtag's leading "#" is normalised OFF. The index stores them both ways
 * depending on how they were written, and a list showing "cats" and "#cats" as
 * two rows for one tag is a list that looks broken.
 */
export function suggestionText(row: AutocompleteRow | null | undefined): string | null {
  if (!row) return null
  const pick = (...candidates: (string | undefined)[]): string | null => {
    for (const candidate of candidates) {
      const text = (candidate ?? "").trim()
      if (text.length > 0) return text
    }
    return null
  }
  switch (row.kind) {
    case "hashtag": {
      const tag = pick(row.hashtag, row.name)
      return tag ? tag.replace(/^#+/, "").trim() || null : null
    }
    case "community":
      return pick(row.name, row.handle)
    case "user":
      return pick(row.display_name, row.username, row.handle)
    default:
      // An unrecognised kind is still a row with words on it, and the words
      // are what this list is for. Better to offer it than to drop a
      // suggestion because the server grew a fourth kind.
      return pick(row.display_name, row.name, row.username, row.hashtag, row.handle)
  }
}

/** A row's kind, narrowed to the four this list knows. */
export function suggestionKind(row: AutocompleteRow | null | undefined): SuggestionKind {
  switch (row?.kind) {
    case "hashtag":
      return "hashtag"
    case "community":
      return "community"
    default:
      return "user"
  }
}

/**
 * The autocomplete response as a list this box can draw.
 *
 * De-duplicated on the TEXT and case-insensitively, because the index really
 * does return a user called "Cats" and a hashtag called "#cats" for the same
 * prefix — and both, pressed, run exactly the same search. Two rows that do
 * the same thing is a list that wastes an arrow key. The FIRST occurrence
 * wins, so the server's own ranking is preserved.
 */
export function parseSuggestions(body: unknown): TubeSuggestion[] {
  const data = (body as { data?: { results?: unknown } } | null | undefined)?.data
  const rows = data?.results
  if (!Array.isArray(rows)) return []

  const seen = new Set<string>()
  const out: TubeSuggestion[] = []
  for (const raw of rows) {
    const text = suggestionText(raw as AutocompleteRow)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const kind = suggestionKind(raw as AutocompleteRow)
    out.push({ key: `s:${key}`, text, kind, badge: badgeFor(kind) })
  }
  return out
}

/**
 * The search-history response as recent searches.
 *
 * De-duplicated the same way, and for a sharper reason: the server stores one
 * row per SEARCH, not per distinct query, so somebody who looked for "cats"
 * three times has three rows. Newest first is the server's order and it is
 * kept, so the de-duplication leaves the most recent copy.
 */
export function parseRecent(body: unknown): TubeSuggestion[] {
  const data = (body as { data?: { items?: unknown } } | null | undefined)?.data
  const rows = data?.items
  if (!Array.isArray(rows)) return []

  const seen = new Set<string>()
  const out: TubeSuggestion[] = []
  for (const raw of rows) {
    const text = ((raw as SearchHistoryRow)?.query ?? "").trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ key: `r:${key}`, text, kind: "recent", badge: badgeFor("recent") })
  }
  return out
}

/* ── When to ask, and what to show ────────────────────────────────────────── */

/**
 * The shortest query worth a request.
 *
 * Two, not one. A single letter matches a large fraction of the index, the
 * answer is nearly useless, and the endpoint is rate limited to 60 a minute
 * per caller — so one-letter queries would spend the budget on the least
 * useful suggestions somebody can get.
 */
export const MIN_QUERY = 2

/** How long the box waits after the last keystroke. See `shouldSuggest`. */
export const DEBOUNCE_MS = 200

/**
 * Is this query worth asking the server about?
 *
 * Trimmed first, because search-service trims before deciding a query is
 * empty — the same rule `normalizeTubeQuery` applies in ./search.ts, restated
 * here rather than reimplemented differently.
 */
export function shouldSuggest(query: string): boolean {
  return query.trim().length >= MIN_QUERY
}

/**
 * What the listbox shows, given what has been typed and what is known.
 *
 * Two states and no blend:
 *
 *   · EMPTY BOX → recent searches, which is the only thing there is to offer
 *     and the thing a person opening a search box usually wants.
 *   · TYPING → the server's suggestions, plus any RECENT search that matches
 *     what has been typed, on top. A recent search is a stronger signal than
 *     a stranger's username — it is a thing this person actually looked for —
 *     and burying it under ten autocomplete rows means somebody re-typing a
 *     query they made yesterday.
 *
 * Capped at `limit`, and the cap counts both sources: a listbox longer than
 * the space under the box is a listbox whose last rows are off screen with no
 * scrollbar to say so.
 */
export function visibleSuggestions(
  query: string,
  recent: readonly TubeSuggestion[],
  suggested: readonly TubeSuggestion[],
  limit = 8
): TubeSuggestion[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed.length === 0) return recent.slice(0, limit)

  const matchingRecent = recent.filter(
    (row) => row.text.toLowerCase().includes(trimmed) && row.text.toLowerCase() !== trimmed
  )
  const seen = new Set(matchingRecent.map((row) => row.text.toLowerCase()))
  const rest = suggested.filter((row) => !seen.has(row.text.toLowerCase()))
  return [...matchingRecent, ...rest].slice(0, limit)
}

/**
 * Which row the arrow keys move to.
 *
 * -1 means "nothing is highlighted and the box's own text is what Enter
 * searches for", which is a real state and not an error: a combobox that
 * forced a selection would stop somebody searching for a word the server did
 * not suggest.
 *
 * Down from -1 goes to the first row; up from -1 goes to the LAST, which is
 * what somebody pressing Up to reach the bottom of a list means. Both ends
 * wrap back through -1 rather than straight round, so there is always a way
 * back to what was typed without deleting anything — the property a list that
 * wrapped directly from last to first would take away.
 */
export function nextSuggestionIndex(
  current: number,
  count: number,
  key: "ArrowDown" | "ArrowUp"
): number {
  if (count <= 0) return -1
  if (key === "ArrowDown") return current >= count - 1 ? -1 : current + 1
  return current <= -1 ? count - 1 : current - 1
}
