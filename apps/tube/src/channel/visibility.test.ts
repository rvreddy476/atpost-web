import { describe, expect, it } from "vitest"
import { visibilityBadge } from "./visibility"

/**
 * The badge on your own rows.
 *
 * Two properties matter more than the wording: `public` gets NOTHING (a chip
 * on every public video would be noise on every channel in the product), and
 * an unrecognised value also gets nothing rather than a guessed chip.
 */

describe("visibilityBadge", () => {
  it("says nothing for a public row", () => {
    expect(visibilityBadge("public")).toBeNull()
  })

  it("says nothing for a row that does not carry the field", () => {
    expect(visibilityBadge(undefined)).toBeNull()
    expect(visibilityBadge(null)).toBeNull()
    expect(visibilityBadge("")).toBeNull()
  })

  it("marks the three narrower audiences the studio can set", () => {
    expect(visibilityBadge("unlisted")?.label).toBe("Unlisted")
    expect(visibilityBadge("private")?.label).toBe("Private")
    expect(visibilityBadge("followers")?.label).toBe("Followers")
  })

  it("says who can see it, not merely what it is called", () => {
    // The chip is two words; the description is what a screen reader and the
    // playlist row actually say, and it has to answer "who".
    expect(visibilityBadge("unlisted")?.description).toContain("link")
    expect(visibilityBadge("private")?.description).toContain("only you")
  })

  it("forgives case and space, because the wire is not this page's to police", () => {
    expect(visibilityBadge(" Private ")?.label).toBe("Private")
  })

  it("says NOTHING for an audience this client has not been told about", () => {
    // A server that grew a fifth audience is not an invitation to invent a
    // chip for it. Saying nothing is the only answer that cannot be wrong.
    expect(visibilityBadge("subscribers_only")).toBeNull()
    expect(visibilityBadge("restricted")).toBeNull()
  })
})
