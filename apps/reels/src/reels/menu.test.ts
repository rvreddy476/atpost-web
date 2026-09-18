import { describe, expect, it } from "vitest"
import { feedbackNotice, reelMenuGroups, reportOutcome } from "./menu"

const ids = (input: { isOwn: boolean; canWrite: boolean }) =>
  reelMenuGroups(input).flat().map((row) => row.id)

describe("reelMenuGroups", () => {
  it("is the brief's four rows for somebody else's short", () => {
    expect(ids({ isOwn: false, canWrite: true })).toEqual([
      "copy-link",
      "not-interested",
      "mute-author",
      "report",
    ])
  })

  it("separates the ranking rows from Report", () => {
    // The dividers are load-bearing: "Not interested" and "Report" doing
    // visibly different kinds of thing is what stops somebody reaching for the
    // second when they meant the first.
    const groups = reelMenuGroups({ isOwn: false, canWrite: true })
    expect(groups).toHaveLength(3)
    expect(groups[2].map((r) => r.id)).toEqual(["report"])
  })

  it("marks only Report as destructive", () => {
    const destructive = reelMenuGroups({ isOwn: false, canWrite: true })
      .flat()
      .filter((row) => row.destructive)
      .map((row) => row.id)
    expect(destructive).toEqual(["report"])
  })

  it("gives a signed-out viewer Copy link and nothing else", () => {
    // Absent, not disabled. The other three all need a session, and a greyed
    // row says "not yet" where the truth is "not here".
    expect(ids({ isOwn: false, canWrite: false })).toEqual(["copy-link"])
  })

  it("does not offer to report or un-recommend your OWN short", () => {
    expect(ids({ isOwn: true, canWrite: true })).toEqual(["copy-link"])
  })

  it("always offers Copy link", () => {
    for (const isOwn of [true, false]) {
      for (const canWrite of [true, false]) {
        expect(ids({ isOwn, canWrite })).toContain("copy-link")
      }
    }
  })

  it("never returns an empty group", () => {
    for (const isOwn of [true, false]) {
      for (const canWrite of [true, false]) {
        for (const group of reelMenuGroups({ isOwn, canWrite })) {
          expect(group.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe("reportOutcome", () => {
  it("confirms a report that was filed", () => {
    expect(reportOutcome(undefined).ok).toBe(true)
  })

  it("treats 409 as SUCCESS, not failure", () => {
    // ACTIVE_REPORT_EXISTS means their report is already open in the
    // moderation queue — the state they were trying to reach. Telling somebody
    // their report failed when it is sitting in the queue is how a person
    // reports the same video four times.
    const out = reportOutcome(409)
    expect(out.ok).toBe(true)
    expect(out.notice).toContain("already reported")
  })

  it("is honest about a refusal", () => {
    // The one thing worse than "we could not file that" is a thank-you for a
    // report that was never filed.
    expect(reportOutcome(500).ok).toBe(false)
    expect(reportOutcome(401).ok).toBe(false)
    expect(reportOutcome(403).notice).toContain("Sign in")
  })
})

describe("feedbackNotice", () => {
  it("says which of the two similar rows happened", () => {
    expect(feedbackNotice("not-interested", true)).not.toBe(feedbackNotice("mute-author", true))
  })

  it("says the same thing about a failure either way", () => {
    expect(feedbackNotice("not-interested", false)).toBe(feedbackNotice("mute-author", false))
  })
})
