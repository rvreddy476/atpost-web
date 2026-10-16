import { describe, expect, it } from "vitest"
import { ADMIN_APPS } from "./apps"
import { buildAdminNav, findNavGroup, parseAdminMe } from "./me"
import { adminErrorMessage } from "./mutation"
import {
  EMPTY_SOUND_FORM,
  SOUNDS,
  checkSoundForm,
  createSoundBody,
  editSoundPatch,
  formatDuration,
  licenseExpiry,
  licenseExpiryNote,
  readSoundPage,
  soundAbilities,
  soundErrorMessage,
  soundListUrl,
  soundRequest,
  soundStatus,
  soundStatusChip,
  toggleFor,
  type SoundFormInput,
} from "./sounds"

const allNavigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me(apps: Record<string, string[]>, { platform = [] as string[], navigation = allNavigation as unknown[] } = {}) {
  const parsed = parseAdminMe({
    data: { user_id: "u-1", permissions: { platform, apps }, mfa: { required: true, verified: true }, navigation },
  })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

describe("permission-gated navigation", () => {
  it("shows Sound library, at /sounds beside the content apps, only with media:sounds.read", () => {
    const nav = buildAdminNav(me({ media: ["media:sounds.read"], live: ["live:streams.read"], rider: ["rider:x"] }))
    const group = findNavGroup(nav, "media")
    expect(group?.label).toBe("Sound library")
    expect(group?.href).toBe("/sounds")
    // After Live, before Mopedu.
    expect(nav.apps.map((g) => g.app)).toEqual(["live", "media", "rider"])
  })

  it("hides it from an admin with another media permission only", () => {
    expect(findNavGroup(buildAdminNav(me({ media: ["media:partner-evidence.read"] })), "media")).toBeNull()
    expect(findNavGroup(buildAdminNav(me({ media: ["media:sounds.manage"] })), "media")).toBeNull()
  })

  it("hides it when admin-service's navigation does not list it", () => {
    const nav = buildAdminNav(me({ media: ["media:sounds.read"] }, { navigation: [{ app: "social", label: "Social" }] }))
    expect(findNavGroup(nav, "media")).toBeNull()
  })

  it("uses the console's label when admin-service names the app by its id", () => {
    const nav = buildAdminNav(me({ media: ["media:sounds.read"] }, { navigation: [{ app: "media", label: "media" }] }))
    expect(findNavGroup(nav, "media")?.label).toBe("Sound library")
  })

  it("reaches it through a cross-app platform permission", () => {
    expect(findNavGroup(buildAdminNav(me({}, { platform: ["*:sounds.read"] })), "media")).not.toBeNull()
  })
})

describe("soundAbilities", () => {
  it("reads without writes for media:sounds.read", () => {
    expect(soundAbilities(me({ media: ["media:sounds.read"] }))).toEqual({ page: true, manage: false })
  })
  it("writes with media:sounds.manage", () => {
    expect(soundAbilities(me({ media: ["media:sounds.read", "media:sounds.manage"] }))).toEqual({ page: true, manage: true })
  })
  it("never offers writes without the page", () => {
    expect(soundAbilities(me({ media: ["media:sounds.manage"] }))).toEqual({ page: false, manage: false })
    expect(soundAbilities(me({ social: ["social:posts.moderate"] }))).toEqual({ page: false, manage: false })
  })
})

describe("the list", () => {
  it("builds the query with the filters and the cursor", () => {
    expect(soundListUrl({ status: "all", q: "", genre: "" })).toBe(`${SOUNDS}?status=all&limit=50`)
    expect(soundListUrl({ status: "withdrawn", q: " rain song ", genre: "Lo-fi", cursor: "abc=" })).toBe(
      `${SOUNDS}?status=withdrawn&q=rain+song&genre=Lo-fi&limit=50&cursor=abc%3D`,
    )
  })

  it("reads the rows and next_cursor from the envelope", () => {
    expect(readSoundPage({ data: [{ id: "s-1" }, "junk"], meta: { next_cursor: "c2" } })).toEqual({ rows: [{ id: "s-1" }], nextCursor: "c2" })
    expect(readSoundPage({ data: null, meta: { next_cursor: "" } })).toEqual({ rows: [], nextCursor: null })
    expect(readSoundPage(undefined)).toEqual({ rows: [], nextCursor: null })
  })

  it("formats durations", () => {
    expect(formatDuration(95_000)).toBe("1:35")
    expect(formatDuration(300_000)).toBe("5:00")
    expect(formatDuration(null)).toBe("—")
  })
})

describe("status chip", () => {
  it("maps each server status to its label and tone", () => {
    expect(soundStatusChip({ status: "draft" })).toEqual({ label: "Draft", tone: "normal" })
    expect(soundStatusChip({ status: "active" })).toEqual({ label: "Active", tone: "good" })
    expect(soundStatusChip({ status: "inactive" })).toEqual({ label: "Inactive", tone: "warn" })
    expect(soundStatusChip({ status: "withdrawn" })).toEqual({ label: "Withdrawn", tone: "bad" })
  })

  it("falls back on is_active, never guessing draft", () => {
    expect(soundStatus({ is_active: true })).toBe("active")
    expect(soundStatus({ is_active: false })).toBe("inactive")
    expect(soundStatus({ status: "weird", is_active: true })).toBe("active")
  })

  it("offers Enable for a draft or inactive sound, Disable for an active one, nothing once withdrawn", () => {
    expect(toggleFor({ status: "draft" })).toEqual({ label: "Enable", isActive: true })
    expect(toggleFor({ status: "inactive" })).toEqual({ label: "Enable", isActive: true })
    expect(toggleFor({ status: "active" })).toEqual({ label: "Disable", isActive: false })
    expect(toggleFor({ status: "withdrawn" })).toBeNull()
  })
})

describe("licence expiry", () => {
  const now = Date.parse("2026-10-16T12:00:00Z")
  const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString()

  it("flags an expired licence", () => {
    expect(licenseExpiry(inDays(-1), now)).toEqual({ state: "expired", days: 0 })
    expect(licenseExpiryNote(inDays(-1), now)).toBe("Licence expired")
  })

  it("flags a licence ending within 30 days", () => {
    expect(licenseExpiry(inDays(10), now)).toEqual({ state: "soon", days: 10 })
    expect(licenseExpiry(inDays(30), now).state).toBe("soon")
    expect(licenseExpiryNote(inDays(1), now)).toBe("Licence ends in 1 day")
    expect(licenseExpiryNote(new Date(now + 3_600_000).toISOString(), now)).toBe("Licence ends today")
  })

  it("does not flag a licence with more than 30 days left, or none at all", () => {
    expect(licenseExpiry(inDays(31), now)).toEqual({ state: "ok", days: 31 })
    expect(licenseExpiryNote(inDays(31), now)).toBeNull()
    expect(licenseExpiry(null, now)).toEqual({ state: "none", days: null })
    expect(licenseExpiry("not a date", now).state).toBe("none")
  })
})

describe("details form validation", () => {
  const valid: SoundFormInput = {
    ...EMPTY_SOUND_FORM,
    title: " Monsoon ",
    artist: "Asha",
    genre: "Folk",
    license_type: "licensed",
    rights_holder: "Saregama",
    license_expires_day: "2027-01-31",
  }

  it("requires title, artist, genre, licence type and rights holder", () => {
    const { problems } = checkSoundForm(EMPTY_SOUND_FORM, { today: "2026-10-16" })
    expect(problems).toEqual(["Title is required.", "Artist is required.", "Genre is required.", "Rights holder is required.", "Choose the licence type."])
  })

  it("turns a valid form into the create fields, blanks as null and the expiry at the end of the day in India", () => {
    const { problems, fields } = checkSoundForm(valid, { today: "2026-10-16" })
    expect(problems).toEqual([])
    expect(fields).toEqual({
      title: "Monsoon",
      artist: "Asha",
      genre: "Folk",
      mood: null,
      license_type: "licensed",
      rights_holder: "Saregama",
      license_reference: null,
      license_expires_at: "2027-01-31T23:59:59+05:30",
      attribution: null,
    })
    // No is_active: a new sound is a draft.
    expect(createSoundBody("audio-library/k.mp3", fields)).toEqual({
      storage_key: "audio-library/k.mp3",
      title: "Monsoon",
      artist: "Asha",
      genre: "Folk",
      license_type: "licensed",
      rights_holder: "Saregama",
      license_expires_at: "2027-01-31T23:59:59+05:30",
    })
  })

  it("refuses an expiry already past, a malformed date, and over-long text", () => {
    expect(checkSoundForm({ ...valid, license_expires_day: "2026-10-15" }, { today: "2026-10-16" }).problems).toEqual(["The licence expiry has already passed."])
    expect(checkSoundForm({ ...valid, license_expires_day: "31/01/2027" }, { today: "2026-10-16" }).problems).toEqual(["The licence expiry is not a valid date."])
    expect(checkSoundForm({ ...valid, title: "x".repeat(201) }, { today: "2026-10-16" }).problems).toEqual(["Title must be 200 characters or fewer."])
  })

  it("an edit sends only what changed, and leaves an untouched past expiry alone", () => {
    const stored = {
      id: "s-1",
      title: "Monsoon",
      artist: "Asha",
      genre: "Folk",
      mood: "Calm",
      license_type: "licensed",
      rights_holder: "Saregama",
      license_reference: "INV-1",
      license_expires_at: "2026-09-30T18:29:59Z",
      attribution: null,
    }
    const unchanged = { ...EMPTY_SOUND_FORM, title: "Monsoon", artist: "Asha", genre: "Folk", mood: "Calm", license_type: "licensed" as const, rights_holder: "Saregama", license_reference: "INV-1", license_expires_day: "2026-09-30" }
    expect(editSoundPatch(stored, unchanged, { today: "2026-10-16" })).toEqual({ problems: [], patch: {} })
    expect(editSoundPatch(stored, { ...unchanged, mood: "", attribution: "Courtesy of Saregama" }, { today: "2026-10-16" })).toEqual({
      problems: [],
      patch: { mood: null, attribution: "Courtesy of Saregama" },
    })
    expect(editSoundPatch(stored, { ...unchanged, license_expires_day: "" }, { today: "2026-10-16" }).patch).toEqual({ license_expires_at: null })
    expect(editSoundPatch(stored, { ...unchanged, license_expires_day: "2026-10-01" }, { today: "2026-10-16" }).problems).toEqual(["The licence expiry has already passed."])
    // The licence type is not editable: never in the patch.
    expect(editSoundPatch(stored, { ...unchanged, license_type: "original" }, { today: "2026-10-16" }).patch).toEqual({})
  })
})

describe("requests", () => {
  it("withdraw sends the scope and the reason", () => {
    expect(soundRequest({ kind: "withdraw", id: "s 1", scope: "everywhere", reason: "Licence revoked by the label" })).toEqual({
      method: "post",
      url: `${SOUNDS}/s%201/withdraw`,
      body: { scope: "everywhere", reason: "Licence revoked by the label" },
    })
    expect(soundRequest({ kind: "withdraw", id: "s-1", scope: "new_uses", reason: "Rotating the catalogue" }).body).toEqual({ scope: "new_uses", reason: "Rotating the catalogue" })
  })

  it("enable/disable is a PATCH of is_active; an edit is a PATCH of the changes", () => {
    expect(soundRequest({ kind: "toggle", id: "s-1", isActive: true })).toEqual({ method: "patch", url: `${SOUNDS}/s-1`, body: { is_active: true } })
    expect(soundRequest({ kind: "edit", id: "s-1", patch: { title: "New" } })).toEqual({ method: "patch", url: `${SOUNDS}/s-1`, body: { title: "New" } })
  })
})

describe("server refusals on create", () => {
  const err = (code: string) => ({ response: { status: 422, data: { error: { code, message: "server text" } } } })

  it("explains UPLOAD_MISSING, NOT_AUDIO and TOO_LONG in the console's words", () => {
    expect(soundErrorMessage(err("UPLOAD_MISSING"))).toMatch(/not found in storage/)
    expect(soundErrorMessage(err("NOT_AUDIO"))).toMatch(/not audio/)
    expect(soundErrorMessage(err("TOO_LONG"))).toMatch(/longer than 5 minutes/)
  })

  it("falls back to the console's usual messages", () => {
    expect(soundErrorMessage(err("PERMISSION_DENIED"))).toBe(adminErrorMessage(err("PERMISSION_DENIED")))
    expect(soundErrorMessage(err("SOMETHING"))).toBe("server text")
  })
})
