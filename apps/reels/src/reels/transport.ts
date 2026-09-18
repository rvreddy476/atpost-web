/**
 * The playhead's arithmetic, and the words the surface says about itself.
 *
 * ── Why this zone has a transport at all ──────────────────────────────────
 * `MomentumVideo` ships one — a scrubber, a clock, a play button and a speaker
 * — and it is the right transport for a card in a feed: hidden while playing,
 * revealed on hover or focus, faded three seconds after the last interaction.
 * On a full-screen short it is the wrong one, and the package says so itself:
 * "A surface with its own chrome — a full-bleed reels viewer that draws its
 * own scrubber — turns this off and keeps everything else."
 *
 * Three requirements force it. The progress bar must be visible ALWAYS, the
 * way YouTube Shorts' is, because on a seven-second loop a bar that fades
 * after three is absent for most of the video. The speaker must be visible
 * always, for the same reason and because sound is the single most-reached-for
 * control on this surface. And a double-press of the picture has to mean LIKE,
 * which it cannot while the player is treating the first press as play/pause
 * and the second as play again.
 *
 * So `controls={false}`, and everything below is what replaces it. No React
 * and no DOM here: these are the rules, and the rules are what is worth
 * asserting without a browser.
 */

/**
 * How far through, as a fraction in [0, 1].
 *
 * Every non-finite input answers 0 rather than NaN, and that matters more here
 * than it looks: `video.duration` is `NaN` until metadata loads and `Infinity`
 * for a live stream, and a NaN reaching a style attribute produces a bar that
 * is silently not drawn at all — a progress bar that never appears on exactly
 * the videos that took longest to load.
 */
export function progressFraction(currentSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(currentSeconds) || !Number.isFinite(durationSeconds)) return 0
  if (durationSeconds <= 0) return 0
  return Math.min(1, Math.max(0, currentSeconds / durationSeconds))
}

/**
 * Where a press or a drag along the bar lands, as a fraction in [0, 1].
 *
 * `offsetX` may be outside the bar and routinely is: a drag that started on the
 * bar keeps sending moves after the pointer has left it, because the element
 * captured the pointer. Clamping here rather than refusing is what makes
 * dragging off the left edge mean "the beginning" instead of "stop seeking".
 */
export function seekFraction(offsetX: number, width: number): number {
  if (!Number.isFinite(offsetX) || !Number.isFinite(width) || width <= 0) return 0
  return Math.min(1, Math.max(0, offsetX / width))
}

/**
 * The time to seek to, in seconds.
 *
 * Never the very last frame. Seeking exactly to `duration` on a looping video
 * fires `ended` immediately and jumps back to zero, so dragging to the right
 * edge would restart the short rather than showing its final frame — which
 * reads as the scrubber being broken at one end. A tenth of a second short of
 * the end is indistinguishable to look at and behaves.
 */
export function seekTarget(fraction: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const clamped = Math.min(1, Math.max(0, fraction))
  return Math.min(durationSeconds - 0.1, clamped * durationSeconds)
}

/**
 * Two presses close enough together to be one gesture.
 *
 * 300ms is the platform double-click threshold and is what a person's hand
 * actually produces; going lower loses real double-taps on a phone and going
 * higher starts treating "pause, look, resume" as a like.
 */
export const DOUBLE_TAP_MS = 300

/**
 * Is THIS press the second half of a double?
 *
 * `previousMs` is null when there has been no press yet, which is its own case
 * rather than a very old timestamp — subtracting from a sentinel number is how
 * a surface ends up liking a short on the first tap after midnight.
 */
export function isDoubleTap(previousMs: number | null, nowMs: number): boolean {
  if (previousMs === null) return false
  return nowMs - previousMs <= DOUBLE_TAP_MS
}

/**
 * What a double-tap on the picture does.
 *
 * ── It only ever LIKES, and never unlikes ─────────────────────────────────
 * This is the one place the surface deliberately refuses to be a toggle, and
 * every product with this gesture agrees. A double-tap is a celebration, not a
 * switch: people double-tap a short they already liked without meaning
 * anything by it, and a gesture that silently removed a like — with no control
 * pressed and no confirmation — would be destroying a signal the creator is
 * ranked on. Unliking stays where it can be seen, on the heart.
 *
 * Returning null rather than a no-op boolean is what lets the caller skip the
 * request AND the animation together: an already-liked short shows no heart,
 * because a burst that celebrates nothing teaches people the gesture failed.
 */
export function doubleTapOutcome(alreadyLiked: boolean): "like" | null {
  return alreadyLiked ? null : "like"
}

/**
 * The accessible name for the speaker.
 *
 * It names the ACTION and not the state, which is the rule for a button whose
 * label changes: "Muted" tells you where you are and leaves you guessing what
 * pressing it does. `aria-pressed` carries the state, which is what it is for.
 */
export function muteLabel(muted: boolean): string {
  return muted ? "Unmute" : "Mute"
}

/** Ditto for the picture's own play/pause. */
export function playLabel(paused: boolean): string {
  return paused ? "Play" : "Pause"
}

/**
 * What a screen reader is told when something changes, or null for silence.
 *
 * ── Politeness, and the things it must NOT say ────────────────────────────
 * These go into a `role="status"` region, which interrupts nothing and is read
 * at the next pause. That is the right register for "you liked this" and
 * exactly the wrong one for the playhead: a live region announcing a position
 * four times a second is a screen reader that cannot be used. So there is no
 * progress announcement here at all — the bar carries `aria-valuetext` for
 * anybody who moves to it, and says nothing when they do not.
 *
 * Returning null for a no-change is deliberate too. A region re-rendered with
 * the same string is silent in some engines and repeats in others, so the
 * caller clears it instead of writing the same sentence twice.
 */
export function stateAnnouncement(
  change: "liked" | "unliked" | "saved" | "unsaved" | "muted" | "unmuted" | "paused" | "playing"
): string {
  switch (change) {
    case "liked":
      return "Liked"
    case "unliked":
      return "Like removed"
    case "saved":
      return "Saved"
    case "unsaved":
      return "Removed from saved"
    case "muted":
      return "Sound off"
    case "unmuted":
      return "Sound on"
    case "paused":
      return "Paused"
    case "playing":
      return "Playing"
  }
}

/**
 * The bar's spoken position: "12 seconds of 58".
 *
 * Whole seconds, because a scrubber on a short is dragged to a moment and not
 * to a frame, and "12.4166 seconds" is not a thing anybody wants read out.
 */
export function positionLabel(currentSeconds: number, durationSeconds: number): string {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0)
  const at = safe(currentSeconds)
  const total = safe(durationSeconds)
  if (total <= 0) return `${at} seconds`
  return `${at} seconds of ${total}`
}
