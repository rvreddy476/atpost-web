import { describe, expect, it } from "vitest"
import {
  cardMenuGroups,
  feedbackNotice,
  nextMenuIndex,
  saveLabel,
  watchLaterLabel,
  type CardMenuInput,
} from "./cardMenu"

/**
 * The card menu as a table.
 *
 * Every rule here is one a screenshot cannot check: a row rendered for an
 * action nobody wired, a "Not interested" offered on your own video that the
 * server answers 400 to, an arrow key that stops at the end of the list
 * instead of wrapping.
 */

const ALL: CardMenuInput["can"] = {
  watchLater: true,
  savePlaylist: true,
  saveBookmark: true,
  share: true,
  feedback: true,
  report: true,
}

function ids(input: CardMenuInput): string[] {
  return cardMenuGroups(input).flat().map((row) => row.id)
}

describe("a row is only shown when something serves it", () => {
  it("offers nothing at all when the surface wired nothing", () => {
    expect(cardMenuGroups({ isOwn: false, can: {} })).toEqual([])
  })

  it("shows exactly the rows whose handlers arrived", () => {
    expect(ids({ isOwn: false, can: { watchLater: true } })).toEqual(["watch-later"])
    expect(ids({ isOwn: false, can: { report: true } })).toEqual(["report"])
  })

  it("drops an empty group rather than drawing a divider around nothing", () => {
    const groups = cardMenuGroups({ isOwn: false, can: { watchLater: true, report: true } })
    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.length > 0)).toBe(true)
  })
})

describe("the groups, and what the dividers mean", () => {
  it("puts the three ways of keeping a video together, then Share, then the signals", () => {
    const groups = cardMenuGroups({ isOwn: false, can: ALL })
    expect(groups.map((group) => group.map((row) => row.id))).toEqual([
      ["watch-later", "save-playlist", "save-bookmark"],
      ["share"],
      ["not-interested", "mute-channel"],
      ["report"],
    ])
  })

  it("keeps Report last and marks it destructive", () => {
    const groups = cardMenuGroups({ isOwn: false, can: ALL })
    const last = groups[groups.length - 1]
    expect(last).toEqual([{ id: "report", label: "Report", destructive: true }])
  })
})

describe("your own video", () => {
  it("offers the lists and Share, and neither feedback nor Report", () => {
    // feed-service answers 400 to the viewer's own author id, and reporting
    // yourself is not a thing. Rows that exist to fail are not rendered.
    expect(ids({ isOwn: true, can: ALL })).toEqual([
      "watch-later",
      "save-playlist",
      "save-bookmark",
      "share",
    ])
  })
})

describe("a row's id never moves with its state", () => {
  it("changes the WORD and not the id, so focus restoration survives a toggle", () => {
    const off = cardMenuGroups({ isOwn: false, can: { watchLater: true, saveBookmark: true } })
    const on = cardMenuGroups({
      isOwn: false,
      inWatchLater: true,
      isSaved: true,
      can: { watchLater: true, saveBookmark: true },
    })
    expect(off.flat().map((r) => r.id)).toEqual(on.flat().map((r) => r.id))
    expect(off.flat().map((r) => r.label)).not.toEqual(on.flat().map((r) => r.label))
  })

  it("says which direction each toggle goes", () => {
    expect(watchLaterLabel(false)).toBe("Save to Watch later")
    expect(watchLaterLabel(true)).toBe("Remove from Watch later")
    expect(saveLabel(false)).toBe("Save")
    expect(saveLabel(true)).toBe("Remove from Saved")
  })

  it("names the rail's word for the bookmark list, so one list has one name", () => {
    // The rail row is "Saved" and the endpoint is /v1/posts/bookmarks. The
    // menu must not invent a third word for the same list.
    expect(saveLabel(true)).toContain("Saved")
  })
})

describe("what the grid says after a feedback press", () => {
  it("separates how it looks from whether it happened", () => {
    expect(feedbackNotice("post", true).tone).toBe("good")
    expect(feedbackNotice("post", false).tone).toBe("bad")
  })

  it("tells the truth about a failure rather than claiming the hide worked", () => {
    expect(feedbackNotice("post", false).text).toMatch(/nothing was changed/i)
    expect(feedbackNotice("author", false).text).toMatch(/nothing was changed/i)
  })

  it("says video for a post and channel for an author", () => {
    expect(feedbackNotice("post", true).text).toMatch(/video/i)
    expect(feedbackNotice("author", true).text).toMatch(/channel/i)
  })
})

describe("arrow keys inside the menu", () => {
  it("wraps in both directions, the way role=menu is expected to", () => {
    expect(nextMenuIndex(0, 3, "ArrowDown")).toBe(1)
    expect(nextMenuIndex(2, 3, "ArrowDown")).toBe(0)
    expect(nextMenuIndex(0, 3, "ArrowUp")).toBe(2)
    expect(nextMenuIndex(2, 3, "ArrowUp")).toBe(1)
  })

  it("lands on the first row from nowhere, whichever key opened it", () => {
    expect(nextMenuIndex(-1, 3, "ArrowDown")).toBe(0)
    // Up from nowhere is the LAST row, which is what a person pressing Up to
    // reach the bottom of a menu means.
    expect(nextMenuIndex(-1, 3, "ArrowUp")).toBe(2)
  })

  it("jumps to the ends", () => {
    expect(nextMenuIndex(1, 4, "Home")).toBe(0)
    expect(nextMenuIndex(1, 4, "End")).toBe(3)
  })

  it("is -1 rather than NaN for a menu with no rows", () => {
    expect(nextMenuIndex(0, 0, "ArrowDown")).toBe(-1)
    expect(nextMenuIndex(-1, 0, "End")).toBe(-1)
  })
})
