import { describe, expect, it } from "vitest"
import {
  canFullscreen,
  canPictureInPicture,
  fullscreenLabel,
  pictureInPictureLabel,
} from "./presentation"

describe("canFullscreen", () => {
  it("asks the ELEMENT, never a user-agent string", () => {
    expect(canFullscreen({ requestFullscreen: async () => undefined }, false)).toBe(true)
  })

  it("is false on a browser without the API — iPhone Safari", () => {
    expect(canFullscreen({}, false)).toBe(false)
    expect(canFullscreen(null, false)).toBe(false)
  })

  it("is true when a caller delegates, whatever the element can do", () => {
    // Tube's expand hook falls back to a fixed-position theatre overlay when
    // the API is refused, so the control is always able to do something.
    expect(canFullscreen({}, true)).toBe(true)
    expect(canFullscreen(null, true)).toBe(true)
  })
})

describe("canPictureInPicture", () => {
  const video = { requestPictureInPicture: async () => undefined }

  it("is true when the document allows it and the element implements it", () => {
    expect(canPictureInPicture(video, true)).toBe(true)
  })

  it("is false where the document forbids it — iOS, and a locked-down iframe", () => {
    expect(canPictureInPicture(video, false)).toBe(false)
  })

  it("is false on an element without the method — Firefox's own video", () => {
    expect(canPictureInPicture({}, true)).toBe(false)
    expect(canPictureInPicture(null, true)).toBe(false)
  })

  it("respects an element that opted out, rather than throwing when pressed", () => {
    expect(canPictureInPicture({ ...video, disablePictureInPicture: true }, true)).toBe(false)
  })
})

describe("labels", () => {
  it("name the action and the way back out, never the state", () => {
    expect(fullscreenLabel(false)).toBe("Full screen")
    expect(fullscreenLabel(true)).toContain("Escape")
    expect(pictureInPictureLabel(false)).toBe("Play in picture in picture")
    expect(pictureInPictureLabel(true)).toBe("Exit picture in picture")
  })
})
