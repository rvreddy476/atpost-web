import { describe, expect, it } from "vitest"
import {
  COMMENT_PAGE_MAX,
  QUICK_REACTIONS,
  canSend,
  commentAuthorName,
  commentErrorMessage,
  discardComment,
  isPendingComment,
  mergeComments,
  pendingComment,
  settleComment,
  type CommentRow,
} from "./comments"

const row = (id: string, over: Partial<CommentRow> = {}): CommentRow => ({
  id,
  post_id: "p1",
  author_id: "u1",
  body: "hello",
  like_count: 0,
  dislike_count: 0,
  reply_count: 0,
  is_reply: false,
  created_at: "2026-09-08T10:00:00Z",
  ...over,
})

describe("mergeComments", () => {
  it("keeps order and drops what is already on screen", () => {
    // The cursor is a `created_at`, so a comment posted between two page
    // fetches — or a retried page — can hand back a row that is already
    // rendered. A duplicate React key is a silent rendering corruption.
    const merged = mergeComments([row("a"), row("b")], [row("b"), row("c")])
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  it("is a no-op when the page is entirely a repeat", () => {
    const existing = [row("a")]
    expect(mergeComments(existing, [row("a")]).map((r) => r.id)).toEqual(["a"])
  })

  it("prepends a freshly written comment without disturbing the list", () => {
    const merged = mergeComments([row("new")], [row("a"), row("b")])
    expect(merged.map((r) => r.id)).toEqual(["new", "a", "b"])
  })
})

describe("commentAuthorName", () => {
  it("prefers the display name", () => {
    expect(commentAuthorName(row("a", { author: { id: "u1", display_name: "Ada L" } }))).toBe("Ada L")
  })

  it("falls back to the handle, then to something neutral", () => {
    expect(commentAuthorName(row("a", { author: { id: "u1", username: "ada" } }))).toBe("@ada")
    // `author` is nil whenever profile hydration was skipped or failed — a
    // real case on this endpoint, not a defensive one.
    expect(commentAuthorName(row("a"))).toBe("Someone")
    expect(commentAuthorName(row("a", { author: { id: "u1" } }))).toBe("Someone")
  })

  it("names an unhydrated row as the viewer's own when it is", () => {
    // The create response carries `author_id` and NO `author` — verified on
    // the live gateway — so the comment somebody has just written is the one
    // row on the list nobody can put a name to. "You" is not a guess.
    expect(commentAuthorName(row("a", { author_id: "u1" }), "u1")).toBe("You")
    expect(commentAuthorName(row("a", { author_id: "u2" }), "u1")).toBe("Someone")
    // And a signed-out reader is told nothing it does not know.
    expect(commentAuthorName(row("a", { author_id: "u1" }))).toBe("Someone")
  })

  it("still prefers a hydrated name over 'You'", () => {
    // Once the LIST has said "Ada L", that is what everyone else sees, so it
    // is what the author sees too. Otherwise reopening the sheet would rename
    // your own comment.
    const hydrated = row("a", { author_id: "u1", author: { id: "u1", display_name: "Ada L" } })
    expect(commentAuthorName(hydrated, "u1")).toBe("Ada L")
  })
})

describe("posting optimistically", () => {
  const pending = pendingComment({
    postId: "p1",
    authorId: "u1",
    text: "  written now  ",
    nonce: "0",
    createdAt: "2026-09-08T10:00:00Z",
  })

  it("marks the row as local, and only that row", () => {
    // The id is what stops a pending row being treated as addressable — an
    // edit or a delete aimed at it would go to the server as a UUID that does
    // not exist. Nothing the server issues can collide: its ids are UUIDs.
    expect(isPendingComment(pending)).toBe(true)
    expect(isPendingComment(row("2846935d-d61e-4749-96b7-8c608746917e"))).toBe(false)
  })

  it("carries the text through and invents nothing else", () => {
    expect(pending.body).toBe("  written now  ")
    expect(pending.post_id).toBe("p1")
    expect(pending.author_id).toBe("u1")
    expect(pending.like_count).toBe(0)
    // No fabricated author: `commentAuthorName` answers "You" from the id.
    expect(pending.author).toBeUndefined()
  })

  it("puts the server's row exactly where the local one was", () => {
    const saved = row("real", { body: "written now" })
    const settled = settleComment([pending, row("a"), row("b")], pending.id, saved)
    expect(settled.map((r) => r.id)).toEqual(["real", "a", "b"])
  })

  it("does not leave two copies when the row is already on the list", () => {
    // A page fetched while the create was in flight contains the new comment,
    // and the create is idempotent on a fingerprint of the text, so a retry
    // answers with the SAME row again. Either way it appears once — a
    // duplicate React key is a silent rendering corruption.
    const saved = row("real")
    const settled = settleComment([pending, saved, row("a")], pending.id, saved)
    expect(settled.map((r) => r.id)).toEqual(["real", "a"])
  })

  it("still shows the comment if the pending row has gone", () => {
    // The sheet reloads on open and the list is replaced wholesale; a create
    // that lands after that must not be silently dropped.
    const saved = row("real")
    expect(settleComment([row("a")], pending.id, saved).map((r) => r.id)).toEqual(["real", "a"])
  })

  it("takes the row back off when the server refuses", () => {
    const rolled = discardComment([pending, row("a")], pending.id)
    expect(rolled.map((r) => r.id)).toEqual(["a"])
    // And leaves everything else exactly as it was — a refused comment is not
    // a reason to disturb the conversation somebody is reading.
    expect(discardComment([row("a"), row("b")], pending.id).map((r) => r.id)).toEqual(["a", "b"])
  })
})

describe("canSend", () => {
  it("does not treat whitespace as a comment", () => {
    expect(canSend("")).toBe(false)
    expect(canSend("   \n ")).toBe(false)
    expect(canSend("hi")).toBe(true)
  })
})

describe("commentErrorMessage", () => {
  it("says what the AUTHOR chose, not that something went wrong", () => {
    // These two are the author's own switches arriving as a refusal. A post
    // can be edited while somebody has the sheet open, and "Something went
    // wrong" for a deliberate choice is the least useful sentence available.
    expect(commentErrorMessage("COMMENTS_DISABLED", 403)).toMatch(/turned off comments/)
    expect(commentErrorMessage("COMMENTS_RESTRICTED", 403)).toMatch(/Only friends/)
  })

  it("recognises a rate limit from either the code or the status", () => {
    expect(commentErrorMessage("RATE_LIMITED", 429)).toMatch(/lot of comments/)
    expect(commentErrorMessage(undefined, 429)).toMatch(/lot of comments/)
  })

  it("asks an unauthenticated reader to sign in", () => {
    expect(commentErrorMessage(undefined, 401)).toBe("Sign in to comment.")
  })

  it("distinguishes a server that failed from a comment that was refused", () => {
    expect(commentErrorMessage(undefined, 502)).toMatch(/did not answer/)
    expect(commentErrorMessage(undefined, 400)).toBe("That comment did not send.")
    expect(commentErrorMessage(undefined, undefined)).toBe("That comment did not send.")
  })
})

describe("the wire constants", () => {
  it("does not exceed the server's page cap", () => {
    // post-service clamps `limit` to 20 by default and 50 at most — and an
    // over-max value falls BACK to 20 rather than clamping to 50, so asking
    // for more than this quietly gets you the smallest page.
    expect(COMMENT_PAGE_MAX).toBe(50)
  })

  it("carries the phone's eight reactions, in the phone's order", () => {
    expect([...QUICK_REACTIONS]).toEqual(["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"])
  })
})
