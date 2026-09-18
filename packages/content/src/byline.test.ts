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
import { UNNAMED_AUTHOR, authorLabel } from "./byline"

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
