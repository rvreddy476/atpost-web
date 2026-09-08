import { describe, expect, it } from "vitest"
import {
  CONTROLS_HIDE_MS,
  SEEK_STEP_SECONDS,
  formatClock,
  intentOnActiveChange,
  keyAction,
  playGlyphVisible,
  progressFraction,
  restingLineVisible,
  scrubTarget,
  scrubberVisible,
  seekTarget,
  shouldPlay,
  toggleIntent,
  type PlaybackIntent,
} from "./controls"

/**
 * The six combinations are written out rather than generated, because this is
 * the table the one-video-at-a-time rule now rests on and a loop that produced
 * it would be as easy to get wrong as the code.
 */
describe("shouldPlay", () => {
  it("follows the coordinator when nobody has said otherwise", () => {
    expect(shouldPlay(true, "auto")).toBe(true)
    expect(shouldPlay(false, "auto")).toBe(false)
  })

  it("lets a person stop the one video the coordinator chose", () => {
    expect(shouldPlay(true, "pause")).toBe(false)
  })

  it("lets a person start a video the coordinator did not choose", () => {
    // The whole of a reduced-motion session: `activeId` is null for ever, so
    // without this there is no way to play anything in the feed at all.
    expect(shouldPlay(false, "play")).toBe(true)
  })

  it("is unambiguous in the two redundant cases", () => {
    expect(shouldPlay(true, "play")).toBe(true)
    expect(shouldPlay(false, "pause")).toBe(false)
  })
})

describe("intentOnActiveChange", () => {
  it("clears whatever the person said, in both directions", () => {
    // Scrolling away rewinds the video, so a pause held across that edge
    // refers to a playhead that no longer exists.
    const intents: PlaybackIntent[] = ["auto", "play", "pause"]
    for (const intent of intents) expect(intentOnActiveChange(intent)).toBe("auto")
  })

  it("means a paused video autoplays again after a scroll away and back", () => {
    // Stated as a test because it is the surprising half of the decision and
    // somebody will come here to check it was deliberate. It was.
    const afterScrollAway = intentOnActiveChange("pause")
    expect(shouldPlay(false, afterScrollAway)).toBe(false)
    const afterScrollBack = intentOnActiveChange(afterScrollAway)
    expect(shouldPlay(true, afterScrollBack)).toBe(true)
  })
})

describe("toggleIntent", () => {
  it("stops what is playing and starts what is not", () => {
    expect(toggleIntent(true, "auto")).toBe("pause")
    expect(toggleIntent(true, "pause")).toBe("play")
    expect(toggleIntent(false, "auto")).toBe("play")
    expect(toggleIntent(false, "play")).toBe("pause")
  })

  it("always changes what is happening, whatever the previous intent was", () => {
    const cases: Array<[boolean, PlaybackIntent]> = [
      [true, "auto"],
      [true, "play"],
      [true, "pause"],
      [false, "auto"],
      [false, "play"],
      [false, "pause"],
    ]
    for (const [active, intent] of cases) {
      const before = shouldPlay(active, intent)
      const after = shouldPlay(active, toggleIntent(active, intent))
      expect(after).toBe(!before)
    }
  })
})

describe("seekTarget", () => {
  it("moves by the delta and clamps at zero", () => {
    expect(seekTarget(30, SEEK_STEP_SECONDS, 120)).toBe(35)
    expect(seekTarget(2, -SEEK_STEP_SECONDS, 120)).toBe(0)
  })

  it("stops just short of the end rather than ending the view", () => {
    // Landing exactly on `duration` fires `ended`, so holding the right arrow
    // would end the view rather than scrub to the end of it.
    expect(seekTarget(119, 30, 120)).toBeCloseTo(119.95)
    expect(seekTarget(119, 30, 120)).toBeLessThan(120)
  })

  it("survives a duration the element has not worked out yet", () => {
    // `video.duration` is NaN until metadata arrives, and assigning NaN to
    // currentTime throws in Firefox.
    expect(seekTarget(10, 5, Number.NaN)).toBe(15)
    expect(seekTarget(Number.NaN, 5, Number.NaN)).toBe(5)
    expect(seekTarget(10, 5, 0)).toBe(15)
  })
})

describe("scrubTarget", () => {
  it("maps a click across the bar onto the timeline", () => {
    expect(scrubTarget(0, 200, 100)).toBe(0)
    expect(scrubTarget(100, 200, 100)).toBe(50)
  })

  it("clamps a drag that left the bar at either end", () => {
    expect(scrubTarget(-40, 200, 100)).toBe(0)
    expect(scrubTarget(9_999, 200, 100)).toBeLessThan(100)
  })

  it("returns zero rather than NaN before the bar has been laid out", () => {
    expect(scrubTarget(50, 0, 100)).toBe(0)
    expect(scrubTarget(50, 200, Number.NaN)).toBe(0)
  })
})

describe("progressFraction", () => {
  it("is a fraction, and never more than one", () => {
    expect(progressFraction(30, 120)).toBe(0.25)
    expect(progressFraction(200, 120)).toBe(1)
  })

  it("is zero rather than NaN before metadata arrives", () => {
    expect(progressFraction(0, Number.NaN)).toBe(0)
    expect(progressFraction(Number.NaN, 120)).toBe(0)
    expect(progressFraction(10, 0)).toBe(0)
  })
})

describe("keyAction", () => {
  it("claims the transport conventions a browser user already has", () => {
    expect(keyAction(" ")).toEqual({ kind: "toggle-play" })
    expect(keyAction("k")).toEqual({ kind: "toggle-play" })
    expect(keyAction("K")).toEqual({ kind: "toggle-play" })
    expect(keyAction("m")).toEqual({ kind: "toggle-muted" })
    expect(keyAction("ArrowRight")).toEqual({ kind: "seek", deltaSeconds: SEEK_STEP_SECONDS })
    expect(keyAction("ArrowLeft")).toEqual({ kind: "seek", deltaSeconds: -SEEK_STEP_SECONDS })
    expect(keyAction("Home")).toEqual({ kind: "seek-to-fraction", fraction: 0 })
    expect(keyAction("End")).toEqual({ kind: "seek-to-fraction", fraction: 1 })
    expect(keyAction("5")).toEqual({ kind: "seek-to-fraction", fraction: 0.5 })
  })

  it("still understands the legacy name for the space bar", () => {
    expect(keyAction("Spacebar")).toEqual({ kind: "toggle-play" })
  })

  it("leaves every other key to the page", () => {
    // A player that swallowed Tab or PageDown would trap a keyboard user
    // inside a video in the middle of an infinite feed.
    expect(keyAction("Tab")).toBeNull()
    expect(keyAction("PageDown")).toBeNull()
    expect(keyAction("Enter")).toBeNull()
    expect(keyAction("a")).toBeNull()
  })

  it("never claims a modifier chord", () => {
    // Ctrl+Left is "back" in some browsers and Cmd+M minimises the window on
    // macOS. Claiming those breaks the OS in order to mute a video.
    expect(keyAction("ArrowLeft", { ctrl: true })).toBeNull()
    expect(keyAction("m", { meta: true })).toBeNull()
    expect(keyAction(" ", { alt: true })).toBeNull()
  })
})

describe("playGlyphVisible", () => {
  const base = { playing: true, started: true, hovered: false, focused: false, recentlyMoved: false }

  it("always shows over a stopped video", () => {
    // The rule that makes a pause button usable at all: chrome that faded
    // while the video was stopped would leave a still frame with no way to
    // restart it and no clue anything had been paused.
    expect(playGlyphVisible({ ...base, playing: false })).toBe(true)
  })

  it("shows on a poster that has never run", () => {
    // The other nineteen cards in a feed. A still with a play triangle is how
    // the web says "this is a video".
    expect(playGlyphVisible({ ...base, playing: false, started: false })).toBe(true)
  })

  it("hides over a video that is playing and untouched", () => {
    expect(playGlyphVisible(base)).toBe(false)
  })

  it("shows while the pointer is over the video and moving", () => {
    expect(playGlyphVisible({ ...base, hovered: true, recentlyMoved: true })).toBe(true)
  })

  it("fades once the pointer has been still, even while hovering", () => {
    expect(playGlyphVisible({ ...base, hovered: true, recentlyMoved: false })).toBe(false)
  })

  it("stays while something inside has keyboard focus", () => {
    // A focused control that is invisible is a control a sighted keyboard
    // user has lost.
    expect(playGlyphVisible({ ...base, focused: true })).toBe(true)
  })

  it("matches the phone's tube player's auto-hide delay", () => {
    expect(CONTROLS_HIDE_MS).toBe(3_000)
  })
})

describe("scrubberVisible", () => {
  const base = { playing: false, started: true, hovered: false, focused: false, recentlyMoved: false }

  it("never appears on a video that has not run", () => {
    // This is the one that keeps a feed usable. Nineteen stopped posters each
    // wearing a scrubber is nineteen empty bars and — far worse — nineteen
    // extra slider tab stops before the bottom of the page.
    expect(scrubberVisible({ ...base, started: false })).toBe(false)
    expect(scrubberVisible({ ...base, started: false, hovered: true, recentlyMoved: true })).toBe(false)
    expect(scrubberVisible({ ...base, started: false, focused: true })).toBe(false)
  })

  it("appears on a video that has run and is now stopped", () => {
    expect(scrubberVisible(base)).toBe(true)
  })

  it("otherwise behaves like the glyph", () => {
    const playing = { ...base, playing: true }
    expect(scrubberVisible(playing)).toBe(false)
    expect(scrubberVisible({ ...playing, hovered: true, recentlyMoved: true })).toBe(true)
    expect(scrubberVisible({ ...playing, focused: true })).toBe(true)
  })
})

describe("restingLineVisible", () => {
  const base = { playing: true, started: true, hovered: false, focused: false, recentlyMoved: false }

  it("is the scrubber's shadow: shown exactly when the scrubber is not", () => {
    // Never both, or the bottom edge carries two progress indicators.
    const cases = [
      base,
      { ...base, hovered: true, recentlyMoved: true },
      { ...base, focused: true },
      { ...base, playing: false },
      { ...base, started: false },
    ]
    for (const c of cases) {
      if (!c.started) {
        expect(restingLineVisible(c)).toBe(false)
      } else {
        expect(restingLineVisible(c)).toBe(!scrubberVisible(c))
      }
    }
  })

  it("says nothing about a video that has not run", () => {
    expect(restingLineVisible({ ...base, started: false })).toBe(false)
  })
})

describe("formatClock", () => {
  it("writes hours only when there are hours", () => {
    expect(formatClock(0)).toBe("0:00")
    expect(formatClock(64)).toBe("1:04")
    expect(formatClock(723)).toBe("12:03")
    expect(formatClock(3_723)).toBe("1:02:03")
  })

  it("never prints a negative or a NaN over a picture", () => {
    expect(formatClock(-5)).toBe("0:00")
    expect(formatClock(Number.NaN)).toBe("0:00")
  })
})
