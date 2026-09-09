/**
 * The rules of linked-video AUTHORING, as arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS DIRECTORY IS, AND WHAT IT IS NOT
 *
 * `src/watch/` RENDERS linked videos: `timeline.ts` answers "given that the
 * video is N milliseconds in, what should be on screen?", and `links.ts`
 * answers "where does this target send somebody?". Both were written against
 * data that no client in this product had ever WRITTEN — the header of
 * `src/watch/api.ts` says so in as many words: "there is no card editor, no
 * end-screen editor and no series builder on any client".
 *
 * This is that editor. The founder's words:
 *
 *     "I think you already implemented linked videos, right? So I suppose I
 *      can link one video to another video, alternate videos kind of things.
 *      So that flow is not there. User can also upload link code to one to
 *      three sequence of videos."
 *
 * Two phrases, two mechanisms, and the mapping is deliberate rather than
 * incidental:
 *
 *   · "a one to three SEQUENCE of videos" → a video SERIES. It is the only
 *     mechanism on this platform with an ORDER (`episode_num`) and a
 *     container a client can page. ./sequence.ts.
 *   · "ALTERNATE videos", loose relations with no order → in-video CARDS. One
 *     call on the video itself, no container, appearing mid-playback at a
 *     timestamp. This file.
 *
 * End screens are a PLACEMENT primitive, not a linking one, and are used here
 * for exactly one thing: the up-next tile near the end. ./upnext.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS FILE IS PURE, AND THAT IS LOAD-BEARING
 *
 * No React, no DOM, no network — same discipline as ../watch/timeline.ts and
 * for a sharper reason. Every rule below exists because the SERVER does not
 * enforce it, and a rule the server does not enforce is one that has to be
 * provable without a server. ./model.test.ts is that proof.
 *
 * ── What the server actually accepts, verified 2026-09-10 ─────────────────
 * Written down because almost none of it is what the table's own DDL implies:
 *
 *   · `title` on a card is NOT NULL on the table and NOT VALIDATED by the
 *     handler. `{"type":"video","target_id":…,"appear_at_ms":0}` with no
 *     title at all answers `200 {"saved":1}` and stores `title: ""`. The
 *     watch page then draws a card-shaped box with nothing in it.
 *   · `target_id` is NOT checked for being a UUID, let alone an existing
 *     post. `"target_id":"not-a-uuid"` answers `200 {"saved":1}`. The watch
 *     page turns it into `/tube/not-a-uuid`, which its own route rejects as
 *     malformed — an authored card that lands on a 404.
 *   · `appear_at_ms` is NOT bounded. `-5000` answers `200` and is stored as
 *     `-5000`; `activeCard` clamps it to 0 at read time, so the card silently
 *     becomes an opening card. A timestamp past the end of the video is
 *     likewise accepted and simply never fires.
 *   · A bad `type` is a **500**, not a 400 — `video_cards_type_check` is a
 *     database CHECK constraint and nothing above it validates. See
 *     `isCardType` below.
 *
 * So every one of those is checked here, before anything is sent.
 */

import { CARD_VISIBLE_MS } from "@/watch/timeline"
import type { CardTargetType, EndScreenTargetType } from "@/watch/api"

/* ── Ids ─────────────────────────────────────────────────────────────────── */

/**
 * The shape of every id in this system.
 *
 * Restated rather than imported: the other copy is a module-private constant
 * in `src/app/[postId]/page.tsx`, where it guards the watch ROUTE. The two are
 * the same regex for the same reason and they guard opposite ends of the same
 * link — this one refuses to WRITE a target that route would refuse to open.
 * That symmetry is the point, and a test asserts it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID.test(value)
}

/* ── The two enums, which are NOT the same enum ─────────────────────────── */

/**
 * A card's four types, and an end screen's four types, and they differ.
 *
 * Cards have `poll`; end screens have `channel_subscribe`. Nothing but a
 * database CHECK constraint enforces either, so sending an end-screen type to
 * the cards endpoint is a **500 with a SQLSTATE in the message** rather than a
 * 400 — verified on the running gateway:
 *
 *     violates check constraint "video_cards_type_check" (SQLSTATE 23514)
 *
 * These guards are what stop that reaching a creator as "something went
 * wrong". They are also why this editor never puts a free-text type field on
 * screen: every type it can write is one it has a control for.
 */
export const CARD_TYPES: readonly CardTargetType[] = [
  "video",
  "playlist",
  "poll",
  "external_link",
] as const

export const END_SCREEN_TYPES: readonly EndScreenTargetType[] = [
  "video",
  "playlist",
  "channel_subscribe",
  "external_link",
] as const

export function isCardType(value: unknown): value is CardTargetType {
  return typeof value === "string" && (CARD_TYPES as readonly string[]).includes(value)
}

export function isEndScreenType(value: unknown): value is EndScreenTargetType {
  return typeof value === "string" && (END_SCREEN_TYPES as readonly string[]).includes(value)
}

/* ── Alternate videos ───────────────────────────────────────────────────── */

/**
 * How many alternates a creator may attach.
 *
 * There is NO server maximum — `{"cards":[…]}` of any length is accepted — so
 * this is ours, and three is the founder's own number carried across from the
 * sequence ("one to three"). It is also the number the watch page can survive:
 * `activeCard` shows ONE card at a time and picks the latest live one, so
 * cards beyond the third are not extra information, they are cards that
 * silently suppress each other.
 */
export const MAX_ALTERNATES = 3

/**
 * The closest two alternates may be placed.
 *
 * NOT an arbitrary "one second". `CARD_VISIBLE_MS` is how long the watch page
 * keeps a card up once it has appeared, and `activeCard` resolves an overlap
 * by showing the LATEST card — so two cards written eight seconds apart is not
 * two prompts, it is one prompt that gets cut off after eight seconds by
 * another. Placing them a full window apart is the only spacing under which
 * every authored card actually gets its window.
 *
 * Importing the constant rather than restating it is the whole point: the
 * authoring rule and the rendering rule cannot drift.
 */
export const MIN_ALTERNATE_GAP_MS = CARD_VISIBLE_MS

/** The longest title and teaser this editor will write. */
export const MAX_CARD_TITLE = 100
export const MAX_CARD_TEASER = 140

/**
 * One alternate, as the creator is editing it.
 *
 * `key` is LOCAL and is not the row's `id`. It cannot be: every save deletes
 * and re-inserts, so the server hands back brand-new ids for rows the creator
 * never touched, and a React list keyed on those remounts every row on every
 * save. The key is minted when the row appears on screen and lives as long as
 * the row does.
 *
 * `targetTitle` is carried alongside `targetId` so the row and the preview can
 * name the video without a second fetch. It is never sent — the card table has
 * no column for it — and it is deliberately not treated as truth: if it is
 * missing the row says "this video" rather than inventing a name.
 */
export interface AlternateDraft {
  key: string
  targetId: string
  targetTitle: string
  title: string
  teaser: string
  atMs: number
}

export function emptyAlternate(key: string, atMs = 0): AlternateDraft {
  return { key, targetId: "", targetTitle: "", title: "", teaser: "", atMs }
}

/**
 * What is wrong with one alternate, or null.
 *
 * One sentence, because it is drawn under one field. The order is the order a
 * creator can act on: pick a video, then name it, then place it.
 *
 * @param durationMs the video's own length, or 0 when it is not known. Zero
 *        SKIPS the "past the end" check rather than failing it — a post whose
 *        media has not finished processing has no duration on any row yet, and
 *        refusing to author links for it would be refusing on a fact we do
 *        not have.
 */
export function alternateProblem(
  draft: AlternateDraft,
  subjectPostId: string,
  durationMs: number
): string | null {
  if (!draft.targetId) return "Pick a video for this to link to."
  if (!isUuid(draft.targetId)) {
    // The server would take this and the watch page would build a link out of
    // it that its own route rejects as malformed. See the file header.
    return "That video id is not a valid id, so the link would not open."
  }
  if (draft.targetId === subjectPostId) {
    return "This links to the video it is on. Pick a different video."
  }
  const title = draft.title.trim()
  if (!title) return "Give it a title — this is the text a viewer sees."
  if (title.length > MAX_CARD_TITLE) {
    return `Titles are at most ${MAX_CARD_TITLE} characters.`
  }
  if (draft.teaser.trim().length > MAX_CARD_TEASER) {
    return `Teasers are at most ${MAX_CARD_TEASER} characters.`
  }
  if (!Number.isFinite(draft.atMs) || draft.atMs < 0) {
    return "Pick a time inside the video."
  }
  if (durationMs > 0 && draft.atMs >= durationMs) {
    return "That time is past the end of the video, so it would never appear."
  }
  return null
}

/**
 * The alternates that collide, by key.
 *
 * Symmetric on purpose — BOTH rows of a colliding pair are marked, because the
 * creator is looking at two rows and either one is the one to move. Marking
 * only the later one reads as an accusation against whichever happened to be
 * added second.
 *
 * Rows with no target are skipped: an unfinished row already carries "pick a
 * video", and adding "and it clashes with row 2" to it is noise.
 */
export function collidingAlternates(drafts: readonly AlternateDraft[]): Set<string> {
  const hit = new Set<string>()
  const placed = drafts.filter((d) => d.targetId && Number.isFinite(d.atMs))
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i]!
      const b = placed[j]!
      if (Math.abs(a.atMs - b.atMs) < MIN_ALTERNATE_GAP_MS) {
        hit.add(a.key)
        hit.add(b.key)
      }
    }
  }
  return hit
}

/**
 * Alternates pointing at the same video, by key.
 *
 * The server would accept it — there is no uniqueness on `(post_id,
 * target_id)` — and the result is two prompts for one destination, the later
 * of which suppresses the earlier. Same symmetry as collisions.
 */
export function duplicateAlternates(drafts: readonly AlternateDraft[]): Set<string> {
  const seen = new Map<string, string[]>()
  for (const draft of drafts) {
    if (!draft.targetId) continue
    const keys = seen.get(draft.targetId) ?? []
    keys.push(draft.key)
    seen.set(draft.targetId, keys)
  }
  const hit = new Set<string>()
  for (const keys of seen.values()) {
    if (keys.length > 1) for (const key of keys) hit.add(key)
  }
  return hit
}

/** Every problem in the alternates section, by draft key. Empty is the good case. */
export function alternateProblems(
  drafts: readonly AlternateDraft[],
  subjectPostId: string,
  durationMs: number
): Map<string, string> {
  const problems = new Map<string, string>()
  for (const draft of drafts) {
    const problem = alternateProblem(draft, subjectPostId, durationMs)
    if (problem) problems.set(draft.key, problem)
  }
  const colliding = collidingAlternates(drafts)
  const duplicated = duplicateAlternates(drafts)
  for (const draft of drafts) {
    if (problems.has(draft.key)) continue
    if (duplicated.has(draft.key)) {
      problems.set(draft.key, "Two alternates point at the same video.")
    } else if (colliding.has(draft.key)) {
      problems.set(
        draft.key,
        `Too close to another alternate — leave at least ${Math.round(
          MIN_ALTERNATE_GAP_MS / 1000
        )}s between them, or one cuts the other off.`
      )
    }
  }
  return problems
}

/* ── Timestamps a person can type ───────────────────────────────────────── */

/**
 * "1:04" or "1:02:03" → milliseconds, or null.
 *
 * A creator places a card by typing a timestamp, not by typing 64000. Bare
 * seconds ("90") are accepted too because that is what somebody reading a
 * duration off a player types half the time.
 *
 * Deliberately strict about the parts: "1:70" is null rather than 130 seconds.
 * Silently reinterpreting an out-of-range minute is how a card ends up
 * somewhere the creator did not put it.
 */
export function parseClock(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  const parts = text.split(":")
  if (parts.length > 3) return null
  if (!parts.every((p) => /^\d{1,3}$/.test(p.trim()))) return null
  const nums = parts.map((p) => Number(p.trim()))
  if (nums.length > 1 && nums.slice(1).some((n) => n > 59)) return null
  let seconds = 0
  for (const n of nums) seconds = seconds * 60 + n
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return seconds * 1000
}
