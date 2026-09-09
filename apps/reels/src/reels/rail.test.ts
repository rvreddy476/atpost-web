import { describe, expect, it } from "vitest"
import { formatCount, railControls, railCountLabel, reelAuthorLabel, showsFollow } from "./rail"

describe("railCountLabel", () => {
  it("says the control's own name when there is nothing to count", () => {
    // "0" under a heart reads as a score; "Like" reads as an invitation.
    expect(railCountLabel(0, "Like")).toBe("Like")
    expect(railCountLabel(-3, "Comment")).toBe("Comment")
  })

  it("says the count as soon as there is one", () => {
    expect(railCountLabel(1, "Like")).toBe("1")
    expect(railCountLabel(8_800, "Like")).toBe("8.8K")
  })
})

describe("formatCount", () => {
  it("never draws a trailing .0", () => {
    // 1.0K is just a longer 1K, and the decimal is only worth the space when
    // it says something.
    expect(formatCount(1_000)).toBe("1K")
    expect(formatCount(12_000)).toBe("12K")
    expect(formatCount(2_000_000)).toBe("2M")
  })

  it("keeps one decimal where it is informative", () => {
    expect(formatCount(1_234)).toBe("1.2K")
    expect(formatCount(1_450_000)).toBe("1.4M")
  })

  it("leaves anything under a thousand alone", () => {
    expect(formatCount(999)).toBe("999")
    expect(formatCount(1)).toBe("1")
  })
})

describe("railControls", () => {
  const base = { likes: 0, comments: 0, liked: false, saved: false }

  it("is like, comment, share, save — in that order", () => {
    expect(railControls(base).map((c) => c.kind)).toEqual(["like", "comment", "share", "save"])
  })

  it("carries counts on like and comment and nouns on the rest", () => {
    const rail = railControls({ ...base, likes: 1_200, comments: 4 })
    expect(rail.map((c) => c.label)).toEqual(["1.2K", "4", "Share", "Save"])
  })

  it("says whether save is done, rather than counting it", () => {
    expect(railControls({ ...base, saved: true }).at(-1)?.label).toBe("Saved")
  })

  it("drops share when the author hid it", () => {
    // Not cosmetic: the switch is a permission the SERVER enforces, so a
    // control drawn anyway promises something the client cannot deliver.
    const rail = railControls({ ...base, hideShare: true })
    expect(rail.map((c) => c.kind)).toEqual(["like", "comment", "save"])
  })

  it("drops comment when the author closed comments", () => {
    const rail = railControls({ ...base, noComments: true })
    expect(rail.map((c) => c.kind)).toEqual(["like", "share", "save"])
  })

  it("keeps like and save whatever the author switched off", () => {
    const rail = railControls({ ...base, noComments: true, hideShare: true })
    expect(rail.map((c) => c.kind)).toEqual(["like", "save"])
  })
})

describe("reelAuthorLabel", () => {
  it("prefers the handle", () => {
    expect(reelAuthorLabel("ada", "Ada Lovelace")).toBe("@ada")
  })

  it("does not double the @", () => {
    expect(reelAuthorLabel("@ada", "Ada Lovelace")).toBe("@ada")
  })

  it("falls back to the display name WITHOUT an @", () => {
    // "@Ada Lovelace" is not a thing, and this is the normal path rather than
    // an edge case: the live reels feed hydrates `author` from a profile
    // allowlist where `username` is omitempty, and every reel it returned had
    // a display name and no handle.
    expect(reelAuthorLabel(undefined, "Ada Lovelace")).toBe("Ada Lovelace")
    expect(reelAuthorLabel(null, "Ada Lovelace")).toBe("Ada Lovelace")
    expect(reelAuthorLabel("   ", "Ada Lovelace")).toBe("Ada Lovelace")
  })

  it("has something to say when the author has neither", () => {
    expect(reelAuthorLabel(undefined, undefined)).toBe("Someone")
  })
})

describe("showsFollow", () => {
  it("stays hidden while the edge is unknown", () => {
    // The half taken from Android unchanged: a Follow button that appears and
    // then vanishes when the real answer lands has told somebody something
    // false about who they follow.
    expect(showsFollow("me", "ada", undefined)).toBe(false)
  })

  it("never offers to follow yourself", () => {
    expect(showsFollow("me", "me", "none")).toBe(false)
  })

  it("stays hidden for a signed-out viewer", () => {
    expect(showsFollow(null, "ada", "none")).toBe(false)
  })

  it("shows once the edge is known, in every state", () => {
    // This is the deliberate difference from Android, which hides the control
    // at "following". The web has no profile zone to undo a follow from, so
    // hiding it would make the action one-way everywhere.
    expect(showsFollow("me", "ada", "none")).toBe(true)
    expect(showsFollow("me", "ada", "following")).toBe(true)
    expect(showsFollow("me", "ada", "requested")).toBe(true)
  })

  it("stays hidden when there is no author", () => {
    expect(showsFollow("me", undefined, "none")).toBe(false)
    expect(showsFollow("me", "", "none")).toBe(false)
  })
})
