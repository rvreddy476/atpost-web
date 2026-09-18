import { describe, expect, it } from "vitest"
import {
  bufferedAhead,
  bufferedSpans,
  hoverFraction,
  tooltipLeftPercent,
  type TimeRangesLike,
} from "./scrubber"

/** A `TimeRanges` cannot be constructed, so this is the shape it presents. */
function ranges(pairs: readonly (readonly [number, number])[]): TimeRangesLike {
  return {
    length: pairs.length,
    start: (i: number) => pairs[i]![0],
    end: (i: number) => pairs[i]![1],
  }
}

describe("bufferedSpans", () => {
  it("draws each span separately, which is the whole point after a seek", () => {
    // Watched the first 30s, then jumped to 120s and started loading again.
    // One bar from 0 would claim the gap between them is ready to play.
    expect(bufferedSpans(ranges([[0, 30], [120, 150]]), 300)).toEqual([
      { start: 0, end: 0.1 },
      { start: 0.4, end: 0.5 },
    ])
  })

  it("is empty before the duration is known", () => {
    expect(bufferedSpans(ranges([[0, 30]]), 0)).toEqual([])
    expect(bufferedSpans(ranges([[0, 30]]), Number.NaN)).toEqual([])
  })

  it("is empty for an element that has buffered nothing", () => {
    expect(bufferedSpans(ranges([]), 300)).toEqual([])
    expect(bufferedSpans(null, 300)).toEqual([])
  })

  it("clamps a span that runs past the duration the element reported", () => {
    expect(bufferedSpans(ranges([[0, 400]]), 300)).toEqual([{ start: 0, end: 1 }])
  })

  it("drops a degenerate span rather than painting a speck on the bar", () => {
    expect(bufferedSpans(ranges([[30, 30]]), 300)).toEqual([])
    expect(bufferedSpans(ranges([[60, 30]]), 300)).toEqual([])
  })
})

describe("bufferedAhead", () => {
  it("reports the end of the span the playhead is inside", () => {
    expect(bufferedAhead(ranges([[0, 30], [120, 150]]), 10, 300)).toBeCloseTo(0.1, 5)
  })

  it("ignores a later span the playhead cannot reach without seeking", () => {
    expect(bufferedAhead(ranges([[120, 150]]), 10, 300)).toBe(0)
  })

  it("tolerates a playhead a few milliseconds ahead of a fresh span", () => {
    // Immediately after a seek the element sits just inside the new range and
    // a strict test reports "nothing buffered" for the frame on screen.
    expect(bufferedAhead(ranges([[120.1, 150]]), 120, 300)).toBeCloseTo(0.5, 5)
  })

  it("is zero with no ranges and with no duration", () => {
    expect(bufferedAhead(ranges([]), 10, 300)).toBe(0)
    expect(bufferedAhead(ranges([[0, 30]]), 10, 0)).toBe(0)
  })
})

describe("hoverFraction", () => {
  it("maps a pointer across the bar", () => {
    expect(hoverFraction(150, 600)).toBeCloseTo(0.25, 5)
  })

  it("clamps a pointer that left the bar under a capture", () => {
    expect(hoverFraction(-40, 600)).toBe(0)
    expect(hoverFraction(900, 600)).toBe(1)
  })

  it("is zero for a bar with no width and for a coordinate that is not one", () => {
    expect(hoverFraction(10, 0)).toBe(0)
    expect(hoverFraction(Number.NaN, 600)).toBe(0)
  })
})

describe("tooltipLeftPercent", () => {
  it("centres on the pointer in the middle of the bar", () => {
    expect(tooltipLeftPercent(0.5, 600, 60)).toBe(50)
  })

  it("holds the tooltip inside the frame at the very start", () => {
    // Half of 60px on a 600px bar is 5% — so it may not go left of 5%.
    expect(tooltipLeftPercent(0, 600, 60)).toBeCloseTo(5, 5)
  })

  it("holds the tooltip inside the frame at the very end", () => {
    expect(tooltipLeftPercent(1, 600, 60)).toBeCloseTo(95, 5)
  })

  it("centres a tooltip too wide to fit rather than returning a negative", () => {
    expect(tooltipLeftPercent(0, 60, 600)).toBe(50)
  })

  it("falls back to the raw position before either width is measured", () => {
    expect(tooltipLeftPercent(0.25, 0, 60)).toBe(25)
    expect(tooltipLeftPercent(0.25, 600, 0)).toBe(25)
  })
})
