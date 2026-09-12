import { describe, expect, it } from "vitest"
import {
  AUTOPLAY_IDLE,
  AUTOPLAY_NEXT_SECONDS,
  countdownProgress,
  reduceAutoplay,
  shouldOfferCountdown,
  type AutoplayEvent,
  type AutoplayState,
  type AutoplayTarget,
} from "./autoplayNext"

/**
 * The countdown's rules, without a clock.
 *
 * Every rule here is one a person would notice breaking: a countdown that
 * runs on in a background tab and comes back as a different video, a Cancel
 * that is forgotten the moment Replay is pressed, a navigation that fires
 * twice. None of them throw, and a browser with a stopwatch is the most
 * expensive place to find out about any of them.
 */

const NEXT: AutoplayTarget = { post_id: "ep3", episode_num: 3, title: "The third one" }

function ended(over: Partial<Extract<AutoplayEvent, { type: "ended" }>> = {}): AutoplayEvent {
  return { type: "ended", next: NEXT, enabled: true, visible: true, ...over }
}

function run(events: AutoplayEvent[], from: AutoplayState = AUTOPLAY_IDLE): AutoplayState {
  return events.reduce(reduceAutoplay, from)
}

function ticks(n: number): AutoplayEvent[] {
  return Array.from({ length: n }, () => ({ type: "tick" as const }))
}

describe("ended", () => {
  it("starts a ten-second count when there is a next episode and autoplay is on", () => {
    const state = reduceAutoplay(AUTOPLAY_IDLE, ended())
    expect(state).toEqual({
      kind: "counting",
      target: NEXT,
      secondsLeft: AUTOPLAY_NEXT_SECONDS,
      paused: false,
    })
    expect(AUTOPLAY_NEXT_SECONDS).toBe(10)
  })

  // Series only. The rail is a list of guesses, and a page that starts a
  // guess plays something nobody chose.
  it("stays idle with no next episode", () => {
    expect(reduceAutoplay(AUTOPLAY_IDLE, ended({ next: null }))).toEqual(AUTOPLAY_IDLE)
  })

  it("stays idle when the countdown is not enabled", () => {
    expect(reduceAutoplay(AUTOPLAY_IDLE, ended({ enabled: false }))).toEqual(AUTOPLAY_IDLE)
  })

  it("starts paused when the tab is already hidden", () => {
    const state = reduceAutoplay(AUTOPLAY_IDLE, ended({ visible: false }))
    expect(state.kind).toBe("counting")
    expect(state.kind === "counting" && state.paused).toBe(true)
  })
})

describe("tick", () => {
  it("counts down one second at a time and fires at zero", () => {
    const nine = run([ended(), ...ticks(1)])
    expect(nine.kind === "counting" && nine.secondsLeft).toBe(9)

    const almost = run([ended(), ...ticks(AUTOPLAY_NEXT_SECONDS - 1)])
    expect(almost.kind === "counting" && almost.secondsLeft).toBe(1)

    expect(run([ended(), ...ticks(AUTOPLAY_NEXT_SECONDS)])).toEqual({ kind: "fired", target: NEXT })
  })

  // A count that runs on in a background tab fires a navigation nobody saw
  // start.
  it("does not move while the tab is hidden, and resumes where it paused", () => {
    const hidden = run([ended(), ...ticks(3), { type: "hidden" }, ...ticks(5)])
    expect(hidden.kind === "counting" && hidden.secondsLeft).toBe(7)
    expect(hidden.kind === "counting" && hidden.paused).toBe(true)

    const back = run([{ type: "visible" }, ...ticks(2)], hidden)
    expect(back.kind === "counting" && back.secondsLeft).toBe(5)
  })

  it("is a no-op outside a count", () => {
    expect(reduceAutoplay(AUTOPLAY_IDLE, { type: "tick" })).toEqual(AUTOPLAY_IDLE)
    const fired: AutoplayState = { kind: "fired", target: NEXT }
    expect(reduceAutoplay(fired, { type: "tick" })).toBe(fired)
  })
})

describe("cancel", () => {
  it("stops a running count", () => {
    expect(run([ended(), ...ticks(2), { type: "cancel" }])).toEqual({ kind: "cancelled" })
  })

  // Somebody who cancelled, replayed and let it end again changed their mind
  // about the video, not about the countdown.
  it("is sticky: a replay that ends again does not restart the count", () => {
    const after = run([
      ended(),
      { type: "cancel" },
      { type: "playing" },
      ended(),
      ...ticks(AUTOPLAY_NEXT_SECONDS),
    ])
    expect(after).toEqual({ kind: "cancelled" })
  })

  it("cannot be reached from idle, so nothing is silently pre-cancelled", () => {
    expect(reduceAutoplay(AUTOPLAY_IDLE, { type: "cancel" })).toEqual(AUTOPLAY_IDLE)
    expect(run([{ type: "cancel" }, ended()]).kind).toBe("counting")
  })
})

describe("playing", () => {
  it("returns a running count to idle, and a later end starts a fresh one", () => {
    const replayed = run([ended(), ...ticks(4), { type: "playing" }])
    expect(replayed).toEqual(AUTOPLAY_IDLE)
    const again = reduceAutoplay(replayed, ended())
    expect(again.kind === "counting" && again.secondsLeft).toBe(AUTOPLAY_NEXT_SECONDS)
  })
})

describe("fired", () => {
  // The hook navigates once on this state. A second `ended` from the element
  // while the route changes must not fire twice.
  it("is terminal", () => {
    const fired = run([ended(), ...ticks(AUTOPLAY_NEXT_SECONDS)])
    expect(reduceAutoplay(fired, ended())).toBe(fired)
    expect(reduceAutoplay(fired, { type: "playing" })).toBe(fired)
    expect(reduceAutoplay(fired, { type: "cancel" })).toBe(fired)
  })
})

describe("shouldOfferCountdown", () => {
  it("needs a next episode, the preference on, and no reduced-motion request", () => {
    expect(shouldOfferCountdown({ next: NEXT, enabled: true, reducedMotion: false })).toBe(true)
    expect(shouldOfferCountdown({ next: null, enabled: true, reducedMotion: false })).toBe(false)
    expect(shouldOfferCountdown({ next: NEXT, enabled: false, reducedMotion: false })).toBe(false)
    // The page does not autoplay the video somebody navigated to under
    // reduced motion; it must not autoplay one they did not.
    expect(shouldOfferCountdown({ next: NEXT, enabled: true, reducedMotion: true })).toBe(false)
  })
})

describe("countdownProgress", () => {
  it("fills the ring as the seconds run out", () => {
    expect(countdownProgress(AUTOPLAY_NEXT_SECONDS)).toBe(0)
    expect(countdownProgress(5)).toBeCloseTo(0.5)
    expect(countdownProgress(0)).toBe(1)
  })

  it("clamps rather than drawing past the ring", () => {
    expect(countdownProgress(99)).toBe(0)
    expect(countdownProgress(-3)).toBe(1)
    expect(countdownProgress(Number.NaN)).toBe(0)
  })
})
