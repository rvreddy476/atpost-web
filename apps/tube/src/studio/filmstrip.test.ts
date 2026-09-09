import { describe, expect, it } from "vitest"
import {
  centreCrop,
  clampTimestamp,
  COVER_ASPECT,
  FRAME_COUNT,
  filmstripTimestamps,
  formatTimecode,
  nearestFrameIndex,
  scaleToBox,
  TAIL_MARGIN_MS,
} from "./filmstrip"

describe("filmstripTimestamps", () => {
  it("returns the phone's 24 frames", () => {
    expect(filmstripTimestamps(120_000)).toHaveLength(FRAME_COUNT)
    expect(FRAME_COUNT).toBe(24)
  })

  // `duration * i / count` with the first at zero — the strip is a MAP of the
  // video, and a map that starts a second in has a hole where the title card
  // was.
  it("starts at zero and spaces evenly", () => {
    const stamps = filmstripTimestamps(24_000, 24)
    expect(stamps[0]).toBe(0)
    expect(stamps[1]).toBe(1_000)
    expect(stamps[12]).toBe(12_000)
  })

  it("never reaches the end of the video", () => {
    const duration = 24_000
    const stamps = filmstripTimestamps(duration, 24)
    expect(Math.max(...stamps)).toBeLessThan(duration)
    expect(Math.max(...stamps)).toBeLessThanOrEqual(duration - TAIL_MARGIN_MS)
  })

  // Seeking to exactly `duration` is not a frame: browsers clamp it to the
  // last decodable one, which is often black.
  it("respects the tail margin on a clip shorter than the margin's reach", () => {
    const stamps = filmstripTimestamps(200, 24)
    for (const stamp of stamps) expect(stamp).toBeLessThanOrEqual(100)
  })

  it("is empty for a duration it cannot use", () => {
    expect(filmstripTimestamps(0)).toEqual([])
    expect(filmstripTimestamps(-5)).toEqual([])
    expect(filmstripTimestamps(Number.NaN)).toEqual([])
    expect(filmstripTimestamps(10_000, 0)).toEqual([])
  })

  it("is monotonic", () => {
    const stamps = filmstripTimestamps(3_600_000)
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1])
    }
  })
})

describe("clampTimestamp", () => {
  it("keeps the handle inside the video", () => {
    expect(clampTimestamp(-1, 10_000)).toBe(0)
    expect(clampTimestamp(5_000, 10_000)).toBe(5_000)
    expect(clampTimestamp(10_000, 10_000)).toBe(10_000 - TAIL_MARGIN_MS)
    expect(clampTimestamp(999_999, 10_000)).toBe(10_000 - TAIL_MARGIN_MS)
  })

  it("does not go negative for a clip shorter than the margin", () => {
    expect(clampTimestamp(50, 40)).toBe(0)
  })
})

describe("nearestFrameIndex", () => {
  const stamps = filmstripTimestamps(24_000, 24)

  it("finds the cell under a time", () => {
    expect(nearestFrameIndex(stamps, 0)).toBe(0)
    expect(nearestFrameIndex(stamps, 12_100)).toBe(12)
  })

  // Ties go earlier so the highlight does not flicker between neighbours
  // while a drag sits exactly between them.
  it("breaks a tie toward the earlier cell", () => {
    expect(nearestFrameIndex(stamps, 500)).toBe(0)
  })

  it("is -1 with nothing to choose from", () => {
    expect(nearestFrameIndex([], 100)).toBe(-1)
  })
})

describe("formatTimecode", () => {
  // Filmstrip.format() on the phone: "0:42.6", growing an hours field only
  // when it needs one.
  it("writes m:ss.t", () => {
    expect(formatTimecode(42_600)).toBe("0:42.6")
    expect(formatTimecode(0)).toBe("0:00.0")
    expect(formatTimecode(1_500)).toBe("0:01.5")
    expect(formatTimecode(61_000)).toBe("1:01.0")
  })

  it("grows an hours field and pads the minutes", () => {
    expect(formatTimecode(3_723_400)).toBe("1:02:03.4")
    expect(formatTimecode(3_600_000)).toBe("1:00:00.0")
  })

  // The readout must never name a time later than the frame actually shown.
  it("truncates rather than rounding", () => {
    expect(formatTimecode(42_699)).toBe("0:42.6")
    expect(formatTimecode(999)).toBe("0:00.9")
  })

  it("survives nonsense", () => {
    expect(formatTimecode(Number.NaN)).toBe("0:00.0")
    expect(formatTimecode(-1)).toBe("0:00.0")
  })
})

describe("scaleToBox", () => {
  it("leaves a small frame alone", () => {
    expect(scaleToBox(640, 360)).toEqual({ width: 640, height: 360 })
  })

  it("scales a 4K frame down by its long edge and keeps the aspect", () => {
    const box = scaleToBox(3840, 2160)
    expect(box.width).toBe(1080)
    expect(box.height).toBe(608) // 2160 * 1080/3840 = 607.5, rounded
    expect(box.width / box.height).toBeCloseTo(3840 / 2160, 1)
  })

  it("scales a portrait frame by its height", () => {
    expect(scaleToBox(1080, 1920)).toEqual({ width: 608, height: 1080 })
  })

  // A canvas sized to a fraction is silently floored, which leaves a
  // one-pixel transparent seam down an edge of the JPEG.
  it("returns whole pixels", () => {
    const box = scaleToBox(1333, 999)
    expect(Number.isInteger(box.width)).toBe(true)
    expect(Number.isInteger(box.height)).toBe(true)
  })

  it("refuses to produce a zero-width canvas", () => {
    expect(scaleToBox(0, 100)).toEqual({ width: 0, height: 0 })
    expect(scaleToBox(4000, 1).height).toBeGreaterThanOrEqual(1)
  })
})

describe("centreCrop", () => {
  it("leaves a frame that is already 16:9 alone", () => {
    expect(centreCrop(1920, 1080)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it("takes a centred slice out of something too wide", () => {
    const crop = centreCrop(4000, 1000)
    expect(crop.height).toBe(1000)
    expect(crop.width).toBe(Math.round(1000 * COVER_ASPECT))
    expect(crop.x).toBe(Math.round((4000 - crop.width) / 2))
    expect(crop.y).toBe(0)
  })

  it("takes a centred slice out of something too tall", () => {
    const crop = centreCrop(1080, 1920)
    expect(crop.width).toBe(1080)
    expect(crop.height).toBe(Math.round(1080 / COVER_ASPECT))
    expect(crop.y).toBe(Math.round((1920 - crop.height) / 2))
    expect(crop.x).toBe(0)
  })

  it("never crops outside the source", () => {
    for (const [w, h] of [
      [4000, 1000],
      [1080, 1920],
      [1, 4000],
      [4000, 1],
    ]) {
      const crop = centreCrop(w, h)
      expect(crop.x).toBeGreaterThanOrEqual(0)
      expect(crop.y).toBeGreaterThanOrEqual(0)
      expect(crop.x + crop.width).toBeLessThanOrEqual(w)
      expect(crop.y + crop.height).toBeLessThanOrEqual(h)
    }
  })
})
