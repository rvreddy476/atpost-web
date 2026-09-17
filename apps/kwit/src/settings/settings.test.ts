import { describe, expect, it } from "vitest"
import settingsDefaults from "@/qa/__fixtures__/settings_get_200_defaults.json"
import { SETTING_GROUPS } from "@/qa/copy"
import { SETTINGS_KEYS, parseSettings, settingsPutBody } from "@/qa/parse"
import { editSetting, settleSave } from "./settingsState"

const defaults = parseSettings(settingsDefaults.data)

describe("settings groups", () => {
  it("draws every one of the sixteen keys exactly once", () => {
    const drawn = SETTING_GROUPS.flatMap((g) => g.rows.map((r) => r.key))
    expect(drawn).toHaveLength(16)
    expect([...drawn].sort()).toEqual([...SETTINGS_KEYS].sort())
  })

  it("groups by channel: In the app, Push, Email", () => {
    expect(SETTING_GROUPS.map((g) => g.title)).toEqual(["In the app", "Push notifications", "Email"])
    for (const group of SETTING_GROUPS) {
      const prefix = group.id === "inbox" ? "inbox_" : group.id === "push" ? "push_" : "email_"
      expect(group.rows.every((r) => r.key.startsWith(prefix))).toBe(true)
    }
  })
})

describe("optimistic settings", () => {
  it("a press that changes nothing is no edit", () => {
    expect(editSetting(defaults, "inbox_answers", true)).toBeNull()
  })

  it("moves at once, and the PUT body is the whole object", () => {
    const edit = editSetting(defaults, "push_votes", true)!
    expect(edit.after.push_votes).toBe(true)
    expect(edit.before.push_votes).toBe(false)
    const body = settingsPutBody(edit.after)
    expect(Object.keys(body)).toHaveLength(16)
    expect(body).toEqual({ ...settingsDefaults.data, push_votes: true })
  })

  it("rolls back on failure", () => {
    const edit = editSetting(defaults, "email_answers", false)!
    expect(settleSave(edit, { ok: false })).toEqual(defaults)
  })

  it("keeps what the server stored on success", () => {
    const edit = editSetting(defaults, "email_topic_digest", true)!
    const stored = { ...edit.after, inbox_votes: false }
    expect(settleSave(edit, { ok: true, stored })).toEqual(stored)
  })
})
