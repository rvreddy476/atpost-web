/**
 * Volume — a number between 0 and 1, and its relationship with mute.
 *
 * ── Volume and mute are two controls, not one ─────────────────────────────
 * The element has both and they are independent: `muted` silences without
 * touching `volume`, which is what makes "unmute" able to restore the level
 * somebody set. A player that implemented mute as `volume = 0` loses that —
 * unmuting has nowhere to go but back to 1, so a person who watches
 * everything at 20% gets a full-volume surprise every time they unmute.
 *
 * So: the slider writes `volume`, the speaker writes `muted`, and the two
 * rules that join them are here.
 *
 *   · Dragging the slider to 0 mutes. It is what the position means, and the
 *     speaker glyph must agree with it or the UI is lying about audio.
 *   · Dragging it UP from 0 unmutes. Somebody moving a volume slider on a
 *     muted video is asking to hear something, and leaving the mute on would
 *     make the control appear broken.
 *
 * ── Why the steps are 5% ──────────────────────────────────────────────────
 * Twenty presses end to end. YouTube's arrow keys move 5% and its slider is
 * continuous; this is stepped in both, because a pointer slider that lands on
 * 0.5317 makes the remembered value meaningless between videos.
 */

import { readPreference, writePreference } from "./preferences"

const STORAGE_NAME = "volume"

/** What ArrowUp and ArrowDown move, as a fraction of full scale. */
export const VOLUME_STEP = 0.05

/** Full, which is what a player with no preference plays at. */
export const DEFAULT_VOLUME = 1

/**
 * 0..1, rounded to the step.
 *
 * Every value that reaches the element goes through here. `video.volume`
 * throws `IndexSizeError` outside 0..1 — not a clamp, an exception — and
 * `NaN` throws too, so a stored value or a pointer position that missed the
 * track by two pixels would take the player down.
 */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME
  const clamped = Math.min(1, Math.max(0, value))
  // Rounded to the step so the slider, the keyboard and storage all agree on
  // the same twenty-one positions.
  return Math.round(clamped / VOLUME_STEP) * VOLUME_STEP
}

/** One step, in the direction given. Clamped at both ends. */
export function stepVolume(current: number, direction: 1 | -1): number {
  return clampVolume(clampVolume(current) + direction * VOLUME_STEP)
}

/** Where a press at `x` on a `width`-wide slider lands. */
export function volumeFromPointer(offsetX: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0
  return clampVolume(offsetX / width)
}

/** `0`–`100`, for `aria-valuenow` and for the tooltip. Always an integer. */
export function volumePercent(value: number): number {
  return Math.round(clampVolume(value) * 100)
}

/**
 * What the element's two properties should be after a volume change.
 *
 * Both rules from the header in one place, so the slider handler cannot
 * implement one and forget the other.
 */
export function volumeChange(next: number): { volume: number; muted: boolean } {
  const volume = clampVolume(next)
  // Zero means mute; anything above it means unmute, whatever the video was
  // doing before. The previous mute state is deliberately not an input: there
  // is no reading of "I moved the volume to 40%" that leaves it silent.
  return { volume, muted: volume <= 0 }
}

/**
 * The level to restore when somebody unmutes.
 *
 * A player muted at volume 0 has no level to go back to — unmuting it would
 * be silent, and the person would press the speaker twice and conclude the
 * sound is broken. So a zero becomes one step up: quiet, audible, and
 * obviously a starting point rather than a blast.
 */
export function volumeOnUnmute(current: number): number {
  const level = clampVolume(current)
  return level > 0 ? level : VOLUME_STEP
}

/** What a stored string means. Anything unrecognised is full volume. */
export function parseVolume(raw: string | null | undefined): number {
  if (raw == null || raw === "") return DEFAULT_VOLUME
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 1) return DEFAULT_VOLUME
  return clampVolume(value)
}

/** This viewer's remembered level. Full when there is none. */
export function readVolume(viewerId: string | null | undefined): number {
  return parseVolume(readPreference(STORAGE_NAME, viewerId))
}

/** Remember it, clamped first so nothing unassignable is ever written. */
export function writeVolume(viewerId: string | null | undefined, value: number): void {
  writePreference(STORAGE_NAME, viewerId, String(clampVolume(value)))
}
