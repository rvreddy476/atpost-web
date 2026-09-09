import { describe, expect, it } from "vitest"
import {
  contentTypeOf,
  hashtagLabel,
  itemsOf,
  mediaFromRow,
  MAX_QUERY_BYTES,
  nextCursorOf,
  normalizeQuery,
  personHandle,
  personName,
  queryTooLong,
  rowToFeedItem,
  signedUrlExpiry,
  type SearchPostRow,
  type SearchUserRow,
} from "./contract"
import { HASHTAG_DESTINATION, isReachable, PERSON_DESTINATION } from "./destinations"

/**
 * What is worth asserting about a search page, and what is not.
 *
 * Not: that a card renders, or that a heading says the right words. Those are
 * a browser's job and they were checked in one.
 *
 * These cover the four things that would ship as silent bugs — no exception,
 * no log, a page that looks fine:
 *
 *   1. The query gate. The service measures BYTES; JavaScript measures UTF-16
 *      units. Get it wrong and either a valid search is refused locally or an
 *      invalid one comes back 400 with nothing on screen to explain it.
 *   2. The row → card mapping. Every field is either copied or deliberately
 *      absent, and "deliberately absent" is exactly the kind of thing that
 *      turns into an invented default during a later edit.
 *   3. The expiry parse. It is arithmetic on a string, it is unobservable for
 *      five minutes, and when it is wrong the symptom is a picture that
 *      disappears on a page nobody is still looking at.
 *   4. The unreachable-destination invariant, which is the same one
 *      `@momentum/chrome`'s destinations.test.ts asserts for navigation: a result is
 *      either a link somewhere real or a control that says why it is not, and
 *      never something in between.
 *
 * The fixtures are trimmed copies of real rows from `GET /v1/search` on the
 * running gateway, signed URL and all — not shapes invented to match the code.
 */

/** A live row: a flick with a video attachment. */
const VIDEO_ROW: SearchPostRow = {
  id: "80951618-2348-4c37-9990-64b392b53294",
  post_id: "80951618-2348-4c37-9990-64b392b53294",
  author_id: "66668bc2-a3f6-40a5-9cdd-c998dcf72f29",
  author: {
    id: "66668bc2-a3f6-40a5-9cdd-c998dcf72f29",
    username: "",
    display_name: "Call UserB",
    avatar_url: null,
  },
  text: "Reel pipeline test over the LAN",
  title: "Pipeline test",
  content_type: "flick",
  post_type: "flick",
  visibility: "public",
  like_count: 0,
  comment_count: 0,
  engagement_score: 0,
  created_at: "2026-09-04T10:17:48.503826+05:30",
  duration_ms: 4000,
  media_id: "bc4dc2ac-b647-4e2c-b782-e35e022c9e25",
  media_kind: "video",
  playback_url: "/v1/media/bc4dc2ac-b647-4e2c-b782-e35e022c9e25/hls/master.m3u8",
  thumbnail_url:
    "https://media-dev.cleestudio.com/media/user/66668bc2/bc4dc2ac/thumb_150" +
    "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260908T181155Z&X-Amz-Expires=300",
}

/** A live row: a plain text post with no attachment. */
const TEXT_ROW: SearchPostRow = {
  id: "5fcc71f0-0f2c-4282-87eb-e2cd881cabf7",
  post_id: "5fcc71f0-0f2c-4282-87eb-e2cd881cabf7",
  author_id: "2d598287-eee7-40b4-a7f5-b46b9412e4e7",
  author: {
    id: "2d598287-eee7-40b4-a7f5-b46b9412e4e7",
    username: "call.usera",
    display_name: "Call Usera",
    avatar_url: null,
  },
  text: "Starting the morning with hot filter coffee.",
  content_type: "post",
  post_type: "post",
  visibility: "public",
  like_count: 3,
  comment_count: 1,
  engagement_score: 0,
  created_at: "2026-08-29T18:13:58.536857+05:30",
  playback_url: null,
  thumbnail_url: null,
}

describe("the query gate", () => {
  it("trims, because the service does before deciding a query is empty", () => {
    expect(normalizeQuery("  coffee  ")).toBe("coffee")
    expect(normalizeQuery(null)).toBe("")
    expect(normalizeQuery(undefined)).toBe("")
    expect(normalizeQuery("   ")).toBe("")
  })

  it("allows exactly the service's ceiling and refuses one byte past it", () => {
    expect(queryTooLong("a".repeat(MAX_QUERY_BYTES))).toBe(false)
    expect(queryTooLong("a".repeat(MAX_QUERY_BYTES + 1))).toBe(true)
  })

  it("counts BYTES, not characters — Go's len() is what rejects the request", () => {
    // 200 four-byte emoji: 800 bytes to the service, 400 UTF-16 units to
    // String.length. A .length check would send this and be answered 400.
    const emoji = "😀".repeat(200)
    expect(emoji.length).toBeLessThan(MAX_QUERY_BYTES)
    expect(queryTooLong(emoji)).toBe(true)

    // And the reverse: 400 three-byte characters is 1200 bytes, still refused,
    // while 160 of them is 480 bytes and must be allowed through.
    expect(queryTooLong("ಕ".repeat(160))).toBe(false)
    expect(queryTooLong("ಕ".repeat(400))).toBe(true)
  })
})

describe("what kind of thing a row is", () => {
  it("takes content_type as authoritative", () => {
    expect(contentTypeOf(VIDEO_ROW)).toBe("flick")
    expect(contentTypeOf(TEXT_ROW)).toBe("post")
  })

  it("maps the legacy spellings the index still holds", () => {
    // ContentTypesForKind in search-service says both pairs exist in the data.
    expect(contentTypeOf({ ...TEXT_ROW, content_type: "video" })).toBe("long_video")
    expect(contentTypeOf({ ...TEXT_ROW, content_type: "reel" })).toBe("flick")
  })

  it("falls back to post_type, then to post, for documents written before the field", () => {
    expect(contentTypeOf({ ...TEXT_ROW, content_type: undefined, post_type: "long_video" })).toBe(
      "long_video"
    )
    expect(contentTypeOf({ ...TEXT_ROW, content_type: undefined, post_type: undefined })).toBe("post")
    // An unknown string is not passed through as one — the card would not
    // recognise it and would silently render the wrong shape.
    expect(contentTypeOf({ ...TEXT_ROW, content_type: "livestream" })).toBe("post")
  })

  it("never infers the kind from whether media is attached", () => {
    // A long_video with no media array is a real thing this corpus contains.
    const bare = { ...TEXT_ROW, content_type: "long_video", media_id: undefined }
    expect(contentTypeOf(bare)).toBe("long_video")
    expect(mediaFromRow(bare)).toEqual([])
  })
})

describe("when a signed URL stops working", () => {
  it("reads the deadline out of the signature", () => {
    // 20260908T181155Z + 300s.
    expect(signedUrlExpiry(VIDEO_ROW.thumbnail_url)).toBe("2026-09-08T18:16:55.000Z")
  })

  it("says nothing for a URL that carries no deadline", () => {
    expect(signedUrlExpiry(null)).toBeUndefined()
    expect(signedUrlExpiry(undefined)).toBeUndefined()
    expect(signedUrlExpiry("/v1/media/abc/hls/master.m3u8")).toBeUndefined()
    expect(signedUrlExpiry("https://cdn.example/x?X-Amz-Date=20260908T181155Z")).toBeUndefined()
    expect(signedUrlExpiry("https://cdn.example/x?X-Amz-Expires=300")).toBeUndefined()
  })

  it("says nothing rather than guessing when the stamp is malformed", () => {
    expect(
      signedUrlExpiry("https://cdn.example/x?X-Amz-Date=2026-09-08T18:11:55Z&X-Amz-Expires=300")
    ).toBeUndefined()
    expect(
      signedUrlExpiry("https://cdn.example/x?X-Amz-Date=20260908T181155Z&X-Amz-Expires=nope")
    ).toBeUndefined()
  })
})

describe("a row becomes an attachment", () => {
  it("files the one resolved URL under a name every picker looks for", () => {
    const [media] = mediaFromRow(VIDEO_ROW)
    // thumb_150 is the only name in IMAGE_PREFERENCE, THUMB_PREFERENCE and
    // POSTER_PREFERENCE all three.
    expect(media.variants).toEqual({ thumb_150: VIDEO_ROW.thumbnail_url })
    expect(media.expires_at).toBe("2026-09-08T18:16:55.000Z")
  })

  it("gives a video its playlist and its length, and claims no transcode state", () => {
    const [media] = mediaFromRow(VIDEO_ROW)
    expect(media.kind).toBe("video")
    expect(media.hls_url).toBe("/v1/media/bc4dc2ac-b647-4e2c-b782-e35e022c9e25/hls/master.m3u8")
    expect(media.playback_kind).toBe("hls")
    expect(media.duration_ms).toBe(4000)
    // The index carries no status. Absent is what @momentum/player reads as
    // "the source did not say"; "ready" would be an assertion nothing made.
    expect(media.status).toBeUndefined()
    expect(media.processing_status).toBeUndefined()
    expect(media.moderation_status).toBeUndefined()
  })

  it("treats a row with no media id as having no attachment", () => {
    expect(mediaFromRow(TEXT_ROW)).toEqual([])
  })

  it("drops an attachment media-service declined to resolve", () => {
    // A media id with neither a poster nor a playback url is nothing to draw
    // and nothing to play — an empty black frame, if it were kept.
    expect(
      mediaFromRow({ ...VIDEO_ROW, thumbnail_url: null, playback_url: null })
    ).toEqual([])
  })

  it("calls an attachment an image when nothing says otherwise", () => {
    const [media] = mediaFromRow({
      ...TEXT_ROW,
      media_id: "img-1",
      thumbnail_url: "https://cdn.example/small_480",
    })
    expect(media.kind).toBe("image")
    expect(media.hls_url).toBeUndefined()
  })
})

describe("a row becomes a card", () => {
  it("carries every field the card draws", () => {
    const item = rowToFeedItem(VIDEO_ROW)
    expect(item.id).toBe(VIDEO_ROW.post_id)
    expect(item.author_id).toBe(VIDEO_ROW.author_id)
    expect(item.content_type).toBe("flick")
    expect(item.created_at).toBe(VIDEO_ROW.created_at)
    expect(item.title).toBe("Pipeline test")
    expect(item.text).toBe("Reel pipeline test over the LAN")
    expect(item.media).toHaveLength(1)
  })

  it("copies the index's counts and invents none", () => {
    expect(rowToFeedItem(TEXT_ROW).counts).toEqual({ likes: 3, comments: 1 })
  })

  it("leaves viewer state unset, because the index holds none", () => {
    const item = rowToFeedItem(TEXT_ROW)
    expect(item.has_reacted).toBeUndefined()
    expect(item.is_bookmarked).toBeUndefined()
    // And no reason line: this endpoint's ranker writes none, and the card
    // must never compose one of its own.
    expect(item.reason_text).toBeUndefined()
  })

  it("omits an empty username rather than promising a handle", () => {
    // Most accounts in this corpus index with username: "". An empty string
    // set on the author would render as "@" under the name.
    expect(rowToFeedItem(VIDEO_ROW).author).toEqual({ display_name: "Call UserB", id: VIDEO_ROW.author_id })
    expect(rowToFeedItem(TEXT_ROW).author?.username).toBe("call.usera")
  })

  it("omits an empty hashtag list rather than sending an empty tag row", () => {
    expect(rowToFeedItem(TEXT_ROW).hashtags).toBeUndefined()
    expect(rowToFeedItem({ ...TEXT_ROW, hashtags: ["coffee"] }).hashtags).toEqual(["coffee"])
  })

  it("survives a row with no author at all", () => {
    // results.go always sets one, but it is a pointer on the wire and a card
    // that throws on a null author is a blank results page.
    expect(rowToFeedItem({ ...TEXT_ROW, author: null }).author).toBeUndefined()
  })
})

describe("naming a person", () => {
  const user = (over: Partial<SearchUserRow>): SearchUserRow => ({
    user_id: "u1",
    username: "",
    display_name: "",
    is_verified: false,
    engagement_score: 0,
    ...over,
  })

  it("prefers the display name", () => {
    expect(personName(user({ display_name: "Call UserB", username: "callb" }))).toBe("Call UserB")
  })

  it("falls back to the handle, and then to a word that is not blank", () => {
    expect(personName(user({ username: "callb" }))).toBe("@callb")
    expect(personName(user({}))).toBe("Someone")
  })

  it("never renders a bare @", () => {
    expect(personHandle(user({ username: "" }))).toBeNull()
    expect(personHandle(user({ username: "   " }))).toBeNull()
    expect(personHandle(user({ username: "callb" }))).toBe("@callb")
  })
})

describe("reading a bucket", () => {
  it("treats an absent, empty or null cursor as the last page", () => {
    // All three occur: omitempty on the wire, `string | null` in the shared
    // type, and "" from the store when it has nothing more.
    expect(nextCursorOf(undefined)).toBeNull()
    expect(nextCursorOf({ items: [] })).toBeNull()
    expect(nextCursorOf({ items: [], next_cursor: null })).toBeNull()
    expect(nextCursorOf({ items: [], next_cursor: "" })).toBeNull()
    expect(nextCursorOf({ items: [], next_cursor: "3" })).toBe("3")
  })

  it("treats a missing bucket as no rows, not as a failure", () => {
    expect(itemsOf(undefined)).toEqual([])
    expect(itemsOf({})).toEqual([])
    expect(itemsOf({ items: [1, 2] })).toEqual([1, 2])
  })

  it("puts exactly one hash on a tag", () => {
    expect(hashtagLabel({ hashtag: "coffee", use_count: 1, engagement_score: 0 })).toBe("#coffee")
    expect(hashtagLabel({ hashtag: "#coffee", use_count: 1, engagement_score: 0 })).toBe("#coffee")
  })
})

describe("results that cannot be opened", () => {
  /*
   * The same invariant @momentum/chrome's destinations.test.ts asserts for navigation, for
   * the same reason: `href: null` with no reason renders a dead row with no
   * explanation, and a reason ALONGSIDE an href renders an excuse under a
   * working link. Both are silent.
   */
  it.each([
    ["person", PERSON_DESTINATION],
    ["hashtag", HASHTAG_DESTINATION],
  ])("%s: is not reachable, and says why", (_name, destination) => {
    expect(isReachable(destination)).toBe(false)
    expect(destination.href).toBeNull()
    expect(destination.unavailableReason).toBeTruthy()
  })

  it("would be reachable the moment an href appears", () => {
    // The predicate is the whole safety property, so it is worth proving it
    // is not simply hardcoded to false.
    expect(isReachable({ href: "/social/u/someone", unavailableReason: null })).toBe(true)
    expect(isReachable({ href: "", unavailableReason: null })).toBe(false)
  })
})
