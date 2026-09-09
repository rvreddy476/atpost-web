import { describe, expect, it } from "vitest"
import {
  collapsesOnKey,
  expandAriaLabel,
  expandLabel,
  expandTarget,
  frameClass,
  isExpanded,
  locksDocumentScroll,
  type ExpandMode,
} from "./expand"

/**
 * The expand control, asserted without a browser.
 *
 * These are the three things about it that would ship silently. A control that
 * still says "Full video" while the video is already full screen is how an
 * expanded player traps somebody. A theatre overlay that does not lock the
 * document leaves the page scrolled somewhere else when it closes. And
 * handling Escape in real fullscreen — where the browser already handles it —
 * is a second exit racing the first, which shows up as a player that leaves
 * fullscreen and instantly re-enters it. None of the three throws.
 */

const MODES: ExpandMode[] = ["inline", "fullscreen", "theatre"]

describe("expandTarget", () => {
  it("prefers the browser's real fullscreen", () => {
    expect(expandTarget(true)).toBe("fullscreen")
  })

  it("falls back to the in-page overlay where there is no Fullscreen API", () => {
    // iPhone Safari has no Element.requestFullscreen, and the call rejects in
    // an iframe without allow="fullscreen". A rejected promise there is
    // silent, so without this branch the button does nothing at all.
    expect(expandTarget(false)).toBe("theatre")
  })

  it("never targets inline — that is what collapsing is for", () => {
    expect(expandTarget(true)).not.toBe("inline")
    expect(expandTarget(false)).not.toBe("inline")
  })
})

describe("isExpanded", () => {
  it("treats both expansions as expanded", () => {
    expect(isExpanded("inline")).toBe(false)
    expect(isExpanded("fullscreen")).toBe(true)
    expect(isExpanded("theatre")).toBe(true)
  })
})

describe("the label", () => {
  it("says what it will do, not what happened", () => {
    expect(expandLabel("inline")).toBe("Full video")
  })

  it("becomes its own opposite once expanded, in BOTH modes", () => {
    // The way back has to be visible. A control still reading "Full video"
    // over a full-screen video is the trap.
    expect(expandLabel("fullscreen")).toBe("Exit full video")
    expect(expandLabel("theatre")).toBe("Exit full video")
  })

  it("keeps the founder's own words rather than translating them", () => {
    expect(expandLabel("inline")).toContain("Full video")
    expect(expandLabel("inline")).not.toContain("Fullscreen")
  })

  it("tells a screen reader how to get back out", () => {
    expect(expandAriaLabel("fullscreen")).toContain("Escape")
    expect(expandAriaLabel("theatre")).toContain("Escape")
    expect(expandAriaLabel("inline")).not.toContain("Escape")
  })

  it("has a name for every mode", () => {
    for (const mode of MODES) {
      expect(expandLabel(mode).length).toBeGreaterThan(0)
      expect(expandAriaLabel(mode).length).toBeGreaterThan(0)
    }
  })
})

describe("frameClass", () => {
  it("keeps the 16:9 slot the page reserved while inline", () => {
    expect(frameClass("inline")).toContain("aspect-video")
    expect(frameClass("inline")).not.toContain("tube-theatre")
  })

  it("drops the aspect cap in BOTH expanded modes", () => {
    // Including real fullscreen: a :fullscreen element is sized by the
    // browser, but an aspect-[16/9] on it still letterboxes inside that
    // screen and the page's max-w still caps it.
    for (const mode of ["fullscreen", "theatre"] as const) {
      expect(frameClass(mode)).toContain("tube-theatre")
      expect(frameClass(mode)).not.toContain("aspect-video")
    }
  })

  it("always positions the box, because the player's controls are absolute", () => {
    // MomentumVideo places its transport absolutely inside whatever box it is
    // given; an unpositioned one lets the controls escape to the nearest
    // positioned ancestor, which on this page is several hundred pixels away.
    for (const mode of MODES) {
      expect(frameClass(mode)).toContain("relative")
    }
  })
})

describe("collapsesOnKey", () => {
  it("exits the in-page overlay on Escape", () => {
    expect(collapsesOnKey("theatre", "Escape")).toBe(true)
  })

  it("leaves Escape to the browser in real fullscreen", () => {
    // The browser consumes it and fires fullscreenchange, which the hook
    // already listens for. Handling it here too is a second exit racing the
    // first — observed as a player that exits and instantly re-enters.
    expect(collapsesOnKey("fullscreen", "Escape")).toBe(false)
  })

  it("does nothing while the player is inline", () => {
    expect(collapsesOnKey("inline", "Escape")).toBe(false)
  })

  it("ignores every other key", () => {
    for (const key of ["Enter", " ", "f", "F", "ArrowDown", "Esc"]) {
      expect(collapsesOnKey("theatre", key)).toBe(false)
    }
  })

  it("leaves a modified Escape alone — browsers and extensions bind them", () => {
    expect(collapsesOnKey("theatre", "Escape", { ctrl: true })).toBe(false)
    expect(collapsesOnKey("theatre", "Escape", { meta: true })).toBe(false)
    expect(collapsesOnKey("theatre", "Escape", { alt: true })).toBe(false)
    expect(collapsesOnKey("theatre", "Escape", { shift: true })).toBe(false)
  })
})

describe("locksDocumentScroll", () => {
  it("locks the page under a fixed overlay, and only there", () => {
    // A wheel over the overlay would otherwise scroll the document behind it,
    // so leaving the expansion lands somewhere other than where it started.
    expect(locksDocumentScroll("theatre")).toBe(true)
    // Real fullscreen takes the document out of the picture entirely.
    expect(locksDocumentScroll("fullscreen")).toBe(false)
    expect(locksDocumentScroll("inline")).toBe(false)
  })
})
