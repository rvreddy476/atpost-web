import { describe, expect, it } from "vitest"
import {
  CHANNEL_TABS,
  CHANNEL_TAB_LABEL,
  channelTabHref,
  parseTab,
  tabAfterKey,
  tabId,
  tabPanelId,
  type ChannelTab,
} from "./tabs"

/**
 * The tab strip's rules, asserted without a DOM.
 *
 * All of this is pure on purpose — the parser because a server component
 * calls it, and the keyboard because a ring that wraps the wrong way is
 * invisible in review and obvious to anybody using the page with a keyboard.
 */

describe("the four tabs", () => {
  it("is Videos, Shorts, Playlists, About, in that order", () => {
    expect([...CHANNEL_TABS]).toEqual(["videos", "shorts", "playlists", "about"])
  })

  it("labels every one of them", () => {
    for (const tab of CHANNEL_TABS) expect(CHANNEL_TAB_LABEL[tab]).toBeTruthy()
  })
})

describe("parseTab", () => {
  it("reads each tab by name", () => {
    for (const tab of CHANNEL_TABS) expect(parseTab(tab)).toBe(tab)
  })

  it("reads the new Shorts tab, which is the whole point of this change", () => {
    expect(parseTab("shorts")).toBe("shorts")
  })

  it("forgives case and surrounding space, because hand-edited URLs arrive", () => {
    expect(parseTab(" Shorts ")).toBe("shorts")
    expect(parseTab("ABOUT")).toBe("about")
  })

  it("lands on Videos for anything it does not recognise", () => {
    // A channel page that rendered nothing for `?tab=` typos would look
    // broken rather than forgiving.
    expect(parseTab("reels")).toBe("videos")
    expect(parseTab("")).toBe("videos")
    expect(parseTab(null)).toBe("videos")
    expect(parseTab(undefined)).toBe("videos")
  })
})

describe("channelTabHref", () => {
  it("gives a channel ONE canonical address, with no ?tab=videos twin", () => {
    expect(channelTabHref("/@ada", "videos")).toBe("/@ada")
  })

  it("puts every other tab in the URL, so it can be sent to somebody", () => {
    expect(channelTabHref("/@ada", "shorts")).toBe("/@ada?tab=shorts")
    expect(channelTabHref("/@ada", "playlists")).toBe("/@ada?tab=playlists")
    expect(channelTabHref("/@ada", "about")).toBe("/@ada?tab=about")
  })
})

describe("tabAfterKey: the arrow-key ring", () => {
  it("moves right and down to the next tab", () => {
    expect(tabAfterKey("videos", "ArrowRight")).toBe("shorts")
    expect(tabAfterKey("videos", "ArrowDown")).toBe("shorts")
    expect(tabAfterKey("shorts", "ArrowRight")).toBe("playlists")
  })

  it("moves left and up to the previous tab", () => {
    expect(tabAfterKey("about", "ArrowLeft")).toBe("playlists")
    expect(tabAfterKey("about", "ArrowUp")).toBe("playlists")
  })

  it("wraps at both ends, so the strip is a ring and not a dead end", () => {
    expect(tabAfterKey("about", "ArrowRight")).toBe("videos")
    expect(tabAfterKey("videos", "ArrowLeft")).toBe("about")
  })

  it("jumps to the ends with Home and End", () => {
    expect(tabAfterKey("playlists", "Home")).toBe("videos")
    expect(tabAfterKey("shorts", "End")).toBe("about")
  })

  it("claims NOTHING else, so Tab and Enter are never swallowed", () => {
    // Null is what tells the component to leave the event alone. Returning the
    // current tab instead would call preventDefault on Tab and trap focus in
    // the tab strip, which is the classic way to break a keyboard user's page.
    for (const key of ["Tab", "Enter", " ", "a", "Escape", "PageDown"]) {
      expect(tabAfterKey("videos", key)).toBeNull()
    }
  })

  it("refuses to move from a tab that is not in the list", () => {
    // A bug upstream, not a navigation. Moving from an unknown position would
    // pick a tab at random.
    expect(tabAfterKey("nope" as ChannelTab, "ArrowRight")).toBeNull()
  })

  it("walks the whole ring in four steps and comes home", () => {
    let at: ChannelTab = "videos"
    for (let i = 0; i < CHANNEL_TABS.length; i += 1) {
      at = tabAfterKey(at, "ArrowRight") as ChannelTab
    }
    expect(at).toBe("videos")
  })
})

describe("the ids that tie a tab to its panel", () => {
  it("gives every tab a distinct, stable pair", () => {
    const ids = new Set<string>()
    for (const tab of CHANNEL_TABS) {
      // Stable — NOT `useId` — because an ARIA relationship may not change
      // between the server render and the client one.
      expect(tabId(tab)).toBe(tabId(tab))
      ids.add(tabId(tab))
      ids.add(tabPanelId(tab))
    }
    expect(ids.size).toBe(CHANNEL_TABS.length * 2)
  })
})
