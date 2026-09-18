import { describe, expect, it } from "vitest"
import { isPlayable, primaryVideo } from "@momentum/player"
import { creatorName, noPictureReason, videoTitle } from "@/tube/video"
import { parsePublicPost, watchableByAnyone } from "./publicPost"

/**
 * The anonymous viewer's row, as a table.
 *
 * Two things are worth asserting and they pull in opposite directions. The
 * first is that the row is ENOUGH: a stranger clicking a card on the signed-out
 * home grid must get a video that plays, a title, a channel and a description,
 * because the alternative is the sign-in wall this path exists to remove. The
 * second is that nothing is INVENTED to get there — no faked `variants`, no
 * synthesised `playback_url`, no defaulted media status — because each of those
 * would turn a missing poster into a broken image or a still-transcoding video
 * into a black rectangle.
 */

/** A response shaped exactly as post-service serialises `PostDetail`. */
const raw = (over: Record<string, unknown> = {}) => ({
  id: "33333333-3333-4333-8333-333333333333",
  author_id: "aaaa0000-0000-4000-8000-000000000001",
  text: "How a transcoder works\nA walk through the ladder.",
  title: "How a transcoder works",
  visibility: "public",
  content_type: "long_video",
  created_at: "2026-09-01T10:00:00Z",
  counts: { likes: 12, comments: 3 },
  view_count: 480,
  no_comments: false,
  hide_share: false,
  is_processing: false,
  media: [
    {
      media_id: "media-1",
      kind: "video",
      position: 0,
      alt_text: "A ladder diagram",
      processing_status: "ready",
      moderation_status: "passed",
      duration_ms: 754_000,
      hls_url: "/v1/media/media-1/hls/master.m3u8",
    },
  ],
  channel: { user_id: "aaaa0000-0000-4000-8000-000000000001", name: "Ada's Workshop", handle: "ada" },
  ...over,
})

describe("parsePublicPost — enough to watch", () => {
  it("produces a row the player will actually play", () => {
    const item = parsePublicPost(raw())!
    const media = primaryVideo(item)!
    expect(media.hls_url).toBe("/v1/media/media-1/hls/master.m3u8")
    expect(isPlayable(item, media)).toBe(true)
    expect(noPictureReason(item)).toBe(null)
  })

  it("carries the title, the description and the channel the page draws", () => {
    const item = parsePublicPost(raw())!
    expect(videoTitle(item)).toBe("How a transcoder works")
    expect(item.text).toContain("A walk through the ladder")
    // `creatorName` reads the channel first, which is why an absent `author`
    // costs this page nothing.
    expect(creatorName(item)).toBe("Ada's Workshop")
  })

  it("keeps the counts and the view count the meta row reads", () => {
    const item = parsePublicPost(raw())!
    expect(item.counts).toEqual({ likes: 12, comments: 3 })
    expect(item.view_count).toBe(480)
  })

  it("carries the author's switches, so the thread and Share obey them", () => {
    const off = parsePublicPost(raw({ no_comments: true, hide_share: true }))!
    expect(off.no_comments).toBe(true)
    expect(off.hide_share).toBe(true)
  })

  it("defaults counts rather than leaving the required field undefined", () => {
    const item = parsePublicPost(raw({ counts: undefined }))!
    expect(item.counts).toEqual({ likes: 0, comments: 0 })
  })
})

describe("parsePublicPost — nothing invented", () => {
  it("has no variants, so no poster is faked", () => {
    const media = primaryVideo(parsePublicPost(raw())!)!
    expect(media.variants).toBe(undefined)
  })

  it("has no blurhash and no dimensions", () => {
    const media = primaryVideo(parsePublicPost(raw())!)!
    expect(media.blurhash).toBe(undefined)
    expect(media.width).toBe(undefined)
    expect(media.height).toBe(undefined)
  })

  it("does not synthesise playback_url from hls_url", () => {
    expect(primaryVideo(parsePublicPost(raw())!)!.playback_url).toBe(undefined)
  })

  it("does not carry viewer-relative flags there is no viewer for", () => {
    const item = parsePublicPost(raw({ has_reacted: true, is_bookmarked: true }))!
    expect(item.has_reacted).toBe(undefined)
    expect(item.is_bookmarked).toBe(undefined)
  })

  it("leaves an absent media status absent, which reads as 'an older row'", () => {
    const item = parsePublicPost(
      raw({ media: [{ media_id: "m", kind: "video", hls_url: "/v1/x" }] })
    )!
    const media = primaryVideo(item)!
    expect(media.processing_status).toBe(undefined)
    expect(isPlayable(item, media)).toBe(true)
  })

  it("does NOT play a row the server says is still processing", () => {
    const item = parsePublicPost(
      raw({
        media: [
          { media_id: "m", kind: "video", processing_status: "processing", hls_url: "/v1/x" },
        ],
      })
    )!
    expect(noPictureReason(item)).toBe("processing")
  })

  it("does NOT play a row moderation has not cleared", () => {
    const item = parsePublicPost(
      raw({
        media: [
          { media_id: "m", kind: "video", moderation_status: "pending", hls_url: "/v1/x" },
        ],
      })
    )!
    expect(noPictureReason(item)).toBe("moderation")
  })
})

describe("parsePublicPost — refusals", () => {
  it("is null for a body that is not a row", () => {
    expect(parsePublicPost(null)).toBe(null)
    expect(parsePublicPost(undefined)).toBe(null)
    expect(parsePublicPost("nope")).toBe(null)
    expect(parsePublicPost([])).toBe(null)
  })

  it("is null without an id", () => {
    expect(parsePublicPost(raw({ id: undefined }))).toBe(null)
  })

  it("drops an attachment with no media id or an unknown kind", () => {
    const item = parsePublicPost(
      raw({ media: [{ kind: "video" }, { media_id: "m", kind: "audio" }] })
    )!
    expect(item.media).toBe(undefined)
    expect(noPictureReason(item)).toBe("missing")
  })
})

describe("watchableByAnyone", () => {
  it("allows public", () => {
    expect(watchableByAnyone(parsePublicPost(raw())!)).toBe(true)
  })

  it("allows UNLISTED — that is what unlisted is for", () => {
    // The metadata path refuses the same row, because a preview is a
    // publication and watching is not. See ./metadata.ts.
    expect(watchableByAnyone(parsePublicPost(raw({ visibility: "unlisted" }))!)).toBe(true)
  })

  it("allows an empty visibility, which the server itself reads as public", () => {
    expect(watchableByAnyone(parsePublicPost(raw({ visibility: "" }))!)).toBe(true)
    expect(watchableByAnyone(parsePublicPost(raw({ visibility: undefined }))!)).toBe(true)
  })

  it("refuses anything the server would not have served a stranger", () => {
    for (const visibility of ["private", "followers", "circle", "PRIVATE"]) {
      expect(watchableByAnyone(parsePublicPost(raw({ visibility }))!)).toBe(false)
    }
  })
})
