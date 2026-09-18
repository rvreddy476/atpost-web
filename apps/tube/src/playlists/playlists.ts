/**
 * What a playlist is on this gateway, and why "Watch later" is one of them.
 *
 * Pure — no React, no network, no DOM — for the reason ../tube/video.ts is:
 * every rule here fails SILENTLY when it is wrong. A find-or-create that
 * matches on the wrong string creates a second Watch later every time the row
 * is opened; a title fallback that guesses draws "undefined" down a column; an
 * ordering that trusts the server's array rather than `position` puts episode
 * nine before episode two. None of those throw and all of them are arithmetic.
 * ./playlists.test.ts is the assertion.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WATCH LATER IS A RESERVED PLAYLIST, AND THAT IS A DECISION
 *
 * There is no watch-later route on this gateway. Not a 404 to be fixed — no
 * table, no handler, nothing. The rail's brief asks for the row anyway, and
 * the honest ways to build it are three:
 *
 *   · BROWSER STORAGE. Rejected. It is not the same list on a phone and a
 *     laptop, it dies with a cleared cache, and the row would be the only
 *     thing in this app that silently means "on this device". Somebody who
 *     saved six videos on their desktop and opens Tube on a tablet would
 *     conclude the platform lost them.
 *
 *   · BOOKMARKS. Rejected, and this is the interesting one. `POST /v1/posts/
 *     {id}/bookmark` exists, it is per-account, it works today — and it is
 *     ALREADY the Saved row, written by the watch page's Save button. Making
 *     Watch later a second name for it would give one list two words in one
 *     rail, which is exactly what `cardLabel` in ../tube/video.ts refuses to
 *     do with "Watch" and "Expand". Save and Watch later are different acts:
 *     one is a keepsake, the other is a queue you intend to empty.
 *
 *   · A RESERVED PLAYLIST. Chosen. `POST /v1/playlists`, `GET /v1/creators/
 *     {viewer}/playlists`, `POST /v1/playlists/{id}/items` and
 *     `DELETE /v1/playlists/{id}/items/{postId}` are all real, all
 *     session-scoped, all verified in post-service's video_series_handler.go.
 *     A playlist whose title is WATCH_LATER_TITLE is a real server-side list:
 *     it survives a reload, it is the same on every device, and it is
 *     ordinary enough that the Playlists page can show it beside the others
 *     rather than hiding a magic row.
 *
 * ── What the choice costs, stated rather than hidden ──────────────────────
 *
 *   · A viewer could create their own playlist called "Watch later" and the
 *     two would be one list. That is a merge rather than a loss, and
 *     `findWatchLater` matches case-insensitively on the trimmed title
 *     precisely so the merge is predictable instead of producing a second
 *     hidden list beside theirs.
 *
 *   · It is created `visibility: "private"`. `GET /v1/playlists/{id}` honours
 *     that for a stranger — but `GET /v1/creators/{id}/playlists` does NOT
 *     filter by visibility (ListPlaylistsByCreator, post-service), so a
 *     private playlist's TITLE and item count are readable by anybody who
 *     knows the creator's user id. Its contents are not. That is a server
 *     gap, it is flagged in the handover, and it is why the Playlists page
 *     says "Private" on a row rather than implying nobody can see it exists.
 *
 *   · There is no rename and no visibility PATCH. A playlist is created,
 *     added to, removed from and deleted; nothing else. The UI offers
 *     nothing else for the same reason a dark rail row carries a sentence.
 */

/**
 * The reserved title, matched case-insensitively and created exactly.
 *
 * One constant, because the find and the create must agree to the character:
 * a create that writes "Watch Later" and a find that looks for "Watch later"
 * makes a new list on every single press.
 */
export const WATCH_LATER_TITLE = "Watch later"

/** What a playlist row looks like coming off the wire. Every field optional. */
export interface PlaylistRow {
  id?: string
  /** Some older rows have been seen with `playlist_id`; both are read. */
  playlist_id?: string
  creator_id?: string
  title?: string
  /** Not a field post-service sends, but cheap to tolerate. */
  name?: string
  description?: string
  cover_url?: string | null
  visibility?: string
  item_count?: number
  video_count?: number
  created_at?: string
  updated_at?: string
}

/** A playlist reduced to what a page can draw without guessing. */
export interface TubePlaylist {
  id: string
  title: string
  description: string
  /** "public" | "unlisted" | "private", lower-cased; "" when the row omits it. */
  visibility: string
  count: number
  /** True when this is the reserved queue, so a page can label it. */
  reserved: boolean
}

/* ── Reading a row ────────────────────────────────────────────────────────── */

/**
 * The id, from whichever field carries it.
 *
 * Null rather than "" for a row with neither, because a playlist with no id
 * has no page to open and no key to be listed under — `parsePlaylist` drops
 * it rather than rendering a link to `/playlists/undefined`.
 *
 * ── `??` was wrong here, and the bug it caused is worth writing down ──────
 * This read `row?.id ?? row?.playlist_id`, which falls through only on null
 * and undefined. An id of `""` is NEITHER: it is a present, falsy string, so
 * `??` returned it, the length check then rejected it, and a row carrying
 * `{id: "", playlist_id: "b"}` came back null — dropped from the list
 * entirely by `parsePlaylist`, with a usable id sitting right beside it.
 *
 * That is exactly the shape a Go service produces: a struct field with no
 * `omitempty` marshals its zero value rather than being absent, so "the field
 * is present and means nothing" is the ordinary case on this wire and not an
 * edge one. The rule is therefore the first NON-EMPTY candidate, which is the
 * same rule `suggestionText` in ../chrome/suggest.ts spells out with its own
 * `pick` — and the reason that one was written as a loop rather than a chain
 * of `??`.
 */
export function playlistId(row: PlaylistRow | null | undefined): string | null {
  for (const candidate of [row?.id, row?.playlist_id]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return null
}

/**
 * The title, or null when there is nothing to draw.
 *
 * Deliberately NOT "Untitled playlist". A video with no title is still a
 * video and gets the fallback `videoTitle` gives it; a playlist row with no
 * title is a row this client does not understand, and the honest answer is to
 * leave it out of the list rather than to invent a name for it. The old
 * `TubePlaylist` type in ../tube/channelApi.ts had the same rule and the same
 * note: the wire shape had never been observed, because every creator on the
 * dev stack has zero playlists.
 *
 * First NON-EMPTY candidate, not `title ?? name` — see `playlistId` above for
 * the bug that chain causes and why this wire produces it routinely. A row
 * with `{title: "", name: "Trip"}` is a row called Trip.
 */
export function playlistTitle(row: PlaylistRow | null | undefined): string | null {
  for (const candidate of [row?.title, row?.name]) {
    const title = typeof candidate === "string" ? candidate.trim() : ""
    if (title.length > 0) return title
  }
  return null
}

/**
 * How many videos, from whichever count the row carries. Never negative.
 *
 * First candidate that is a real count, and NOT `item_count ?? video_count`.
 * The same trap as `playlistId`, and sharper here because the empty value is
 * `0`: a Go `ItemCount int` with no `omitempty` marshals a zero, which is a
 * present, falsy, perfectly valid number — so `??` would keep it and a row
 * carrying `{item_count: 0, video_count: 4}` would read "No videos yet" over
 * four videos.
 *
 * Zero is not distinguished from absent, deliberately. Both mean "nothing to
 * count", `playlistCountLabel` says so in words, and the alternative — a
 * nullable count with a third rendering for "unknown" — would be a third
 * sentence for a difference nobody can act on.
 */
export function playlistCount(row: PlaylistRow | null | undefined): number {
  for (const candidate of [row?.item_count, row?.video_count]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate)
    }
  }
  return 0
}

/** One row, or null when it cannot be drawn. See `playlistTitle`. */
export function parsePlaylist(raw: unknown): TubePlaylist | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as PlaylistRow
  const id = playlistId(row)
  const title = playlistTitle(row)
  if (!id || !title) return null
  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description.trim() : "",
    visibility: typeof row.visibility === "string" ? row.visibility.trim().toLowerCase() : "",
    count: playlistCount(row),
    reserved: isWatchLaterTitle(title),
  }
}

/** A whole list. Rows that cannot be drawn are dropped, never guessed at. */
export function parsePlaylists(body: unknown): TubePlaylist[] {
  const data = (body as { data?: unknown } | null | undefined)?.data
  if (!Array.isArray(data)) return []
  return data.map(parsePlaylist).filter((row): row is TubePlaylist => row !== null)
}

/* ── The reserved queue ───────────────────────────────────────────────────── */

/** Is this the reserved title? Trimmed and case-insensitive — see the header. */
export function isWatchLaterTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim().toLowerCase() === WATCH_LATER_TITLE.toLowerCase()
}

/**
 * The viewer's Watch later, out of their playlists, or null to create one.
 *
 * The OLDEST match wins when there are several, which there should never be
 * and can be: two tabs pressing "Save to Watch later" within the same second
 * both find nothing and both create. Picking the oldest makes the tie-break
 * stable — every later visit keeps choosing the same list rather than
 * alternating between two — and the duplicate is visible on the Playlists
 * page, where it can be deleted, instead of being hidden by the row.
 *
 * "Oldest" is `created_at` when the rows carry it and array order otherwise,
 * because `ListPlaylistsByCreator` sorts `created_at DESC`: the LAST match in
 * server order is the oldest one.
 */
export function findWatchLater(rows: readonly TubePlaylist[]): TubePlaylist | null {
  const matches = rows.filter((row) => row.reserved)
  return matches.length > 0 ? matches[matches.length - 1] : null
}

/* ── Items ────────────────────────────────────────────────────────────────── */

/** One `playlist_items` row: a pointer, not a post. See `orderedPostIds`. */
export interface PlaylistItemRow {
  playlist_id?: string
  post_id?: string
  position?: number
  added_at?: string
}

/**
 * The post ids of a playlist, in the order they should be drawn.
 *
 * ── The server sends POINTERS, and this is the whole reason this exists ───
 * `GET /v1/playlists/{id}/items` answers `[{playlist_id, post_id, position,
 * added_at}]` and nothing else — no title, no media, no author. So a playlist
 * page is two round trips: this list, then `POST /v1/posts/batch` with the
 * ids. That batch is capped at 100 by post-service and answers a MAP keyed by
 * id, which loses the order — which is why the order is computed here, from
 * `position`, and the map is read back through it.
 *
 * Sorted on `position` rather than trusted from the array because the server's
 * `ORDER BY position ASC` is a property of today's query, and a client that
 * re-sorts costs nothing and cannot be broken by a change to it. Ties fall
 * back to the order they arrived in, which `Array.prototype.sort` guarantees
 * is stable.
 *
 * Duplicates are dropped. A post added twice is one row on screen: React needs
 * one key per child, and a playlist showing the same video twice reads as a
 * bug whichever way it got there.
 */
export function orderedPostIds(rows: readonly PlaylistItemRow[]): string[] {
  const withIndex = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => typeof row.post_id === "string" && row.post_id.length > 0)
  withIndex.sort((a, b) => {
    const pa = typeof a.row.position === "number" ? a.row.position : a.index
    const pb = typeof b.row.position === "number" ? b.row.position : b.index
    return pa === pb ? a.index - b.index : pa - pb
  })
  const seen = new Set<string>()
  const out: string[] = []
  for (const { row } of withIndex) {
    const id = row.post_id as string
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/* ── Where a playlist lives ───────────────────────────────────────────────── */

/**
 * One playlist's page, zone-relative.
 *
 * Zone-relative because `next/link` adds this zone's basePath itself — the
 * same rule `videoHref` in ../tube/video.ts follows, and the same bug if it
 * is broken ("/tube/tube/playlists/…").
 *
 * The id is encoded. It is a UUID today and encoding it costs nothing;
 * the day it is not, a raw one would break the route rather than the link.
 */
export function playlistHref(id: string): string {
  return `/playlists/${encodeURIComponent(id)}`
}

/** How a playlist's visibility reads to a person, or null for "say nothing". */
export function visibilityLabel(visibility: string): string | null {
  switch (visibility) {
    case "private":
      return "Private"
    case "unlisted":
      return "Unlisted"
    case "public":
      return "Public"
    default:
      // A value this client does not know is not announced. Printing the raw
      // word would put a server enum on somebody's screen.
      return null
  }
}

/**
 * "12 videos", "1 video", "No videos yet".
 *
 * A count of zero is a real and common state — a playlist is created empty —
 * and "0 videos" reads like a failure where the sentence is a fact.
 */
export function playlistCountLabel(count: number): string {
  if (count <= 0) return "No videos yet"
  return count === 1 ? "1 video" : `${count} videos`
}
