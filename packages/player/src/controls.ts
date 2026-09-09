/**
 * The player's controls, as arithmetic — no React, no DOM, no JSX.
 *
 * Everything a transport control has to decide is a small rule, and every one
 * of those rules is a place a player goes wrong: whether a video may play,
 * what a key press means, where a seek lands, whether the chrome is on screen.
 * Kept here so they can be tested as values rather than as a screenshot, in
 * the same spirit as `visibleFraction` and `pickActive` in `autoplay.ts` and
 * the carousel's arithmetic in @momentum/content.
 *
 * ── The rule worth reading twice: three conditions, not one ───────────────
 * `autoplay.ts` answers ONE question — which single item in the feed is the
 * one on screen — and the header there is emphatic that no second place may
 * decide it. A pause button does not add a second place; it adds a second
 * QUESTION. "May this play" was `active`; it is now `active AND the person has
 * not said stop`, and `shouldPlay` below is the only place the two meet.
 *
 * There is also a third state that is neither: a person pressing play on a
 * video the coordinator never chose. That is not hypothetical — under
 * `prefers-reduced-motion` the coordinator is disabled and NOTHING is ever
 * active, so before this file existed there was no way to play a video in the
 * feed at all. `PlaybackIntent.play` is what makes that possible, and
 * `manualPlayback.ts` is what stops it from breaking the one-video rule.
 *
 * ── Why intent resets when a card scrolls away ───────────────────────────
 * See `intentOnActiveChange`. The short version: `active` going false already
 * pauses AND rewinds to zero, so the thing the pause referred to no longer
 * exists by the time the card comes back.
 */

/**
 * What the PERSON has said about playback, which is not the same question as
 * whether the video is currently playing.
 *
 *   auto   they have not said anything; the coordinator decides.
 *   play   they pressed play. Overrides a coordinator that says no.
 *   pause  they pressed pause. Overrides a coordinator that says yes.
 */
export type PlaybackIntent = "auto" | "play" | "pause"

/**
 * The one place `active` and user intent meet.
 *
 * Deliberately total and deliberately boring: there are six combinations and
 * all six are written out in the tests, because "the video kept playing after
 * I scrolled away" is a bug that costs a creator's payout its honesty and is
 * invisible in a screenshot.
 */
export function shouldPlay(active: boolean, intent: PlaybackIntent): boolean {
  if (intent === "pause") return false
  if (intent === "play") return true
  return active
}

/**
 * What intent survives the coordinator changing its mind.
 *
 * Nothing does. Both transitions clear it, for two different reasons:
 *
 *   active true → false   The card left the screen. `MomentumVideo` pauses and
 *                         rewinds `currentTime` to 0 on exactly this edge, so
 *                         a "pause" that is still held on the way back refers
 *                         to a playhead position that no longer exists — the
 *                         person would return to a poster frame with no
 *                         indication anything was ever paused, which reads as
 *                         a broken video rather than as a remembered choice.
 *                         Clearing it also revokes any manual play, which is
 *                         what keeps an off-screen video from playing on.
 *
 *   active false → true    The card is now the one the coordinator chose. A
 *                         "play" held from a reduced-motion session is now
 *                         redundant, and a stale "pause" would make the one
 *                         card on screen the one card that will not start.
 *
 * The consequence, stated plainly so nobody has to discover it: pause a video,
 * scroll it off screen, scroll back, and it autoplays again from the start.
 * That is the same thing the feed does to a video you simply scrolled past,
 * and treating a paused video differently would mean the feed had a hidden
 * mode with no affordance to leave it.
 */
export function intentOnActiveChange(_intent: PlaybackIntent): PlaybackIntent {
  return "auto"
}

/** Pressing the play/pause control, whatever the video is doing right now. */
export function toggleIntent(active: boolean, intent: PlaybackIntent): PlaybackIntent {
  return shouldPlay(active, intent) ? "pause" : "play"
}

/* ── Seeking ─────────────────────────────────────────────────────────────── */

/** The step an arrow key takes, in seconds. YouTube's five, and everyone's. */
export const SEEK_STEP_SECONDS = 5

/**
 * Where a relative seek lands.
 *
 * Clamped at both ends, and 0 rather than NaN for a duration the element has
 * not worked out yet — `video.duration` is `NaN` until metadata arrives, and
 * assigning NaN to `currentTime` throws in Firefox.
 */
export function seekTarget(currentSeconds: number, deltaSeconds: number, durationSeconds: number): number {
  const from = Number.isFinite(currentSeconds) ? currentSeconds : 0
  const next = from + deltaSeconds
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return Math.max(0, next)
  // A hair short of the end: seeking exactly to `duration` fires `ended`, so
  // holding the right arrow would end the view rather than scrub to the end.
  return Math.min(Math.max(0, next), Math.max(0, durationSeconds - 0.05))
}

/** Where a click at `x` on a `width`-wide progress bar lands, in seconds. */
export function scrubTarget(offsetX: number, width: number, durationSeconds: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const fraction = Math.min(1, Math.max(0, offsetX / width))
  return seekTarget(0, fraction * durationSeconds, durationSeconds)
}

/** 0..1, for the progress bar's width. Zero rather than NaN before metadata. */
export function progressFraction(currentSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  if (!Number.isFinite(currentSeconds) || currentSeconds <= 0) return 0
  return Math.min(1, currentSeconds / durationSeconds)
}

/* ── Keyboard ────────────────────────────────────────────────────────────── */

export type ControlAction =
  | { kind: "toggle-play" }
  | { kind: "toggle-muted" }
  | { kind: "seek"; deltaSeconds: number }
  | { kind: "seek-to-fraction"; fraction: number }

/**
 * What a key press means to a focused player.
 *
 * The conventions a browser user already has, and no invented ones:
 * Space and K play/pause, M mutes, the arrows seek, Home/End jump to the ends,
 * the number row jumps to that tenth. `null` for everything else, so the key
 * reaches the page — a player that swallowed Tab or PageDown would trap a
 * keyboard user inside a video in the middle of a feed.
 *
 * Modifier chords are never ours: Ctrl+Left is "back" in some browsers and
 * Cmd+M minimises the window on macOS. Claiming those would break the OS to
 * mute a video.
 */
export function keyAction(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}
): ControlAction | null {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return null

  switch (key) {
    case " ":
    // Some engines still report the legacy name for the space bar.
    case "Spacebar":
    case "k":
    case "K":
      return { kind: "toggle-play" }
    case "m":
    case "M":
      return { kind: "toggle-muted" }
    case "ArrowRight":
      return { kind: "seek", deltaSeconds: SEEK_STEP_SECONDS }
    case "ArrowLeft":
      return { kind: "seek", deltaSeconds: -SEEK_STEP_SECONDS }
    case "Home":
      return { kind: "seek-to-fraction", fraction: 0 }
    case "End":
      return { kind: "seek-to-fraction", fraction: 1 }
    default: {
      if (key.length === 1 && key >= "0" && key <= "9") {
        return { kind: "seek-to-fraction", fraction: Number(key) / 10 }
      }
      return null
    }
  }
}

/* ── The chrome, and when it is on screen ────────────────────────────────── */

/**
 * How long after the last pointer movement the controls fade, in ms.
 *
 * Three seconds, which is `AUTO_HIDE_MILLIS` in the Android tube player
 * (feature/tube/.../watch/WatchControls.kt) — the one surface on the phone
 * that has a full transport, and therefore the one worth matching. Long enough
 * to travel from the edge of a card to a small button without the target
 * vanishing under the cursor, short enough that the chrome is not sitting over
 * the picture while somebody watches.
 */
export const CONTROLS_HIDE_MS = 3_000

export interface ChromeState {
  playing: boolean
  /**
   * Has this video ever actually run? A poster nobody has started is not a
   * "paused video" and must not be dressed as one.
   */
  started: boolean
  hovered: boolean
  focused: boolean
  /**
   * Has the pointer moved, or a control been used, within CONTROLS_HIDE_MS?
   * The auto-hide timer, expressed as a flag.
   */
  recentlyMoved: boolean
  /**
   * Did a TOUCH ask for the chrome, inside the same window?
   *
   * A finger has no hover, so `hovered` is never usefully true on a phone and
   * a transport gated on it alone would be permanently unreachable there. A
   * tap on a playing video sets this instead, and it decays on the same timer.
   * `tapOutcome` is the other half of the rule.
   */
  revealed: boolean
}

/**
 * Whether the transport is on screen — the bottom bar AND the speaker, as one.
 *
 * ── One answer, where there used to be three ─────────────────────────────
 * Each control had its own rule, which is how this player ended up with a big
 * glyph in the CENTRE of the picture coming and going on a different schedule
 * from the scrubber beneath it. A centre play button on a feed video is a
 * design error twice over: it sits exactly where a person is trying to look,
 * and it competes with the press-anywhere-to-toggle behaviour that every video
 * on the web already has — the thing under the cursor is a button that does
 * the same job as the picture behind it, so a mistimed fade reads as "the
 * pause button didn't work". It is gone. The transport is one object now, and
 * one object has one visibility.
 *
 * The rules, in order:
 *
 *   NOT PLAYING → always. This is what makes a pause button usable at all: a
 *     transport that faded over a stopped video would leave a still frame with
 *     no way to restart it and no sign that anything had been paused. It is
 *     also the poster affordance on the other nineteen cards in a feed — the
 *     coordinator plays one video at a time, so everything else is a still,
 *     and a still with a play button is how the web says "this is a video".
 *
 *   FOCUSED → always, for the reason a focused control may never be invisible:
 *     a sighted keyboard user has otherwise lost the thing they are driving.
 *     Not hover's poor relation; it is the entire keyboard story.
 *
 *   HOVERED or REVEALED, and recently → the mouse case and the touch case.
 *     They differ only in what starts the timer, so they share everything after
 *     it.
 */
export function chromeVisible(input: ChromeState): boolean {
  if (!input.playing) return true
  if (input.focused) return true
  return (input.hovered || input.revealed) && input.recentlyMoved
}

/**
 * Whether the scrubber and its clock are drawn.
 *
 * The chrome's rule AND one more, and the extra condition is the whole point.
 * A feed holds twenty cards and nineteen of them are stopped at zero; giving
 * each one a live scrubber paints nineteen empty progress bars across the page
 * and — far worse — puts nineteen extra `role="slider"` tab stops between a
 * keyboard user and the bottom of the feed.
 *
 * So a scrubber needs something to scrub: a video that has run. `MomentumVideo`
 * enforces it harder than this function can, by keeping `role="slider"` out of
 * the document entirely until then — an untouched feed has zero of them, not
 * nineteen wearing `tabIndex={-1}`.
 */
export function scrubberVisible(input: ChromeState): boolean {
  return input.started && chromeVisible(input)
}

/**
 * The hairline along the bottom edge: shown when the scrubber is not, for a
 * video that has something to report. This is `ProgressLine` in the Android
 * tube player, which appears exactly when its controls auto-hide.
 */
export function restingLineVisible(input: ChromeState): boolean {
  return input.started && !scrubberVisible(input)
}

/**
 * What a press on the PICTURE means.
 *
 * A mouse always toggles. It cannot press blind: reaching the video moves the
 * pointer, and the movement is itself what summons the chrome, so by the time
 * the click lands the person has already seen what they are pressing.
 *
 * A finger is different, and this is the rule that makes the transport usable
 * on a phone at all. There is no hover, so a tap on a playing video whose
 * chrome has faded would toggle something invisible — somebody reaches for a
 * video to find its controls and silently stops it instead. So the FIRST tap
 * reveals, and only a tap while the transport is already on screen toggles.
 * Which is what every video app on a phone does.
 *
 * Pen counts as touch. It hovers on some digitisers and not on others, and the
 * cost of guessing wrong is a control nobody can find.
 */
export function tapOutcome(pointerType: string, isChromeVisible: boolean): "reveal" | "toggle" {
  if (pointerType === "touch" || pointerType === "pen") {
    return isChromeVisible ? "toggle" : "reveal"
  }
  return "toggle"
}

/**
 * `1:04`, `12:03`, `1:02:03`.
 *
 * Hours only when there are hours: a two-minute flick reading `0:01:04` puts
 * two characters of nothing over the picture on every card in the feed.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
