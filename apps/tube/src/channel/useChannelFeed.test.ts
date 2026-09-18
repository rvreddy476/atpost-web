import { describe, expect, it } from "vitest"
import type { FeedItem } from "@atpost/types/feed"
import { mergePage } from "./useChannelFeed"

/**
 * The one rule in the tab feed that can CRASH a page rather than merely look
 * wrong: two rows with the same id are two React children with one key.
 *
 * The rest of the hook — when it fetches, what it holds while a tab is
 * inactive — needs a renderer this repo does not have (no jsdom, no
 * testing-library; ./SubscribeControls.test.tsx has the note). This is the
 * part that can be asserted honestly without one.
 */

const row = (id: string) => ({ id }) as FeedItem

describe("mergePage", () => {
  it("appends a page to what is already held, in order", () => {
    expect(mergePage([row("a"), row("b")], [row("c")]).map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  it("drops a row that crossed the page boundary twice", () => {
    // Not expected on an author feed, which is newest-first over a stable
    // list — but one repeat is a crash, and the guard is four lines.
    expect(mergePage([row("a"), row("b")], [row("b"), row("c")]).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("keeps the FIRST copy, so a row does not jump down the grid on page two", () => {
    const first = row("b")
    const merged = mergePage([row("a"), first], [row("b")])
    expect(merged[1]).toBe(first)
    expect(merged).toHaveLength(2)
  })

  it("handles an empty page and an empty list", () => {
    expect(mergePage([], [row("a")]).map((r) => r.id)).toEqual(["a"])
    expect(mergePage([row("a")], []).map((r) => r.id)).toEqual(["a"])
    expect(mergePage([], [])).toEqual([])
  })

  it("produces unique keys even when the SAME page arrives twice", () => {
    const page = [row("a"), row("b")]
    const merged = mergePage(page, page)
    expect(new Set(merged.map((r) => r.id)).size).toBe(merged.length)
  })
})
