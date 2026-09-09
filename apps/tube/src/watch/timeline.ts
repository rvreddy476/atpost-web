/**
 * The playhead, as arithmetic.
 *
 * Chapters, cards and end screens are all the same question asked three ways —
 * "given that the video is N milliseconds in, what should be on screen?" — and
 * that question has no business needing a browser to answer. Pure: no React, no
 * DOM, no network. The hooks that feed it a real `currentTime` are
 * ./usePlayhead.ts and ./useWatchLinks.ts.
 *
 * This is the file that gets the tests, and it is the file to read before
 * changing any timing on this page.
 */

import type { Chapter, EndScreen, VideoCard } from "./api"

/* ── Chapters ───────────────────────────────────────────────────────────── */

/**
 * The chapters, in the order they play.
 *
 * Sorted on `start_ms` and NOT on `chapter_index`, which is what the server
 * orders by. The two can disagree: `chapter_index` is the author's numbering
 * and nothing on the table forces it to ascend with time, so a row edited out
 * of order produces a list that jumps backwards. A seek list that goes
 * backwards is worse than a renumbered one — somebody clicking the third row
 * and landing before the second has no way to tell what happened.
 *
 * Rows with a negative `start_ms` are dropped rather than clamped to zero. Two
 * chapters both starting at 0 would make `activeChapterIndex` pick one of them
 * arbitrarily, and a chapter that claims to start before the video does is bad
 * data rather than a chapter at the beginning.
 *
 * A tie on `start_ms` keeps the lower `chapter_index` first, so the ordering is
 * stable across renders rather than dependent on the sort's implementation.
 */
export function orderedChapters(chapters: readonly Chapter[]): Chapter[] {
  return chapters
    .filter((c) => Number.isFinite(c.start_ms) && c.start_ms >= 0)
    .slice()
    .sort((a, b) => a.start_ms - b.start_ms || a.chapter_index - b.chapter_index)
}

/**
 * Which chapter is playing, or -1.
 *
 * The LAST chapter whose `start_ms` is at or before the playhead. Not the
 * nearest: a chapter is a span that runs until the next one begins, so at
 * 61_000ms with chapters at 0 and 60_000 the answer is the second, and it stays
 * the second for as long as the video runs.
 *
 * -1 when the playhead is before the first chapter, which is a real state: an
 * author may start their chapter list at 0:12 after a cold open, and
 * highlighting the first chapter during the cold open would be a small lie
 * about where you are.
 *
 * Expects `orderedChapters` output. Given an unsorted list it answers about the
 * list it was given, which is why the ordering is a separate, testable step.
 */
export function activeChapterIndex(
  chapters: readonly Chapter[],
  positionMs: number
): number {
  if (!Number.isFinite(positionMs)) return -1
  let found = -1
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.start_ms <= positionMs) found = i
    else break
  }
  return found
}

/**
 * Where a chapter ends — the next one's start, or the end of the video.
 *
 * `durationMs` of 0 means the player has not learned the duration yet, and the
 * honest answer for the last chapter is then `Infinity` rather than 0: a
 * progress bar drawn from a zero-length span would show the last chapter as
 * complete the instant it started.
 */
export function chapterEndMs(
  chapters: readonly Chapter[],
  index: number,
  durationMs: number
): number {
  const next = chapters[index + 1]
  if (next) return next.start_ms
  return durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
}

/**
 * Where a click on a chapter should put the playhead.
 *
 * Clamped INSIDE the video rather than at its exact end. Setting
 * `currentTime` to precisely `duration` fires `ended` on most browsers, so a
 * chapter row whose `start_ms` is past a duration the server disagrees with —
 * which happens when a video is re-trimmed after its chapters were written —
 * would end the video instead of seeking into it. A second back from the end is
 * a place you can still watch from.
 */
export const SEEK_TAIL_GUARD_MS = 1_000

export function chapterSeekMs(startMs: number, durationMs: number): number {
  const target = Math.max(0, Math.round(startMs))
  if (durationMs <= 0) return target
  return Math.min(target, Math.max(0, durationMs - SEEK_TAIL_GUARD_MS))
}

/** "1:04", "1:02:03". Chapter timestamps, in the shape a person reads them. */
export function chapterClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes)
  const ss = String(seconds).padStart(2, "0")
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/* ── In-video cards ─────────────────────────────────────────────────────── */

/**
 * How long a card stays up once it has appeared.
 *
 * The row says WHEN — `appear_at_ms` — and nothing says when it should go. So
 * this is a client decision, and twelve seconds is chosen for a reason worth
 * writing down: it is long enough to read a title and a teaser and decide, and
 * short enough that a card cannot sit over the picture for a whole video if an
 * author sets `appear_at_ms` to 0. YouTube's own teaser is about five seconds
 * and then collapses to an icon; there is no icon here yet, so the prompt
 * carries the whole window itself.
 */
export const CARD_VISIBLE_MS = 12_000

/**
 * The card to show right now, or null.
 *
 * ── One at a time, and it is the LATEST one ───────────────────────────────
 * Windows can overlap — nothing on the table stops two cards being written a
 * second apart — and two prompts stacked in one corner is how both become
 * unreadable. The newest wins because that is the one whose moment the video
 * has just reached; an older card still inside its own window has already had
 * its chance.
 *
 * ── Dismissal is permanent for the view, and by ID ────────────────────────
 * Somebody who closes a card has said no to it. Re-showing it because the
 * playhead moved a frame — or because they scrubbed back over its window — is
 * the single most annoying thing an overlay can do. The set is the caller's, so
 * it lives as long as the view does and resets when the video does.
 *
 * A seek BACKWARDS past a card's window does not un-dismiss it either, which is
 * deliberate: the alternative is that scrubbing through a video pops every
 * card that has already been refused.
 */
export function activeCard(
  cards: readonly VideoCard[],
  positionMs: number,
  dismissed: ReadonlySet<string>
): VideoCard | null {
  if (!Number.isFinite(positionMs)) return null
  let best: VideoCard | null = null
  for (const card of cards) {
    if (dismissed.has(card.id)) continue
    const start = Math.max(0, card.appear_at_ms)
    if (!Number.isFinite(start)) continue
    if (positionMs < start || positionMs >= start + CARD_VISIBLE_MS) continue
    if (!best || start >= Math.max(0, best.appear_at_ms)) best = card
  }
  return best
}

/* ── End screens ────────────────────────────────────────────────────────── */

/**
 * The end-screen elements live right now.
 *
 * Half-open on purpose: `start_ms <= t < end_ms`. A closed interval makes two
 * screens written back to back — one ending at 100_000, the next starting there
 * — both live for one frame, which reads as a flicker.
 *
 * A row whose `end_ms` is not after its `start_ms` is dropped rather than
 * shown for an instant. That is bad data, and an overlay that appears and
 * vanishes is worse than one that never appears.
 *
 * Several ARE returned, unlike cards: an end screen is a positioned tile and
 * YouTube shows up to four at once. Where they go is `endScreenSlot`.
 */
export function activeEndScreens(
  screens: readonly EndScreen[],
  positionMs: number
): EndScreen[] {
  if (!Number.isFinite(positionMs)) return []
  return screens.filter(
    (s) =>
      Number.isFinite(s.start_ms) &&
      Number.isFinite(s.end_ms) &&
      s.end_ms > s.start_ms &&
      positionMs >= s.start_ms &&
      positionMs < s.end_ms
  )
}

/** A box on the picture, in percentages of the player's own box. */
export interface EndScreenSlot {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

/**
 * Where one end screen goes.
 *
 * ── `position` is JSONB with no schema and no writer ──────────────────────
 * Migration 012 declares `position JSONB NOT NULL` and stops there. No client
 * in this product writes an end screen, so there is no example payload
 * anywhere — which means any confident interface for it would be a guess
 * printed as a fact. So this parses defensively and returns null when it
 * cannot, and the overlay lays unpositioned tiles out in a grid instead. A
 * tile in the wrong corner is a cosmetic problem; a tile at NaN% is an
 * invisible one.
 *
 * Two conventions are accepted because both are plausible and they cannot be
 * confused: values at or below 1 are read as FRACTIONS of the frame, values
 * above 1 as PERCENTAGES. The ambiguity is only at exactly 1, which as a
 * fraction is the far edge and as a percentage is a 1%-wide tile — and the
 * fraction reading is the one that leaves something on screen.
 *
 * Everything is clamped so a tile cannot be pushed off the picture, and a
 * degenerate width or height falls back to the default rather than to zero.
 */
const DEFAULT_SLOT_WIDTH_PCT = 34
const DEFAULT_SLOT_HEIGHT_PCT = 26

export function endScreenSlot(position: unknown): EndScreenSlot | null {
  if (!position || typeof position !== "object") return null
  const raw = position as Record<string, unknown>

  const x = readAxis(raw.x ?? raw.left)
  const y = readAxis(raw.y ?? raw.top)
  if (x === null || y === null) return null

  const w = readAxis(raw.w ?? raw.width) ?? DEFAULT_SLOT_WIDTH_PCT
  const h = readAxis(raw.h ?? raw.height) ?? DEFAULT_SLOT_HEIGHT_PCT

  const widthPct = clamp(w > 0 ? w : DEFAULT_SLOT_WIDTH_PCT, 5, 100)
  const heightPct = clamp(h > 0 ? h : DEFAULT_SLOT_HEIGHT_PCT, 5, 100)
  return {
    leftPct: clamp(x, 0, 100 - widthPct),
    topPct: clamp(y, 0, 100 - heightPct),
    widthPct,
    heightPct,
  }
}

function readAxis(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < 0) return null
  // <= 1 is a fraction of the frame; > 1 is already a percentage. See above.
  return value <= 1 ? value * 100 : value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Is the video near enough its end for an end screen to be reasonable?
 *
 * A second gate on top of the row's own window, and it is not redundant. The
 * window is authored against a duration that may since have changed — a video
 * re-trimmed after its end screens were written keeps rows pointing at
 * timestamps that are now in the middle of it — and an end screen over the
 * middle of a video covers content somebody is watching. The last 30 seconds,
 * or the last 20% of a short one, whichever is longer.
 *
 * Returns true when the duration is unknown, deliberately: an unknown duration
 * must not be a reason to withhold something an author explicitly placed.
 */
export const END_SCREEN_TAIL_MS = 30_000
export const END_SCREEN_TAIL_FRACTION = 0.2

export function inEndScreenWindow(positionMs: number, durationMs: number): boolean {
  if (!Number.isFinite(positionMs)) return false
  if (!Number.isFinite(durationMs) || durationMs <= 0) return true
  const tail = Math.max(END_SCREEN_TAIL_MS, durationMs * END_SCREEN_TAIL_FRACTION)
  return positionMs >= durationMs - tail
}
