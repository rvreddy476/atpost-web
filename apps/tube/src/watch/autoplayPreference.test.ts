import { describe, expect, it } from "vitest"
import { autoplayNextKey, parseAutoplayNext } from "./autoplayPreference"

/**
 * The pure half of the preference. The two ways it fails silently are a key
 * that collides between accounts and a stray value read as "off", and both
 * are arithmetic rather than something to click at.
 */

describe("autoplayNextKey", () => {
  it("is namespaced to the app and the surface, because every zone shares one origin", () => {
    expect(autoplayNextKey("u1")).toBe("momentum.tube.autoplay-next.u1")
    expect(autoplayNextKey("u1")).not.toBe(autoplayNextKey("u2"))
  })

  it("falls back to a shared anonymous slot when there is nobody to attribute it to", () => {
    expect(autoplayNextKey(null)).toBe("momentum.tube.autoplay-next.anon")
    expect(autoplayNextKey(undefined)).toBe("momentum.tube.autoplay-next.anon")
    expect(autoplayNextKey("   ")).toBe("momentum.tube.autoplay-next.anon")
  })
})

describe("parseAutoplayNext", () => {
  // The founder's default is on.
  it("is on when nothing is stored", () => {
    expect(parseAutoplayNext(null)).toBe(true)
    expect(parseAutoplayNext(undefined)).toBe(true)
    expect(parseAutoplayNext("")).toBe(true)
  })

  it("is off only for the exact string \"0\"", () => {
    expect(parseAutoplayNext("0")).toBe(false)
    expect(parseAutoplayNext("1")).toBe(true)
  })

  // A parser that read every non-"1" as off would switch autoplay off for
  // anyone whose storage held a value some other version wrote, and they
  // would never learn a countdown existed.
  it("treats anything else as the default rather than as off", () => {
    expect(parseAutoplayNext("false")).toBe(true)
    expect(parseAutoplayNext("off")).toBe(true)
    expect(parseAutoplayNext("00")).toBe(true)
    expect(parseAutoplayNext(" 0")).toBe(true)
  })
})
