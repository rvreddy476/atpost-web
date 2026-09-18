import { describe, expect, it } from "vitest"
import {
  DOUBLE_TAP_MS,
  doubleTapOutcome,
  isDoubleTap,
  muteLabel,
  playLabel,
  positionLabel,
  progressFraction,
  seekFraction,
  seekTarget,
  stateAnnouncement,
} from "./transport"

describe("progressFraction", () => {
  it("is the position over the duration", () => {
    expect(progressFraction(15, 60)).toBe(0.25)
  })

  it("answers 0 rather than NaN before metadata loads", () => {
    // `video.duration` is NaN until then, and a NaN reaching a style attribute
    // produces a bar that is silently not drawn at all — a progress bar that
    // never appears on exactly the videos that took longest to load.
    expect(progressFraction(0, Number.NaN)).toBe(0)
    expect(progressFraction(Number.NaN, 30)).toBe(0)
    expect(progressFraction(5, 0)).toBe(0)
  })

  it("answers 0 for a live stream's infinite duration", () => {
    expect(progressFraction(5, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it("clamps at both ends", () => {
    expect(progressFraction(90, 60)).toBe(1)
    expect(progressFraction(-5, 60)).toBe(0)
  })
})

describe("seekFraction", () => {
  it("is the offset over the width", () => {
    expect(seekFraction(50, 200)).toBe(0.25)
  })

  it("clamps a drag that left the bar", () => {
    // Most drags leave it — the bar is 3px tall and the element captured the
    // pointer — so dragging off the left edge has to mean "the beginning"
    // rather than "stop seeking".
    expect(seekFraction(-40, 200)).toBe(0)
    expect(seekFraction(400, 200)).toBe(1)
  })

  it("refuses a zero-width bar instead of dividing by it", () => {
    expect(seekFraction(10, 0)).toBe(0)
  })
})

describe("seekTarget", () => {
  it("maps a fraction onto the duration", () => {
    expect(seekTarget(0.5, 60)).toBe(30)
  })

  it("never lands on the very last frame", () => {
    // Seeking exactly to `duration` on a LOOPING video fires `ended`
    // immediately and jumps back to zero, so dragging to the right edge would
    // restart the short rather than show its final frame.
    expect(seekTarget(1, 60)).toBeCloseTo(59.9)
  })

  it("has nowhere to seek in a video with no duration", () => {
    expect(seekTarget(0.5, 0)).toBe(0)
    expect(seekTarget(0.5, Number.NaN)).toBe(0)
  })
})

describe("isDoubleTap", () => {
  it("is false for the very first press", () => {
    // Not "a very old timestamp": subtracting from a sentinel number is how a
    // surface ends up liking a short on the first tap after midnight.
    expect(isDoubleTap(null, 1_000)).toBe(false)
  })

  it("is true inside the window and false outside it", () => {
    expect(isDoubleTap(1_000, 1_000 + DOUBLE_TAP_MS)).toBe(true)
    expect(isDoubleTap(1_000, 1_000 + DOUBLE_TAP_MS + 1)).toBe(false)
  })
})

describe("doubleTapOutcome", () => {
  it("likes a short that is not liked", () => {
    expect(doubleTapOutcome(false)).toBe("like")
  })

  it("NEVER unlikes one that is", () => {
    // The one place this surface refuses to be a toggle. People double-tap a
    // short they already liked without meaning anything by it, and a gesture
    // that silently removed a like — no control pressed, no confirmation —
    // would be destroying a signal the creator is ranked on. Null also means
    // no burst: a heart that celebrates nothing teaches people it failed.
    expect(doubleTapOutcome(true)).toBeNull()
  })
})

describe("muteLabel / playLabel", () => {
  it("names the action, not the state", () => {
    // `aria-pressed` carries the state, which is what it is for. "Muted" as a
    // name leaves you guessing what pressing it does.
    expect(muteLabel(true)).toBe("Unmute")
    expect(muteLabel(false)).toBe("Mute")
    expect(playLabel(true)).toBe("Play")
    expect(playLabel(false)).toBe("Pause")
  })
})

describe("stateAnnouncement", () => {
  it("has a sentence for every change the surface makes", () => {
    const changes = [
      "liked",
      "unliked",
      "saved",
      "unsaved",
      "muted",
      "unmuted",
      "paused",
      "playing",
    ] as const
    for (const change of changes) {
      expect(stateAnnouncement(change).length).toBeGreaterThan(0)
    }
  })

  it("distinguishes the two directions of every toggle", () => {
    expect(stateAnnouncement("liked")).not.toBe(stateAnnouncement("unliked"))
    expect(stateAnnouncement("saved")).not.toBe(stateAnnouncement("unsaved"))
    expect(stateAnnouncement("muted")).not.toBe(stateAnnouncement("unmuted"))
  })
})

describe("positionLabel", () => {
  it("speaks whole seconds", () => {
    // A scrubber on a short is dragged to a moment, not to a frame, and
    // "12.4166 seconds" is not a thing anybody wants read out.
    expect(positionLabel(12.4166, 58.2)).toBe("12 seconds of 58")
  })

  it("says only the position when the duration is not known yet", () => {
    expect(positionLabel(3, Number.NaN)).toBe("3 seconds")
    expect(positionLabel(3, 0)).toBe("3 seconds")
  })
})
