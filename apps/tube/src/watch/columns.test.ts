import { describe, expect, it } from "vitest"
import {
  COLUMN_GAP_PX,
  MIN_PLAYER_COLUMN_PX,
  RAIL_WIDTH_PX,
  SPLIT_MIN_WIDTH_PX,
  gridTemplateColumns,
  watchColumns,
} from "./columns"
import { wantsLinkPreview } from "./fixtures"

/**
 * One column or two, and the switch that shows sample data.
 *
 * The layout is measured rather than declared with a `lg:` breakpoint because
 * @momentum/chrome hands every zone a 600px centre track — so a wide WINDOW is
 * not a wide PAGE here, and a viewport rule would draw a recommendations rail
 * by squeezing a 16:9 player down to about 360px. See ./columns.ts.
 */

describe("watchColumns", () => {
  it("splits once there is room for a full-size player AND the rail", () => {
    expect(watchColumns(SPLIT_MIN_WIDTH_PX)).toBe("split")
    expect(watchColumns(SPLIT_MIN_WIDTH_PX - 1)).toBe("stacked")
  })

  it("stays stacked in the frame's own 600px centre track", () => {
    // The layout this page has today. A rail here would take half the picture.
    expect(watchColumns(600)).toBe("stacked")
  })

  it("stays stacked on a phone", () => {
    expect(watchColumns(375)).toBe("stacked")
    expect(watchColumns(768)).toBe("stacked")
  })

  it("splits in a widened frame", () => {
    expect(watchColumns(1_100)).toBe("split")
  })

  it("is stacked before anything has been measured", () => {
    // A ResizeObserver reports nothing until its first callback, and the server
    // has no width at all. Stacked-then-widened reflows once; split-then-
    // collapsed has already drawn a rail beside a 200px player.
    expect(watchColumns(0)).toBe("stacked")
    expect(watchColumns(Number.NaN)).toBe("stacked")
  })

  it("keeps the threshold derived from its three parts", () => {
    // So the numbers cannot drift out of agreement with the threshold.
    expect(SPLIT_MIN_WIDTH_PX).toBe(MIN_PLAYER_COLUMN_PX + COLUMN_GAP_PX + RAIL_WIDTH_PX)
  })
})

describe("gridTemplateColumns", () => {
  it("gives the player column a floor of zero so one wide child cannot push the rail out", () => {
    // A grid item defaults to `min-width: auto` and refuses to shrink below its
    // content — the same reason AppFrame's own tracks are minmax(0, …).
    expect(gridTemplateColumns("split")).toBe(`minmax(0, 1fr) ${RAIL_WIDTH_PX}px`)
    expect(gridTemplateColumns("stacked")).toBe("minmax(0, 1fr)")
  })
})

describe("wantsLinkPreview", () => {
  it("is off unless the URL says otherwise", () => {
    // Fixtures must never be reachable by somebody who has not asked for them.
    expect(wantsLinkPreview("")).toBe(false)
    expect(wantsLinkPreview("?links=")).toBe(false)
    expect(wantsLinkPreview("?links=1")).toBe(false)
    expect(wantsLinkPreview("?preview=links")).toBe(false)
  })

  it("is on for the exact parameter", () => {
    expect(wantsLinkPreview("?links=preview")).toBe(true)
    expect(wantsLinkPreview("?a=b&links=preview")).toBe(true)
  })
})
