import { describe, expect, it } from "vitest"
import { endScreenSlot, inEndScreenWindow } from "@/watch/timeline"
import {
  MAX_UP_NEXT_LEAD_MS,
  MIN_UP_NEXT_LEAD_MS,
  UP_NEXT_LEAD_MS,
  UP_NEXT_POSITION,
  emptyUpNext,
  hasUpNext,
  upNextWindow,
  windowIsVisible,
} from "./upnext"

/**
 * The up-next window, which exists so a creator never types a millisecond.
 *
 * The interesting cases are the two the server would accept and the watch page
 * would then refuse to draw: a window that starts before the video does, and a
 * window earlier than the page's own end-screen gate.
 */

describe("upNextWindow", () => {
  it("ends at the duration and starts one lead earlier", () => {
    expect(upNextWindow(120_000)).toEqual({ startMs: 100_000, endMs: 120_000 })
  })

  it("defaults to twenty seconds", () => {
    expect(UP_NEXT_LEAD_MS).toBe(20_000)
    expect(MIN_UP_NEXT_LEAD_MS).toBeLessThan(UP_NEXT_LEAD_MS)
    expect(MAX_UP_NEXT_LEAD_MS).toBeGreaterThan(UP_NEXT_LEAD_MS)
  })

  it("honours a chosen lead", () => {
    expect(upNextWindow(300_000, 45_000)).toEqual({ startMs: 255_000, endMs: 300_000 })
  })

  it("never starts before the video does", () => {
    // A 5-second video with the 20-second default would otherwise produce
    // start_ms: -15000, which the server stores and which puts an "up next"
    // tile on screen from the first frame.
    const window = upNextWindow(5_000)!
    expect(window.startMs).toBe(0)
    expect(window.endMs).toBe(5_000)
  })

  it("leaves a real window on a very short video", () => {
    const window = upNextWindow(800)!
    expect(window.endMs).toBeGreaterThan(window.startMs)
  })

  it("is null when the duration is unknown, rather than guessing one", () => {
    // `GET /v1/videos/{postId}` answers 404 for a post whose media is not
    // attached, and a by-author row has no duration_ms either.
    expect(upNextWindow(0)).toBeNull()
    expect(upNextWindow(-1)).toBeNull()
    expect(upNextWindow(Number.NaN)).toBeNull()
  })

  it("produces a window `activeEndScreens` accepts — end strictly after start", () => {
    for (const duration of [800, 5_000, 30_000, 120_000, 3_600_000]) {
      const window = upNextWindow(duration)!
      expect(window.endMs).toBeGreaterThan(window.startMs)
      expect(window.startMs).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("windowIsVisible", () => {
  it("agrees with the watch page's own gate", () => {
    const window = upNextWindow(120_000)!
    expect(windowIsVisible(window, 120_000)).toBe(inEndScreenWindow(window.startMs, 120_000))
  })

  it("is true for every default window, whatever the duration", () => {
    // The whole reason the default lead is 20s: `inEndScreenWindow` refuses
    // anything before the last max(30s, 20%), so a shorter lead is always
    // inside it.
    for (const duration of [5_000, 30_000, 120_000, 600_000, 3_600_000]) {
      expect(windowIsVisible(upNextWindow(duration)!, duration)).toBe(true)
    }
  })

  it("catches a lead the page would refuse to draw", () => {
    // 60s before the end of a 10-minute video: the gate is the last 120s, so
    // this one is visible …
    expect(windowIsVisible(upNextWindow(600_000, 60_000)!, 600_000)).toBe(true)
    // … but 60s before the end of a 4-minute video is outside the last 48s.
    expect(windowIsVisible({ startMs: 0, endMs: 240_000 }, 240_000)).toBe(false)
  })

  it("is true when the duration is unknown, matching inEndScreenWindow", () => {
    expect(windowIsVisible({ startMs: 0, endMs: 1 }, 0)).toBe(true)
  })
})

describe("UP_NEXT_POSITION", () => {
  it("parses through the watch page's own slot reader", () => {
    const slot = endScreenSlot(UP_NEXT_POSITION)
    expect(slot).not.toBeNull()
    // `readAxis` multiplies a fraction by 100, so these are floating-point
    // results rather than the integers they read as: 0.14 * 100 is
    // 14.000000000000002. They are CSS percentages, which is why that is
    // harmless — and why the assertion has to be approximate.
    expect(slot!.leftPct).toBeCloseTo(62, 6)
    expect(slot!.topPct).toBeCloseTo(14, 6)
  })

  it("stays clear of the in-video card, which is drawn top-left", () => {
    expect(endScreenSlot(UP_NEXT_POSITION)!.leftPct).toBeGreaterThan(50)
  })

  it("stays inside the frame", () => {
    const slot = endScreenSlot(UP_NEXT_POSITION)!
    expect(slot.leftPct + slot.widthPct).toBeLessThanOrEqual(100)
    expect(slot.topPct + slot.heightPct).toBeLessThanOrEqual(100)
  })
})

describe("hasUpNext", () => {
  it("is false for a fresh draft, which is the common state", () => {
    expect(hasUpNext(emptyUpNext())).toBe(false)
  })

  it("is true once a target is chosen", () => {
    expect(hasUpNext({ ...emptyUpNext(), targetId: "x" })).toBe(true)
  })
})
