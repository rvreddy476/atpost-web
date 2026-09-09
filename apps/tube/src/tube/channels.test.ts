import { describe, expect, it } from "vitest"
import type { FeedItem } from "@atpost/types/feed"
import {
  atHandle,
  bannerImage,
  bannerSeed,
  bareHandle,
  channelHref,
  channelRef,
  channelsFromFeed,
  isLongVideoRow,
  itemChannelHref,
  subscribersLabel,
  videosLabel,
} from "./channels"
import { feedQueryKey } from "./api"

/**
 * The fixtures are the live payload, not an idealised one.
 *
 * `GET /v1/channels/search?q=a` was read against the running gateway with no
 * cookie jar on 2026-09-09 and returned three channels — "Call B Studio"
 * (@call.userb), "CQS Proof Channel" (@cqsproof1788722611) and "raghu varan"
 * (@raghuvaran). Every one of them has `avatar_media_id: null`,
 * `avatar_url: null` and `video_count: 2`, and none of the six long videos on
 * the feed has an author with a `username`. So the shapes below are the ones
 * this code will actually meet: a channel with a handle and no picture, and a
 * feed row whose only "@" is on its channel.
 */

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "e6eb184f-7dbc-4327-b552-948ce18e42a3",
    author_id: "4511999b-08eb-411c-87ce-b5a0e670b641",
    content_type: "long_video",
    created_at: "2026-09-06T20:02:24.906757Z",
    counts: { likes: 0, comments: 0 },
    ...over,
  }
}

describe("handles", () => {
  it("strips the @ the URL carries and the space a paste brings", () => {
    expect(bareHandle("@ada")).toBe("ada")
    expect(bareHandle("  @ada  ")).toBe("ada")
    expect(bareHandle("ada")).toBe("ada")
  })

  it("strips a doubled @, which is what /@@ada in an address bar produces", () => {
    expect(bareHandle("@@ada")).toBe("ada")
  })

  it("is null for nothing, so a name never becomes a link to /@", () => {
    expect(bareHandle("")).toBeNull()
    expect(bareHandle("   ")).toBeNull()
    expect(bareHandle("@")).toBeNull()
    expect(bareHandle(null)).toBeNull()
    expect(bareHandle(undefined)).toBeNull()
  })

  it("writes a handle back with exactly one @", () => {
    expect(atHandle("ada")).toBe("@ada")
    expect(atHandle("@ada")).toBe("@ada")
  })

  it("never renders a bare @ for a channel with no handle", () => {
    expect(atHandle("")).toBeNull()
    expect(atHandle("@")).toBeNull()
  })
})

describe("channelRef — what goes in the URL", () => {
  it("prefers the handle", () => {
    expect(channelRef({ handle: "cqsproof1788722611", user_id: "4511999b" })).toBe(
      "cqsproof1788722611"
    )
  })

  it("falls back to the user id, because the server accepts either at {key}", () => {
    expect(channelRef({ handle: "", user_id: "4511999b" })).toBe("4511999b")
    expect(channelRef({ user_id: "4511999b" })).toBe("4511999b")
  })

  it("is null when there is neither — the null that stops a broken link", () => {
    expect(channelRef({ handle: "", user_id: "" })).toBeNull()
    expect(channelRef(null)).toBeNull()
    expect(channelRef(undefined)).toBeNull()
  })
})

describe("channelHref is ZONE-RELATIVE", () => {
  /**
   * The single most expensive mistake available in this repo. `next/link`
   * prefixes the zone's basePath itself, so a href of "/tube/@ada" asks for
   * "/tube/tube/@ada" — the same trap that made apps/reels request
   * "/reels/social" from its own empty state.
   */
  it("does not carry the zone prefix", () => {
    expect(channelHref("ada")).toBe("/@ada")
    expect(channelHref("ada")).not.toContain("/tube")
  })

  it("accepts a ref that already has its @, and does not double it", () => {
    expect(channelHref("@ada")).toBe("/@ada")
  })

  it("is null for a row with no channel at all", () => {
    expect(itemChannelHref(item())).toBeNull()
  })

  it("is the channel's page for a row that has one", () => {
    expect(
      itemChannelHref(
        item({ channel: { user_id: "4511999b", name: "CQS Proof Channel", handle: "cqsproof1" } })
      )
    ).toBe("/@cqsproof1")
  })
})

describe("counts", () => {
  /**
   * Zero is DRAWN here, unlike a like count. A channel page is about its
   * subscriber number, so omitting it exactly when it is least flattering is
   * a nicer lie rather than a truer one — the same argument `viewsLabel`
   * makes in ./video.ts. Every channel on the dev stack is at 0 today.
   */
  it("says zero in words rather than as a digit", () => {
    expect(subscribersLabel(0)).toBe("No subscribers yet")
    expect(subscribersLabel(null)).toBe("No subscribers yet")
    expect(subscribersLabel(undefined)).toBe("No subscribers yet")
  })

  it("is singular at one", () => {
    expect(subscribersLabel(1)).toBe("1 subscriber")
    expect(videosLabel(1)).toBe("1 video")
  })

  it("abbreviates above a thousand", () => {
    expect(subscribersLabel(1200)).toBe("1.2K subscribers")
  })

  it("never prints a negative, which a bad projection can produce", () => {
    expect(subscribersLabel(-3)).toBe("No subscribers yet")
    expect(videosLabel(-1)).toBe("No videos yet")
  })
})

describe("the derived banner", () => {
  it("is the same colour for the same channel on every visit", () => {
    expect(bannerSeed("cqsproof1788722611")).toBe(bannerSeed("cqsproof1788722611"))
    expect(bannerImage("ada")).toBe(bannerImage("ada"))
  })

  /**
   * The reason FNV-1a is used rather than a sum of character codes: these two
   * handles differ in one trailing letter, and a summing hash would put them
   * on adjacent hues — two channels a person switches between would look
   * identical.
   */
  it("separates handles that differ by one character", () => {
    expect(bannerSeed("call.usera")).not.toBe(bannerSeed("call.userb"))
  })

  it("is a hue, so it always resolves to a real colour", () => {
    for (const key of ["", "a", "call.userb", "raghuvaran", "cqsproof1788722611"]) {
      const hue = bannerSeed(key)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
    expect(bannerImage(null)).toContain("linear-gradient")
  })
})

describe("isLongVideoRow", () => {
  it("accepts the current name and its legacy synonym", () => {
    expect(isLongVideoRow({ content_type: "long_video" })).toBe(true)
    // feed-service's GetLongVideoFeed reads both; dropping this one would
    // hide exactly the oldest videos on the platform.
    expect(isLongVideoRow({ content_type: "video" })).toBe(true)
  })

  it("reads either field, because an older row fills in only one", () => {
    expect(isLongVideoRow({ post_type: "long_video" })).toBe(true)
    expect(isLongVideoRow({ content_type: undefined, post_type: "video" })).toBe(true)
  })

  it("rejects everything else, including a reel", () => {
    expect(isLongVideoRow({ content_type: "reel" })).toBe(false)
    expect(isLongVideoRow({ content_type: "photo", post_type: "text" })).toBe(false)
    expect(isLongVideoRow({})).toBe(false)
    expect(isLongVideoRow(null)).toBe(false)
  })
})

describe("channelsFromFeed — the rail's subscribed list", () => {
  const rows = [
    item({
      id: "1",
      channel: { user_id: "b", name: "Call B Studio", handle: "call.userb" },
      author: { id: "b", display_name: "Call UserB" },
    }),
    item({
      id: "2",
      channel: { user_id: "a", name: "CQS Proof Channel", handle: "@cqsproof1" },
      author: { id: "a", display_name: "Cqs creator" },
    }),
    item({
      id: "3",
      channel: { user_id: "b", name: "Call B Studio", handle: "call.userb" },
      author: { id: "b", display_name: "Call UserB" },
    }),
  ]

  it("is one row per channel, in the order their newest video appears", () => {
    // The feed is newest first, so the FIRST row an author has is their
    // newest — which is why de-duplication gives the right order for free.
    // Transcribed from `channelBubbles` in the Android client.
    expect(channelsFromFeed(rows, null).map((c) => c.user_id)).toEqual(["b", "a"])
  })

  it("normalises the handle it stores, so the rail's links are not doubled", () => {
    expect(channelsFromFeed(rows, null)[1].handle).toBe("cqsproof1")
  })

  it("leaves the viewer's own channel out — the rail is who you watch", () => {
    expect(channelsFromFeed(rows, "b").map((c) => c.user_id)).toEqual(["a"])
  })

  it("falls back to the author when the row predates channels", () => {
    const legacy = [item({ id: "4", author: { id: "c", display_name: "Someone Real" } })]
    expect(channelsFromFeed(legacy, null)).toEqual([
      { user_id: "c", name: "Someone Real", handle: "", avatar_url: null },
    ])
  })

  it("drops a row with an id and no name rather than listing 'Someone'", () => {
    // A rail of identical placeholder rows is unusable in a way a missing row
    // is not: this list is how a viewer PICKS a channel.
    const nameless = [item({ id: "5", author: { id: "d" } })]
    expect(channelsFromFeed(nameless, null)).toEqual([])
  })

  it("survives a page with no channels and no authors at all", () => {
    expect(channelsFromFeed([item()], null)).toEqual([])
    expect(channelsFromFeed([], null)).toEqual([])
  })
})

describe("feedQueryKey — what makes the feed hook start over", () => {
  /**
   * A cursor and a seen-set belong to ONE query. If two different queries
   * produce the same key the hook keeps paging the old list; if one query
   * produces two keys it refetches page one on every render.
   */
  it("is stable for the same question asked twice", () => {
    expect(feedQueryKey({ category: "comedy" })).toBe(feedQueryKey({ category: "comedy" }))
    expect(feedQueryKey({})).toBe(feedQueryKey({ category: null, followingOnly: false }))
    expect(feedQueryKey()).toBe(feedQueryKey({}))
  })

  it("differs for every narrowing that changes the request", () => {
    const keys = new Set([
      feedQueryKey({}),
      feedQueryKey({ category: "comedy" }),
      feedQueryKey({ category: "music" }),
      feedQueryKey({ followingOnly: true }),
      feedQueryKey({ anonymous: true }),
    ])
    expect(keys.size).toBe(5)
  })

  it("separates the public shelf from the ranked feed", () => {
    // They are different ENDPOINTS with different cursor families — mixing a
    // `/v1/posts/*` timestamp cursor into `/v1/feed/*` is a 400.
    expect(feedQueryKey({ anonymous: true })).not.toBe(feedQueryKey({}))
  })
})
