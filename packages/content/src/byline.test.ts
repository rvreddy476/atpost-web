/**
 * What a card calls the person who wrote it.
 *
 * The test worth more than the others is the last one: whatever this returns
 * when nothing named the author, it must not be "Someone". That string was
 * rendered twenty times on one hashtag page whenever a single profile lookup
 * failed, and a page of identical invented people reads as a broken renderer
 * rather than as missing data.
 */

import { describe, expect, it } from "vitest"
import { MAX_ROLE_CHARS, UNNAMED_AUTHOR, authorLabel, authorRole } from "./byline"

describe("authorLabel", () => {
  it("prefers the channel, because a channel post is BY the channel", () => {
    const label = authorLabel({
      author: { id: "u1", display_name: "Ada Lovelace", username: "ada" },
      channel: { user_id: "u1", name: "Analytical Engines", handle: "engines" },
    })
    expect(label.name).toBe("Analytical Engines")
    expect(label.handle).toBe("@engines")
    expect(label.unnamed).toBe(false)
  })

  it("uses the author's display name, with their handle beside it", () => {
    const label = authorLabel({ author: { id: "u1", display_name: "Ada", username: "ada" } })
    expect(label.name).toBe("Ada")
    expect(label.handle).toBe("@ada")
  })

  it("has no handle line when nothing carries one", () => {
    expect(authorLabel({ author: { id: "u1", display_name: "Ada" } }).handle).toBeUndefined()
  })

  it("falls back to the handle the post already carries", () => {
    // A real, chosen, unique name for a person — not a degradation. And it is
    // NOT repeated beside itself.
    const label = authorLabel({ author: { id: "u1", username: "ada" } })
    expect(label.name).toBe("@ada")
    expect(label.handle).toBeUndefined()
    expect(label.unnamed).toBe(false)
  })

  it("treats whitespace as absent rather than as a name", () => {
    // A display_name of "   " is what an empty column looks like once JSON
    // has been through a service that writes "" instead of omitting it.
    const label = authorLabel({ author: { id: "u1", display_name: "  ", username: "  " } })
    expect(label.name).toBe(UNNAMED_AUTHOR)
    expect(label.unnamed).toBe(true)
  })

  it("never says Someone, and says so as a fact about the label", () => {
    const label = authorLabel({ author: { id: "u1" } })
    expect(label.name).toBe(UNNAMED_AUTHOR)
    expect(label.name).not.toBe("Someone")
    // The flag is what lets a caller count unnamed rows instead of comparing
    // rendered strings.
    expect(label.unnamed).toBe(true)
  })

  it("still shows a channel handle when the channel has no name", () => {
    const label = authorLabel({ channel: { user_id: "u1", handle: "engines" } })
    expect(label.name).toBe(UNNAMED_AUTHOR)
    expect(label.handle).toBe("@engines")
  })

  it("survives a row with neither an author nor a channel", () => {
    expect(authorLabel({}).name).toBe(UNNAMED_AUTHOR)
  })
})

/**
 * The second line of the byline — the reference's "role or bio".
 *
 * Absent on every `/v1/feed/home` row, because feed-service's `Author` struct
 * carries neither field. These cases are about the OTHER source: a hashtag row
 * this zone re-hydrates from `/v1/profiles/batch`, whose public card does carry
 * both. See @atpost/types.
 */
describe("authorRole", () => {
  it("is absent when the wire said nothing, which is the home feed's normal case", () => {
    expect(authorRole({})).toBeUndefined()
    expect(authorRole({ author: { id: "u1" } })).toBeUndefined()
    // Never "" — a caller's `{role && …}` is the whole of the decision about
    // whether the middle dot beside it is drawn.
    expect(authorRole({ author: { id: "u1", bio: "   " } })).toBeUndefined()
  })

  it("prefers the profession over the bio", () => {
    // The shorter, more factual of the two, on a line that already has a
    // handle on it.
    expect(
      authorRole({ author: { id: "u1", profession: "Potter", bio: "I make things." } })
    ).toBe("Potter")
  })

  it("falls back to the bio when there is no profession", () => {
    expect(authorRole({ author: { id: "u1", bio: "I make things." } })).toBe("I make things.")
  })

  it("collapses a multi-line bio onto one line", () => {
    // A bio is free text and this is a single line beside a handle.
    expect(authorRole({ author: { id: "u1", bio: "Potter.\n\n  Cyclist." } })).toBe(
      "Potter. Cyclist."
    )
  })

  it("caps a long bio rather than letting it push the post off the fold", () => {
    const long = `${"word ".repeat(60)}end`
    const role = authorRole({ author: { id: "u1", bio: long } })
    expect(role).toBeDefined()
    expect(role!.length).toBeLessThanOrEqual(MAX_ROLE_CHARS + 1)
    expect(role!.endsWith("…")).toBe(true)
    // Cut on a word boundary, so the line does not break mid-word.
    expect(role).not.toMatch(/\wo…$/)
  })

  it("does not add an ellipsis to something that fits", () => {
    expect(authorRole({ author: { id: "u1", profession: "Potter" } })).toBe("Potter")
  })
})
