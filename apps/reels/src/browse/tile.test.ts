import { describe, expect, it } from "vitest"
import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import {
  reelHref,
  tileAuthor,
  tileBlurhash,
  tileComments,
  tileDuration,
  tileLabel,
  tileLikes,
  tileMedia,
  tilePoster,
} from "./tile"

/**
 * The fixtures are the live payload, not an idealised one.
 *
 * `GET /v1/feed/reels` was read against the running gateway with the test
 * account on 2026-09-09 and all four of this account's reels came back the
 * same shape: `variants` of 360p / 480p / 720p / original / thumb_150, a
 * blurhash, an `expires_at` 300 seconds out, an `author` with a display_name
 * and NO username. Every assertion below is about that shape, because a grid
 * that renders a fixture nobody has and nothing this feed sends is a grid that
 * ships blank.
 */
const NOW = Date.parse("2026-09-09T09:15:12.000Z")

function media(over: Partial<FeedMedia> = {}): FeedMedia {
  return {
    media_id: "383a2a8b-2cd8-4a02-9f3e-e4d32cd28e45",
    kind: "video",
    position: 0,
    status: "ready",
    width: 1080,
    height: 1920,
    blurhash: "LRBNH0t74TRj4mWB-;og%gf6M{kC",
    duration_ms: 28411,
    expires_at: "2026-09-09T09:20:12.132762317Z",
    variants: {
      "360p": "https://media-dev.example/360p?X-Amz-Signature=a",
      "480p": "https://media-dev.example/480p?X-Amz-Signature=b",
      "720p": "https://media-dev.example/720p?X-Amz-Signature=c",
      original: "https://media-dev.example/original?X-Amz-Signature=d",
      thumb_150: "https://media-dev.example/thumb_150?X-Amz-Signature=e",
    },
    hls_url: "/v1/media/383a2a8b/hls/master.m3u8",
    ...over,
  } as FeedMedia
}

function reel(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "3f860f61-ddb6-4be6-98e6-3b892e9c584f",
    author_id: "7cd6ea3a-9c80-4f20-806f-5d08de0f914b",
    content_type: "flick",
    created_at: "2026-09-05T11:06:14.895679Z",
    counts: { likes: 1, comments: 0 },
    author: { id: "7cd6ea3a-9c80-4f20-806f-5d08de0f914b", display_name: "raghu varan" },
    media: [media()],
    ...over,
  } as FeedItem
}

describe("reelHref", () => {
  it("is zone-relative, so next/link puts the basePath on exactly once", () => {
    // "/reels/{id}" here would become "/reels/reels/{id}". This is the same
    // trap that made ReelsEmpty's `<Link href="/social">` ask for
    // /reels/social.
    expect(reelHref({ id: "abc" })).toBe("/abc")
    expect(reelHref({ id: "abc" }).startsWith("/reels")).toBe(false)
  })
})

describe("tilePoster", () => {
  it("uses thumb_150, the only image these rows carry", () => {
    // pickPoster would answer undefined here: 360p/480p/720p are transcode
    // renditions, not stills, and it excludes thumb_150 for a 600px card.
    expect(tilePoster(tileMedia(reel()), NOW)).toBe(
      "https://media-dev.example/thumb_150?X-Amz-Signature=e"
    )
  })

  it("refuses a signature that has expired", () => {
    const late = Date.parse("2026-09-09T09:21:00.000Z")
    expect(tilePoster(tileMedia(reel()), late)).toBeNull()
  })

  it("refuses one about to expire mid-request", () => {
    // isExpired's 10s skew. 09:20:07 is four seconds before the deadline.
    const nearly = Date.parse("2026-09-09T09:20:07.000Z")
    expect(tilePoster(tileMedia(reel()), nearly)).toBeNull()
  })

  it("answers nothing for a reel with no media at all", () => {
    expect(tileMedia(reel({ media: [] }))).toBeNull()
    expect(tilePoster(null, NOW)).toBeNull()
  })

  it("still has a blurhash when the poster is gone", () => {
    // The base layer is the point: an expired grid goes soft, not blank.
    const late = Date.parse("2026-09-09T09:21:00.000Z")
    expect(tilePoster(tileMedia(reel()), late)).toBeNull()
    expect(tileBlurhash(tileMedia(reel()))).toBe("LRBNH0t74TRj4mWB-;og%gf6M{kC")
  })
})

describe("tileDuration", () => {
  it("reads the row rather than guessing", () => {
    expect(tileDuration(tileMedia(reel()))).toBe("0:28")
  })

  it("says nothing when the row does not", () => {
    expect(tileDuration(tileMedia(reel({ media: [media({ duration_ms: undefined })] })))).toBeNull()
    expect(tileDuration(tileMedia(reel({ media: [media({ duration_ms: 0 })] })))).toBeNull()
  })
})

describe("the counts", () => {
  it("draws a count only when there is one", () => {
    expect(tileLikes(reel())).toBe("1")
    expect(tileLikes(reel({ counts: { likes: 0, comments: 0 } }))).toBeNull()
    expect(tileComments(reel({ counts: { likes: 0, comments: 0 } }))).toBeNull()
    expect(tileComments(reel({ counts: { likes: 0, comments: 12 } }))).toBe("12")
  })

  it("compacts the way the phone's rail does", () => {
    expect(tileLikes(reel({ counts: { likes: 1234, comments: 0 } }))).toBe("1.2K")
    expect(tileLikes(reel({ counts: { likes: 1000, comments: 0 } }))).toBe("1K")
  })

  it("respects an author who turned comments off", () => {
    expect(tileComments(reel({ no_comments: true, counts: { likes: 0, comments: 9 } }))).toBeNull()
  })
})

describe("tileAuthor", () => {
  it("falls back to the display name, which is the normal path on this feed", () => {
    // Every reel the live stack returned had a display_name and no username.
    expect(tileAuthor(reel())).toBe("raghu varan")
  })

  it("prefers a handle where there is one", () => {
    const withHandle = reel({
      author: { id: "x", display_name: "raghu varan", username: "raghu" },
    })
    expect(tileAuthor(withHandle)).toBe("@raghu")
  })

  it("never renders a bare @", () => {
    const empty = reel({ author: { id: "x", display_name: "", username: "" } })
    expect(tileAuthor(empty)).toBe("Someone")
  })
})

describe("tileLabel", () => {
  it("names the act, the position and the author in one string", () => {
    // The whole tile is one link, so this is the ONLY thing announced — every
    // visible mark inside it is aria-hidden.
    expect(tileLabel(reel(), 1, 4)).toBe("Expand reel 1 of 4 by raghu varan")
  })

  it("includes the caption when there is one", () => {
    expect(tileLabel(reel({ text: "My bangaram" }), 2, 4)).toBe(
      "Expand reel 2 of 4 by raghu varan — My bangaram"
    )
  })

  it("does not read out a whole essay", () => {
    const long = reel({ text: "x".repeat(400) })
    expect(tileLabel(long, 1, 1).length).toBeLessThan(140)
  })
})
