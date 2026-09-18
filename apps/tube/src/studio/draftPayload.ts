/**
 * The draft, as `/v1/posts/drafts` will hold it — and the honest account of
 * what it will not.
 *
 * Pure. No React, no network, no storage, so the two directions can be
 * asserted key by key in ./draftPayload.test.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PAYLOAD IS A CLOSED SET AND AN UNKNOWN KEY IS A 400.
 *
 * post-service `parseDraftPayload` (internal/service/post_drafts.go, read
 * 2026-09-18) decodes into `PostDraftPayload` with `DisallowUnknownFields`.
 * One key it does not recognise and the whole save is 400 INVALID_DRAFT — not
 * the key dropped, the save refused. So `toDraftPayload` below emits ONLY the
 * keys in that struct, and the list is written out rather than derived,
 * because the cost of being wrong is that autosave fails silently for
 * everybody.
 *
 * The keys it accepts:
 *
 *     text · visibility · content_type · media_ids · alt_texts · poll ·
 *     rich_text · no_comments · no_likes · location_name · location_lat ·
 *     location_lng · feeling · activity · activity_detail · language ·
 *     title · distribution · cover_frame_ms · filter · audio_track_id ·
 *     cover_media_id · tags · category · paid_promotion · is_made_for_kids ·
 *     altered_content · hide_share · allow_download · tagged_user_ids
 *
 * ── The eleven fields this studio has and that list does not ──────────────
 *
 *     seo_title · license · allow_embedding · remix_setting ·
 *     comment_moderation · comment_access · recording_date ·
 *     recording_location · hashtags · mentions · the series attachment
 *
 * There is no key to put them under. `alt_texts` is a free-form
 * `map[string]string` and would physically hold them, and using it that way
 * would be putting studio state in a field named for accessibility text,
 * where the next person to read `alt_texts` finds a licence id in it. So they
 * are not sent, and `LOCAL_ONLY_FIELDS` names them for ./useDraftAutosave.ts,
 * which keeps them in this browser alongside the server draft and says on
 * screen which half came back from where.
 *
 * ── Why `publish_to_feed` is not in that list even though it is missing ───
 * It is carried as `distribution.main_feed`, which IS a payload key and which
 * the server treats as authoritative anyway. One of the two spellings
 * survives, which is enough.
 */

import type { DistributionPolicy } from "@/tube/uploadApi"
import {
  COMMENTS_MODE_OPTIONS,
  commentWire,
  emptyDraft,
  LICENSE_OPTIONS,
  normaliseCategory,
  REMIX_OPTIONS,
  type CommentsMode,
  type VideoDraft,
  type Visibility,
} from "./fields"

/**
 * `post_type`, and it is `"video"` rather than anything more descriptive.
 *
 * `validDraftPostTypes` is `post | poll | article | reel | video`. There is no
 * `long_video`, and a value outside the set is 400 INVALID_DRAFT. The payload's
 * own `content_type: "long_video"` is what carries the real kind — and it is
 * read: `publishDraftRow` maps `content_type == "long_video"` to
 * `post_type: "video"` itself.
 */
export const DRAFT_POST_TYPE = "video"

/** Named for the autosave hook, and for the sentence it puts on screen. */
export const LOCAL_ONLY_FIELDS = [
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
] as const satisfies readonly (keyof VideoDraft)[]

/** The payload, exactly. `Record<string, unknown>` is what the api takes. */
export function toDraftPayload(
  draft: VideoDraft,
  mediaId: string | null,
  coverMediaId: string | null
): Record<string, unknown> {
  const comments = commentWire(draft.commentsMode)
  const distribution: DistributionPolicy = {
    version: 1,
    main_feed: draft.mainFeed,
    notify_subscribers: draft.notifySubscribers,
  }

  const payload: Record<string, unknown> = {
    content_type: "long_video",
    title: draft.title,
    text: draft.description,
    visibility: draft.visibility,
    language: draft.language,
    category: normaliseCategory(draft.category),
    tags: draft.tags,
    is_made_for_kids: draft.madeForKids === true,
    paid_promotion: draft.paidPromotion,
    altered_content: draft.alteredContent,
    no_comments: comments.no_comments,
    no_likes: !draft.allowLikes,
    hide_share: draft.hideShare,
    allow_download: draft.allowDownload,
    distribution,
  }

  // `media_ids` is what makes the draft worth having: writing it registers the
  // asset in `draft_media`, which is the reference that stops the upload being
  // swept while somebody is away from the form. Omitted rather than sent empty
  // when there is nothing yet — and `validateDraft` refuses a payload with
  // neither text nor media, which is why ./useDraftAutosave.ts does not even
  // try to save before the id exists.
  if (mediaId) payload.media_ids = [mediaId]
  if (coverMediaId) payload.cover_media_id = coverMediaId

  return payload
}

/**
 * The draft, read back out of a payload the server returned.
 *
 * Everything unrecognised falls back to `emptyDraft()`'s value rather than to
 * a zero: a payload written by a future studio, or by the phone's composer,
 * is a legitimate thing to open here and it should come up as a filled form
 * with some blanks, not as a form full of falses that somebody then publishes.
 *
 * The local half (`LOCAL_ONLY_FIELDS`) is merged in by the caller, after this.
 */
export function fromDraftPayload(payload: unknown): {
  draft: VideoDraft
  mediaId: string | null
  coverMediaId: string | null
} {
  const base = emptyDraft()
  if (typeof payload !== "object" || payload === null) {
    return { draft: base, mediaId: null, coverMediaId: null }
  }
  const p = payload as Record<string, unknown>

  const str = (key: string, fallback: string): string =>
    typeof p[key] === "string" ? (p[key] as string) : fallback
  const bool = (key: string, fallback: boolean): boolean =>
    typeof p[key] === "boolean" ? (p[key] as boolean) : fallback
  const strings = (key: string): string[] =>
    Array.isArray(p[key]) ? (p[key] as unknown[]).filter((v): v is string => typeof v === "string") : []

  const visibility = str("visibility", base.visibility)
  const distribution =
    typeof p.distribution === "object" && p.distribution !== null
      ? (p.distribution as Record<string, unknown>)
      : {}

  const draft: VideoDraft = {
    ...base,
    title: str("title", base.title),
    description: str("text", base.description),
    visibility: isVisibility(visibility) ? visibility : base.visibility,
    language: str("language", base.language),
    category: normaliseCategory(str("category", base.category)),
    tags: strings("tags"),

    // A saved draft carries the answer or it carries `false`, and those are
    // different things — `false` here would be a filed declaration nobody
    // made. The payload cannot express "unanswered", so only `true` is
    // trusted and anything else comes back as the unanswered `null` the
    // validator refuses to publish.
    madeForKids: p.is_made_for_kids === true ? true : null,
    paidPromotion: bool("paid_promotion", base.paidPromotion),
    alteredContent: bool("altered_content", base.alteredContent),

    allowLikes: !bool("no_likes", !base.allowLikes),
    hideShare: bool("hide_share", base.hideShare),
    allowDownload: bool("allow_download", base.allowDownload),
    commentsMode: bool("no_comments", false) ? "off" : base.commentsMode,

    mainFeed:
      typeof distribution.main_feed === "boolean" ? distribution.main_feed : base.mainFeed,
    notifySubscribers:
      typeof distribution.notify_subscribers === "boolean"
        ? distribution.notify_subscribers
        : base.notifySubscribers,
  }

  const mediaIds = strings("media_ids")
  const cover = typeof p.cover_media_id === "string" ? p.cover_media_id : null

  return { draft, mediaId: mediaIds[0] ?? null, coverMediaId: cover }
}

function isVisibility(value: string): value is Visibility {
  return value === "public" || value === "unlisted" || value === "followers" || value === "private"
}

/* ── The local half ───────────────────────────────────────────────────────── */

/**
 * The fields the server payload cannot carry, kept in this browser.
 *
 * ── localStorage, with its eyes open ──────────────────────────────────────
 * It is per-browser, so a draft opened on another machine comes back with
 * these at their defaults — which the studio SAYS, rather than letting
 * somebody discover that their licence choice quietly reset. That is a worse
 * outcome than the server holding them and a much better one than dropping
 * them, and the alternative (smuggling them through `alt_texts`) is a lie in
 * the data.
 *
 * Nothing here is sensitive: it is a licence id, a comment rule and a
 * recording location.
 */
export function localDraftKey(draftId: string): string {
  return `momentum.tube.studio.draft.${draftId}`
}

export type LocalDraftHalf = Pick<VideoDraft, (typeof LOCAL_ONLY_FIELDS)[number]>

export function toLocalHalf(draft: VideoDraft): LocalDraftHalf {
  return {
    seoTitle: draft.seoTitle,
    license: draft.license,
    allowEmbedding: draft.allowEmbedding,
    remixSetting: draft.remixSetting,
    commentsMode: draft.commentsMode,
    commentAccess: draft.commentAccess,
    recordingDate: draft.recordingDate,
    recordingLocation: draft.recordingLocation,
    hashtags: draft.hashtags,
    mentions: draft.mentions,
    seriesId: draft.seriesId,
    seriesEpisodeNum: draft.seriesEpisodeNum,
  }
}

/**
 * Merge a stored local half onto a draft, discarding anything that is not the
 * shape it should be.
 *
 * Validated rather than spread: `localStorage` is user-writable and survives
 * a deploy, so the value under this key may be last month's shape, or
 * somebody's experiment. A `remixSetting` of `"deny"` — the value an earlier
 * pass of ./fields.ts offered — would fail the draft table's CHECK on the very
 * next save, so it is dropped here rather than carried forward.
 */
export function mergeLocalHalf(draft: VideoDraft, stored: unknown): VideoDraft {
  if (typeof stored !== "object" || stored === null) return draft
  const s = stored as Record<string, unknown>
  const next = { ...draft }

  if (typeof s.seoTitle === "string") next.seoTitle = s.seoTitle
  if (typeof s.recordingDate === "string") next.recordingDate = s.recordingDate
  if (typeof s.recordingLocation === "string") next.recordingLocation = s.recordingLocation
  if (typeof s.allowEmbedding === "boolean") next.allowEmbedding = s.allowEmbedding

  if (LICENSE_OPTIONS.some((o) => o.value === s.license)) next.license = s.license as string
  if (REMIX_OPTIONS.some((o) => o.value === s.remixSetting)) {
    next.remixSetting = s.remixSetting as string
  }
  if (COMMENTS_MODE_OPTIONS.some((o) => o.value === s.commentsMode)) {
    next.commentsMode = s.commentsMode as CommentsMode
  }
  if (s.commentAccess === "everyone" || s.commentAccess === "followers") {
    next.commentAccess = s.commentAccess
  }

  if (Array.isArray(s.hashtags)) {
    next.hashtags = s.hashtags.filter((v): v is string => typeof v === "string")
  }
  if (Array.isArray(s.mentions)) {
    next.mentions = s.mentions.filter((v): v is string => typeof v === "string")
  }
  if (typeof s.seriesId === "string") next.seriesId = s.seriesId
  if (typeof s.seriesEpisodeNum === "number" && Number.isInteger(s.seriesEpisodeNum)) {
    next.seriesEpisodeNum = s.seriesEpisodeNum
  }

  return next
}
