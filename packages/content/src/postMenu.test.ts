import { describe, expect, it } from "vitest"
import {
  REPORT_REASONS,
  analyticsReasonFor,
  postMenuGroups,
  reportNeedsDetails,
  saveLabel,
  type PostMenuInput,
} from "./postMenu"

/** Everything wired, someone else's post, no author switches. The base case. */
const ALL: PostMenuInput = {
  isOwn: false,
  hideShare: false,
  hasReason: false,
  can: { save: true, copyLink: true, share: true, feedback: true, report: true },
}

const ids = (input: PostMenuInput) => postMenuGroups(input).map((group) => group.map((row) => row.id))

describe("postMenuGroups", () => {
  it("keeps the phone's three groups, in the phone's order", () => {
    expect(ids(ALL)).toEqual([
      ["save", "copy-link", "share"],
      ["interested", "not-interested", "mute-author"],
      ["report"],
    ])
  })

  it("puts 'why you're seeing this' first, and only when the server said why", () => {
    // The sentence is the ranking service's. There is no row when there is no
    // sentence, because the client has nothing honest to put in it.
    expect(ids({ ...ALL, hasReason: true })[0][0]).toBe("why")
    expect(ids(ALL)[0]).not.toContain("why")
  })

  it("drops Share on a post whose author turned sharing off", () => {
    // The same rule the action bar holds: a control the server will refuse is
    // absent, not disabled. A Share row here would be the offer the bar just
    // declined to make.
    expect(ids({ ...ALL, hideShare: true })[0]).toEqual(["save", "copy-link"])
  })

  it("offers your own post nothing to report and nothing to be uninterested in", () => {
    expect(ids({ ...ALL, isOwn: true })).toEqual([["save", "copy-link", "share"]])
  })

  it("drops a row whose handler the zone never wired", () => {
    // A Report that files nothing and a 403 are the same broken promise; one
    // of them just fails later.
    expect(ids({ ...ALL, can: { save: true } })).toEqual([["save"]])
  })

  it("returns nothing at all when there is nothing to offer", () => {
    // The card renders no trigger in this case rather than an empty menu.
    expect(postMenuGroups({ ...ALL, can: {} })).toEqual([])
  })

  it("never returns an empty group, so no divider is ever drawn over nothing", () => {
    const groups = postMenuGroups({ ...ALL, can: { report: true } })
    expect(groups).toEqual([[{ id: "report", label: "Report", destructive: true }]])
  })

  it("marks Report as the destructive row and puts it last", () => {
    const groups = postMenuGroups(ALL)
    const last = groups[groups.length - 1]
    expect(last[last.length - 1]).toMatchObject({ id: "report", destructive: true })
  })
})

describe("saveLabel", () => {
  it("says what pressing it will do", () => {
    expect(saveLabel(false)).toBe("Save")
    expect(saveLabel(true)).toBe("Unsave")
  })
})

describe("REPORT_REASONS", () => {
  it("only sends values trust-safety-service actually accepts", () => {
    // `validReportCategories` in internal/service/moderation.go. The service
    // also rewrites four legacy aliases; a new client must not send them.
    const canonical = new Set([
      "spam",
      "harassment",
      "scam_fraud",
      "sexual_content",
      "hate_abuse",
      "impersonation",
      "child_safety",
      "violence_threat",
      "self_harm",
      "misinformation",
      "intellectual_property",
      "other",
    ])
    for (const reason of REPORT_REASONS) expect(canonical.has(reason.value)).toBe(true)
  })

  it("carries no legacy alias", () => {
    const values = REPORT_REASONS.map((r) => r.value as string)
    for (const alias of ["hate_speech", "hate", "violence", "nudity", "false_info"]) {
      expect(values).not.toContain(alias)
    }
  })

  it("asks for words only for 'Other'", () => {
    expect(reportNeedsDetails("other")).toBe(true)
    expect(reportNeedsDetails("spam")).toBe(false)
    expect(reportNeedsDetails("child_safety")).toBe(false)
  })
})

describe("analyticsReasonFor", () => {
  it("translates the five that exist in both vocabularies", () => {
    expect(analyticsReasonFor("spam")).toBe("spam")
    expect(analyticsReasonFor("sexual_content")).toBe("nudity")
    expect(analyticsReasonFor("violence_threat")).toBe("violence")
    expect(analyticsReasonFor("hate_abuse")).toBe("hate")
    expect(analyticsReasonFor("misinformation")).toBe("misinformation")
  })

  it("passes the rest through rather than dropping the event", () => {
    // Ingest stores an unrecognised reason as "unspecified" and accepts the
    // batch, so a report is still counted as the strong negative signal it is.
    expect(analyticsReasonFor("impersonation")).toBe("impersonation")
    expect(analyticsReasonFor("other")).toBe("other")
  })

  it("only ever emits one of the contract's reasons or a canonical category", () => {
    const negative = new Set([
      "spam",
      "nudity",
      "violence",
      "hate",
      "misinformation",
      "repetitive",
      "irrelevant",
      "dislike_creator",
    ])
    const canonical = new Set(REPORT_REASONS.map((r) => r.value as string))
    for (const reason of REPORT_REASONS) {
      const mapped = analyticsReasonFor(reason.value)
      expect(negative.has(mapped) || canonical.has(mapped)).toBe(true)
    }
  })
})
