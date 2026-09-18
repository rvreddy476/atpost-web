import { describe, expect, it } from "vitest"
import {
  DRAFT_POST_TYPE,
  fromDraftPayload,
  LOCAL_ONLY_FIELDS,
  localDraftKey,
  mergeLocalHalf,
  toDraftPayload,
  toLocalHalf,
} from "./draftPayload"
import { emptyDraft, type VideoDraft } from "./fields"

function draft(overrides: Partial<VideoDraft> = {}): VideoDraft {
  return {
    ...emptyDraft(),
    title: "A perfectly ordinary title",
    category: "education",
    madeForKids: false,
    ...overrides,
  }
}

/**
 * The exact key set `PostDraftPayload` declares, read out of
 * post-service/internal/service/post_drafts.go on 2026-09-18.
 *
 * `parseDraftPayload` decodes with `DisallowUnknownFields`, so a key outside
 * this set is 400 INVALID_DRAFT for the whole save — silently, in the
 * background, for everybody. That is why the set is asserted rather than
 * trusted.
 */
const SERVER_PAYLOAD_KEYS = new Set([
  "text",
  "visibility",
  "content_type",
  "media_ids",
  "alt_texts",
  "poll",
  "rich_text",
  "no_comments",
  "no_likes",
  "location_name",
  "location_lat",
  "location_lng",
  "feeling",
  "activity",
  "activity_detail",
  "language",
  "title",
  "distribution",
  "cover_frame_ms",
  "filter",
  "audio_track_id",
  "cover_media_id",
  "tags",
  "category",
  "paid_promotion",
  "is_made_for_kids",
  "altered_content",
  "hide_share",
  "allow_download",
  "tagged_user_ids",
])

describe("toDraftPayload — the closed key set", () => {
  it("emits no key the server would refuse", () => {
    const payload = toDraftPayload(
      draft({
        seoTitle: "search title",
        hashtags: ["howto"],
        mentions: ["ravi"],
        license: "creative_commons",
        remixSetting: "disallow",
        recordingLocation: "Hyderabad",
      }),
      "media-1",
      "cover-1"
    )
    const unknown = Object.keys(payload).filter((key) => !SERVER_PAYLOAD_KEYS.has(key))
    expect(unknown).toEqual([])
  })

  it("posts as `video`, which is in validDraftPostTypes — `long_video` is not", () => {
    expect(DRAFT_POST_TYPE).toBe("video")
  })

  it("names the real kind in the payload, where publishDraftRow reads it", () => {
    expect(toDraftPayload(draft(), "m", null).content_type).toBe("long_video")
  })
})

describe("toDraftPayload — what it carries", () => {
  it("registers the media id, which is what protects the upload", () => {
    expect(toDraftPayload(draft(), "media-1", null).media_ids).toEqual(["media-1"])
  })

  it("omits media_ids when nothing has been reserved yet", () => {
    // `validateDraft` on the server refuses a payload with neither text nor
    // media, so an empty array would be a save that always 400s.
    expect(toDraftPayload(draft(), null, null)).not.toHaveProperty("media_ids")
  })

  it("omits the cover until one is uploaded", () => {
    expect(toDraftPayload(draft(), "m", null)).not.toHaveProperty("cover_media_id")
    expect(toDraftPayload(draft(), "m", "c").cover_media_id).toBe("c")
  })

  it("normalises the category, exactly as the draft PATCH will anyway", () => {
    expect(toDraftPayload(draft({ category: "Home Repair" }), "m", null).category).toBe(
      "home-repair"
    )
  })

  it("carries the distribution policy the create will send", () => {
    const payload = toDraftPayload(draft({ mainFeed: false, notifySubscribers: false }), "m", null)
    expect(payload.distribution).toEqual({
      version: 1,
      main_feed: false,
      notify_subscribers: false,
    })
  })

  it("inverts the comment and like switches the same way the create does", () => {
    const off = toDraftPayload(draft({ commentsMode: "off", allowLikes: false }), "m", null)
    expect(off.no_comments).toBe(true)
    expect(off.no_likes).toBe(true)
  })
})

describe("fromDraftPayload", () => {
  it("round-trips the fields the payload can hold", () => {
    const original = draft({
      title: "Rebuilding a lathe",
      description: "Six weekends.",
      visibility: "unlisted",
      category: "tech",
      language: "hi",
      tags: ["lathe", "restoration"],
      madeForKids: true,
      paidPromotion: true,
      alteredContent: true,
      allowLikes: false,
      hideShare: true,
      allowDownload: false,
      mainFeed: false,
      notifySubscribers: false,
    })
    const { draft: back, mediaId, coverMediaId } = fromDraftPayload(
      toDraftPayload(original, "media-9", "cover-9")
    )

    expect(mediaId).toBe("media-9")
    expect(coverMediaId).toBe("cover-9")
    expect(back.title).toBe("Rebuilding a lathe")
    expect(back.description).toBe("Six weekends.")
    expect(back.visibility).toBe("unlisted")
    expect(back.category).toBe("tech")
    expect(back.language).toBe("hi")
    expect(back.tags).toEqual(["lathe", "restoration"])
    expect(back.madeForKids).toBe(true)
    expect(back.paidPromotion).toBe(true)
    expect(back.alteredContent).toBe(true)
    expect(back.allowLikes).toBe(false)
    expect(back.hideShare).toBe(true)
    expect(back.allowDownload).toBe(false)
    expect(back.mainFeed).toBe(false)
    expect(back.notifySubscribers).toBe(false)
  })

  it("never restores a made-for-kids answer nobody gave", () => {
    // The payload cannot say "unanswered", and `false` would be a filed legal
    // declaration made by a round trip rather than by a person. So anything
    // but an explicit `true` comes back unanswered and the validator holds.
    const { draft: back } = fromDraftPayload(
      toDraftPayload(draft({ madeForKids: false }), "m", null)
    )
    expect(back.madeForKids).toBeNull()
  })

  it("falls back to the empty draft rather than to zeros", () => {
    const { draft: back } = fromDraftPayload({})
    expect(back).toEqual(emptyDraft())
  })

  it("survives a payload that is not an object at all", () => {
    expect(fromDraftPayload(null).draft).toEqual(emptyDraft())
    expect(fromDraftPayload("nonsense").mediaId).toBeNull()
  })

  it("ignores a visibility outside the four the server takes", () => {
    const { draft: back } = fromDraftPayload({ visibility: "secret" })
    expect(back.visibility).toBe("public")
  })
})

describe("the local half", () => {
  it("names every field the server payload cannot carry", () => {
    expect([...LOCAL_ONLY_FIELDS]).toEqual([
      "seoTitle",
      "license",
      "allowEmbedding",
      "remixSetting",
      "commentsMode",
      "commentAccess",
      "recordingDate",
      "recordingLocation",
      "hashtags",
      "mentions",
      "seriesId",
      "seriesEpisodeNum",
    ])
  })

  it("round-trips through the merge", () => {
    const original = draft({
      seoTitle: "Lathe restoration",
      license: "creative_commons",
      allowEmbedding: false,
      remixSetting: "allow_audio_only",
      commentsMode: "review",
      commentAccess: "followers",
      recordingDate: "2026-08-01",
      recordingLocation: "Hyderabad",
      hashtags: ["lathe"],
      mentions: ["ravi.k"],
      seriesId: "series-1",
      seriesEpisodeNum: 3,
    })
    const merged = mergeLocalHalf(emptyDraft(), toLocalHalf(original))
    for (const field of LOCAL_ONLY_FIELDS) {
      expect(merged[field]).toEqual(original[field])
    }
  })

  it("drops a value that is no longer in the vocabulary", () => {
    // `"deny"` is what an earlier pass of ./fields.ts offered and it fails the
    // reel_drafts CHECK. A stale localStorage value must not be carried
    // forward into the next save.
    const merged = mergeLocalHalf(emptyDraft(), { remixSetting: "deny", license: "cc-by" })
    expect(merged.remixSetting).toBe("allow")
    expect(merged.license).toBe("standard")
  })

  it("drops a comment access the studio does not offer", () => {
    expect(mergeLocalHalf(emptyDraft(), { commentAccess: "nobody" }).commentAccess).toBe("everyone")
  })

  it("ignores a stored value of the wrong type", () => {
    const merged = mergeLocalHalf(emptyDraft(), {
      seoTitle: 42,
      hashtags: ["ok", 7, null],
      seriesEpisodeNum: 1.5,
    })
    expect(merged.seoTitle).toBe("")
    expect(merged.hashtags).toEqual(["ok"])
    expect(merged.seriesEpisodeNum).toBeNull()
  })

  it("survives a stored value that is not an object", () => {
    expect(mergeLocalHalf(emptyDraft(), "nonsense")).toEqual(emptyDraft())
    expect(mergeLocalHalf(emptyDraft(), null)).toEqual(emptyDraft())
  })

  it("namespaces the storage key by draft id", () => {
    expect(localDraftKey("abc")).toBe("momentum.tube.studio.draft.abc")
    expect(localDraftKey("abc")).not.toBe(localDraftKey("abd"))
  })
})
