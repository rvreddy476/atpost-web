import { describe, expect, it } from "vitest"
import type { FeedMedia } from "@atpost/types/feed"
import {
  analyticsContentType,
  areVariantsExpired,
  isPlayable,
  mayAutoplay,
  pickPoster,
  pickProgressive,
  primaryVideo,
} from "./playability"

const video = (over: Partial<FeedMedia> = {}): FeedMedia => ({
  media_id: "m1",
  kind: "video",
  position: 0,
  status: "ready",
  processing_status: "ready",
  moderation_status: "passed",
  playback_kind: "hls",
  playback_url: "/v1/media/m1/hls/master.m3u8",
  variants: { thumb_150: "t", "360p": "a", "480p": "b", "720p": "c", original: "o" },
  ...over,
})

describe("isPlayable", () => {
  it("plays a ready, cleared video", () => {
    expect(isPlayable({ is_processing: false }, video())).toBe(true)
  })

  it("refuses a post that is still transcoding, even when the media says ready", () => {
    // This is the real-world case: the post flag is updated before the media
    // row is. Trusting only the media row renders a broken player.
    expect(isPlayable({ is_processing: true }, video())).toBe(false)
  })

  it("refuses unready transcode state from either field", () => {
    expect(isPlayable({}, video({ status: "processing" }))).toBe(false)
    expect(isPlayable({}, video({ processing_status: "pending" }))).toBe(false)
    expect(isPlayable({}, video({ status: "failed" }))).toBe(false)
  })

  it("refuses media moderation has not cleared", () => {
    expect(isPlayable({}, video({ moderation_status: "pending" }))).toBe(false)
    expect(isPlayable({}, video({ moderation_status: "rejected" }))).toBe(false)
  })

  it("treats an absent status as ready — older rows are fine", () => {
    expect(
      isPlayable({}, video({ status: undefined, processing_status: undefined, moderation_status: undefined }))
    ).toBe(true)
  })

  it("refuses an image", () => {
    expect(isPlayable({}, video({ kind: "image" }))).toBe(false)
  })

  it("refuses a video with nothing to play", () => {
    expect(
      isPlayable({}, video({ playback_url: undefined, hls_url: undefined, variants: {} }))
    ).toBe(false)
  })
})

describe("mayAutoplay", () => {
  it("never autoplays under reduced motion, however playable", () => {
    expect(mayAutoplay({}, video(), { reducedMotion: true })).toBe(false)
    expect(mayAutoplay({}, video(), { reducedMotion: false })).toBe(true)
  })
})

describe("variant pickers", () => {
  it("prefers the cheapest progressive stream, because it is a fallback", () => {
    expect(pickProgressive(video())).toBe("a") // 360p
  })

  it("falls through the preference order when a variant is missing", () => {
    expect(pickProgressive(video({ variants: { "720p": "c", original: "o" } }))).toBe("c")
    expect(pickProgressive(video({ variants: { original: "o" } }))).toBe("o")
  })

  it("returns undefined rather than a wrong key when there are no variants", () => {
    expect(pickProgressive(video({ variants: undefined }))).toBeUndefined()
    // An image's variant names share nothing with a video's — the case that
    // makes a hardcoded "480p" render nothing for every photograph.
    expect(pickProgressive(video({ variants: { thumb_150: "t", medium_1080: "m" } }))).toBeUndefined()
  })

  it("picks a poster big enough to not look blurry", () => {
    expect(pickPoster(video())).toBe("b") // 480p before 360p before thumb_150
    expect(pickPoster(video({ variants: { thumb_150: "t" } }))).toBe("t")
  })
})

describe("areVariantsExpired", () => {
  const now = Date.parse("2026-09-08T12:00:00Z")

  it("is false when nothing expires", () => {
    expect(areVariantsExpired({}, now)).toBe(false)
  })

  it("is false while there is real time left", () => {
    expect(areVariantsExpired({ expires_at: "2026-09-08T12:05:00Z" }, now)).toBe(false)
  })

  it("is true once past the deadline", () => {
    expect(areVariantsExpired({ expires_at: "2026-09-08T11:59:00Z" }, now)).toBe(true)
  })

  it("counts a URL about to expire as expired", () => {
    // Four seconds left is not enough to start a request with.
    expect(areVariantsExpired({ expires_at: "2026-09-08T12:00:04Z" }, now)).toBe(true)
  })

  it("ignores an unparseable timestamp rather than blanking the media", () => {
    expect(areVariantsExpired({ expires_at: "soon" }, now)).toBe(false)
  })
})

describe("analyticsContentType", () => {
  it("splits at ninety seconds, matching the server's classifier", () => {
    expect(analyticsContentType(60_000)).toBe("flick")
    expect(analyticsContentType(90_000)).toBe("flick")
    expect(analyticsContentType(90_001)).toBe("long_video")
  })
})

describe("primaryVideo", () => {
  it("returns the first video by position, not by array order", () => {
    const item = {
      id: "p",
      author_id: "a",
      content_type: "post" as const,
      created_at: "",
      counts: { likes: 0, comments: 0 },
      media: [
        video({ media_id: "second", position: 2 }),
        video({ media_id: "image", position: 0, kind: "image" }),
        video({ media_id: "first", position: 1 }),
      ],
    }
    expect(primaryVideo(item)?.media_id).toBe("first")
  })

  it("returns undefined for a long_video that arrived with no media", () => {
    expect(
      primaryVideo({
        id: "p",
        author_id: "a",
        content_type: "long_video",
        created_at: "",
        counts: { likes: 0, comments: 0 },
      })
    ).toBeUndefined()
  })
})
