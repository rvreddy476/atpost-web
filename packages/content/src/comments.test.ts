import { describe, expect, it } from "vitest"
import {
  COMMENT_PAGE_MAX,
  QUICK_REACTIONS,
  canSend,
  commentAuthorName,
  commentErrorMessage,
  mergeComments,
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
