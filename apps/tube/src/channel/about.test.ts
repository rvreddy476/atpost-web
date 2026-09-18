import { describe, expect, it } from "vitest"
import { aboutSummary } from "./about"

/**
 * Whether the header offers a "more".
 *
 * The rule is a heuristic and the test pins WHICH WAY it is allowed to be
 * wrong: offering a "more" that reveals little is a small anticlimax, while
 * withholding one over six paragraphs leaves them unreadable. Every case here
 * is written from that side.
 */

describe("aboutSummary", () => {
  it("says there is nothing when there is nothing", () => {
    for (const empty of ["", "   ", "\n\n", null, undefined]) {
      const summary = aboutSummary(empty)
      expect(summary.present).toBe(false)
      expect(summary.expandable).toBe(false)
      expect(summary.text).toBe("")
    }
  })

  it("trims the edges but keeps the inside", () => {
    expect(aboutSummary("  Weekly builds.  ").text).toBe("Weekly builds.")
  })

  it("offers no more for a line that plainly fits", () => {
    const summary = aboutSummary("Weekly builds and long repairs.")
    expect(summary.present).toBe(true)
    expect(summary.expandable).toBe(false)
  })

  it("offers more for anything long enough to be clamped", () => {
    expect(aboutSummary("x".repeat(200)).expandable).toBe(true)
  })

  it("offers more for a SHORT about that is several lines", () => {
    // Two short lines are already two lines, however few characters they hold
    // — which a pure length test would miss and a reader would notice.
    expect(aboutSummary("Repairs.\nEvery Tuesday.\nAsk anything.").expandable).toBe(true)
  })

  it("keeps the newlines, because the header renders them", () => {
    expect(aboutSummary("One\nTwo").text).toBe("One\nTwo")
  })
})
