import { afterEach, describe, expect, it } from "vitest"
import {
  DEFAULT_VOLUME,
  VOLUME_STEP,
  clampVolume,
  parseVolume,
  readVolume,
  stepVolume,
  volumeChange,
  volumeFromPointer,
  volumeOnUnmute,
  volumePercent,
  writeVolume,
} from "./volume"

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

describe("clampVolume", () => {
  it("keeps a level inside the range a video element will accept", () => {
    // Outside 0..1 `video.volume` throws IndexSizeError — not a clamp.
    expect(clampVolume(1.4)).toBe(1)
    expect(clampVolume(-1)).toBe(0)
  })

  it("answers full volume for values that would throw", () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME)
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it("rounds to the step so the slider, the keys and storage agree", () => {
    expect(clampVolume(0.5317)).toBeCloseTo(0.55, 5)
    expect(clampVolume(0.51)).toBeCloseTo(0.5, 5)
  })
})

describe("stepVolume", () => {
  it("moves one step in the direction given", () => {
    expect(stepVolume(0.5, 1)).toBeCloseTo(0.5 + VOLUME_STEP, 5)
    expect(stepVolume(0.5, -1)).toBeCloseTo(0.5 - VOLUME_STEP, 5)
  })

  it("clamps at both ends", () => {
    expect(stepVolume(1, 1)).toBe(1)
    expect(stepVolume(0, -1)).toBe(0)
  })

  it("takes twenty presses to cross the whole scale", () => {
    let level = 0
    let presses = 0
    while (level < 1 && presses < 100) {
      level = stepVolume(level, 1)
      presses += 1
    }
    expect(presses).toBe(20)
  })
})

describe("volumeFromPointer", () => {
  it("maps a press across the track", () => {
    expect(volumeFromPointer(40, 80)).toBeCloseTo(0.5, 5)
  })

  it("clamps a pointer that left the element under a capture", () => {
    expect(volumeFromPointer(-20, 80)).toBe(0)
    expect(volumeFromPointer(200, 80)).toBe(1)
  })

  it("is silent rather than NaN for a track with no width yet", () => {
    expect(volumeFromPointer(10, 0)).toBe(0)
  })
})

describe("volumePercent", () => {
  it("is a whole number, for aria-valuenow", () => {
    expect(volumePercent(0.55)).toBe(55)
    expect(volumePercent(0)).toBe(0)
    expect(volumePercent(1)).toBe(100)
  })
})

describe("volumeChange", () => {
  it("mutes when the slider reaches zero, so the glyph cannot lie", () => {
    expect(volumeChange(0)).toEqual({ volume: 0, muted: true })
  })

  it("unmutes as soon as the slider leaves zero", () => {
    expect(volumeChange(VOLUME_STEP)).toEqual({ volume: VOLUME_STEP, muted: false })
  })
})

describe("volumeOnUnmute", () => {
  it("restores the level somebody set, which is why mute is not volume 0", () => {
    expect(volumeOnUnmute(0.2)).toBeCloseTo(0.2, 5)
  })

  it("gives a silent player somewhere to go rather than unmuting to silence", () => {
    expect(volumeOnUnmute(0)).toBe(VOLUME_STEP)
  })
})

describe("parseVolume", () => {
  it("reads a level back", () => {
    expect(parseVolume("0.5")).toBeCloseTo(0.5, 5)
  })

  it("reads a stored zero as zero rather than as absent", () => {
    expect(parseVolume("0")).toBe(0)
  })

  it("means full volume for absent, empty and out-of-range values", () => {
    expect(parseVolume(null)).toBe(1)
    expect(parseVolume("")).toBe(1)
    expect(parseVolume("loud")).toBe(1)
    expect(parseVolume("2")).toBe(1)
    expect(parseVolume("-1")).toBe(1)
  })
})

describe("readVolume / writeVolume", () => {
  it("round-trips a level for one viewer", () => {
    installStorage()
    writeVolume("u-7", 0.35)
    expect(readVolume("u-7")).toBeCloseTo(0.35, 5)
  })

  it("is full volume for a viewer who has never chosen", () => {
    installStorage()
    expect(readVolume("u-7")).toBe(1)
  })

  it("never writes a value a video element would refuse", () => {
    const store = installStorage()
    writeVolume("u-7", 9)
    expect(store["momentum.player.volume.u-7"]).toBe("1")
  })
})
