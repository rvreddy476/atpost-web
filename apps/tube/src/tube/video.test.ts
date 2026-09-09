import { describe, expect, it } from "vitest"
import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import {
  cardLabel,
  commentsLabel,
  creatorHandle,
  creatorName,
  isWatchable,
  likesLabel,
  noPictureReason,
  showsFollow,
  videoBlurhash,
  videoDuration,
  videoHref,
  videoMedia,
  videoPoster,
  videoTitle,
  viewsLabel,
} from "./video"

/**
 * The fixtures are the live payload, not an idealised one.
 *
 * `GET /v1/feed/videos?limit=50` was read against the running gateway with a
 * dev account on 2026-09-09. Six rows came back, all `content_type:
 * "long_video"`, and the shape below is theirs:
 *
 *   · every row carries `title`, `channel{user_id,name,handle,avatar_url}`,
 *     `view_count`, `category`, `reason`/`reason_text`;
 *   · `author` carries `display_name` and sometimes `avatar_media_id`, and
 *     NOT ONE of the four authors carries a `username` — so `channel.handle`
 *     is the only "@" this content has;
 *   · media, where present, carries variants 360p / 480p / 720p / original /
 *     thumb_150, a blurhash, and an `expires_at` 300 seconds out;
 *   · TWO of the six carry no `media` key at all and are not `is_processing`.
 *
 * That last one is the fixture that matters most. A grid built against a
 * fixture where every row has a video renders four cards for six videos, or
 * throws reading `media[0]`, and neither shows up until it is in front of
 * somebody.
 */
const NOW = Date.parse("2026-09-09T09:55:20.000Z")

function media(over: Partial<FeedMedia> = {}): FeedMedia {
  return {
    media_id: "b48d7210-47f2-4d6f-b313-39229c830c7d",
    kind: "video",
    position: 0,
    status: "ready",
    width: 480,
    height: 864,
    blurhash: "LhE{hBs:00WBMxoftRWBjZofofWB",
    duration_ms: 221994,
    expires_at: "2026-09-09T10:00:20.807519436Z",
    variants: {
      "360p": "https://media-dev.example/360p?X-Amz-Signature=a",
      "480p": "https://media-dev.example/480p?X-Amz-Signature=b",
      "720p": "https://media-dev.example/720p?X-Amz-Signature=c",
      original: "https://media-dev.example/original?X-Amz-Signature=d",
      thumb_150: "https://media-dev.example/thumb_150?X-Amz-Signature=e",
    },
    hls_url: "/v1/media/b48d7210-47f2-4d6f-b313-39229c830c7d/hls/master.m3u8",
    playback_url: "/v1/media/b48d7210-47f2-4d6f-b313-39229c830c7d/hls/master.m3u8",
    playback_kind: "hls",
    processing_status: "ready",
    moderation_status: "passed",
    ...over,
  } as FeedMedia
}

function video(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "02822253-9016-486e-9ed4-79842eccaa5d",
    author_id: "7cd6ea3a-9c80-4f20-806f-5d08de0f914b",
    content_type: "long_video",
    created_at: "2026-09-06T09:39:05.053841Z",
    text: "My Honey dancing for Kattu",
    title: "Kattu kattu",
    category: "music",
    view_count: 0,
    counts: { likes: 1, comments: 0 },
    author: {
      id: "7cd6ea3a-9c80-4f20-806f-5d08de0f914b",
      display_name: "raghu varan",
      avatar_media_id: "e13c1582-7950-46e9-8519-f0709e982cd9",
    },
    channel: {
      user_id: "7cd6ea3a-9c80-4f20-806f-5d08de0f914b",
      name: "raghu varan",
      handle: "raghuvaran",
      avatar_url: null,
    },
    media: [media()],
    ...over,
  } as FeedItem
}

/** `e6eb184f-…` "CQS final proof" — a real row with no media key at all. */
function mediaLess(): FeedItem {
  const row = video({
    id: "e6eb184f-7dbc-4327-b552-948ce18e42a3",
    title: "CQS final proof",
    text: "Final analytics round-trip",
    author: { id: "4511999b-08eb-411c-87ce-b5a0e670b641", display_name: "Cqs creator" },
    channel: undefined,
    counts: { likes: 0, comments: 0 },
  })
  delete row.media
  return row
}

describe("videoHref", () => {
  it("is zone-relative, so next/link puts the basePath on exactly once", () => {
    // "/tube/{id}" here would become "/tube/tube/{id}". Same trap that made
    // apps/reels' empty state ask for /reels/social.
    expect(videoHref({ id: "abc" })).toBe("/abc")
    expect(videoHref({ id: "abc" }).startsWith("/tube")).toBe(false)
  })
})

describe("videoTitle", () => {
  it("uses the title, which every long video on this feed has", () => {
    expect(videoTitle(video())).toBe("Kattu kattu")
  })

  it("falls back to the FIRST LINE of the description", () => {
    const row = video({ title: undefined, text: "A heading\nand a paragraph under it" })
    expect(videoTitle(row)).toBe("A heading")
  })

  it("never renders an empty heading", () => {
    expect(videoTitle(video({ title: "   ", text: "" }))).toBe("Untitled video")
    expect(videoTitle(video({ title: undefined, text: undefined }))).toBe("Untitled video")
  })
})

describe("the creator", () => {
  it("names the CHANNEL, because a long video is published by one", () => {
    // post-service answers 403 CHANNEL_REQUIRED to a long_video from an
    // account with no channel, so this is the normal path and not a bonus.
    expect(creatorName(video())).toBe("raghu varan")
    expect(creatorHandle(video())).toBe("@raghuvaran")
  })

  it("prefers the channel's name even when it differs from the author's", () => {
    const row = video({
      author: { id: "x", display_name: "Call UserB" },
      channel: { user_id: "x", name: "Call B Studio", handle: "call.userb", avatar_url: null },
    })
    expect(creatorName(row)).toBe("Call B Studio")
    expect(creatorHandle(row)).toBe("@call.userb")
  })

  it("falls back to the author for a row with no channel", () => {
    expect(creatorName(mediaLess())).toBe("Cqs creator")
  })

  it("answers no handle rather than a bare @", () => {
    // Not one author on this feed has a `username`, so this is the live case.
    expect(creatorHandle(mediaLess())).toBeNull()
    const empty = video({ channel: undefined, author: { id: "x", display_name: "A", username: "" } })
    expect(creatorHandle(empty)).toBeNull()
  })

  it("does not double the @ on a handle that already carries one", () => {
    const row = video({
      channel: { user_id: "x", name: "N", handle: "@already", avatar_url: null },
    })
    expect(creatorHandle(row)).toBe("@already")
  })

  it("says Someone rather than nothing when there is no name anywhere", () => {
    const row = video({ channel: undefined, author: { id: "x", display_name: "  " } })
    expect(creatorName(row)).toBe("Someone")
  })
})

describe("isWatchable", () => {
  it("is true for a row with a ready video", () => {
    expect(isWatchable(video())).toBe(true)
  })

  it("is FALSE for a long_video with no media — two of six live rows", () => {
    // Not is_processing, not is_scheduled. The server means to return these.
    expect(isWatchable(mediaLess())).toBe(false)
    expect(videoMedia(mediaLess())).toBeNull()
  })

  it("is false for a row whose only attachment is a picture", () => {
    const row = video({ media: [media({ kind: "image" })] })
    expect(isWatchable(row)).toBe(false)
  })
})

describe("noPictureReason", () => {
  it("is null for a ready video — there is a picture", () => {
    expect(noPictureReason(video())).toBeNull()
  })

  it("says 'missing' for a long_video with no media", () => {
    // The two CQS rows. Nothing is on its way; waiting will not help.
    expect(noPictureReason(mediaLess())).toBe("missing")
  })

  it("says 'processing' from the POST's flag even when the media looks ready", () => {
    // The order that matters: `is_processing` lives on the post and the media
    // row lags behind it. Trusting the media row here is how a black
    // rectangle with a broken-file glyph gets on screen.
    expect(noPictureReason(video({ is_processing: true }))).toBe("processing")
  })

  it("says 'processing' while the transcode is unfinished", () => {
    expect(noPictureReason(video({ media: [media({ status: "processing" })] }))).toBe("processing")
    expect(
      noPictureReason(video({ media: [media({ processing_status: "pending_upload" })] }))
    ).toBe("processing")
  })

  it("says 'moderation' for a video nothing has cleared yet", () => {
    expect(noPictureReason(video({ media: [media({ moderation_status: "pending" })] }))).toBe(
      "moderation"
    )
    expect(noPictureReason(video({ media: [media({ moderation_status: "rejected" })] }))).toBe(
      "moderation"
    )
  })

  it("says 'missing' when everything cleared and there is still no url", () => {
    const noUrl = video({
      media: [media({ hls_url: undefined, playback_url: undefined, variants: {} })],
    })
    expect(noPictureReason(noUrl)).toBe("missing")
  })
})

describe("videoPoster", () => {
  it("uses thumb_150, the only IMAGE these rows carry", () => {
    // 360p/480p/720p are transcode renditions — video/mp4 — so pickPoster
    // answers undefined for every one of them and a grid built on it would be
    // entirely blurhash.
    expect(videoPoster(videoMedia(video()), NOW)).toBe(
      "https://media-dev.example/thumb_150?X-Amz-Signature=e"
    )
  })

  it("refuses a signature that has expired", () => {
    const late = Date.parse("2026-09-09T10:01:00.000Z")
    expect(videoPoster(videoMedia(video()), late)).toBeNull()
  })

  it("refuses one about to expire mid-request", () => {
    // isExpired's 10s skew. 10:00:15 is five seconds before the deadline.
    const nearly = Date.parse("2026-09-09T10:00:15.000Z")
    expect(videoPoster(videoMedia(video()), nearly)).toBeNull()
  })

  it("still has a blurhash when the poster is gone", () => {
    const late = Date.parse("2026-09-09T10:01:00.000Z")
    expect(videoPoster(videoMedia(video()), late)).toBeNull()
    expect(videoBlurhash(videoMedia(video()))).toBe("LhE{hBs:00WBMxoftRWBjZofofWB")
  })

  it("answers nothing at all for a row with no media", () => {
    expect(videoPoster(videoMedia(mediaLess()), NOW)).toBeNull()
    expect(videoBlurhash(videoMedia(mediaLess()))).toBeNull()
  })
})

describe("videoDuration", () => {
  it("reads the row rather than guessing", () => {
    expect(videoDuration(videoMedia(video()))).toBe("3:42")
  })

  it("carries hours for a video long enough to have them", () => {
    expect(videoDuration(videoMedia(video({ media: [media({ duration_ms: 3_723_000 })] })))).toBe(
      "1:02:03"
    )
  })

  it("says nothing when the row does not", () => {
    expect(videoDuration(videoMedia(video({ media: [media({ duration_ms: 0 })] })))).toBeNull()
    expect(videoDuration(null)).toBeNull()
  })
})

describe("viewsLabel", () => {
  it("draws a zero, unlike the like count — see the note in ./video.ts", () => {
    // Every video on the dev stack is at 0 today, so this IS the live case.
    expect(viewsLabel(video())).toBe("No views yet")
  })

  it("does not say '1 views'", () => {
    expect(viewsLabel(video({ view_count: 1 }))).toBe("1 view")
  })

  it("compacts the way every other count in the product does", () => {
    expect(viewsLabel(video({ view_count: 2 }))).toBe("2 views")
    expect(viewsLabel(video({ view_count: 1234 }))).toBe("1.2K views")
    expect(viewsLabel(video({ view_count: 1_450_000 }))).toBe("1.4M views")
  })

  it("treats a missing count as no views rather than throwing", () => {
    expect(viewsLabel(video({ view_count: undefined }))).toBe("No views yet")
  })
})

describe("the badge counts", () => {
  it("draws a count only when there is one", () => {
    expect(likesLabel(video())).toBe("1")
    expect(likesLabel(video({ counts: { likes: 0, comments: 0 } }))).toBeNull()
    expect(commentsLabel(video({ counts: { likes: 0, comments: 0 } }))).toBeNull()
    expect(commentsLabel(video({ counts: { likes: 0, comments: 12 } }))).toBe("12")
  })

  it("respects an author who turned comments off", () => {
    const row = video({ no_comments: true, counts: { likes: 0, comments: 9 } })
    expect(commentsLabel(row)).toBeNull()
  })
})

describe("cardLabel", () => {
  it("names the act, the video, its place and its author in one string", () => {
    // The whole card is one link, so this is the ONLY thing announced — every
    // visible mark inside it is aria-hidden.
    expect(cardLabel(video(), 2, 6)).toBe(
      "Watch Kattu kattu, video 2 of 6, by raghu varan, 3:42"
    )
  })

  it("says Watch and not Expand", () => {
    // "Expand" is the founder's word for the control on the WATCH page. Using
    // it here would name two different acts with one word, one click apart.
    expect(cardLabel(video(), 1, 6)).toContain("Watch ")
    expect(cardLabel(video(), 1, 6)).not.toContain("Expand")
  })

  it("warns that a media-less row has nothing to play", () => {
    const label = cardLabel(mediaLess(), 3, 6)
    expect(label).toContain("CQS final proof")
    expect(label).toContain("no video attached")
  })
})

describe("showsFollow", () => {
  it("waits for the real edge rather than guessing", () => {
    // undefined is "not yet known" and is NOT "not following". A button that
    // appears on somebody you already follow and vanishes a beat later has
    // told the person in between something false.
    expect(showsFollow("viewer", "author", undefined)).toBe(false)
    expect(showsFollow("viewer", "author", "none")).toBe(true)
    expect(showsFollow("viewer", "author", "following")).toBe(true)
    expect(showsFollow("viewer", "author", "requested")).toBe(true)
  })

  it("never offers to follow yourself", () => {
    expect(showsFollow("me", "me", "none")).toBe(false)
  })

  it("draws nothing for a signed-out browser or an authorless row", () => {
    expect(showsFollow(null, "author", "none")).toBe(false)
    expect(showsFollow("viewer", undefined, "none")).toBe(false)
  })
})
