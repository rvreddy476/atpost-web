import { describe, expect, it } from "vitest"
import type { CommentRow } from "@momentum/content"
import {
  canDelete,
  canEdit,
  canReply,
  commentLikeCount,
  countDelta,
  isOwnComment,
  likedStateOf,
  removeComment,
  replaceComment,
  wasEdited,
} from "./comments"

const AT = "2026-09-18T10:00:00.000000Z"

function row(over: Partial<CommentRow> = {}): CommentRow {
  return {
    id: "c1",
    post_id: "p1",
    author_id: "ada",
    body: "hello",
    like_count: 0,
    dislike_count: 0,
    reply_count: 0,
    is_reply: false,
    created_at: AT,
    ...over,
  }
}

/** The shape `pendingComment` mints: a local nonce id the server never saw. */
const pending = row({ id: "pending:1" })

describe("isOwnComment", () => {
  it("is false while we do not yet know who is looking", () => {
    // `/v1/auth/me` has not landed. A surface that offered Delete in that beat
    // would be offering it to the wrong person.
    expect(isOwnComment(row(), null)).toBe(false)
    expect(isOwnComment(row(), undefined)).toBe(false)
  })

  it("matches on the author id", () => {
    expect(isOwnComment(row(), "ada")).toBe(true)
    expect(isOwnComment(row(), "bob")).toBe(false)
  })
})

describe("canEdit / canDelete", () => {
  it("are offered on your own settled comment", () => {
    expect(canEdit(row(), "ada")).toBe(true)
    expect(canDelete(row(), "ada")).toBe(true)
  })

  it("are NOT offered on a comment still in flight", () => {
    // A PATCH to the id of an optimistic row would 404: the id is a local
    // nonce and the server has never heard of it.
    expect(canEdit(pending, "ada")).toBe(false)
    expect(canDelete(pending, "ada")).toBe(false)
  })

  it("are never offered on somebody else's", () => {
    expect(canEdit(row(), "bob")).toBe(false)
    expect(canDelete(row(), "bob")).toBe(false)
  })
})

describe("canReply", () => {
  it("is offered to the SHORT's author, not the comment's", () => {
    // REPLY_OWNER_ONLY, and the easy one to get backwards.
    expect(canReply(row({ author_id: "bob" }), "ada", "ada")).toBe(true)
    expect(canReply(row({ author_id: "ada" }), "bob", "ada")).toBe(false)
  })

  it("refuses a reply to a reply", () => {
    // CANNOT_REPLY_TO_REPLY. Both spellings the wire uses.
    expect(canReply(row({ is_reply: true }), "ada", "ada")).toBe(false)
    expect(canReply(row({ parent_id: "c0" }), "ada", "ada")).toBe(false)
  })

  it("refuses a second reply", () => {
    // REPLY_EXISTS — the thread is capped at one, for ever.
    expect(canReply(row({ reply: row({ id: "c2", is_reply: true }) }), "ada", "ada")).toBe(false)
  })

  it("refuses one on a comment still in flight", () => {
    expect(canReply(pending, "ada", "ada")).toBe(false)
  })

  it("is never offered to a signed-out viewer", () => {
    expect(canReply(row(), null, "ada")).toBe(false)
  })
})

describe("wasEdited", () => {
  it("is false when updated_at was set on the INSERT", () => {
    // post-service sets it on the insert as well as on the edit, so "has an
    // updated_at" would mark every comment edited.
    expect(wasEdited(row({ updated_at: AT }))).toBe(false)
    expect(wasEdited(row())).toBe(false)
  })

  it("is true once the two differ", () => {
    expect(wasEdited(row({ updated_at: "2026-09-18T10:05:00.000000Z" }))).toBe(true)
  })
})

describe("likedStateOf", () => {
  it("is unpressed until the viewer presses it in this session", () => {
    // The list carries no viewer-liked flag, so there is no evidence. A dark
    // heart on something you liked last week understates; a lit heart on
    // something you did not like is the UI telling you about an action you
    // never took.
    expect(likedStateOf(undefined)).toBe(false)
    expect(likedStateOf(false)).toBe(false)
    expect(likedStateOf(true)).toBe(true)
  })
})

describe("commentLikeCount", () => {
  it("applies the guess to the ROW's number, so pressing twice cannot drift", () => {
    const r = row({ like_count: 4 })
    expect(commentLikeCount(r, true, undefined)).toBe(5)
    expect(commentLikeCount(r, false, undefined)).toBe(4)
    expect(commentLikeCount(r, undefined, undefined)).toBe(4)
  })

  it("takes the server's count outright when it sent one", () => {
    expect(commentLikeCount(row({ like_count: 4 }), true, 9)).toBe(9)
    expect(commentLikeCount(row({ like_count: 4 }), true, 0)).toBe(0)
  })
})

describe("replaceComment", () => {
  const parent = row({ id: "p", reply: row({ id: "r", is_reply: true, body: "old" }) })

  it("replaces a top-level row", () => {
    const out = replaceComment([parent], "p", (r) => ({ ...r, body: "new" }))
    expect(out[0].body).toBe("new")
  })

  it("replaces a row nested as a reply — the one a plain map misses", () => {
    // Which is how an edited creator reply snaps back to its old text on the
    // next render.
    const out = replaceComment([parent], "r", (r) => ({ ...r, body: "new" }))
    expect(out[0].reply?.body).toBe("new")
  })

  it("leaves everything else alone", () => {
    const other = row({ id: "o" })
    const out = replaceComment([parent, other], "r", (r) => ({ ...r, body: "new" }))
    expect(out[1]).toBe(other)
  })
})

describe("removeComment", () => {
  const parent = row({ id: "p", reply: row({ id: "r", is_reply: true }) })

  it("takes a parent out, and its reply with it", () => {
    // A reply left floating under nothing is a thread that cannot be read.
    expect(removeComment([parent], "p")).toEqual([])
  })

  it("takes a reply out on its own", () => {
    const out = removeComment([parent], "r")
    expect(out).toHaveLength(1)
    expect(out[0].reply).toBeUndefined()
  })
})

describe("countDelta", () => {
  it("counts a create as one", () => {
    expect(countDelta("created")).toBe(1)
  })

  it("counts a deleted parent as itself AND its reply", () => {
    // The rail's number is what a person checks to see whether their comment
    // landed, so drifting by one every time somebody tidies up their own
    // thread is a small permanent lie.
    expect(countDelta("deleted", row())).toBe(-1)
    expect(countDelta("deleted", row({ reply: row({ id: "r" }) }))).toBe(-2)
  })
})
