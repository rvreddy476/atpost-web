import { describe, expect, it } from "vitest"
import type { CommentRow } from "@momentum/content"
import {
  COMMENT_MAX_LENGTH,
  EDIT_WINDOW_MS,
  applyLike,
  attachReply,
  canDelete,
  canEdit,
  canReplyTo,
  canReport,
  canSubmit,
  charactersLeft,
  commentCount,
  focusCommentId,
  isOwnComment,
  nudgeLike,
  removeComment,
  replaceBody,
  showsCounter,
} from "./thread"

/**
 * The comment rules, as a table.
 *
 * What is being asserted is mostly ABSENCE: that Reply is not offered to
 * somebody the server will refuse, that Edit disappears when the window does,
 * that a pending row is not the target of anything addressable. Each of those
 * is a control that would otherwise be rendered and then fail, which is the
 * failure mode @momentum/content's postMenu.ts calls "a broken promise that
 * just fails later".
 */

const NOW = Date.parse("2026-09-18T12:00:00.000Z")

const row = (over: Partial<CommentRow> = {}): CommentRow => ({
  id: "c1",
  post_id: "p1",
  author_id: "viewer",
  body: "A comment.",
  like_count: 3,
  dislike_count: 0,
  reply_count: 0,
  is_reply: false,
  created_at: new Date(NOW - 60_000).toISOString(),
  ...over,
})

const pending = (over: Partial<CommentRow> = {}) => row({ id: "pending:abc", ...over })

describe("whose comment it is", () => {
  it("is the viewer's when the ids match", () => {
    expect(isOwnComment(row(), "viewer")).toBe(true)
    expect(isOwnComment(row(), "someone")).toBe(false)
  })

  it("is nobody's for a signed-out viewer", () => {
    expect(isOwnComment(row(), null)).toBe(false)
  })
})

describe("canEdit", () => {
  it("allows the author inside the fifteen-minute window", () => {
    expect(canEdit(row(), "viewer", NOW)).toBe(true)
  })

  it("refuses once the window has passed", () => {
    const old = row({ created_at: new Date(NOW - EDIT_WINDOW_MS - 1).toISOString() })
    expect(canEdit(old, "viewer", NOW)).toBe(false)
  })

  it("does not restart the clock from an edit", () => {
    const edited = row({
      created_at: new Date(NOW - EDIT_WINDOW_MS - 1).toISOString(),
      updated_at: new Date(NOW - 10).toISOString(),
    })
    expect(canEdit(edited, "viewer", NOW)).toBe(false)
  })

  it("refuses somebody else's comment and a pending one", () => {
    expect(canEdit(row(), "someone", NOW)).toBe(false)
    expect(canEdit(pending(), "viewer", NOW)).toBe(false)
  })

  it("refuses a row with an unreadable timestamp rather than guessing", () => {
    expect(canEdit(row({ created_at: "not a date" }), "viewer", NOW)).toBe(false)
  })
})

describe("canDelete", () => {
  it("has no window", () => {
    const old = row({ created_at: "2020-01-01T00:00:00Z" })
    expect(canDelete(old, "viewer")).toBe(true)
  })

  it("refuses somebody else's, and a pending row that has no id yet", () => {
    expect(canDelete(row(), "someone")).toBe(false)
    expect(canDelete(pending(), "viewer")).toBe(false)
  })
})

describe("canReplyTo — the post owner, once, to a top-level comment", () => {
  it("allows the post's author", () => {
    expect(canReplyTo(row({ author_id: "someone" }), "owner", "owner")).toBe(true)
  })

  it("refuses everybody else, which is REPLY_OWNER_ONLY", () => {
    expect(canReplyTo(row(), "viewer", "owner")).toBe(false)
  })

  it("refuses a reply to a reply, which the server calls CANNOT_REPLY_TO_REPLY", () => {
    expect(canReplyTo(row({ is_reply: true }), "owner", "owner")).toBe(false)
    expect(canReplyTo(row({ parent_id: "c0" }), "owner", "owner")).toBe(false)
  })

  it("refuses a second reply, which the server calls REPLY_EXISTS", () => {
    expect(canReplyTo(row({ reply: row({ id: "r1" }) }), "owner", "owner")).toBe(false)
  })

  it("refuses when nobody is signed in or the owner is unknown", () => {
    expect(canReplyTo(row(), null, "owner")).toBe(false)
    expect(canReplyTo(row(), "owner", null)).toBe(false)
  })
})

describe("canReport", () => {
  it("is offered on somebody else's comment", () => {
    expect(canReport(row({ author_id: "someone" }), "viewer")).toBe(true)
  })

  it("is not offered on your own — Delete is the answer to regret", () => {
    expect(canReport(row(), "viewer")).toBe(false)
  })

  it("is not offered to a signed-out viewer or on a pending row", () => {
    expect(canReport(row({ author_id: "someone" }), null)).toBe(false)
    expect(canReport(pending({ author_id: "someone" }), "viewer")).toBe(false)
  })
})

describe("changing the list", () => {
  const list = () => [
    row({ id: "a" }),
    row({ id: "b", reply: row({ id: "b-reply", is_reply: true, parent_id: "b" }) }),
  ]

  it("applies the server's settled count", () => {
    expect(applyLike(list(), "a", 11)[0].like_count).toBe(11)
  })

  it("reaches a reply as well as a top-level row", () => {
    const after = applyLike(list(), "b-reply", 7)
    expect(after[1].reply?.like_count).toBe(7)
  })

  it("nudges optimistically and never below zero", () => {
    expect(nudgeLike(list(), "a", 1)[0].like_count).toBe(4)
    expect(nudgeLike(applyLike(list(), "a", 0), "a", -1)[0].like_count).toBe(0)
  })

  it("replaces a body and marks it edited", () => {
    const after = replaceBody(list(), "a", "Rewritten.")
    expect(after[0].body).toBe("Rewritten.")
    expect(after[0].updated_at).toBeTruthy()
  })

  it("removes a comment with its reply", () => {
    const after = removeComment(list(), "b")
    expect(after.map((r) => r.id)).toEqual(["a"])
  })

  it("removes a reply without removing its parent", () => {
    const after = removeComment(list(), "b-reply")
    expect(after.map((r) => r.id)).toEqual(["a", "b"])
    expect(after[1].reply).toBe(undefined)
  })

  it("attaches a reply to the comment it answers", () => {
    const reply = row({ id: "a-reply", is_reply: true, parent_id: "a" })
    const after = attachReply(list(), "a", reply)
    expect(after[0].reply?.id).toBe("a-reply")
    expect(after[0].reply_count).toBe(1)
    expect(after[1].reply?.id).toBe("b-reply")
  })

  it("leaves every other row untouched", () => {
    const before = list()
    const after = applyLike(before, "a", 9)
    expect(after[1]).toBe(before[1])
  })
})

describe("commentCount", () => {
  it("moves the post's own number rather than counting loaded rows", () => {
    expect(commentCount(412, 1)).toBe(413)
    expect(commentCount(412, -1)).toBe(411)
  })

  it("never goes below zero", () => {
    expect(commentCount(0, -3)).toBe(0)
  })
})

describe("focusCommentId", () => {
  const id = "44444444-4444-4444-8444-444444444444"

  it("reads the notification's deep link", () => {
    expect(focusCommentId(`?focusComment=${id}`)).toBe(id)
    expect(focusCommentId(`focusComment=${id}&t=12`)).toBe(id)
  })

  it("is null when there is no such parameter", () => {
    expect(focusCommentId("?t=12")).toBe(null)
    expect(focusCommentId("")).toBe(null)
    expect(focusCommentId(null)).toBe(null)
  })

  it("refuses anything that is not a UUID — it goes into a path", () => {
    expect(focusCommentId("?focusComment=../../admin")).toBe(null)
    expect(focusCommentId("?focusComment=12")).toBe(null)
  })
})

describe("the composer's limits", () => {
  it("refuses whitespace", () => {
    expect(canSubmit("   \n ")).toBe(false)
    expect(canSubmit("hi")).toBe(true)
  })

  it("refuses more than the client's maximum", () => {
    expect(canSubmit("x".repeat(COMMENT_MAX_LENGTH))).toBe(true)
    expect(canSubmit("x".repeat(COMMENT_MAX_LENGTH + 1))).toBe(false)
  })

  it("shows the counter only near the end", () => {
    expect(showsCounter("x".repeat(10))).toBe(false)
    expect(showsCounter("x".repeat(COMMENT_MAX_LENGTH - 10))).toBe(true)
    expect(charactersLeft("x".repeat(COMMENT_MAX_LENGTH - 10))).toBe(10)
  })
})
