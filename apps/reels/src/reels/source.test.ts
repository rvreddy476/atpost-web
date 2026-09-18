import { describe, expect, it } from "vitest"
import { canWrite, emptyCopy, sourceFor, tabsFor } from "./source"

describe("tabsFor", () => {
  it("offers both tabs to a signed-in viewer", () => {
    expect(tabsFor(false).map((t) => t.id)).toEqual(["for-you", "following"])
  })

  it("offers NO tabs to a signed-out one", () => {
    // Not a disabled strip: `following_only` needs a session and
    // /v1/posts/recent has no "following" of its own, so both tabs would be
    // the same list. A greyed control says "not yet" where the truth is "not
    // here".
    expect(tabsFor(true)).toEqual([])
  })
})

describe("sourceFor", () => {
  it("sends a signed-out viewer to the recent posts endpoint, whatever the tab", () => {
    // /v1/feed/flicks ranks against a viewer and 401s for an anonymous
    // browser, and each 401 costs a failed token refresh behind it.
    expect(sourceFor(true, "for-you")).toBe("recent")
    expect(sourceFor(true, "following")).toBe("recent")
  })

  it("sends a signed-in viewer to the ranked feed by default", () => {
    expect(sourceFor(false, "for-you")).toBe("flicks")
  })

  it("only asks for following_only from the tab that can be switched off", () => {
    expect(sourceFor(false, "following")).toBe("following")
  })
})

describe("emptyCopy", () => {
  it("does not claim the platform is empty when the RANKER was", () => {
    // The specific invention this guards against: an empty ranked answer is a
    // fact about one account, and copy saying "no shorts have been posted"
    // would turn it into a claim about the platform.
    const copy = emptyCopy("flicks")
    expect(copy.title).toBe("No shorts for you yet")
    expect(copy.body).toContain("ranked for each account")
  })

  it("points the Following tab at the other one", () => {
    const copy = emptyCopy("following")
    expect(copy.body).toContain("For you")
  })

  it("is the only case that really is about the platform", () => {
    // /v1/posts/recent is unranked, unfiltered and newest-first, so nothing in
    // it does mean nothing published.
    expect(emptyCopy("recent").title).toBe("No shorts yet")
  })

  it("says something different for each of the three", () => {
    const titles = (["flicks", "following", "recent"] as const).map((s) => emptyCopy(s).title)
    expect(new Set(titles).size).toBe(3)
  })
})

describe("canWrite", () => {
  it("is the session, and nothing else", () => {
    expect(canWrite(false)).toBe(true)
    expect(canWrite(true)).toBe(false)
  })
})
