import { afterEach, describe, expect, it } from "vitest"
import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  normalizeRate,
  parseRate,
  rateAriaLabel,
  rateIsNotable,
  rateLabel,
  readPlaybackRate,
  stepRate,
  writePlaybackRate,
} from "./playbackRate"

function installStorage(store: Record<string, string> = {}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => (key in store ? store[key]! : null),
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
      },
    },
  })
  return store
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined })
})

describe("PLAYBACK_RATES", () => {
  it("is YouTube's list: 0.25 to 2 in quarters, ascending, with 1 in it", () => {
    expect([...PLAYBACK_RATES]).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
    expect(PLAYBACK_RATES).toContain(DEFAULT_PLAYBACK_RATE)
  })
})

describe("rateLabel", () => {
  it("calls 1 Normal, because that is the stop people hunt for", () => {
    expect(rateLabel(1)).toBe("Normal")
  })

  it("sets every other stop with a multiplication sign", () => {
    expect(rateLabel(0.25)).toBe("0.25×")
    expect(rateLabel(1.5)).toBe("1.5×")
    expect(rateLabel(2)).toBe("2×")
  })
})

describe("rateAriaLabel", () => {
  it("says Normal SPEED, so a screen reader knows it is one", () => {
    expect(rateAriaLabel(1)).toBe("Normal speed")
  })

  it("spells the multiplier out rather than leaving a symbol to guess at", () => {
    expect(rateAriaLabel(1.75)).toBe("1.75 times speed")
  })
})

describe("rateIsNotable", () => {
  it("is false at normal speed, so nothing is drawn on a normal video", () => {
    expect(rateIsNotable(1)).toBe(false)
  })

  it("is true anywhere else", () => {
    expect(rateIsNotable(1.5)).toBe(true)
    expect(rateIsNotable(0.5)).toBe(true)
  })
})

describe("normalizeRate", () => {
  it("leaves a stop alone", () => {
    for (const rate of PLAYBACK_RATES) expect(normalizeRate(rate)).toBe(rate)
  })

  it("snaps a value from somewhere else to the nearest stop", () => {
    expect(normalizeRate(1.4)).toBe(1.5)
    expect(normalizeRate(1.2)).toBe(1.25)
  })

  it("breaks a tie downwards, so a value cannot creep up on round trips", () => {
    expect(normalizeRate(1.125)).toBe(1)
  })

  it("clamps rather than rejecting, so a value off the end lands on an end", () => {
    expect(normalizeRate(4)).toBe(2)
    expect(normalizeRate(0.01)).toBe(0.25)
  })

  it("answers Normal for the values that would throw on a video element", () => {
    expect(normalizeRate(Number.NaN)).toBe(1)
    expect(normalizeRate(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe("stepRate", () => {
  it("walks the list one stop at a time", () => {
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(1, -1)).toBe(0.75)
  })

  it("clamps at both ends rather than wrapping", () => {
    expect(stepRate(2, 1)).toBe(2)
    expect(stepRate(0.25, -1)).toBe(0.25)
  })

  it("steps from the nearest stop when it starts from somewhere odd", () => {
    expect(stepRate(1.4, 1)).toBe(1.75)
  })
})

describe("parseRate", () => {
  it("reads a stop back", () => {
    expect(parseRate("1.5")).toBe(1.5)
  })

  it("means Normal for absent, empty and unparseable values", () => {
    expect(parseRate(null)).toBe(1)
    expect(parseRate(undefined)).toBe(1)
    expect(parseRate("")).toBe(1)
    expect(parseRate("fast")).toBe(1)
    expect(parseRate("0")).toBe(1)
    expect(parseRate("-2")).toBe(1)
  })

  it("snaps a value some other version of this app wrote", () => {
    expect(parseRate("1.2")).toBe(1.25)
  })
})

describe("readPlaybackRate / writePlaybackRate", () => {
  it("round-trips a speed for one viewer", () => {
    installStorage()
    writePlaybackRate("u-7", 1.75)
    expect(readPlaybackRate("u-7")).toBe(1.75)
  })

  it("is Normal for a viewer who has never chosen", () => {
    installStorage()
    expect(readPlaybackRate("u-7")).toBe(1)
  })

  it("never writes a value a video element would refuse", () => {
    const store = installStorage()
    writePlaybackRate("u-7", Number.NaN)
    expect(store["momentum.player.speed.u-7"]).toBe("1")
  })

  it("is Normal when storage is unavailable entirely", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined })
    expect(readPlaybackRate("u-7")).toBe(1)
  })
})
