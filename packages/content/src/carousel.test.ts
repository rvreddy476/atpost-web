import { describe, expect, it } from "vitest"
import {
  arrowLabel,
  carouselLabel,
  clampPage,
  controlsVisible,
  dragTarget,
  isPageActive,
  isPageRendered,
  keyTarget,
  pageFromScroll,
  pillLabel,
  pipLabel,
  slideLabel,
  stepTarget,
} from "./carousel"

/**
 * The numbers below are the real ones: a 570px feed column is what the social
 * zone's `max-w-xl` produces, and the 2-photo post in the live feed
 * (7cb92b2c-…, two 1080x1350 images) is what the pill and the pips were read
 * against in the browser.
 */
const WIDTH = 570

describe("pageFromScroll", () => {
  it("reads the page from the scroller rather than remembering one", () => {
    expect(pageFromScroll(0, WIDTH, 5)).toBe(0)
    expect(pageFromScroll(WIDTH, WIDTH, 5)).toBe(1)
    expect(pageFromScroll(WIDTH * 4, WIDTH, 5)).toBe(4)
  })

  it("rounds to the nearest page mid-scroll, so the pill never leads by one", () => {
    // Just past halfway is the next page; just short of it is still this one.
    expect(pageFromScroll(WIDTH * 0.49, WIDTH, 5)).toBe(0)
    expect(pageFromScroll(WIDTH * 0.51, WIDTH, 5)).toBe(1)
  })

  it("survives a rubber-band overscroll past either end", () => {
    expect(pageFromScroll(-120, WIDTH, 3)).toBe(0)
    expect(pageFromScroll(WIDTH * 9, WIDTH, 3)).toBe(2)
  })

  it("returns the first page when the track has not been laid out yet", () => {
    // A server render, a display:none ancestor, the frame before hydration —
    // all of them measure zero, and dividing by it would produce NaN and then
    // an out-of-range index.
    expect(pageFromScroll(0, 0, 5)).toBe(0)
    expect(pageFromScroll(400, Number.NaN, 5)).toBe(0)
  })
})

describe("isPageActive", () => {
  it("needs BOTH the post to be active and the page to be in view", () => {
    expect(isPageActive(true, 0, 0)).toBe(true)
    // The post is the one on screen, but this video is two swipes away.
    expect(isPageActive(true, 2, 0)).toBe(false)
    // The page is showing, but the post has scrolled out of the viewport.
    expect(isPageActive(false, 0, 0)).toBe(false)
    expect(isPageActive(false, 2, 2)).toBe(false)
  })

  it("is true for at most one page of a post", () => {
    const pages = [0, 1, 2, 3, 4]
    const playing = pages.filter((i) => isPageActive(true, i, 3))
    expect(playing).toEqual([3])
  })
})

describe("isPageRendered", () => {
  it("mounts the current page and its immediate neighbours only", () => {
    expect([0, 1, 2, 3, 4].map((i) => isPageRendered(i, 0))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
    expect([0, 1, 2, 3, 4].map((i) => isPageRendered(i, 2))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it("never mounts more than three pages of a five-photo post", () => {
    for (let current = 0; current < 5; current++) {
      const mounted = [0, 1, 2, 3, 4].filter((i) => isPageRendered(i, current))
      expect(mounted.length).toBeLessThanOrEqual(3)
    }
  })
})

describe("keyTarget", () => {
  it("moves one page per arrow press", () => {
    expect(keyTarget("ArrowRight", 0, 5)).toBe(1)
    expect(keyTarget("ArrowLeft", 3, 5)).toBe(2)
  })

  it("jumps to the ends", () => {
    expect(keyTarget("Home", 3, 5)).toBe(0)
    expect(keyTarget("End", 0, 5)).toBe(4)
  })

  it("returns null at the ends, so the key is not swallowed", () => {
    expect(keyTarget("ArrowLeft", 0, 5)).toBeNull()
    expect(keyTarget("ArrowRight", 4, 5)).toBeNull()
    expect(keyTarget("Home", 0, 5)).toBeNull()
    expect(keyTarget("End", 4, 5)).toBeNull()
  })

  it("ignores every key that is not ours", () => {
    // Tab must reach the browser, and Up/Down belong to the feed's scrolling.
    for (const key of ["Tab", "ArrowUp", "ArrowDown", "Enter", " ", "a"]) {
      expect(keyTarget(key, 1, 5)).toBeNull()
    }
  })

  it("does nothing on a single page", () => {
    expect(keyTarget("ArrowRight", 0, 1)).toBeNull()
  })
})

describe("dragTarget", () => {
  it("moves one page when the drag passes the threshold", () => {
    // Dragging LEFT (negative) pulls the next page in.
    expect(dragTarget(0, -WIDTH * 0.3, WIDTH, 5)).toBe(1)
    expect(dragTarget(2, WIDTH * 0.3, WIDTH, 5)).toBe(1)
  })

  it("springs back when the drag is short", () => {
    expect(dragTarget(2, -WIDTH * 0.2, WIDTH, 5)).toBe(2)
    expect(dragTarget(2, WIDTH * 0.2, WIDTH, 5)).toBe(2)
    // A click that wobbled by three pixels is not a page change.
    expect(dragTarget(1, -3, WIDTH, 5)).toBe(1)
  })

  it("moves exactly one page however far the drag went", () => {
    // A carousel is not a scrubber: a long trackpad fling must not skip four
    // photographs the reader never saw.
    expect(dragTarget(0, -WIDTH * 4, WIDTH, 5)).toBe(1)
  })

  it("cannot leave the deck", () => {
    expect(dragTarget(0, WIDTH, WIDTH, 5)).toBe(0)
    expect(dragTarget(4, -WIDTH, WIDTH, 5)).toBe(4)
  })
})

describe("labels", () => {
  it("prints the pill 1-based, the way a person reads it", () => {
    expect(pillLabel(0, 5)).toBe("1/5")
    expect(pillLabel(4, 5)).toBe("5/5")
  })

  it("names each page by what it is and where it is", () => {
    expect(slideLabel(1, 5, "image")).toBe("Photo 2 of 5")
    expect(slideLabel(2, 3, "video")).toBe("Video 3 of 3")
  })

  it("gives the control a name that does not change as pages do", () => {
    // A name that moved with the page would re-announce the whole control on
    // every swipe, on top of the page's own label.
    expect(carouselLabel(5)).toBe(carouselLabel(5))
    expect(carouselLabel(5)).toBe("Post media, 5 items")
  })
})

describe("clampPage", () => {
  it("keeps an index inside the deck whatever it is handed", () => {
    expect(clampPage(-4, 3)).toBe(0)
    expect(clampPage(99, 3)).toBe(2)
    expect(clampPage(Number.NaN, 3)).toBe(0)
    expect(clampPage(0, 0)).toBe(0)
  })
})

/* ── The controls the founder asked for: arrows, and pips you can press ──── */

describe("stepTarget", () => {
  it("moves one page, in the direction the arrow points", () => {
    expect(stepTarget("next", 0, 5)).toBe(1)
    expect(stepTarget("prev", 3, 5)).toBe(2)
  })

  /**
   * Null is what makes the arrow ABSENT rather than disabled. A greyed arrow
   * welded over the first photograph of every carousel is chrome that can
   * never do anything, sitting on top of the content it decorates.
   */
  it("has nowhere to go at the ends, which is what removes the button", () => {
    expect(stepTarget("prev", 0, 5)).toBeNull()
    expect(stepTarget("next", 4, 5)).toBeNull()
  })

  it("gives the same answer as the arrow keys, because it is the same answer", () => {
    // One definition of "what does next mean here". Two would eventually
    // disagree, and the visible symptom is an arrow that works at an end the
    // keyboard refuses to cross.
    for (const page of [0, 1, 2, 3, 4]) {
      expect(stepTarget("next", page, 5)).toBe(keyTarget("ArrowRight", page, 5))
      expect(stepTarget("prev", page, 5)).toBe(keyTarget("ArrowLeft", page, 5))
    }
  })

  it("offers nothing on a single-page deck", () => {
    expect(stepTarget("next", 0, 1)).toBeNull()
    expect(stepTarget("prev", 0, 1)).toBeNull()
  })
})

describe("controlsVisible", () => {
  it("is nothing at rest, so an untouched feed carries no overlay chrome", () => {
    expect(controlsVisible({ hovered: false, focused: false, recentlyMoved: false })).toBe(false)
  })

  it("appears for a mouse that is over the frame and still moving", () => {
    expect(controlsVisible({ hovered: true, focused: false, recentlyMoved: true })).toBe(true)
  })

  it("fades under a mouse that has stopped, on the player's own clock", () => {
    // `recentlyMoved` IS the CONTROLS_HIDE_MS timer. A cursor parked over a
    // photograph is not asking for two buttons on top of it.
    expect(controlsVisible({ hovered: true, focused: false, recentlyMoved: false })).toBe(false)
  })

  it("stays for keyboard focus, whatever the timer says", () => {
    // The one condition with no clock on it: a control that faded out from
    // under the focus would leave that focus inside an aria-hidden subtree.
    expect(controlsVisible({ hovered: false, focused: true, recentlyMoved: false })).toBe(true)
  })
})

describe("pip and arrow labels", () => {
  it("names an arrow by what it does", () => {
    expect(arrowLabel("prev")).toBe("Previous photo")
    expect(arrowLabel("next")).toBe("Next photo")
  })

  /**
   * The pips were `aria-hidden` decoration on purpose — a row of dots
   * announcing "dot dot dot" told a screen-reader user nothing that each
   * slide's own label had not already said. Pressable things cannot be
   * decoration, so the labels have to earn their place: `slideLabel` names a
   * THING and is read on arrival, `pipLabel` names an ACTION and is read on
   * the control that performs it.
   */
  it("says what pressing a pip does, not what the pip is", () => {
    expect(pipLabel(2, 5, "image")).toBe("Show photo 3 of 5")
    expect(pipLabel(0, 2, "video")).toBe("Show video 1 of 2")
  })

  it("never reads the same as the slide it moves to", () => {
    for (const index of [0, 1, 2]) {
      expect(pipLabel(index, 3, "image")).not.toBe(slideLabel(index, 3, "image"))
    }
  })
})
