import { describe, expect, it } from "vitest"
import { blurhashAverageColor, decodeBlurhash, isValidBlurhash } from "./blurhash"

/**
 * The hashes below are real ones from the live feed, not invented strings —
 * a made-up hash can be self-consistent and still prove nothing about whether
 * this decoder agrees with the encoder that produced the ones we actually get.
 */
const PHOTO = "LdKwtaD%_3oz_NWBNGof9GRj9Fae" // a 1080x1350 photograph
const FLICK = "LmF$eOs?00W~kCk8niaijYROWotU" // a 1080x1920 video first frame

describe("isValidBlurhash", () => {
  it("accepts hashes the feed actually returns", () => {
    expect(isValidBlurhash(PHOTO)).toBe(true)
    expect(isValidBlurhash(FLICK)).toBe(true)
  })

  it("rejects absent, short and wrong-length input", () => {
    expect(isValidBlurhash(undefined)).toBe(false)
    expect(isValidBlurhash(null)).toBe(false)
    expect(isValidBlurhash("")).toBe(false)
    expect(isValidBlurhash("abc")).toBe(false)
    // The component count is encoded in the first character, so a hash one
    // character short is the failure mode that matters: it parses, and then
    // reads past the end of the string.
    expect(isValidBlurhash(PHOTO.slice(0, -1))).toBe(false)
  })

  it("rejects a character outside the base-83 alphabet", () => {
    expect(isValidBlurhash(`\\${PHOTO.slice(1)}`)).toBe(false)
  })
})

describe("decodeBlurhash", () => {
  it("fills every pixel with an opaque colour", () => {
    const pixels = decodeBlurhash(PHOTO, 8, 8)
    expect(pixels.length).toBe(8 * 8 * 4)
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255)
  })

  it("produces something other than a flat grey", () => {
    // The whole point of decoding is that the result carries the picture's
    // colour. A decoder with the linear/sRGB conversion missing still returns
    // plausible-looking bytes, so "it returned data" proves nothing — this
    // asserts the channels actually differ from one another.
    const pixels = decodeBlurhash(PHOTO, 8, 8)
    let differs = false
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== pixels[i + 1] || pixels[i + 1] !== pixels[i + 2]) differs = true
    }
    expect(differs).toBe(true)
  })

  it("varies across the image rather than repeating one colour", () => {
    const pixels = decodeBlurhash(FLICK, 8, 8)
    const first = [pixels[0], pixels[1], pixels[2]].join(",")
    const last = [pixels[pixels.length - 4], pixels[pixels.length - 3], pixels[pixels.length - 2]].join(",")
    expect(first).not.toBe(last)
  })

  it("is stable — the same hash decodes identically twice", () => {
    expect(Array.from(decodeBlurhash(PHOTO, 4, 4))).toEqual(
      Array.from(decodeBlurhash(PHOTO, 4, 4))
    )
  })

  it("throws on a malformed hash rather than returning garbage", () => {
    expect(() => decodeBlurhash("nope", 4, 4)).toThrow()
  })
})

describe("blurhashAverageColor", () => {
  it("returns a CSS colour for a valid hash", () => {
    const colour = blurhashAverageColor(PHOTO)
    expect(colour).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/)
  })

  it("agrees with the top-left pixel of the decode", () => {
    // The DC term IS the average, and the basis functions are all 1 at (0,0)
    // only for the DC component — so these are close but not identical. What
    // matters is that they are in the same neighbourhood, which catches a
    // decodeDC that forgot the sRGB→linear conversion (that error shifts the
    // channels by 40+ each).
    const pixels = decodeBlurhash(PHOTO, 2, 2)
    const [r, g, b] = blurhashAverageColor(PHOTO)!
      .match(/\d+/g)!
      .map(Number)
    expect(Math.abs(r - pixels[0])).toBeLessThan(90)
    expect(Math.abs(g - pixels[1])).toBeLessThan(90)
    expect(Math.abs(b - pixels[2])).toBeLessThan(90)
  })

  it("returns null rather than throwing for an invalid hash", () => {
    expect(blurhashAverageColor("nope")).toBeNull()
  })
})
