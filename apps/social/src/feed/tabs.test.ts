/**
 * The URL is the tab's only durable home, so this is where it is checked.
 *
 * Everything here is a string in and a string out. The cases are the ones a
 * real address bar produces — a hand-typed tab name, a pasted `#`, a link that
 * already carries a campaign parameter — rather than the ones the happy path
 * produces, because the happy path is the one the browser exercises anyway.
 */

import { describe, expect, it } from "vitest"
import {
  DEFAULT_TAB,
  FEED_TABS,
  listKey,
  normalizeTag,
  readRoute,
  sameRoute,
  writeRoute,
} from "./tabs"

describe("the tab set", () => {
  it("is the three Android ships, in Android's order", () => {
    // If this fails, the web and the phone have drifted apart and one of them
    // is showing a section the other does not. See the note in ./tabs.ts.
    expect(FEED_TABS.map((t) => t.id)).toEqual(["for-you", "following", "hashtag"])
    expect(FEED_TABS.map((t) => t.label)).toEqual(["For You", "Following", "HashTag"])
  })

  it("opens on For You", () => {
    expect(DEFAULT_TAB).toBe("for-you")
  })
})

describe("readRoute", () => {
  it("reads a bare URL as the default tab", () => {
    expect(readRoute("")).toEqual({ tab: "for-you", tag: null })
    expect(readRoute("?")).toEqual({ tab: "for-you", tag: null })
  })

  it("takes the search string with or without its question mark", () => {
    expect(readRoute("?tab=following")).toEqual({ tab: "following", tag: null })
    expect(readRoute("tab=following")).toEqual({ tab: "following", tag: null })
  })

  it("falls back to the default rather than erroring on a name it does not know", () => {
    // Someone typed it, or an old link survived a rename. A blank screen would
    // be a worse answer than the front door.
    expect(readRoute("?tab=friends")).toEqual({ tab: "for-you", tag: null })
    expect(readRoute("?tab=")).toEqual({ tab: "for-you", tag: null })
  })

  it("is not case sensitive about the tab", () => {
    expect(readRoute("?tab=Following").tab).toBe("following")
  })

  it("carries a tag only on the tab that can show one", () => {
    expect(readRoute("?tab=hashtag&tag=momentum")).toEqual({ tab: "hashtag", tag: "momentum" })
    // A tag with no hashtag tab describes a screen that does not exist.
    expect(readRoute("?tab=following&tag=momentum")).toEqual({ tab: "following", tag: null })
    expect(readRoute("?tag=momentum")).toEqual({ tab: "for-you", tag: null })
  })

  it("normalises a pasted tag", () => {
    expect(readRoute("?tab=hashtag&tag=%23Momentum").tag).toBe("momentum")
    expect(readRoute("?tab=hashtag&tag=  test  ").tag).toBe("test")
  })

  it("reads an empty tag as the tag list, not as a tag", () => {
    expect(readRoute("?tab=hashtag&tag=").tag).toBeNull()
    expect(readRoute("?tab=hashtag&tag=%23").tag).toBeNull()
  })
})

describe("normalizeTag", () => {
  it.each([
    ["#Momentum", "momentum"],
    ["momentum", "momentum"],
    ["  #Test ", "test"],
    ["##double", "double"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ])("%p -> %p", (input, expected) => {
    expect(normalizeTag(input)).toBe(expected)
  })
})

describe("writeRoute", () => {
  it("leaves nothing behind for the default tab", () => {
    // The front door's canonical URL is the bare one. `?tab=for-you` would be
    // carried around by every share and every bookmark for no information.
    expect(writeRoute("?tab=following", { tab: "for-you", tag: null })).toBe("")
    expect(writeRoute("", { tab: "for-you", tag: null })).toBe("")
  })

  it("names the other tabs", () => {
    expect(writeRoute("", { tab: "following", tag: null })).toBe("?tab=following")
    expect(writeRoute("", { tab: "hashtag", tag: null })).toBe("?tab=hashtag")
  })

  it("adds the tag, normalised", () => {
    expect(writeRoute("", { tab: "hashtag", tag: "#Momentum" })).toBe("?tab=hashtag&tag=momentum")
  })

  it("drops a tag the destination cannot show", () => {
    expect(writeRoute("?tab=hashtag&tag=momentum", { tab: "following", tag: null })).toBe(
      "?tab=following"
    )
    expect(writeRoute("?tab=hashtag&tag=momentum", { tab: "hashtag", tag: null })).toBe(
      "?tab=hashtag"
    )
  })

  it("keeps parameters that are not ours", () => {
    // A campaign parameter on a shared link is how the reader got here. A tab
    // switch that quietly dropped it would make the URL lie about that.
    expect(writeRoute("?ref=newsletter", { tab: "following", tag: null })).toBe(
      "?ref=newsletter&tab=following"
    )
    expect(writeRoute("?ref=newsletter&tab=following", { tab: "for-you", tag: null })).toBe(
      "?ref=newsletter"
    )
  })

  it("round-trips with readRoute", () => {
    for (const route of [
      { tab: "for-you" as const, tag: null },
      { tab: "following" as const, tag: null },
      { tab: "hashtag" as const, tag: null },
      { tab: "hashtag" as const, tag: "momentum" },
    ]) {
      expect(readRoute(writeRoute("", route))).toEqual(route)
    }
  })
})

describe("sameRoute", () => {
  it("distinguishes two tags on the same tab", () => {
    expect(sameRoute({ tab: "hashtag", tag: "a" }, { tab: "hashtag", tag: "b" })).toBe(false)
    expect(sameRoute({ tab: "hashtag", tag: "a" }, { tab: "hashtag", tag: "a" })).toBe(true)
    expect(sameRoute({ tab: "hashtag", tag: null }, { tab: "hashtag", tag: "a" })).toBe(false)
  })
})

describe("listKey", () => {
  it("gives each section its own bucket", () => {
    expect(listKey({ tab: "for-you", tag: null })).toBe("for-you")
    expect(listKey({ tab: "following", tag: null })).toBe("following")
  })

  it("gives each TAG its own bucket", () => {
    // One bucket for "the hashtag tab" would show the previous tag's posts
    // under the new tag's heading.
    expect(listKey({ tab: "hashtag", tag: "momentum" })).toBe("tag:momentum")
    expect(listKey({ tab: "hashtag", tag: "test" })).toBe("tag:test")
  })

  it("has no bucket for the trending list, which is not a list of posts", () => {
    expect(listKey({ tab: "hashtag", tag: null })).toBeNull()
  })
})
