import { describe, expect, it } from "vitest"
import {
  clamp,
  durationSeconds,
  posterFor,
  primaryVideoMedia,
  publicPreview,
  shouldRenderWatchPage,
  videoDescriptionFor,
  videoTitleFor,
  watchMetadata,
  type PostRow,
} from "./metadata"
import { PREVIEW_REVALIDATE_SECONDS } from "./serverPost"

/**
 * The link preview, as a table.
 *
 * The half of this that matters is `publicPreview`. Every tag `watchMetadata`
 * emits goes into HTML served to anybody who asks for the URL — there is no
 * viewer behind a crawler — so a title that escapes this predicate is a title
 * the whole internet has, permanently, in somebody's cache. Each clause below
 * is one way a video can be not-yet, no-longer or never public, and the last
 * one (unlisted) is the one the SERVER would have allowed: it admits an
 * anonymous reader to an unlisted post on purpose, and "anyone with the link"
 * is not "put it in a search index".
 */

const post = (over: Partial<PostRow> = {}): PostRow => ({
  id: "33333333-3333-4333-8333-333333333333",
  visibility: "public",
  content_type: "long_video",
  review_status: "approved",
  text: "How a transcoder works\nA walk through the ladder, one rendition at a time.",
  created_at: "2026-09-01T10:00:00Z",
  media: [{ media_id: "media-1", kind: "video", position: 0, duration_ms: 754_000 }],
  channel: { user_id: "u1", name: "Ada's Workshop", handle: "ada" },
  ...over,
})

const base = {
  postId: "33333333-3333-4333-8333-333333333333",
  origin: "https://momentum.test",
  basePath: "/tube",
  siteName: "Momentum Tube",
  fallbackDescription: "Long video on Momentum.",
}

describe("publicPreview", () => {
  it("describes a published public video", () => {
    expect(publicPreview(post())).toBe(true)
  })

  it("refuses nothing at all", () => {
    expect(publicPreview(null)).toBe(false)
    expect(publicPreview(undefined)).toBe(false)
  })

  for (const visibility of ["private", "followers", "circle", "PRIVATE"]) {
    it(`refuses ${visibility}`, () => {
      expect(publicPreview(post({ visibility }))).toBe(false)
    })
  }

  it("refuses UNLISTED, which the server itself would have served", () => {
    expect(publicPreview(post({ visibility: "unlisted" }))).toBe(false)
  })

  it("refuses an empty visibility, failing closed on a row it does not recognise", () => {
    expect(publicPreview(post({ visibility: "" }))).toBe(false)
    expect(publicPreview(post({ visibility: undefined }))).toBe(false)
  })

  it("refuses a soft-deleted video", () => {
    expect(publicPreview(post({ deleted_at: "2026-09-02T00:00:00Z" }))).toBe(false)
  })

  it("refuses a scheduled video, by either field", () => {
    expect(publicPreview(post({ is_scheduled: true }))).toBe(false)
    expect(publicPreview(post({ publish_at: "2026-10-01T00:00:00Z" }))).toBe(false)
  })

  it("refuses one still transcoding", () => {
    expect(publicPreview(post({ is_processing: true }))).toBe(false)
  })

  it("refuses one that moderation has not approved", () => {
    expect(publicPreview(post({ review_status: "flagged" }))).toBe(false)
    expect(publicPreview(post({ review_status: "pending" }))).toBe(false)
  })

  it("refuses a members-only video and a redacted body", () => {
    expect(publicPreview(post({ tier_required_id: "tier-1" }))).toBe(false)
    expect(publicPreview(post({ body_redacted: true }))).toBe(false)
  })
})

describe("clamp", () => {
  it("leaves a short line alone", () => {
    expect(clamp("Short", 70)).toBe("Short")
  })

  it("collapses newlines, because a meta tag is one line", () => {
    expect(clamp("one\n\ntwo   three", 70)).toBe("one two three")
  })

  it("cuts at a word boundary and marks the cut", () => {
    const out = clamp("the complete guide to photography in low light", 20)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out).not.toContain("photog…")
  })
})

describe("the words", () => {
  it("prefers seo_title, then title, then the first line of the text", () => {
    expect(videoTitleFor(post({ seo_title: "S", title: "T" }))).toBe("S")
    expect(videoTitleFor(post({ title: "T" }))).toBe("T")
    expect(videoTitleFor(post())).toBe("How a transcoder works")
  })

  it("answers null when there is nothing, rather than 'Untitled'", () => {
    expect(videoTitleFor(post({ text: "   ", title: "", seo_title: "" }))).toBe(null)
  })

  it("does not repeat the title as the description", () => {
    const description = videoDescriptionFor(post(), "fallback")
    expect(description).not.toContain("How a transcoder works")
    expect(description).toContain("one rendition at a time")
  })

  it("uses the whole text when the title came from elsewhere", () => {
    const description = videoDescriptionFor(post({ title: "Episode 4" }), "fallback")
    expect(description).toContain("How a transcoder works")
  })

  it("falls back when the post has no text", () => {
    expect(videoDescriptionFor(post({ text: "" }), "fallback")).toBe("fallback")
  })
})

describe("the picture and the clock", () => {
  it("takes the first video attachment in carousel order", () => {
    const row = post({
      media: [
        { media_id: "second", kind: "video", position: 3 },
        { media_id: "first", kind: "video", position: 1 },
        { media_id: "image", kind: "image", position: 0 },
      ],
    })
    expect(primaryVideoMedia(row)?.media_id).toBe("first")
  })

  it("prefers the creator's cover frame at a large rendition", () => {
    expect(posterFor(post({ cover_media_id: "cover-1" }))).toEqual({
      path: "/v1/media/cover-1/serve/medium_1080",
      large: true,
    })
  })

  it("falls back to the video's biggest still, which is not large", () => {
    expect(posterFor(post())).toEqual({
      path: "/v1/media/media-1/serve/thumb_300",
      large: false,
    })
  })

  it("has no picture for a post with no video", () => {
    expect(posterFor(post({ media: [] }))).toBe(null)
  })

  it("rounds the duration to seconds and omits an unknown one", () => {
    expect(durationSeconds(post())).toBe(754)
    expect(durationSeconds(post({ media: [{ media_id: "m", kind: "video" }] }))).toBe(undefined)
    expect(
      durationSeconds(post({ media: [{ media_id: "m", kind: "video", duration_ms: 0 }] }))
    ).toBe(undefined)
  })
})

describe("watchMetadata", () => {
  it("emits the full card for a public video", () => {
    const meta = watchMetadata({ ...base, post: post() })
    expect(meta.title).toBe("How a transcoder works")
    expect(meta.alternates?.canonical).toBe(
      "https://momentum.test/tube/33333333-3333-4333-8333-333333333333"
    )
    expect(meta.robots).toEqual({ index: true, follow: true })

    const og = meta.openGraph as Record<string, unknown>
    expect(og.type).toBe("video.other")
    expect(og.siteName).toBe("Momentum Tube")
    expect(og.url).toBe("https://momentum.test/tube/33333333-3333-4333-8333-333333333333")
    expect(og.duration).toBe(754)
    expect(og.releaseDate).toBe("2026-09-01T10:00:00Z")
    expect(og.authors).toEqual(["Ada's Workshop"])
    expect(og.images).toEqual([
      {
        url: "https://momentum.test/tube/v1/media/media-1/serve/thumb_300",
        alt: "How a transcoder works",
      },
    ])
  })

  it("uses a large twitter card only when the picture is large", () => {
    const small = watchMetadata({ ...base, post: post() })
    const large = watchMetadata({ ...base, post: post({ cover_media_id: "cover-1" }) })
    expect((small.twitter as Record<string, unknown>).card).toBe("summary")
    expect((large.twitter as Record<string, unknown>).card).toBe("summary_large_image")
  })

  it("leaks nothing about a private video, and asks not to be indexed", () => {
    const meta = watchMetadata({ ...base, post: post({ visibility: "private" }) })
    const json = JSON.stringify(meta)
    expect(json).not.toContain("How a transcoder works")
    expect(json).not.toContain("Ada's Workshop")
    expect(json).not.toContain("media-1")
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.title).toBe("Momentum Tube")
  })

  it("leaks nothing about an unlisted video either", () => {
    const meta = watchMetadata({ ...base, post: post({ visibility: "unlisted" }) })
    expect(JSON.stringify(meta)).not.toContain("How a transcoder works")
  })

  it("still emits a canonical URL for a video it may not describe", () => {
    const meta = watchMetadata({ ...base, post: null })
    expect(meta.alternates?.canonical).toBe(
      "https://momentum.test/tube/33333333-3333-4333-8333-333333333333"
    )
  })

  it("carries no picture when the post has none, rather than a broken URL", () => {
    const meta = watchMetadata({ ...base, post: post({ media: [] }) })
    expect((meta.openGraph as Record<string, unknown>).images).toBe(undefined)
    expect((meta.twitter as Record<string, unknown>).images).toBe(undefined)
  })
})

describe("shouldRenderWatchPage", () => {
  it("always renders for a signed-in request, whatever a stranger may see", () => {
    expect(shouldRenderWatchPage({ signedIn: true, post: null })).toBe(true)
  })

  it("renders a public video for a signed-out visitor", () => {
    expect(shouldRenderWatchPage({ signedIn: false, post: post() })).toBe(true)
  })

  it("404s a signed-out visitor to a video no stranger may read", () => {
    expect(shouldRenderWatchPage({ signedIn: false, post: null })).toBe(false)
  })
})

describe("the preview cache", () => {
  it("is finite, so unpublishing stops the preview within the window", () => {
    expect(Number.isFinite(PREVIEW_REVALIDATE_SECONDS)).toBe(true)
    expect(PREVIEW_REVALIDATE_SECONDS).toBeGreaterThan(0)
    expect(PREVIEW_REVALIDATE_SECONDS).toBeLessThanOrEqual(900)
  })
})
