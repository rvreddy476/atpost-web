import { describe, expect, it } from "vitest"
import { authorHandle, byline, isOwnPost, showsPostedAnonymously } from "./byline"
import { flattenPages, nextOffset } from "./paging"
import { parseQuestionSummary } from "./parse"
import {
  canAnswer,
  canAsk,
  canSearch,
  canSelectBestAnswer,
  isUuid,
  orderAnswers,
  parseTags,
  shouldCheckSimilar,
  toggleId,
} from "./rules"
import { applyVote, nextVote, voteStateOf, type VoteState } from "./votes"
import { EMPTY_UUID } from "./wire"

const ME = "66666666-6666-4666-8666-666666666666"
const OTHER = "2d598287-eee7-40b4-a7f5-b46b9412e4e7"

describe("byline", () => {
  const table: [string, boolean, Parameters<typeof byline>[1], string][] = [
    ["anonymous wins over a name", true, { user_id: "u", username: "priya", display_name: "Priya R" }, "Anonymous"],
    ["anonymous with no author", true, null, "Anonymous"],
    ["display name first", false, { user_id: "u", username: "priya", display_name: "Priya R" }, "Priya R"],
    ["then the handle", false, { user_id: "u", username: "priya", display_name: "  " }, "@priya"],
    ["a missing author is a Member, never Anonymous", false, null, "Member"],
    ["an author with no names is a Member", false, { user_id: "u", username: "", display_name: "" }, "Member"],
  ]
  it.each(table)("%s", (_name, anonymous, author, expected) => {
    expect(byline(anonymous, author)).toBe(expected)
  })

  it("never offers a profile handle for anonymous content", () => {
    expect(authorHandle(true, { user_id: "u", username: "priya", display_name: "" })).toBeNull()
    expect(authorHandle(false, { user_id: "u", username: "priya", display_name: "" })).toBe("priya")
  })
})

describe("ownership", () => {
  it("the masked id is nobody's", () => {
    expect(isOwnPost(EMPTY_UUID, EMPTY_UUID)).toBe(false)
    expect(isOwnPost("", "")).toBe(false)
    expect(isOwnPost(ME, null)).toBe(false)
    expect(isOwnPost(ME, ME)).toBe(true)
    expect(isOwnPost(OTHER, ME)).toBe(false)
  })

  it("shows 'Posted anonymously' only to the author of an anonymous post", () => {
    expect(showsPostedAnonymously({ is_anonymous: true, author_id: ME }, ME)).toBe(true)
    expect(showsPostedAnonymously({ is_anonymous: true, author_id: EMPTY_UUID }, ME)).toBe(false)
    expect(showsPostedAnonymously({ is_anonymous: false, author_id: ME }, ME)).toBe(false)
    expect(showsPostedAnonymously({ is_anonymous: true, author_id: ME }, null)).toBe(false)
  })

  it("only the open question's author may mark best", () => {
    expect(canSelectBestAnswer(ME, ME, "open")).toBe(true)
    expect(canSelectBestAnswer(ME, ME, "closed")).toBe(false)
    expect(canSelectBestAnswer(OTHER, ME, "open")).toBe(false)
    expect(canSelectBestAnswer(EMPTY_UUID, EMPTY_UUID, "open")).toBe(false)
    expect(canSelectBestAnswer(ME, null, "open")).toBe(false)
  })
})

describe("composer rules", () => {
  it("canAsk needs a 10–300 character title and a topic", () => {
    expect(canAsk("short", ["t"])).toBe(false)
    expect(canAsk("How do I do this?", [])).toBe(false)
    expect(canAsk("How do I do this?", ["t"])).toBe(true)
    expect(canAsk("x".repeat(301), ["t"])).toBe(false)
  })

  it("answers, search and the similar check have floors", () => {
    expect(canAnswer("  ")).toBe(false)
    expect(canAnswer("y")).toBe(true)
    expect(canSearch("a")).toBe(false)
    expect(canSearch(" go ")).toBe(true)
    expect(canSearch(null)).toBe(false)
    expect(shouldCheckSimilar("How do I")).toBe(false)
    expect(shouldCheckSimilar("How do I scale")).toBe(true)
  })

  it("parses tags", () => {
    expect(parseTags("#Go, latency  go,,p99")).toEqual(["go", "latency", "p99"])
    expect(parseTags("a b c d e f g")).toHaveLength(5)
    expect(parseTags("")).toEqual([])
  })

  it("toggles ids", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"])
    expect(toggleId(["a", "b"], "a")).toEqual(["b"])
  })

  it("validates UUID params", () => {
    expect(isUuid("4d5e6f7a-8b9c-4d0e-1f2a-3b4c5d6e7f80")).toBe(true)
    expect(isUuid("not-a-uuid")).toBe(false)
    expect(isUuid("../../admin")).toBe(false)
  })
})

describe("orderAnswers", () => {
  it("pins the best answer first and keeps the server order otherwise", () => {
    const rows = [
      { id: "a", is_best: false },
      { id: "b", is_best: false },
      { id: "c", is_best: true },
    ]
    expect(orderAnswers(rows, null).map((r) => r.id)).toEqual(["c", "a", "b"])
    expect(orderAnswers(rows.map((r) => ({ ...r, is_best: false })), "b").map((r) => r.id)).toEqual(["b", "a", "c"])
  })
})

describe("optimistic votes", () => {
  const none: VoteState = { viewerVote: null, score: 7, up: 8, down: 1 }
  const table: [string, VoteState, "up" | "down", VoteState, "up" | "down" | null][] = [
    ["none → up", none, "up", { viewerVote: "up", score: 8, up: 9, down: 1 }, "up"],
    ["none → down", none, "down", { viewerVote: "down", score: 6, up: 8, down: 2 }, "down"],
    ["up → up clears", { viewerVote: "up", score: 7, up: 8, down: 1 }, "up", { viewerVote: null, score: 6, up: 7, down: 1 }, null],
    ["down → down clears", { viewerVote: "down", score: 7, up: 8, down: 1 }, "down", { viewerVote: null, score: 8, up: 8, down: 0 }, null],
    ["up → down switches", { viewerVote: "up", score: 7, up: 8, down: 1 }, "down", { viewerVote: "down", score: 5, up: 7, down: 2 }, "down"],
    ["down → up switches", { viewerVote: "down", score: 7, up: 8, down: 1 }, "up", { viewerVote: "up", score: 9, up: 9, down: 0 }, "up"],
  ]
  it.each(table)("%s", (_name, before, pressed, after, wire) => {
    expect(applyVote(before, pressed)).toEqual(after)
    expect(nextVote(before.viewerVote, pressed)).toBe(wire)
  })

  it("never drives a count below zero on inconsistent input", () => {
    expect(applyVote({ viewerVote: "up", score: 0, up: 0, down: 0 }, "up").up).toBe(0)
  })

  it("reads the wire row", () => {
    expect(voteStateOf({ viewer_vote: "up", vote_score: 7, upvote_count: 8, downvote_count: 1 })).toEqual({
      viewerVote: "up",
      score: 7,
      up: 8,
      down: 1,
    })
  })
})

describe("paging", () => {
  it("stops on a short page", () => {
    expect(nextOffset(new Array(20).fill(0), [new Array(20).fill(0)])).toBe(20)
    expect(nextOffset(new Array(5).fill(0), [new Array(20).fill(0), new Array(5).fill(0)])).toBeUndefined()
    expect(nextOffset([], [[]])).toBeUndefined()
  })

  it("drops a question a later page repeats", () => {
    const q = (id: string) => parseQuestionSummary({ id })
    expect(flattenPages([[q("a"), q("b")], [q("b"), q("c")]]).map((r) => r.id)).toEqual(["a", "b", "c"])
    expect(flattenPages(undefined)).toEqual([])
  })
})
