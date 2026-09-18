import { afterEach, describe, expect, it } from "vitest"
import {
  AUTO_LEVEL,
  autoLabel,
  currentQualityLabel,
  levelLabel,
  nearestLevelForHeight,
  parseQualityHeight,
  qualityMenuAvailable,
  qualityOptions,
  readQualityHeight,
  writeQualityHeight,
  type LevelLike,
} from "./quality"

/** A ladder as hls.js reports one: lowest first, which is how manifests read. */
const LADDER: LevelLike[] = [
  { height: 360, bitrate: 800_000 },
  { height: 480, bitrate: 1_400_000 },
  { height: 720, bitrate: 2_800_000 },
  { height: 1080, bitrate: 5_000_000 },
]

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

describe("levelLabel", () => {
  it("uses the height, which is the number people actually have", () => {
    expect(levelLabel({ height: 720 }, 2)).toBe("720p")
  })

  it("falls back to the bitrate for a variant with no RESOLUTION", () => {
    expect(levelLabel({ bitrate: 1_400_000 }, 1)).toBe("1400 kbps")
  })

  it("falls back to a position when it has neither, so rows stay distinct", () => {
    expect(levelLabel({}, 0)).toBe("Level 1")
  })
})

describe("qualityOptions", () => {
  it("puts Auto first and the rest highest-first", () => {
    const options = qualityOptions(LADDER)
    expect(options.map((o) => o.label)).toEqual(["Auto", "1080p", "720p", "480p", "360p"])
  })

  it("keeps the hls.js index on every row, so currentLevel can be set", () => {
    const options = qualityOptions(LADDER)
    expect(options[0]!.index).toBe(AUTO_LEVEL)
    expect(options[1]!.index).toBe(3)
    expect(options[4]!.index).toBe(0)
  })

  it("collapses two variants at one height to the higher-bitrate row", () => {
    const options = qualityOptions([
      { height: 720, bitrate: 2_000_000 },
      { height: 720, bitrate: 3_500_000 },
    ])
    expect(options).toHaveLength(2)
    // Index 1 is the 3.5 Mbps variant — the better picture, which is what
    // choosing a height by hand is asking for.
    expect(options[1]!.index).toBe(1)
  })

  it("keeps every unlabelled row, which are not duplicates of each other", () => {
    const options = qualityOptions([{ bitrate: 800_000 }, { bitrate: 1_600_000 }])
    expect(options).toHaveLength(3)
  })

  it("is Auto alone for an empty ladder", () => {
    expect(qualityOptions([]).map((o) => o.label)).toEqual(["Auto"])
  })
})

describe("qualityMenuAvailable", () => {
  it("is false with no ladder — native HLS and progressive MP4", () => {
    expect(qualityMenuAvailable([])).toBe(false)
  })

  it("is false for a single variant, which is not a choice", () => {
    expect(qualityMenuAvailable([{ height: 720 }])).toBe(false)
  })

  it("is true once there is something to choose between", () => {
    expect(qualityMenuAvailable(LADDER)).toBe(true)
  })
})

describe("autoLabel", () => {
  it("says what Auto resolved to, which is the whole complaint about Auto", () => {
    expect(autoLabel(LADDER, 2)).toBe("Auto (720p)")
  })

  it("says plain Auto before a level has been picked", () => {
    expect(autoLabel(LADDER, -1)).toBe("Auto")
  })

  it("says plain Auto rather than 0p for a level with no height", () => {
    expect(autoLabel([{ bitrate: 800_000 }], 0)).toBe("Auto")
  })
})

describe("currentQualityLabel", () => {
  it("reports the resolved height while adapting", () => {
    expect(currentQualityLabel(LADDER, AUTO_LEVEL, 1)).toBe("Auto (480p)")
  })

  it("reports the chosen height when one was chosen", () => {
    expect(currentQualityLabel(LADDER, 3, 1)).toBe("1080p")
  })

  it("falls back to Auto when the chosen index is gone after a source switch", () => {
    expect(currentQualityLabel(LADDER, 9, 2)).toBe("Auto (720p)")
  })
})

describe("nearestLevelForHeight", () => {
  it("finds the exact height when the new ladder has it", () => {
    expect(nearestLevelForHeight(LADDER, 720)).toBe(2)
  })

  it("picks the nearest when the remembered height is gone", () => {
    expect(nearestLevelForHeight([{ height: 360 }, { height: 1080 }], 480)).toBe(0)
  })

  it("breaks a tie downwards — a soft picture beats a buffer wheel", () => {
    expect(nearestLevelForHeight([{ height: 480 }, { height: 1080 }], 780)).toBe(0)
  })

  it("is Auto for no memory, and for a ladder with no heights at all", () => {
    expect(nearestLevelForHeight(LADDER, 0)).toBe(AUTO_LEVEL)
    expect(nearestLevelForHeight([], 720)).toBe(AUTO_LEVEL)
    expect(nearestLevelForHeight([{ bitrate: 800_000 }], 720)).toBe(AUTO_LEVEL)
  })
})

describe("parseQualityHeight", () => {
  it("reads a height back", () => {
    expect(parseQualityHeight("1080")).toBe(1080)
  })

  it("means Auto for absent, empty, the literal auto, and junk", () => {
    expect(parseQualityHeight(null)).toBe(0)
    expect(parseQualityHeight("")).toBe(0)
    expect(parseQualityHeight("auto")).toBe(0)
    expect(parseQualityHeight("best")).toBe(0)
    expect(parseQualityHeight("-720")).toBe(0)
  })
})

describe("readQualityHeight / writeQualityHeight", () => {
  it("round-trips an explicit choice", () => {
    installStorage()
    writeQualityHeight("u-7", 720)
    expect(readQualityHeight("u-7")).toBe(720)
  })

  it("is Auto for a viewer who has never chosen", () => {
    installStorage()
    expect(readQualityHeight("u-7")).toBe(0)
  })

  it("REMOVES the key when Auto is chosen, rather than storing a word", () => {
    const store = installStorage()
    writeQualityHeight("u-7", 1080)
    writeQualityHeight("u-7", 0)
    expect("momentum.player.quality.u-7" in store).toBe(false)
  })
})
