import { describe, expect, it } from "vitest"
import type { EndScreen, SeriesEpisode, VideoCard } from "./api"
import {
  cardDestination,
  endScreenDestination,
  episodeLabel,
  externalDestination,
  nextEpisode,
  orderedEpisodes,
  watchHref,
} from "./links"

/**
 * Where a linked-video target sends somebody, and — more often — where it does
 * not.
 *
 * The refusals are the point. A card may target a POLL and an end screen may
 * target a PLAYLIST, and the web has no surface for either; a naive
 * `href={\`/\${target_id}\`}` turns those into controls that look like links
 * and land on a 404 wearing this zone's chrome.
 */

function card(over: Partial<VideoCard>): VideoCard {
  return { id: "c", post_id: "p", type: "video", title: "t", appear_at_ms: 0, ...over }
}

function screen(over: Partial<EndScreen>): EndScreen {
  return { id: "s", post_id: "p", type: "video", start_ms: 0, end_ms: 1, ...over }
}

function episode(num: number, postId: string, title?: string | null): SeriesEpisode {
  return { series_id: "s", post_id: postId, episode_num: num, title: title ?? null }
}

describe("watchHref", () => {
  it("is zone-relative, because Next adds the basePath itself", () => {
    // "/tube/{id}" here would ask for "/tube/tube/{id}". Same trap that made
    // apps/reels ask for "/reels/social" from its own empty state.
    expect(watchHref("abc")).toBe("/abc")
    expect(watchHref("abc")).not.toContain("/tube")
  })
})

describe("externalDestination", () => {
  it("accepts http and https", () => {
    expect(externalDestination("https://example.org/x")).toEqual({
      kind: "external",
      href: "https://example.org/x",
    })
  })

  it("refuses every other scheme", () => {
    // `target_url` is free text on a table with no validation behind it, and a
    // javascript: URL in an href is how a content field becomes an execution
    // primitive.
    expect(externalDestination("javascript:alert(1)")).toBeNull()
    expect(externalDestination("data:text/html,<script>")).toBeNull()
    expect(externalDestination("mailto:a@b.c")).toBeNull()
  })

  it("refuses what does not parse, and nothing at all", () => {
    expect(externalDestination("not a url")).toBeNull()
    expect(externalDestination("")).toBeNull()
    expect(externalDestination(null)).toBeNull()
    expect(externalDestination(undefined)).toBeNull()
  })
})

describe("cardDestination", () => {
  it("links one video to another — the founder's own case", () => {
    expect(cardDestination(card({ type: "video", target_id: "v2" }))).toEqual({
      kind: "internal",
      href: "/v2",
    })
  })

  it("offers nothing for a target this client has no surface for", () => {
    // The prompt still renders — as an announcement rather than a dead link.
    expect(cardDestination(card({ type: "poll", target_id: "q" }))).toBeNull()
    expect(cardDestination(card({ type: "playlist", target_id: "l" }))).toBeNull()
  })

  it("offers nothing for a video card with no target", () => {
    expect(cardDestination(card({ type: "video", target_id: null }))).toBeNull()
  })

  it("refuses a type nobody here has seen rather than guessing a URL", () => {
    expect(cardDestination(card({ type: "product" as never, target_id: "x" }))).toBeNull()
  })
})

describe("endScreenDestination", () => {
  it("links to a video", () => {
    expect(endScreenDestination(screen({ type: "video", target_id: "v2" }))).toEqual({
      kind: "internal",
      href: "/v2",
    })
  })

  it("gives channel_subscribe no href, because it is a button and not a link", () => {
    expect(endScreenDestination(screen({ type: "channel_subscribe" }))).toBeNull()
  })

  it("gives a playlist none either — there is no playlist surface", () => {
    expect(endScreenDestination(screen({ type: "playlist", target_id: "l" }))).toBeNull()
  })

  it("passes an external link through the same scheme check", () => {
    expect(
      endScreenDestination(screen({ type: "external_link", target_url: "javascript:x" }))
    ).toBeNull()
  })
})

describe("orderedEpisodes", () => {
  it("orders by episode number, not by insertion", () => {
    const out = orderedEpisodes([episode(3, "c"), episode(1, "a"), episode(2, "b")])
    expect(out.map((e) => e.post_id)).toEqual(["a", "b", "c"])
  })

  it("does not mutate the list it was given", () => {
    const input = [episode(3, "c"), episode(1, "a")]
    orderedEpisodes(input)
    expect(input.map((e) => e.episode_num)).toEqual([3, 1])
  })
})

describe("nextEpisode", () => {
  const series = [episode(1, "a"), episode(2, "b"), episode(3, "c")]

  it("is the one after this video", () => {
    expect(nextEpisode(series, "b")!.post_id).toBe("c")
  })

  it("is null at the end of the series", () => {
    expect(nextEpisode(series, "c")).toBeNull()
  })

  it("is null when this video is not in the list at all", () => {
    // Which is what a series fetched for the wrong post looks like.
    expect(nextEpisode(series, "zzz")).toBeNull()
    expect(nextEpisode([], "a")).toBeNull()
  })

  it("steps over a gap in the author's numbering", () => {
    // Episode 3 was unpublished. Stranding somebody at the end of episode 2 is
    // not what a missing number means.
    const gapped = [episode(1, "a"), episode(2, "b"), episode(4, "d")]
    expect(nextEpisode(gapped, "b")!.post_id).toBe("d")
  })

  it("answers about the ORDER, not the array", () => {
    const shuffled = [episode(3, "c"), episode(1, "a"), episode(2, "b")]
    expect(nextEpisode(shuffled, "a")!.post_id).toBe("b")
  })
})

describe("episodeLabel", () => {
  it("uses the row's own title when it has one", () => {
    expect(episodeLabel(episode(2, "b", "Where this started"))).toBe("Where this started")
  })

  it("falls back to the number rather than to an empty row", () => {
    // `title` is nullable on the table and blank is the same as absent.
    expect(episodeLabel(episode(2, "b", null))).toBe("Episode 2")
    expect(episodeLabel(episode(2, "b", "   "))).toBe("Episode 2")
  })
})
