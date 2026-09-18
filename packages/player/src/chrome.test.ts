import { describe, expect, it } from "vitest"
import { chromeFeatures, settingsMenuUseful, type PlayerFeatures } from "./chrome"

/**
 * The compatibility promise, asserted rather than asserted-to.
 *
 * The first test is the one that protects @momentum/content's feed and
 * apps/reels: a caller that passes nothing must get a player with none of this
 * on it. If it ever fails, twenty feed cards have grown a gear menu.
 */
describe("chromeFeatures", () => {
  it("gives a caller that says nothing exactly nothing — the reels default", () => {
    const features = chromeFeatures()
    for (const [name, value] of Object.entries(features)) {
      expect(value, `${name} must default off`).toBe(false)
    }
  })

  it("treats an explicit minimal the same as the default", () => {
    expect(chromeFeatures("minimal")).toEqual(chromeFeatures())
  })

  it("turns everything on for the full chrome", () => {
    const features = chromeFeatures("full")
    for (const [name, value] of Object.entries(features)) {
      expect(value, `${name} must be on`).toBe(true)
    }
  })

  it("lets a caller switch one feature off — tube, which draws its own", () => {
    const features = chromeFeatures("full", { fullscreen: false })
    expect(features.fullscreen).toBe(false)
    expect(features.pictureInPicture).toBe(true)
    expect(features.speed).toBe(true)
  })

  it("lets a caller switch one feature on over the minimal preset", () => {
    expect(chromeFeatures("minimal", { captions: true }).captions).toBe(true)
    expect(chromeFeatures("minimal", { captions: true }).speed).toBe(false)
  })

  it("ignores an undefined override rather than reading it as off", () => {
    // A caller spreading `{ fullscreen: props.fullscreen }` from an optional
    // prop must not switch the preset's feature off by mentioning it.
    const overrides = { fullscreen: undefined } as Partial<PlayerFeatures>
    expect(chromeFeatures("full", overrides).fullscreen).toBe(true)
  })

  it("returns a fresh object each time, so a caller cannot poison the preset", () => {
    const first = chromeFeatures("full")
    first.speed = false
    expect(chromeFeatures("full").speed).toBe(true)
  })
})

describe("settingsMenuUseful", () => {
  const full = chromeFeatures("full")

  it("is false when the gear itself is off", () => {
    expect(settingsMenuUseful(chromeFeatures("minimal"), { quality: true })).toBe(false)
  })

  it("is true whenever speed is on, because speed always has a list", () => {
    expect(settingsMenuUseful(full, {})).toBe(true)
  })

  it("is false on a progressive MP4 with speed off — nothing to show", () => {
    const features = chromeFeatures("full", { speed: false })
    expect(settingsMenuUseful(features, { quality: false, captions: false })).toBe(false)
  })

  it("is true for quality alone once a ladder exists", () => {
    const features = chromeFeatures("full", { speed: false, captions: false })
    expect(settingsMenuUseful(features, { quality: true })).toBe(true)
  })

  it("is true for captions alone once a track exists", () => {
    const features = chromeFeatures("full", { speed: false, quality: false })
    expect(settingsMenuUseful(features, { captions: true })).toBe(true)
  })
})
