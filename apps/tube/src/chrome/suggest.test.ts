import { describe, expect, it } from "vitest"
import {
  MIN_QUERY,
  badgeFor,
  nextSuggestionIndex,
  parseRecent,
  parseSuggestions,
  shouldSuggest,
  suggestionKind,
  suggestionText,
  visibleSuggestions,
  type TubeSuggestion,
} from "./suggest"

/**
 * The search box's suggestions, asserted as arithmetic.
 *
 * All of it fails silently in a browser: a duplicate row that wastes an arrow
 * key, a hashtag shown twice because one copy kept its "#", a keyboard index
 * with no way back to what was typed, a request fired for a one-letter query
 * against an endpoint that rate-limits at 60 a minute and fails closed.
 */

function suggestion(text: string, kind: TubeSuggestion["kind"] = "user"): TubeSuggestion {
  return { key: `${kind}:${text.toLowerCase()}`, text, kind, badge: badgeFor(kind) }
}

describe("reading one autocomplete row", () => {
  it("takes the name a person would recognise, per kind", () => {
    expect(suggestionText({ kind: "user", display_name: "Ada L", username: "ada" })).toBe("Ada L")
    expect(suggestionText({ kind: "user", username: "ada" })).toBe("ada")
    expect(suggestionText({ kind: "community", name: "Cyclists", handle: "bikes" })).toBe(
      "Cyclists"
    )
  })

  it("strips a hashtag's hash, so one tag is not two rows", () => {
    // The index stores them both ways depending on how they were written.
    expect(suggestionText({ kind: "hashtag", hashtag: "#cats" })).toBe("cats")
    expect(suggestionText({ kind: "hashtag", hashtag: "cats" })).toBe("cats")
  })

  it("drops a row with no words rather than offering a blank one", () => {
    expect(suggestionText({ kind: "user" })).toBeNull()
    expect(suggestionText({ kind: "user", display_name: "   " })).toBeNull()
    expect(suggestionText(null)).toBeNull()
    expect(suggestionText({ kind: "hashtag", hashtag: "#" })).toBeNull()
  })

  it("still offers a kind this client has never heard of", () => {
    // Better than dropping a suggestion because the server grew a fourth kind.
    expect(suggestionText({ kind: "product", name: "Kettle" })).toBe("Kettle")
    expect(suggestionKind({ kind: "product" })).toBe("user")
  })

  it("says what each row is, because the index has no video titles in it", () => {
    expect(badgeFor("recent")).toBe("Recent")
    expect(badgeFor("user")).toBe("Creator")
    expect(badgeFor("hashtag")).toBe("Tag")
    expect(badgeFor("community")).toBe("Community")
  })
})

describe("reading a whole response", () => {
  it("de-duplicates on the text, keeping the server's own ranking", () => {
    // A user "Cats" and a hashtag "#cats" both run the same search when
    // pressed. Two rows doing one thing wastes an arrow key.
    const rows = parseSuggestions({
      data: {
        results: [
          { kind: "user", display_name: "Cats" },
          { kind: "hashtag", hashtag: "#cats" },
          { kind: "user", display_name: "Catsup" },
        ],
      },
    })
    expect(rows.map((r) => r.text)).toEqual(["Cats", "Catsup"])
    expect(rows[0].kind).toBe("user")
  })

  it("is an empty list, not a throw, for every shape the wire can go wrong in", () => {
    expect(parseSuggestions(undefined)).toEqual([])
    expect(parseSuggestions({})).toEqual([])
    expect(parseSuggestions({ data: {} })).toEqual([])
    expect(parseSuggestions({ data: { results: "nope" } })).toEqual([])
  })

  it("keeps the most recent copy of a query searched three times", () => {
    // The server stores one row per SEARCH, not per distinct query, newest
    // first — so the first occurrence is the newest.
    const rows = parseRecent({
      data: {
        items: [
          { id: "3", query: "cats" },
          { id: "2", query: "dogs" },
          { id: "1", query: "Cats" },
        ],
      },
    })
    expect(rows.map((r) => r.text)).toEqual(["cats", "dogs"])
    expect(rows.every((r) => r.kind === "recent")).toBe(true)
  })

  it("drops a history row with no query on it", () => {
    expect(parseRecent({ data: { items: [{ id: "1" }, { id: "2", query: "  " }] } })).toEqual([])
  })
})

describe("when to ask the server at all", () => {
  it("needs two characters, because one matches most of the index", () => {
    expect(MIN_QUERY).toBe(2)
    expect(shouldSuggest("c")).toBe(false)
    expect(shouldSuggest("ca")).toBe(true)
  })

  it("trims first, the way search-service does before calling a query empty", () => {
    expect(shouldSuggest("   ")).toBe(false)
    expect(shouldSuggest(" c ")).toBe(false)
    expect(shouldSuggest("  ca  ")).toBe(true)
  })
})

describe("what the listbox shows", () => {
  const recent = [suggestion("cats", "recent"), suggestion("dogs", "recent")]
  const suggested = [suggestion("catsup"), suggestion("catamaran")]

  it("is the recent list for an empty box, which is all there is to offer", () => {
    expect(visibleSuggestions("", recent, suggested).map((r) => r.text)).toEqual(["cats", "dogs"])
  })

  it("puts a matching recent search ABOVE the server's suggestions", () => {
    // A thing this person actually looked for beats a stranger's username.
    expect(visibleSuggestions("cat", recent, suggested).map((r) => r.text)).toEqual([
      "cats",
      "catsup",
      "catamaran",
    ])
  })

  it("leaves out the recent search that is exactly what is typed", () => {
    // Offering "cats" while "cats" is in the box is a row that does nothing.
    expect(visibleSuggestions("cats", recent, suggested).map((r) => r.text)).not.toContain("cats")
  })

  it("never shows one word twice when both sources have it", () => {
    const both = [suggestion("cats"), suggestion("catsup")]
    const texts = visibleSuggestions("cat", recent, both).map((r) => r.text)
    expect(texts.filter((t) => t === "cats")).toHaveLength(1)
  })

  it("caps across BOTH sources, so the list fits under the box", () => {
    const many = Array.from({ length: 20 }, (_, i) => suggestion(`cat${i}`))
    expect(visibleSuggestions("cat", recent, many, 8)).toHaveLength(8)
  })
})

describe("the arrow keys", () => {
  it("goes down into the list and back out to what was typed", () => {
    // -1 is a real state: the box's own text is what Enter searches for. A
    // combobox that forced a selection would stop somebody searching for a
    // word the server did not suggest.
    expect(nextSuggestionIndex(-1, 3, "ArrowDown")).toBe(0)
    expect(nextSuggestionIndex(0, 3, "ArrowDown")).toBe(1)
    expect(nextSuggestionIndex(2, 3, "ArrowDown")).toBe(-1)
  })

  it("goes up to the last row from nothing, and back out at the top", () => {
    expect(nextSuggestionIndex(-1, 3, "ArrowUp")).toBe(2)
    expect(nextSuggestionIndex(2, 3, "ArrowUp")).toBe(1)
    expect(nextSuggestionIndex(0, 3, "ArrowUp")).toBe(-1)
  })

  it("is -1 for an empty list, whichever key was pressed", () => {
    expect(nextSuggestionIndex(-1, 0, "ArrowDown")).toBe(-1)
    expect(nextSuggestionIndex(0, 0, "ArrowUp")).toBe(-1)
  })
})
