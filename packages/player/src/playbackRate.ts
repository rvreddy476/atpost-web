/**
 * Playback speed, as arithmetic and a list.
 *
 * The list is YouTube's — 0.25 through 2 in quarters — and it is a list
 * rather than a slider on purpose. A continuous speed control invites 1.37×,
 * which nobody wants and which makes "put it back to normal" a fiddly aiming
 * problem. Eight stops, one of them named `Normal`, and `<` / `>` walk them.
 *
 * ── `Normal`, not `1×` ────────────────────────────────────────────────────
 * The one value a person needs to be able to get back to is the one that
 * should not look like the others. YouTube labels it `Normal` and so does
 * this: in a menu of seven numbers, a word is the thing the eye finds.
 *
 * ── Survives a source switch ──────────────────────────────────────────────
 * `video.playbackRate` is reset to 1 by the media element's load algorithm —
 * so changing `src`, or hls.js re-attaching, silently undoes the choice. The
 * rate is therefore state in React and re-applied on every attach, never read
 * back off the element. `MomentumVideo` does the re-applying; this file is
 * only the rules it applies.
 */

import { readPreference, writePreference } from "./preferences"

/** The stops, ascending. Exported so a menu and a test read the same list. */
export const PLAYBACK_RATES: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

/** The rate a player with no preference plays at. */
export const DEFAULT_PLAYBACK_RATE = 1

const STORAGE_NAME = "speed"

/**
 * What a stop is called.
 *
 * `1×` would be correct and is wrong — see the header. Everything else is the
 * number with a multiplication sign, not the letter x, because `1.25x` in a
 * menu of tabular numbers reads as a variable.
 */
export function rateLabel(rate: number): string {
  if (rate === 1) return "Normal"
  return `${rate}×`
}

/**
 * The accessible name for a stop, which must not be `Normal` on its own.
 *
 * A screen reader reading a menu of "0.25×, 0.5×, … Normal, 1.25×" gives no
 * clue that `Normal` is a speed at all, and it is the item a person is most
 * often hunting for. So the spoken name says both.
 */
export function rateAriaLabel(rate: number): string {
  return rate === 1 ? "Normal speed" : `${rate} times speed`
}

/**
 * Is this speed worth announcing in the chrome?
 *
 * Only when it is not 1. A badge reading `1×` on every video would be a
 * permanent piece of furniture that says nothing; a badge reading `1.5×` is
 * the answer to "why does this person sound like that".
 */
export function rateIsNotable(rate: number): boolean {
  return normalizeRate(rate) !== DEFAULT_PLAYBACK_RATE
}

/**
 * The nearest stop to whatever was asked for.
 *
 * Every rate that reaches the element goes through here, because the two
 * sources that are not a menu press — storage and a caller's prop — can hold
 * anything. A `playbackRate` of 0 pauses the video with the play button still
 * showing "pause"; a negative one throws in Firefox; `NaN` throws everywhere.
 * Clamping rather than rejecting means a value from a future version of this
 * list (say 3) lands on the nearest stop we have instead of silently
 * reverting to 1 — the person still gets the fastest speed available.
 */
export function normalizeRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_PLAYBACK_RATE
  let best = PLAYBACK_RATES[0]!
  let bestDistance = Math.abs(rate - best)
  for (const candidate of PLAYBACK_RATES) {
    const distance = Math.abs(rate - candidate)
    // `<` and not `<=`: a tie keeps the SLOWER stop, so a value exactly
    // between two speeds does not creep upwards on every round trip.
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/**
 * One step along the list. `>` is `+1`, `<` is `-1`.
 *
 * Clamped, never wrapped. Holding `>` past 2 and finding yourself at 0.25 is
 * the kind of surprise that costs somebody the thread of what they were
 * watching, and there is no visible end-stop to warn them it was coming.
 */
export function stepRate(current: number, direction: 1 | -1): number {
  const from = normalizeRate(current)
  const index = PLAYBACK_RATES.indexOf(from)
  const next = Math.min(PLAYBACK_RATES.length - 1, Math.max(0, index + direction))
  return PLAYBACK_RATES[next]!
}

/** What a stored string means. Anything unrecognised is the default. */
export function parseRate(raw: string | null | undefined): number {
  if (raw == null || raw === "") return DEFAULT_PLAYBACK_RATE
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PLAYBACK_RATE
  return normalizeRate(value)
}

/** This viewer's remembered speed. `Normal` when there is none. */
export function readPlaybackRate(viewerId: string | null | undefined): number {
  return parseRate(readPreference(STORAGE_NAME, viewerId))
}

/** Remember it. Normalised first, so nothing unparseable is ever written. */
export function writePlaybackRate(viewerId: string | null | undefined, rate: number): void {
  writePreference(STORAGE_NAME, viewerId, String(normalizeRate(rate)))
}
