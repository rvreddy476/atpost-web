/**
 * The countdown to the next episode, as a state machine with no clock in it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SERIES ONLY, AND NOTHING ELSE STARTS BY ITSELF
 *
 * The founder's decision, and it is the right one: a series is the one thing
 * on this platform with an ORDER. Somebody at the end of episode 2 has told
 * the page, by being there, what they want next. The recommendations rail is
 * a list of guesses, and a page that starts playing a guess is a page that
 * plays something nobody chose, with sound, on a tab they may have stopped
 * looking at. So `ended` with no `next` is `idle`, always, and after the LAST
 * episode the end screen offers rather than decides.
 *
 * ── Pure, so every rule is a test rather than a stopwatch ─────────────────
 * The hook in ./useAutoplayNext.ts owns the interval, the visibility listener
 * and the keyboard; this file owns what they MEAN. Ten seconds is long enough
 * that Cancel is a real choice and short enough that nobody reaches for the
 * rail instead; the number lives here so the card's ring and the reducer's
 * count cannot drift apart.
 *
 * ── The rules, each of which is a sentence somebody could be surprised by ─
 *
 *   · Cancel is STICKY for the view. Somebody who cancelled, pressed Replay
 *     and let the video end again did not change their mind about the
 *     countdown; they changed their mind about the video. Asking again would
 *     be nagging. Navigating to another episode mounts a fresh view (the
 *     watch page is keyed on the post), so the stickiness ends there.
 *
 *   · The count only moves while the tab is visible. A countdown that runs
 *     on in a background tab fires a navigation nobody saw start, and comes
 *     back as "why is this a different video". Hidden pauses; visible
 *     resumes from where it paused rather than restarting.
 *
 *   · `playing` returns to idle from counting. Pressing play on the ended
 *     video, or a Replay, is the person choosing THIS video again, and the
 *     next one must not arrive over the top of it.
 *
 *   · `fired` is terminal. The hook navigates on it once; a second `ended`
 *     from the element while the route is still changing must not fire twice.
 */

/** Seconds from the end of an episode to the start of the next. */
export const AUTOPLAY_NEXT_SECONDS = 10

/** What the countdown is counting towards. The thin shape the rail already has. */
export interface AutoplayTarget {
  post_id: string
  episode_num: number
  title?: string | null
}

export type AutoplayState =
  | { kind: "idle" }
  | {
      kind: "counting"
      target: AutoplayTarget
      secondsLeft: number
      /** The tab is hidden; ticks are ignored until it is visible again. */
      paused: boolean
    }
  | { kind: "cancelled" }
  | { kind: "fired"; target: AutoplayTarget }

export type AutoplayEvent =
  | {
      type: "ended"
      next: AutoplayTarget | null
      /** `shouldOfferCountdown` already applied: the preference and reduced motion. */
      enabled: boolean
      /** Whether the tab is visible right now, so a count started hidden starts paused. */
      visible: boolean
    }
  | { type: "tick" }
  | { type: "cancel" }
  | { type: "playing" }
  | { type: "hidden" }
  | { type: "visible" }

export const AUTOPLAY_IDLE: AutoplayState = { kind: "idle" }

export function reduceAutoplay(state: AutoplayState, event: AutoplayEvent): AutoplayState {
  switch (event.type) {
    case "ended": {
      // Sticky and terminal states are unmoved by the video ending again.
      if (state.kind === "cancelled" || state.kind === "fired") return state
      if (!event.next || !event.enabled) return AUTOPLAY_IDLE
      return {
        kind: "counting",
        target: event.next,
        secondsLeft: AUTOPLAY_NEXT_SECONDS,
        paused: !event.visible,
      }
    }
    case "tick": {
      if (state.kind !== "counting" || state.paused) return state
      const secondsLeft = state.secondsLeft - 1
      if (secondsLeft <= 0) return { kind: "fired", target: state.target }
      return { ...state, secondsLeft }
    }
    case "cancel":
      // Only a running count can be cancelled. Cancelling from idle would
      // make the sticky state reachable without a countdown ever having been
      // shown, and the next `ended` would then silently never offer one.
      return state.kind === "counting" ? { kind: "cancelled" } : state
    case "playing":
      return state.kind === "counting" ? AUTOPLAY_IDLE : state
    case "hidden":
      return state.kind === "counting" ? { ...state, paused: true } : state
    case "visible":
      return state.kind === "counting" ? { ...state, paused: false } : state
    default:
      return state
  }
}

/**
 * Should a countdown be offered at all?
 *
 * Three things have to be true: there is a next episode, the viewer has not
 * turned the preference off, and they have not asked their operating system
 * for less motion. The last one matches what this page already does for the
 * first play: `WatchScreen` does not autoplay under `prefers-reduced-motion`,
 * and a page that would not start the video somebody navigated to has no
 * business starting one they did not. The end screen still offers the next
 * episode as a button in every one of the three refusals.
 */
export function shouldOfferCountdown(input: {
  next: AutoplayTarget | null
  enabled: boolean
  reducedMotion: boolean
}): boolean {
  return input.next !== null && input.enabled && !input.reducedMotion
}

/** The ring's fill, 0 to 1, for a given number of seconds left. */
export function countdownProgress(secondsLeft: number): number {
  if (!Number.isFinite(secondsLeft)) return 0
  const clamped = Math.min(AUTOPLAY_NEXT_SECONDS, Math.max(0, secondsLeft))
  return 1 - clamped / AUTOPLAY_NEXT_SECONDS
}
