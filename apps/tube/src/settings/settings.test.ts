import { describe, expect, it } from "vitest"
import { CHANNEL_HANDLE_MAX, handleShapeError, nameShapeError } from "@/studio/channelForm"
import {
  channelFormErrors,
  channelPatchBody,
  channelSaveMessage,
  parseDetailedPrefs,
  prefsPutBody,
} from "./settings"

describe("parseDetailedPrefs", () => {
  it("reads the three keys it draws", () => {
    expect(
      parseDetailedPrefs({
        push_enabled: true,
        push_new_videos: false,
        inapp_new_videos: true,
        quiet_hours_start: "22:00",
      })
    ).toEqual({ pushEnabled: true, pushNewVideos: false, inappNewVideos: true })
  })

  it("draws a missing key as on, and only an explicit false as off", () => {
    // Notifications default to on here: Subscribe turns them on in the
    // same press. And a wrong OFF on push_enabled would grey out both
    // switches with a sentence blaming a master switch that is not off.
    expect(parseDetailedPrefs({})).toEqual({
      pushEnabled: true,
      pushNewVideos: true,
      inappNewVideos: true,
    })
    expect(parseDetailedPrefs({ push_enabled: "no" }).pushEnabled).toBe(true)
    expect(parseDetailedPrefs({ push_enabled: false }).pushEnabled).toBe(false)
  })

  it("survives a body that is not a row at all", () => {
    expect(parseDetailedPrefs(null).pushEnabled).toBe(true)
    expect(parseDetailedPrefs("row").inappNewVideos).toBe(true)
  })
})

describe("prefsPutBody", () => {
  it("carries the changed key and nothing else", () => {
    // The partial PUT leaves absent keys untouched, so a body that echoed
    // the row would carry a stale copy of every key this page does not draw.
    const body = prefsPutBody("pushNewVideos", false)
    expect(body).toEqual({ push_new_videos: false })
    expect(Object.keys(body)).toHaveLength(1)
    expect(prefsPutBody("inappNewVideos", true)).toEqual({ inapp_new_videos: true })
  })
})

describe("channelFormErrors", () => {
  const good = { name: "Ada's Channel", handle: "ada.lovelace", about: "" }

  it("is null for a form the server would take", () => {
    expect(channelFormErrors(good)).toBeNull()
  })

  it("uses the studio's own rules, not a copy of them", () => {
    // The create form and the edit form must agree, so the sentence here IS
    // the studio's sentence.
    expect(channelFormErrors({ ...good, handle: "Ada" })?.handle).toBe(handleShapeError("Ada"))
    expect(channelFormErrors({ ...good, handle: "a-b" })?.handle).toBe(handleShapeError("a-b"))
    expect(channelFormErrors({ ...good, name: "ab" })?.name).toBe(nameShapeError("ab"))
    expect(channelFormErrors({ ...good, handle: "x".repeat(CHANNEL_HANDLE_MAX + 1) })?.handle).toBeTruthy()
  })

  it("caps about and allows it empty", () => {
    expect(channelFormErrors({ ...good, about: "y".repeat(201) })?.about).toContain("200")
    expect(channelFormErrors({ ...good, about: "y".repeat(200) })).toBeNull()
  })

  it("reports every failing field at once", () => {
    const errors = channelFormErrors({ name: "", handle: "", about: "" })
    expect(errors?.name).toBeTruthy()
    expect(errors?.handle).toBeTruthy()
    expect(errors?.about).toBeUndefined()
  })
})

describe("channelPatchBody", () => {
  const current = { name: "Ada", handle: "ada", about: "Maths." }

  it("is null when nothing changed, so nothing is sent", () => {
    expect(channelPatchBody(current, { ...current })).toBeNull()
    // Whitespace and case are normalised before comparing, the way the
    // fields normalise them, so a stray space is not a PATCH.
    expect(channelPatchBody(current, { name: " Ada ", handle: "ADA", about: "Maths. " })).toBeNull()
  })

  it("sends only the fields that differ", () => {
    expect(channelPatchBody(current, { ...current, about: "Maths and engines." })).toEqual({
      about: "Maths and engines.",
    })
    const body = channelPatchBody(current, { name: "Ada L", handle: "ada", about: "Maths." })
    expect(body).toEqual({ name: "Ada L" })
    expect(body && "handle" in body).toBe(false)
  })

  it("sends an emptied about, because clearing it is a change", () => {
    expect(channelPatchBody(current, { ...current, about: "" })).toEqual({ about: "" })
  })
})

describe("channelSaveMessage", () => {
  it("names the handle for a 409", () => {
    expect(channelSaveMessage({ status: 409, code: "HANDLE_TAKEN", message: null })).toContain(
      "taken"
    )
  })

  it("repeats the server's own sentence for a 400", () => {
    expect(channelSaveMessage({ status: 400, code: "INVALID_REQUEST", message: "about too long" })).toBe(
      "about too long"
    )
  })

  it("has a sentence for everything else", () => {
    expect(channelSaveMessage({ status: 500, code: null, message: null })).toBeTruthy()
    expect(channelSaveMessage({ status: 401, code: null, message: null })).toContain("Sign in")
  })
})
