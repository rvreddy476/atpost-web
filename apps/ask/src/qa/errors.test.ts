import { describe, expect, it } from "vitest"
import profileReputation403 from "./__fixtures__/profile_reputation_get_403_not_self.json"
import questionClose403 from "./__fixtures__/question_close_403_forbidden.json"
import topicsPost403 from "./__fixtures__/topics_post_403_not_moderator.json"
import vote400 from "./__fixtures__/vote_post_400_cannot_vote_own.json"
import { classifyError, classifyResponse, errorMessage, isNotAvailable } from "./errors"

/** What the api-gateway's dormant gate writes: no `meta`. */
const GATE_404 = { error: { code: "NOT_FOUND", message: "Not found" } }
/** What qa-service writes for a missing row: with `meta`. */
const SERVICE_404 = { error: { code: "NOT_FOUND", message: "question not found" }, meta: { request_id: "r1" } }

function axiosError(status: number, data: unknown) {
  return { isAxiosError: true, response: { status, data } }
}

describe("classifyResponse", () => {
  const table: [string, number, unknown, string, string | null][] = [
    ["gate 404, meta-less", 404, GATE_404, "notAvailable", "NOT_FOUND"],
    ["404 with no body at all", 404, undefined, "notAvailable", null],
    ["404 with an html body", 404, "<html>Not found</html>", "notAvailable", null],
    ["404 with meta: null", 404, { ...GATE_404, meta: null }, "notAvailable", "NOT_FOUND"],
    ["service 404 with meta", 404, SERVICE_404, "notFound", "NOT_FOUND"],
    ["service 404 with empty meta", 404, { ...GATE_404, meta: {} }, "notFound", "NOT_FOUND"],
    ["401", 401, { error: { code: "UNAUTHORIZED", message: "x" }, meta: {} }, "signInRequired", "UNAUTHORIZED"],
    ["401 without a body", 401, undefined, "signInRequired", null],
    ["403 close forbidden (golden)", 403, questionClose403, "forbidden", "FORBIDDEN"],
    ["403 not moderator (golden)", 403, topicsPost403, "forbidden", "NOT_MODERATOR"],
    ["403 not self (golden)", 403, profileReputation403, "forbidden", "NOT_SELF"],
    ["400 cannot vote own (golden)", 400, vote400, "cannotVoteOwn", "CANNOT_VOTE_OWN"],
    ["400 invalid request", 400, { error: { code: "INVALID_REQUEST", message: "at least one topic is required" }, meta: {} }, "other", "INVALID_REQUEST"],
    ["500", 500, { error: { code: "QUERY_FAILED", message: "pq: boom" }, meta: {} }, "other", "QUERY_FAILED"],
  ]

  it.each(table)("%s", (_name, status, body, kind, code) => {
    const e = classifyResponse(status, body)
    expect(e.kind).toBe(kind)
    expect(e.code).toBe(code)
    expect(e.status).toBe(status)
  })
})

describe("classifyError", () => {
  it("reads an axios error's response", () => {
    expect(classifyError(axiosError(404, GATE_404)).kind).toBe("notAvailable")
    expect(classifyError(axiosError(404, SERVICE_404)).kind).toBe("notFound")
    expect(isNotAvailable(axiosError(404, GATE_404))).toBe(true)
    expect(isNotAvailable(axiosError(404, SERVICE_404))).toBe(false)
  })

  it("an axios error with no response is the network", () => {
    expect(classifyError({ isAxiosError: true, request: {} }).kind).toBe("network")
  })

  it("anything else is other", () => {
    expect(classifyError(new Error("boom")).kind).toBe("other")
    expect(classifyError(null).kind).toBe("other")
    expect(isNotAvailable(null)).toBe(false)
  })
})

describe("errorMessage", () => {
  it("says what happened, never a server code", () => {
    expect(errorMessage(axiosError(404, GATE_404))).toMatch(/isn.t available/i)
    expect(errorMessage(axiosError(401, undefined))).toBe("Sign in to do that.")
    expect(errorMessage(axiosError(400, vote400))).toBe("You cannot vote on your own post.")
    expect(errorMessage(axiosError(403, profileReputation403))).toBe("That is only visible to its owner.")
    expect(errorMessage(axiosError(403, topicsPost403))).toBe("You do not have permission for that.")
    expect(errorMessage(axiosError(403, questionClose403))).toBe("Only the question author or a moderator can close it.")
    expect(errorMessage(axiosError(404, SERVICE_404))).toBe("That is not here any more.")
    expect(errorMessage({ isAxiosError: true, request: {} })).toMatch(/offline/)
    expect(errorMessage(axiosError(500, { error: { code: "QUERY_FAILED", message: "pq: boom" }, meta: {} }))).toBe(
      "Something went wrong. Try again.",
    )
    expect(errorMessage(axiosError(400, { error: { code: "INVALID_REQUEST", message: "at least one topic is required" }, meta: {} }))).toBe(
      "At least one topic is required.",
    )
  })
})
