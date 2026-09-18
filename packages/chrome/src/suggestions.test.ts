/**
 * The line under a suggested person's name.
 *
 * The test that matters is the first group: the rail printed
 * "Popular on atpost" — the name of a product that no longer exists — to
 * every reader, on every row of the only bucket the ranker currently fills,
 * inside a page whose own wordmark says Momentum. It was rendered verbatim
 * on the argument that a client may not rewrite a server string. The string
 * is not rewritten here; it is replaced by this product's own copy for the
 * row's own `reason_code`, which is the migration suggestion-service's
 * brand.go says it is waiting for the clients to make.
 *
 * The second group is the other half, and it is what stops the fix becoming a
 * downgrade: a scored candidate's prose carries facts no client can
 * reconstruct, and it is kept.
 */

import { describe, expect, it } from "vitest"
import { BRAND } from "@momentum/brand"
import { GENERIC_REASON, namesAProduct, suggestionReason } from "./suggestions"

describe("namesAProduct", () => {
  it("catches the old names and the current one alike", () => {
    // The current name is in the list deliberately: the rule is "the UI
    // states product names in its own words", not "catch this rename".
    expect(namesAProduct("Popular on atpost")).toBe(true)
    expect(namesAProduct("Popular on Momentum")).toBe(true)
    expect(namesAProduct("New to postbook")).toBe(true)
  })

  it("leaves an ordinary sentence alone", () => {
    expect(namesAProduct("Both in Weekend Cyclists")).toBe(false)
    expect(namesAProduct("Lives in Hyderabad")).toBe(false)
  })
})

describe("suggestionReason", () => {
  it("never prints a server sentence that names a product", () => {
    const line = suggestionReason({
      explain_text: "Popular on atpost",
      reason_codes: ["POPULAR"],
    })
    expect(line).not.toContain("atpost")
    expect(line).toBe(`Popular on ${BRAND.name}`)
  })

  it("owns the product word even when the server's is already current", () => {
    // So that the next rename is one constant in @momentum/brand and not a
    // redeploy of a backend service.
    const line = suggestionReason({
      explain_text: "New to Momentum",
      reason_codes: ["NEW_CREATOR"],
    })
    expect(line).toBe(`New to ${BRAND.name}`)
  })

  it("keeps the server's sentence when it names no product", () => {
    // These carry facts this client was never sent and cannot rebuild.
    expect(
      suggestionReason({ explain_text: "Both in Weekend Cyclists", reason_codes: ["COMMON_GROUPS"] })
    ).toBe("Both in Weekend Cyclists")
    expect(suggestionReason({ explain_text: "Studied at Osmania" })).toBe("Studied at Osmania")
  })

  it("puts a real mutual count above any prose", () => {
    expect(
      suggestionReason({ explain_text: "Popular on atpost", mutual_friend_count: 3 })
    ).toBe("3 mutual friends")
    expect(suggestionReason({ mutual_friend_count: 1 })).toBe("1 mutual friend")
  })

  it("draws no number the server is not really computing", () => {
    // `mutual_friend_count` is a hardcoded Go zero on three paths — the
    // popular fallback a new account gets, the interstitial, and every
    // `type=follow` row — and is indistinguishable there from a computed
    // zero. "0 mutual friends" would be false on one and meaningless on the
    // other, so zero is never drawn.
    const line = suggestionReason({ mutual_friend_count: 0, reason_codes: ["POPULAR"] })
    expect(line).not.toContain("0")
    expect(line).not.toContain("mutual")
  })

  it("falls through the codes until it finds one it has copy for", () => {
    expect(suggestionReason({ reason_codes: ["SAME_SCHOOL", "MUTUAL_FOLLOW"] })).toBe(
      "You follow each other"
    )
  })

  it("says something true when there is nothing to say", () => {
    expect(suggestionReason({})).toBe(GENERIC_REASON)
    // A code with no copy of ours, and a sentence that names a product: the
    // sentence is refused and the generic line is what is left.
    expect(suggestionReason({ explain_text: "Popular on atpost", reason_codes: ["MYSTERY"] })).toBe(
      GENERIC_REASON
    )
    expect(suggestionReason({ explain_text: "   " })).toBe(GENERIC_REASON)
  })
})
