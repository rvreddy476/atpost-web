import { describe, expect, it } from "vitest"
import { failureOf, feedbackNotice, reportNotice } from "./outcomes"

/**
 * The point of these is not that the sentences are right — a copy change would
 * break half of them and be a fine change to make. It is that the CASES stay
 * distinct.
 *
 * The failure mode this guards is the one every one of these routes invites: a
 * single `catch` and a single "Something went wrong", which is wrong about the
 * author turning comments off, wrong about a rate limit, and worst of all
 * wrong about a report that is already filed — where painting the 409 red
 * teaches people that reporting does not work, and the next thing they do is
 * report it again.
 *
 * So each test asserts a DIFFERENCE rather than a string, and the tone matters
 * as much as the words: it is what decides whether the pill reads as a
 * confirmation or a problem.
 */

const axiosLike = (status: number, code?: string) => ({
  response: { status, data: code ? { error: { code } } : {} },
})

describe("failureOf", () => {
  it("digs the status and the code out of an axios rejection", () => {
    expect(failureOf(axiosLike(403, "COMMENTS_DISABLED"))).toEqual({
      status: 403,
      code: "COMMENTS_DISABLED",
    })
  })

  it("reports a request that never got an answer as having no status", () => {
    // Offline, or a dead proxy. `status: undefined` is the signal, and it has
    // to survive rather than become a 0 or a 500 — the sentence for it is the
    // one that does not blame the server.
    expect(failureOf(new Error("Network Error"))).toEqual({ status: undefined, code: undefined })
  })

  it("survives being handed something that is not an error at all", () => {
    // A rejected promise can carry anything. Crashing the handler that was
    // trying to report a failure is a strictly worse outcome than reporting
    // it vaguely.
    expect(failureOf(undefined)).toEqual({ status: undefined, code: undefined })
    expect(failureOf("nope")).toEqual({ status: undefined, code: undefined })
    expect(failureOf({ response: {} })).toEqual({ status: undefined, code: undefined })
  })
})

describe("feedbackNotice", () => {
  it("says which of the three things actually happened", () => {
    // One post goes, or every post by an account goes, or nothing goes and the
    // ranker leans the other way. "Thanks for the feedback" covers all three
    // and informs nobody.
    const hidePost = feedbackNotice("not_interested", "post").text
    const hideAuthor = feedbackNotice("not_interested", "author").text
    const morePost = feedbackNotice("interested", "post").text
    expect(new Set([hidePost, hideAuthor, morePost]).size).toBe(3)
    expect(hideAuthor).toMatch(/account/)
  })

  it("confirms rather than warns when it worked", () => {
    expect(feedbackNotice("not_interested", "post").tone).toBe("good")
    expect(feedbackNotice("interested", "author").tone).toBe("good")
  })

  it("does not tell someone to retry a 400 they cannot influence", () => {
    // A 400 here is ours: both ids, neither id, or an unknown signal. Nothing
    // the person did causes it and nothing they can do fixes it.
    const bad = feedbackNotice("not_interested", "post", { status: 400, code: "INVALID_REQUEST" })
    expect(bad.tone).toBe("bad")
    expect(bad.text).not.toMatch(/try again/i)
  })

  it("separates a rate limit from a refusal from a dead connection", () => {
    const limited = feedbackNotice("not_interested", "post", { status: 429 })
    const gone = feedbackNotice("not_interested", "post", { status: 404, code: "NOT_FOUND" })
    const offline = feedbackNotice("not_interested", "post", {})
    const broken = feedbackNotice("not_interested", "post", { status: 502 })
    expect(new Set([limited.text, gone.text, offline.text, broken.text]).size).toBe(4)
    // "Try again in a moment" is only ever said where waiting is the fix.
    expect(limited.text).toMatch(/in a moment/)
    expect(offline.text).toMatch(/[Nn]othing was recorded/)
  })

  it("asks an expired session to sign in rather than blaming the feed", () => {
    expect(feedbackNotice("interested", "post", { status: 401 }).text).toMatch(/Sign in/)
  })
})

describe("reportNotice", () => {
  it("treats an existing report as the confirmation it is", () => {
    // THE case this module exists for. 409 ACTIVE_REPORT_EXISTS means an open
    // report by this person against this post is already in the queue — which
    // is exactly the state they were trying to reach.
    const again = reportNotice({ status: 409, code: "ACTIVE_REPORT_EXISTS" })
    expect(again.tone).toBe("good")
    expect(again.text).toMatch(/already reported/)
    // And it says the report is still open, so nobody files a third.
    expect(again.text).toMatch(/still with moderation/)
  })

  it("recognises the repeat from the code alone", () => {
    // The status is the gateway's; the code is the service's. Either is enough
    // and neither is required to be present for the other to work.
    expect(reportNotice({ code: "ACTIVE_REPORT_EXISTS" }).tone).toBe("good")
    expect(reportNotice({ status: 409 }).tone).toBe("good")
  })

  it("confirms a report that filed", () => {
    const filed = reportNotice()
    expect(filed.tone).toBe("good")
    expect(filed.text).toMatch(/moderation/)
  })

  it("is explicit that a failure filed NOTHING", () => {
    // The one fact a person needs after a failed report: it did not happen.
    // Whose fault it was is not something they can act on.
    for (const failure of [{ status: 500 }, { status: 400 }, {}]) {
      const notice = reportNotice(failure)
      expect(notice.tone).toBe("bad")
      expect(notice.text).toMatch(/[Nn]othing was (filed|sent)/)
    }
  })

  it("keeps sign-in, rate limit and a vanished post apart", () => {
    const unauth = reportNotice({ status: 401 })
    const limited = reportNotice({ status: 429 })
    const gone = reportNotice({ status: 404 })
    expect(new Set([unauth.text, limited.text, gone.text]).size).toBe(3)
    expect(unauth.text).toMatch(/Sign in/)
  })
})
