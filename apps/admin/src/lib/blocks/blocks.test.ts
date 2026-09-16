import { describe, expect, it } from "vitest"
import { initialReveal, isBlurred, revealReducer, type RevealEvent, type RevealState } from "./reveal"
import { checkReason, MIN_REASON_LENGTH } from "./confirm"
import { isDay, matchPreset, normaliseRange, presetRange, rangeDays } from "./dateRange"
import { toAlignedSeries } from "./chart"

const run = (state: RevealState, ...events: RevealEvent[]) => events.reduce(revealReducer, state)

describe("reveal", () => {
  it("starts blurred only for sensitive documents", () => {
    expect(isBlurred(initialReveal(true))).toBe(true)
    expect(isBlurred(initialReveal(false))).toBe(false)
  })

  it("unblurs only after the reveal call resolves", () => {
    const requested = run(initialReveal(true), { type: "request" })
    expect(requested.status).toBe("revealing")
    expect(isBlurred(requested)).toBe(true)
    expect(run(requested, { type: "resolved", revealed: true }).status).toBe("revealed")
  })

  it("stays hidden when the reveal fails or is declined, and can be retried after a failure", () => {
    const failed = run(initialReveal(true), { type: "request" }, { type: "failed", error: "403" })
    expect(failed).toEqual({ status: "failed", error: "403" })
    expect(isBlurred(failed)).toBe(true)
    expect(run(failed, { type: "request" }).status).toBe("revealing")
    expect(run(initialReveal(true), { type: "request" }, { type: "resolved", revealed: false }).status).toBe("hidden")
  })

  it("ignores a second request while one is in flight, and stray results", () => {
    const inFlight = run(initialReveal(true), { type: "request" })
    expect(run(inFlight, { type: "request" })).toBe(inFlight)
    const hidden = initialReveal(true)
    expect(run(hidden, { type: "resolved", revealed: true })).toBe(hidden)
    expect(run(hidden, { type: "failed", error: "x" })).toBe(hidden)
  })

  it("can be hidden again and resets for a new document", () => {
    const revealed = run(initialReveal(true), { type: "request" }, { type: "resolved", revealed: true })
    expect(run(revealed, { type: "hide" }).status).toBe("hidden")
    expect(run(revealed, { type: "reset", sensitive: true }).status).toBe("hidden")
  })
})

describe("confirm with reason", () => {
  it("requires a real reason for destructive actions", () => {
    expect(checkReason("", { destructive: true }).ok).toBe(false)
    expect(checkReason("   spam   ", { destructive: true }).ok).toBe(false)
    expect(checkReason("x".repeat(MIN_REASON_LENGTH), { destructive: true }).ok).toBe(true)
    expect(checkReason("x".repeat(501), { destructive: true }).ok).toBe(false)
  })

  it("lets a non-destructive action go without one unless it is required", () => {
    expect(checkReason("", { destructive: false }).ok).toBe(true)
    expect(checkReason("", { destructive: false, required: true }).ok).toBe(false)
  })
})

describe("date range", () => {
  const today = new Date(2026, 8, 16)

  it("builds inclusive presets and recognises them", () => {
    expect(presetRange("today", today)).toEqual({ from: "2026-09-16", to: "2026-09-16" })
    expect(presetRange("7d", today)).toEqual({ from: "2026-09-10", to: "2026-09-16" })
    expect(rangeDays(presetRange("30d", today))).toBe(30)
    expect(matchPreset({ from: "2026-09-10", to: "2026-09-16" }, today)).toBe("7d")
    expect(matchPreset({ from: "2026-09-11", to: "2026-09-16" }, today)).toBeNull()
  })

  it("validates days, swaps reversed ends and caps the span", () => {
    expect(isDay("2026-02-29")).toBe(false)
    expect(isDay("2028-02-29")).toBe(true)
    expect(normaliseRange({ from: "2026-13-01", to: "2026-09-01" })).toBeNull()
    expect(normaliseRange({ from: "2026-09-16", to: "2026-09-01" })).toEqual({ from: "2026-09-01", to: "2026-09-16" })
    expect(normaliseRange({ from: "2026-01-01", to: "2026-09-16" }, 90)).toEqual({ from: "2026-06-19", to: "2026-09-16" })
  })
})

describe("chart series", () => {
  it("aligns rows by time, drops unreadable times and leaves gaps for missing values", () => {
    const series = toAlignedSeries(
      [
        { t: "2026-09-02T00:00:00Z", orders: 5, refunds: 1 },
        { t: "not a date", orders: 99 },
        { t: 1_788_220_800_000, orders: 3, refunds: Number.NaN },
      ],
      ["orders", "refunds"],
    )
    expect(series).toEqual([
      [1_788_220_800, Date.parse("2026-09-02T00:00:00Z") / 1000],
      [3, 5],
      [null, 1],
    ])
  })
})
