/**
 * Resuming where somebody stopped, and not flooding the server saying so.
 *
 * Pure: no React, no DOM, no network. ./useResume.ts is the hook that drives a
 * real `<video>` with it; ./api.ts is the transport. Everything that decides
 * anything is here, because both halves of this feature fail silently when they
 * are wrong — a resume that fires at the wrong moment throws somebody back into
 * a video they had finished, and a save cadence that is too eager is a POST
 * every animation frame that nobody notices until the server bill does.
 */

import type { WatchProgress } from "./api"

/* ── Resuming ───────────────────────────────────────────────────────────── */

/**
 * Below this, there is nothing worth resuming.
 *
 * Ten seconds. A saved position of four seconds is not a place somebody left
 * off; it is the record of a video they opened and closed. Jumping them past
 * the opening of a video they have effectively not started is a worse greeting
 * than starting it properly.
 */
export const RESUME_MIN_MS = 10_000

/**
 * Past this share of the video, resuming means starting over.
 *
 * The server's own `completed` rule is 90%, and this is deliberately looser at
 * 95%: `completed` is about whether a view counts, and it is right to be
 * generous with it. This is about where to put the playhead, and somebody who
 * watched 91% and came back almost certainly wants the last thirty seconds
 * rather than the beginning — so the two thresholds answer different questions
 * and should not be shared.
 */
export const RESUME_MAX_FRACTION = 0.95

/**
 * Where to start the video, or null to start at the beginning.
 *
 * Null is the common answer and it is not a failure: no saved row, a row from a
 * view that finished, a position too early to be worth restoring, or a position
 * so late that resuming would land on the credits. Only a position genuinely in
 * the middle of a video produces a number.
 *
 * `durationMs` is the PLAYER's duration, not the stored one — they disagree
 * whenever a video has been re-trimmed since it was last watched, and the
 * player's is the one that can actually be seeked to. A stored position past
 * the current duration is treated as "start over", because it is a position in
 * a video that no longer exists.
 */
export function resumeTargetMs(
  progress: WatchProgress | null | undefined,
  durationMs: number
): number | null {
  if (!progress) return null
  if (progress.completed) return null

  const position = progress.position_ms
  if (!Number.isFinite(position) || position < RESUME_MIN_MS) return null

  if (Number.isFinite(durationMs) && durationMs > 0) {
    if (position >= durationMs * RESUME_MAX_FRACTION) return null
  }
  return Math.round(position)
}

/**
 * What to tell somebody who was moved.
 *
 * A player that silently starts eleven minutes in looks broken — the honest
 * reading of it is that the video is corrupt, not that you have been helped.
 * The notice names the time so the claim is checkable.
 */
export function resumeNotice(positionMs: number, clock: (ms: number) => string): string {
  return `Resumed from ${clock(positionMs)}.`
}

/* ── Saving ─────────────────────────────────────────────────────────────── */

/**
 * The floor between two saves. Ten seconds of wall clock.
 *
 * Not per frame, not per `timeupdate` — that event fires roughly four times a
 * second, which over a twenty-minute video is nearly five thousand POSTs for
 * one person watching one thing.
 */
export const SAVE_INTERVAL_MS = 10_000

/**
 * How far the playhead must have moved to be worth saying so.
 *
 * Five seconds. The interval alone is not enough: a PAUSED video still fires
 * nothing but still sits in a page whose timer keeps running, and a video
 * looping over one second of buffering would otherwise post the same number for
 * ever. Both conditions must hold.
 *
 * The comparison is on ABSOLUTE distance so a backwards seek counts. Somebody
 * who scrubs from 15:00 to 2:00 and leaves must not come back to 15:00.
 */
export const SAVE_MIN_DELTA_MS = 5_000

export interface SaveDecision {
  positionMs: number
  durationMs: number
  /** Null before the first save of this view. */
  lastSavedPositionMs: number | null
  /** Null before the first save of this view. `Date.now()` at that save. */
  lastSavedAtMs: number | null
  nowMs: number
  /** False for a signed-out viewer. There is no anonymous watch progress. */
  signedIn: boolean
  /**
   * The video reached its end, or the view is ending (the page is being left).
   * This is the save that matters most and it bypasses the cadence — but not
   * the sign-in check, and not the "have we already saved exactly this" check.
   */
  final?: boolean
}

/**
 * Should the client POST progress right now?
 *
 * ── Signed out is a hard no, and not merely a waste ───────────────────────
 * `POST /v1/videos/{id}/progress` reads `X-User-Id` and answers 401 without
 * one. Every such request also costs a failed token refresh behind it in the
 * api-client's response interceptor, which is how a signed-out tab left open on
 * a watch page turns into a steady drip of doomed requests.
 *
 * ── Position zero is never saved on its own ───────────────────────────────
 * Saving 0 overwrites a real resume point with "the beginning" the moment
 * somebody opens a video and leaves — which is precisely the case the feature
 * exists to survive. A `final` save at 0 is refused for the same reason.
 */
export function shouldSaveProgress(d: SaveDecision): boolean {
  if (!d.signedIn) return false
  if (!Number.isFinite(d.positionMs) || d.positionMs <= 0) return false

  // Already told the server this exact place. Applies to `final` too: leaving a
  // paused video sends the same number the periodic save just sent.
  if (d.lastSavedPositionMs !== null && Math.round(d.lastSavedPositionMs) === Math.round(d.positionMs)) {
    return false
  }

  if (d.final) return true
  if (d.lastSavedAtMs === null || d.lastSavedPositionMs === null) return true

  const movedEnough = Math.abs(d.positionMs - d.lastSavedPositionMs) >= SAVE_MIN_DELTA_MS
  const waitedEnough = d.nowMs - d.lastSavedAtMs >= SAVE_INTERVAL_MS
  return movedEnough && waitedEnough
}

/**
 * Did the video play to its end?
 *
 * Sent as `completed: true`, which the server honours as given. Everything
 * short of that is left to the server's own 90% rule — a client guessing at
 * completion is a client deciding whether a view counted, and that is not the
 * client's decision to make. The one case it genuinely knows better is this
 * one: the media element fired `ended`.
 */
export function completedFromEnd(ended: boolean): true | undefined {
  return ended ? true : undefined
}
