import { describe, expect, it } from "vitest"
import { visibleFraction } from "@momentum/player"
import { VISIBLE_RATIO } from "./useDwellTracker"

/* ── Why this file is about rectangles and not about the hook ──────────────
 *
 * The two defects being pinned here were both in the NUMBER the tracker
 * compared against its bar, not in its wiring, and both of them LOSE
 * impressions. That direction matters: impressions are the denominator of CQS,
 * and CQS sets the creator fund's quality multiplier — so an impression that
 * never fires does not merely under-report reach, it inflates every rate
 * computed per impression for everyone whose card was tall or whose header was
 * in the way.
 *
 * The old rule was `entry.intersectionRatio >= 0.5`, a fraction of the
 * ELEMENT, measured against the whole window. Every number below was measured
 * in headless Chrome against the running social zone at the stated viewport,
 * with a real IntersectionObserver on a real element scrolled a frame at a
 * time.
 */

/** Measured live by hit-testing the top edge of the viewport: h-14 + 1px. */
const INSET = { top: 57 }

/** What an IntersectionObserver reports: the visible fraction of the ELEMENT. */
function elementRatio(top: number, height: number, viewportHeight: number): number {
  const visible = Math.max(0, Math.min(top + height, viewportHeight) - Math.max(top, 0))
  return height === 0 ? 0 : visible / height
}

describe("the impression bar", () => {
  /* ── Defect 1: a tall card can never be half of itself ───────────────── */
  describe("a card taller than the window", () => {
    /**
     * Live, 1440x900, a 2000px element walked through 200 scroll offsets: the
     * greatest `intersectionRatio` it ever reached was 0.45, the observer
     * (threshold [0, 0.5, 1]) never delivered a crossing above 0, and NOT ONE
     * of the 200 offsets counted as an impression — while the element covered
     * the whole visible band at every one of them.
     */
    it("could never reach the bar on its own scale, at any offset", () => {
      const H = 2000
      const V = 900
      let bestRatio = 0
      let bestFraction = 0
      for (let top = V; top >= -H; top -= 10) {
        bestRatio = Math.max(bestRatio, elementRatio(top, H, V))
        bestFraction = Math.max(bestFraction, visibleFraction({ top, height: H }, V, INSET))
      }
      expect(bestRatio).toBeCloseTo(0.45, 4) // 900 of 2000 — the live figure
      expect(bestRatio).toBeLessThan(VISIBLE_RATIO) // …so: no impression, ever
      expect(bestFraction).toBe(1) // …for a card filling the entire screen
    })

    /**
     * And this is not a synthetic size. Live at 812x375 — a phone in landscape
     * — a 760px card (media capped at 75vh, plus a caption and the action row)
     * topped out at an intersectionRatio of 0.4934 and never registered.
     */
    it("is reachable on real hardware, not just with an absurd card", () => {
      const V = 375
      expect(elementRatio(0, 760, V)).toBeCloseTo(0.4934, 3)
      expect(elementRatio(0, 760, V)).toBeLessThan(VISIBLE_RATIO)
      // The same card, measured against what can be seen: entirely visible.
      expect(visibleFraction({ top: 57, height: 760 }, V, INSET)).toBe(1)
    })

    it("registers as soon as it fills half the visible band", () => {
      // 1200px card, 1440x900 window, 57px of chrome. Half the band is 421.5px
      // of it on screen — which is where "half on screen is seen" was always
      // meant to fall.
      const H = 1200
      const V = 900
      expect(visibleFraction({ top: V - 421, height: H }, V, INSET)).toBeLessThan(VISIBLE_RATIO)
      expect(visibleFraction({ top: V - 422, height: H }, V, INSET)).toBeGreaterThanOrEqual(
        VISIBLE_RATIO
      )
      // The old rule needed 600px of it — two thirds of the window — before it
      // would count the same view.
      expect(elementRatio(V - 421, H, V)).toBeCloseTo(0.3508, 3)
    })
  })

  /* ── Defect 2: pixels behind the header are not "seen" ───────────────── */
  describe("the strip behind the sticky header", () => {
    /**
     * Live, 1440x900, a 675px card walked through 200 offsets: five of them
     * were counted as an impression by the old rule and are not visible enough
     * once the 57px header is excluded. Same blind spot as the coordinator's,
     * and it had to be fixed the same way or a play and an impression would
     * disagree about what "on screen" means.
     */
    it("does not credit an impression for a card that is half behind chrome", () => {
      const H = 675
      const V = 900
      // A card on its way off the top: 338px of it is inside the window —
      // just over half of it, so the old rule counted it — but 57px of that
      // 338 is underneath the header and nobody can see it.
      const top = -337
      expect(elementRatio(top, H, V)).toBeGreaterThanOrEqual(VISIBLE_RATIO)
      expect(visibleFraction({ top, height: H }, V, INSET)).toBeLessThan(VISIBLE_RATIO)
      expect(visibleFraction({ top, height: H }, V, INSET)).toBeCloseTo(0.4163, 4)
    })

    it("agrees with the autoplay coordinator about what is on screen", () => {
      // Not a coincidence to be maintained by hand: both call the same
      // function with the same inset. This is the assertion that fails if
      // either grows its own copy.
      const box = { top: -261, height: 675 }
      expect(visibleFraction(box, 900, INSET)).toBeCloseTo(0.5289, 4)
    })
  })
})
