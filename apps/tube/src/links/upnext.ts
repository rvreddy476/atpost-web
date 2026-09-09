/**
 * Up next — one end screen, in the closing stretch, placed for the creator.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AN END SCREEN IS A PLACEMENT PRIMITIVE, NOT A LINKING ONE
 *
 * It is used here for exactly one thing and is deliberately not offered as a
 * general way to link videos. The reason is that it is the only one of the
 * three mechanisms whose row carries a `position` — a box on the picture — and
 * a creator who is given "link a video" in the shape of "place a box" will use
 * it for relations that belong in a card or a series, where they have a
 * timeline and an order. Alternates are ./model.ts; the sequence is
 * ./sequence.ts; this is the tile at the end and nothing else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THE SERVER REQUIRES THAT THE BRIEF DOES NOT SAY
 *
 * Verified on the running gateway, 2026-09-10:
 *
 *   · `position` is **NOT NULL and NOT DEFAULTED**. Omitting it is not "no
 *     position", it is a 500:
 *
 *         null value in column "position" of relation "video_end_screens"
 *         violates not-null constraint (SQLSTATE 23502)
 *
 *     So every screen this editor writes carries one, always. That is what
 *     `UP_NEXT_POSITION` is.
 *
 *   · The enum is `video | playlist | channel_subscribe | external_link` — it
 *     has `channel_subscribe` where a card has `poll` — and a wrong value is a
 *     500 from `video_end_screens_type_check`, same as cards. `isEndScreenType`
 *     in ./model.ts is the guard.
 *
 *   · `GET` is **unordered**. Nothing about the read tells you which screen is
 *     which, which is a second reason this editor manages exactly one and
 *     passes any others through untouched rather than trying to identify them.
 *
 * Pure: no React, no network. ./upnext.test.ts.
 */

import { END_SCREEN_TAIL_FRACTION, END_SCREEN_TAIL_MS } from "@/watch/timeline"

/**
 * How long before the end the up-next tile comes up, by default.
 *
 * The creator is not asked to type milliseconds — the brief is explicit about
 * that, and it is right: `start_ms` and `end_ms` are two numbers in a unit
 * nobody reads a video in, for a window whose only sensible value is "near the
 * end". So this is a default with a control over its LENGTH in seconds, and
 * the arithmetic below turns that into the pair the wire wants.
 *
 * Twenty seconds is chosen to sit comfortably inside the watch page's own
 * gate: `inEndScreenWindow` refuses to draw an end screen before the last
 * `max(30s, 20%)` of a video no matter what the row says, because a row
 * authored against a duration the video no longer has would otherwise cover
 * the middle of it. A default of 20s is inside that gate for every duration,
 * so the tile a creator places is a tile that actually appears.
 */
export const UP_NEXT_LEAD_MS = 20_000

/** The shortest and longest lead the control offers. */
export const MIN_UP_NEXT_LEAD_MS = 5_000
export const MAX_UP_NEXT_LEAD_MS = 60_000

/**
 * Where the tile goes.
 *
 * Fractions of the frame, which `endScreenSlot` reads as such (it treats
 * values at or below 1 as fractions and above 1 as percentages). Right-hand
 * side, upper half:
 *
 *   · The overlay's own container is `inset-x-0 bottom-16 top-0`, so these
 *     percentages are already measured inside a box that stops short of the
 *     transport. y 0.14–0.56 keeps it clear of the rest.
 *   · Left is where the in-video card sits (`CardPrompt` is `left-3 top-3`),
 *     and an alternate that is still on screen when the end screen opens must
 *     not be underneath it.
 *   · Top-right is the player's speaker and bottom-right is this page's own
 *     "Full video" control; 14% down and 56% at its lowest is between them.
 *
 * One fixed placement, and the creator is not given a drag handle. A single
 * tile has one sensible place; a box-dragging surface is a different feature
 * and it would be the only part of this editor with no correct default.
 */
export const UP_NEXT_POSITION = { x: 0.62, y: 0.14, w: 0.34, h: 0.42 } as const

/** The window an up-next tile occupies. Both ends in milliseconds. */
export interface UpNextWindow {
  startMs: number
  endMs: number
}

/**
 * The window for a tile that should show for `leadMs` before the end.
 *
 * Null when the duration is not known, and that is a real state rather than a
 * defensive one: a post whose media is still processing has no `duration_ms`
 * on any row the client can read, and `GET /v1/videos/{postId}` answers
 * `404 Video metadata not found` for a post with no media at all — verified.
 * There is no honest window for a video of unknown length, so the section asks
 * for the length instead of guessing one.
 *
 * `end_ms` is the duration itself. `activeEndScreens` is HALF-OPEN
 * (`start <= t < end`), so the tile is live right up to the final frame and
 * gone at the exact end — which is where the player stops reporting a position
 * anyway. A value past the duration would be a row that outlives its video.
 *
 * The lead is clamped to leave at least a second of window on a very short
 * video: a 5-second video with a 20-second lead would otherwise produce
 * `start_ms: -15000`, which the server accepts and which makes an "up next"
 * tile that is on screen from the first frame.
 */
export function upNextWindow(durationMs: number, leadMs = UP_NEXT_LEAD_MS): UpNextWindow | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null
  const lead = Math.min(
    Math.max(Math.round(leadMs), 1_000),
    Math.max(1_000, Math.round(durationMs))
  )
  const endMs = Math.round(durationMs)
  return { startMs: Math.max(0, endMs - lead), endMs }
}

/**
 * Would the watch page actually draw a tile in this window?
 *
 * The second gate, restated from the reader's side. `inEndScreenWindow` will
 * not draw an end screen before the last `max(30s, 20%)` of a video however
 * the row is written, so a window that starts earlier than that is a row the
 * creator authored and no viewer will ever see. The editor says so rather than
 * writing it and letting the creator conclude the feature is broken.
 *
 * True when the duration is unknown, matching `inEndScreenWindow` exactly: an
 * unknown duration must not be a reason to withhold something a creator
 * explicitly placed.
 */
export function windowIsVisible(window: UpNextWindow, durationMs: number): boolean {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return true
  const tail = Math.max(END_SCREEN_TAIL_MS, durationMs * END_SCREEN_TAIL_FRACTION)
  return window.startMs >= durationMs - tail
}

/** One up-next tile, as the creator is editing it. */
export interface UpNextDraft {
  /** Empty means "no up-next tile", which is a legal and common state. */
  targetId: string
  /** The target video's own title, for the row and the preview. Never sent. */
  targetTitle: string
  /** Shown on the tile. Falls back to "Watch next" on the watch page if blank. */
  title: string
  /** How long before the end it appears. */
  leadMs: number
}

export function emptyUpNext(): UpNextDraft {
  return { targetId: "", targetTitle: "", title: "", leadMs: UP_NEXT_LEAD_MS }
}

/** True when the creator has actually asked for a tile. */
export function hasUpNext(draft: UpNextDraft): boolean {
  return Boolean(draft.targetId)
}
