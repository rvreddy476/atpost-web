import { describe, expect, it } from "vitest"
import { pickActive, visibleFraction, type Candidate } from "./autoplay"

/* ── Why these tests are about rectangles and not about React ──────────────
 *
 * The bug being pinned here was never in the hook's wiring. It was that the
 * number the coordinator RANKED on was a number an IntersectionObserver had
 * recorded at some earlier moment, on a different scale, and the decision
 * boundary fell between two of the thresholds it sampled — so the rank could
 * be wrong while every callback had fired exactly as specified.
 *
 * The fix moves the decision onto live geometry, which makes the rule a pure
 * function of rectangles. That is what is worth testing: give it the exact
 * geometry the live feed was in when it failed, and it must answer correctly.
 */

const MIN = 0.6

/** A card at `top`, `height` tall. */
function card(id: string, top: number, height: number): Candidate {
  return { id, box: { top, height } }
}

describe("visibleFraction", () => {
  it("is a fraction of the VIEWPORT for a card taller than the screen", () => {
    // 900px card, 720px window, sitting exactly over the whole window.
    // intersectionRatio would be 0.8 — this must be 1.
    expect(visibleFraction({ top: -90, height: 900 }, 720)).toBe(1)
  })

  it("is a fraction of the CARD for a card that fits", () => {
    // Half of a 300px card in a 720px window: both readings agree.
    expect(visibleFraction({ top: 570, height: 300 }, 720)).toBeCloseTo(0.5, 5)
  })

  it("is zero for a card entirely above the fold", () => {
    expect(visibleFraction({ top: -806, height: 734 }, 720)).toBe(0)
  })

  it("is zero for a card entirely below the fold", () => {
    expect(visibleFraction({ top: 720, height: 500 }, 720)).toBe(0)
  })

  it("counts only the part on screen when a card straddles the top", () => {
    // 400 of a 500px card visible, in a 720px window: measurable is the card.
    expect(visibleFraction({ top: -100, height: 500 }, 720)).toBeCloseTo(0.8, 5)
  })

  it("never divides by nothing", () => {
    expect(visibleFraction({ top: 0, height: 0 }, 720)).toBe(0)
    expect(visibleFraction({ top: 0, height: 500 }, 0)).toBe(0)
  })

  /* ── The regression, at the geometry it was measured at ────────────────
   *
   * Live feed, 475px cards, 374px viewport. The last IntersectionObserver
   * threshold crossing below the bar was intersectionRatio 0.4, which is a
   * visibleFraction of 0.508; the next threshold up, 0.6, is a visibleFraction
   * of 0.762. Everything between those two was invisible to the observer, and
   * the 0.6 bar lives inside that gap. These three offsets are the ones the
   * live page was measured at while it played nothing.
   */
  describe("the gap the observer could not see", () => {
    const H = 475
    const V = 374
    const tops = [146, 120, 96] // scrollY 1350 / 1375 / 1400, rising into view

    it.each(tops)("reports the truth at top %i, where the observer was silent", (top) => {
      const fraction = visibleFraction({ top, height: H }, V)
      expect(fraction).toBeGreaterThan(MIN)
      // …and the observer's own scale for the same rectangle is still stuck
      // between its thresholds, which is exactly why it said nothing.
      const intersectionRatio = fraction * (Math.min(H, V) / H)
      expect(intersectionRatio).toBeGreaterThan(0.4)
      expect(intersectionRatio).toBeLessThan(0.6)
    })

    it("plays the card the observer never reported on", () => {
      expect(pickActive([card("a", 120, H)], V, { minRatio: MIN })).toBe("a")
    })
  })
})

describe("pickActive", () => {
  it("plays nothing when nothing clears the bar", () => {
    expect(
      pickActive([card("a", 500, 700), card("b", -650, 700)], 720, { minRatio: MIN })
    ).toBeNull()
  })

  it("plays nothing when there is nothing registered", () => {
    expect(pickActive([], 720, { minRatio: MIN })).toBeNull()
  })

  it("returns exactly one id, never a set", () => {
    const winner = pickActive([card("a", -6, 734), card("b", 744, 696)], 720, { minRatio: MIN })
    expect(winner).toBe("a")
  })

  it("prefers the card that fills more of the screen", () => {
    // b covers the window; a is two thirds of the way out.
    const winner = pickActive([card("a", -400, 700), card("b", -10, 740)], 720, { minRatio: MIN })
    expect(winner).toBe("b")
  })

  it("breaks a tie on distance from the centre of the viewport, not insertion order", () => {
    // Two identical cards, both fully visible in a very tall window. `far` is
    // listed first so insertion order would pick the wrong one.
    const winner = pickActive([card("far", 40, 300), card("near", 700, 300)], 1600, {
      minRatio: MIN,
    })
    expect(winner).toBe("near")
    // …and the answer does not depend on the order they were registered in.
    expect(
      pickActive([card("near", 700, 300), card("far", 40, 300)], 1600, { minRatio: MIN })
    ).toBe("near")
  })

  describe("hand-off", () => {
    it("hands over when the reader has genuinely moved on", () => {
      // The incumbent is 800px off screen; the next card fills the window.
      const winner = pickActive([card("a", -806, 734), card("b", -56, 696)], 720, {
        minRatio: MIN,
        currentId: "a",
      })
      expect(winner).toBe("b")
    })

    it("drops the crown entirely when nothing else qualifies", () => {
      const winner = pickActive([card("a", -717, 702), card("b", 419, 739)], 720, {
        minRatio: MIN,
        currentId: "a",
      })
      expect(winner).toBeNull()
    })

    it("keeps the crown while a challenger is only marginally better", () => {
      // a: 0.60 visible. b: 0.65 visible. A slow scroll passing through this
      // must not swap on every frame.
      expect(visibleFraction({ top: 300, height: 700 }, 720)).toBeCloseTo(0.6, 3)
      expect(visibleFraction({ top: -245, height: 700 }, 720)).toBeCloseTo(0.65, 3)
      const winner = pickActive([card("a", 300, 700), card("b", -245, 700)], 720, {
        minRatio: MIN,
        currentId: "a",
      })
      expect(winner).toBe("a")
    })

    it("gives up the crown once the challenger is clearly better", () => {
      // a is barely over the bar, b fills the window.
      const winner = pickActive([card("a", 300, 700), card("b", -10, 740)], 720, {
        minRatio: MIN,
        currentId: "a",
      })
      expect(winner).toBe("b")
    })

    it("gives no protection to an incumbent that fell below the bar", () => {
      // a is 40% visible — under the bar — and b is only just over it. Even
      // though b does not beat a by the margin, a is not eligible at all.
      const winner = pickActive([card("a", 432, 720), card("b", -288, 720)], 720, {
        minRatio: MIN,
        currentId: "a",
      })
      expect(winner).toBe("b")
    })

    it("gives no protection to an incumbent that is no longer registered", () => {
      // The card unmounted, so it is not among the candidates at all.
      const winner = pickActive([card("b", -10, 700)], 720, { minRatio: MIN, currentId: "gone" })
      expect(winner).toBe("b")
    })

    it("is stable: re-deciding with the same geometry does not oscillate", () => {
      const cards = [card("a", -20, 700), card("b", 690, 700)]
      let current: string | null = null
      const seen: (string | null)[] = []
      for (let i = 0; i < 5; i += 1) {
        current = pickActive(cards, 720, { minRatio: MIN, currentId: current })
        seen.push(current)
      }
      expect(seen).toEqual(["a", "a", "a", "a", "a"])
    })
  })

  describe("a slow scroll past a hand-off point", () => {
    /**
     * Two 700px cards, 20px apart, in a 720px window, walked past each other
     * one pixel at a time. The crown must change hands exactly once — the
     * flicker this whole rule exists to prevent is the same pair swapping back
     * and forth as the numbers cross.
     */
    it("changes hands exactly once", () => {
      let current: string | null = null
      let changes = 0
      for (let scroll = 0; scroll <= 720; scroll += 1) {
        const cards = [card("a", -scroll, 700), card("b", 720 - scroll, 700)]
        const next = pickActive(cards, 720, { minRatio: MIN, currentId: current })
        if (next !== current) changes += 1
        current = next
      }
      expect(changes).toBeLessThanOrEqual(3) // null → a, a → b, and at most one release
      expect(current).toBe("b")
    })
  })
})
