import { describe, expect, it } from "vitest"
import { ALL_CHIP, SUBSCRIPTIONS_CHIP, chipKey, chipLabel, chipQuery } from "./chips"

/**
 * The chip rail's wire arguments.
 *
 * The part that fails silently: a chip that sends the wrong parameter is not
 * an error, it is an empty page. The second chip is the one with history —
 * it was "Following" and sent `following_only`, and since 2026-09-12 it is
 * "Subscriptions" and sends `subscribed_only`, the same query the
 * Subscriptions page makes. Both the word and the parameter are pinned here
 * so they cannot drift apart again.
 */

describe("the chip rail's wire arguments", () => {
  it("sends nothing at all for All, so the request is what it always was", () => {
    expect(chipQuery(ALL_CHIP)).toEqual({})
  })

  it("sends subscribed_only for Subscriptions, and never following_only", () => {
    const query = chipQuery(SUBSCRIPTIONS_CHIP)
    expect(query).toEqual({ subscribedOnly: true })
    expect("followingOnly" in query).toBe(false)
  })

  it("sends exactly one narrowing, never both", () => {
    expect(chipQuery({ kind: "category", id: "comedy" })).toEqual({ category: "comedy" })
    expect(chipQuery(SUBSCRIPTIONS_CHIP)).not.toHaveProperty("category")
  })
})

describe("chip keys", () => {
  it("keys categories apart from the two constructed chips", () => {
    expect(chipKey(ALL_CHIP)).toBe("all")
    expect(chipKey(SUBSCRIPTIONS_CHIP)).toBe("subscriptions")
    expect(chipKey({ kind: "category", id: "all" })).toBe("category:all")
    expect(chipKey({ kind: "category", id: "subscriptions" })).toBe("category:subscriptions")
  })

  it("no longer has a following chip at all", () => {
    // The kind is gone from the union, so this is a type-level fact; the
    // runtime check is that nothing answers to the old key.
    expect(chipKey(SUBSCRIPTIONS_CHIP)).not.toBe("following")
  })
})

describe("chip labels", () => {
  it("says Subscriptions, the same word as the page in the left rail", () => {
    expect(chipLabel(SUBSCRIPTIONS_CHIP, [])).toBe("Subscriptions")
    expect(chipLabel(ALL_CHIP, [])).toBe("All")
  })

  it("labels an unknown slug as the slug, which is a clue rather than 'Unknown'", () => {
    const categories = [{ id: "comedy", label: "Comedy" }]
    expect(chipLabel({ kind: "category", id: "comedy" }, categories)).toBe("Comedy")
    expect(chipLabel({ kind: "category", id: "mystery" }, categories)).toBe("mystery")
  })
})
