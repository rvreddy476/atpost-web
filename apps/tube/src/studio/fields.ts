/**
 * The draft a creator fills in, what makes it valid, and how it becomes the
 * create body.
 *
 * Pure. No React, no network — so the mapping from "what the form said" to
 * "what goes on the wire" is a table that can be asserted field by field, and
 * ./fields.test.ts does exactly that.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERYTHING HERE IS SETTABLE ONLY AT CREATE
 *
 * There is no generic post-update endpoint on this gateway. `PATCH
 * /v1/videos/{id}/category` moves one column and nothing moves the others. So
 * a creator who ticks the wrong compliance box cannot fix it — they delete the
 * video and upload it again. That fact is why this form is a stepped studio
 * with a review at the end rather than a wall of controls with a Post button,
 * and why ./StepSettings.tsx says so on screen instead of leaving it to be
 * found out.
 *
 * ── Where the vocabulary comes from ───────────────────────────────────────
 * The phone's create surface (feature/post/.../createhub/ReelSurface.kt)
 * carries FOUR of these: "Allow comments", "Hide share button", "Allow
 * download", and — for reels only — "Allow remix". Its wording is used
 * verbatim for those four. Everything else on this screen has no phone
 * wording to match, because the phone does not offer it: `CreatePostWireTest`
 * actively asserts that `paid_promotion`, `altered_content`,
 * `is_made_for_kids`, `license`, `publish_to_feed` and the rest never reach
 * the wire from Android. The server has always had the columns. This is the
 * first client that fills them, which is the whole of the founder's
 * "it's for children, or like, all these things require compliances".
 */

import type { CreateLongVideoRequest } from "@/tube/uploadApi"

/* ── Visibility ───────────────────────────────────────────────────────────── */

export type Visibility = "public" | "followers" | "private" | "unlisted"

/**
 * The four the server takes, with the phone's three descriptions.
 *
 * `oneof public followers private unlisted`, verified: `"secret"` is 400
 * INVALID_REQUEST and omitting the field is 400 on the `required` tag.
 *
 * ── Unlisted is offered here and not on the phone ─────────────────────────
 * The Android audience sheet has three rows and deliberately leaves unlisted
 * out. That is right for a reel, which is a discovery format; it is wrong for
 * long video, where "here is a link, it is not on my channel" is one of the
 * things people came for. The description is this app's own, since there is
 * no phone string to copy.
 */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone on Momentum" },
  { value: "unlisted", label: "Unlisted", hint: "Anyone with the link" },
  { value: "followers", label: "Followers", hint: "People who follow you" },
  { value: "private", label: "Private", hint: "Only you" },
]

/* ── Category ─────────────────────────────────────────────────────────────── */

/**
 * The taxonomy, when `GET /v1/posts/categories` cannot be reached.
 *
 * ── This column is free text, and the studio still offers a list ──────────
 * `category` on a long video is NOT validated against the taxonomy — verified
 * by storing "Technology" and "Education" verbatim, neither of which is a
 * taxonomy id. So a text box would work.
 *
 * It is a list anyway, and the reason is the phone. Android's long-video form
 * requires a category and offers exactly these ids, lowercase
 * (`ReelSupport.kt`). A web studio that let people type "Tech", "tech",
 * "Technology" and "TECH" would fill one column with four spellings of one
 * category and quietly break every filter built on it later — including the
 * chip rail this zone already draws, which sends `?category=` as a slug.
 *
 * The server's own list wins when it loads; this is the fallback, and it is
 * the same list the phone falls back to.
 */
export const FALLBACK_CATEGORIES: { id: string; label: string }[] = [
  { id: "comedy", label: "Comedy" },
  { id: "music", label: "Music" },
  { id: "dance", label: "Dance" },
  { id: "food", label: "Food" },
  { id: "travel", label: "Travel" },
  { id: "sports", label: "Sports" },
  { id: "education", label: "Education" },
  { id: "tech", label: "Tech" },
  { id: "beauty", label: "Beauty" },
  { id: "fashion", label: "Fashion" },
  { id: "gaming", label: "Gaming" },
  { id: "fitness", label: "Fitness" },
  { id: "pets", label: "Pets" },
  { id: "art", label: "Art" },
  { id: "news", label: "News" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "business", label: "Business" },
  { id: "other", label: "Other" },
]

/* ── The smaller enumerations ─────────────────────────────────────────────── */

/**
 * Only values that were seen accepted are offered.
 *
 * `remix_setting`, `comment_moderation` and `comment_access` are plain
 * strings in the create struct, not `oneof`s, so the server takes anything and
 * a client can invent a value that no reader ever matches. Two of each were
 * confirmed on the wire — the server's own default, and one alternative that
 * read back unchanged — and that is the entire menu. Guessing a third
 * ("subscribers", "hold_links", "allow_with_credit" all look plausible) would
 * be shipping a control whose effect nobody has observed.
 *
 * The probe that would settle the rest is a create per value, and
 * `POST /v1/posts` is capped at 20 an hour. That is the honest reason the
 * list is short.
 */
export const REMIX_OPTIONS = [
  { value: "allow", label: "Allow remix", hint: "Other people can build on this video" },
  { value: "deny", label: "No remixing", hint: "Nobody can build on this video" },
] as const

export const COMMENT_MODERATION_OPTIONS = [
  { value: "none", label: "Publish immediately", hint: "Comments appear as they are written" },
  { value: "hold_all", label: "Hold for review", hint: "Nothing appears until you approve it" },
] as const

export const COMMENT_ACCESS_OPTIONS = [
  { value: "everyone", label: "Everyone", hint: "" },
  { value: "followers", label: "Followers", hint: "People who follow you" },
] as const

/** `license` is free text; "standard" is the server's default and "cc-by" was
 *  stored verbatim. */
export const LICENSE_OPTIONS = [
  { value: "standard", label: "Standard Momentum licence" },
  { value: "cc-by", label: "Creative Commons — Attribution (CC BY)" },
] as const

/** A short list rather than every ISO code. The phone hardcodes `"en"`. */
export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "ja", label: "Japanese" },
] as const

/* ── Limits ───────────────────────────────────────────────────────────────── */

/** 400 TITLE_TOO_LONG names it: "101 code points, limit 100". */
export const TITLE_MAX = 100
export const SEO_TITLE_MAX = 100
export const TAGS_MAX = 20
export const TAG_MAX_LENGTH = 50
export const SCHEDULE_MIN_MS = 5 * 60 * 1000
export const SCHEDULE_MAX_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The title's length in the units the server counts.
 *
 * ── Code points, not `.length` ────────────────────────────────────────────
 * The server says "code points" and means runes. JavaScript's `.length` is
 * UTF-16 code units, so every emoji counts twice and every astral character
 * does too. A title of 60 emoji is 60 runes to the server and 120 to
 * `.length` — the form would refuse a title the server would take, and the
 * counter under the box would show a number the creator can see is wrong.
 *
 * `[...s]` iterates code points. It is not grapheme clusters, and that is
 * correct: a family emoji is several code points to the server too.
 */
export function runeLength(value: string): number {
  return [...value].length
}

/* ── The draft ────────────────────────────────────────────────────────────── */

/**
 * When the video goes live.
 *
 * ── Why "now" is a separate mode and not just an absent `publish_at` ──────
 * Because publishing is a SECOND CALL with a side effect. `POST
 * /v1/videos/{id}/publish` runs `UPDATE posts SET visibility = 'public'` —
 * read out of post-service's store, and observed: a post created `unlisted`
 * reads back `public` after it. So "publish now" and "unlisted" are
 * contradictory instructions, and a studio that ran both would silently
 * overrule a choice somebody had just made two steps earlier.
 *
 * So the mode is explicit, `publishAction` below decides what actually
 * happens, and the review step states it in a sentence.
 */
export type ScheduleMode = "now" | "at"

export interface VideoDraft {
  title: string
  seoTitle: string
  description: string
  visibility: Visibility
  category: string
  language: string
  tags: string[]

  /**
   * The made-for-kids declaration. `null` means "not answered yet".
   *
   * ── Tri-state, and required ───────────────────────────────────────────
   * A boolean defaulting to false would mean every video ever uploaded from
   * this studio carries a filed declaration that it is not for children,
   * made by a form rather than by a person. That is the one field on this
   * page where a default is not a convenience but a statement somebody else
   * put in a creator's mouth, so there is no default and the studio will not
   * publish until it has been answered.
   */
  madeForKids: boolean | null
  paidPromotion: boolean
  alteredContent: boolean
  license: string

  allowEmbedding: boolean
  publishToFeed: boolean
  remixSetting: string
  commentModeration: string
  commentAccess: string
  /** The phone's "Allow comments", inverted on the wire into `no_comments`. */
  allowComments: boolean
  allowLikes: boolean
  /** The phone's "Hide share button", sent as-is. */
  hideShare: boolean
  /** The phone's "Allow download". Default on, as on the phone. */
  allowDownload: boolean

  /** `YYYY-MM-DD`, from a plain date input. Empty means unset. */
  recordingDate: string
  recordingLocation: string

  scheduleMode: ScheduleMode
  /** A `datetime-local` value: `YYYY-MM-DDTHH:mm`, in the browser's own zone. */
  scheduleAt: string
}

/**
 * A fresh draft.
 *
 * The defaults are the SERVER's defaults wherever the server has one — read
 * off a post created with nothing but the required fields: `remix_setting
 * "allow"`, `comment_moderation "none"`, `comment_access "everyone"`,
 * `license "standard"`, `allow_embedding true`, `publish_to_feed true`,
 * `no_likes false`, `hide_share false`. Matching them means an untouched form
 * sends exactly what an untouched phone would, and the two clients cannot
 * disagree about what "I did not choose anything" means.
 *
 * `allowDownload` is the exception, and it is the PHONE's default rather than
 * the server's: Android ships "Allow download" on, and its comment says an
 * omitted value means "unspecified" rather than true. Sending it explicitly,
 * on, matches what a creator on the phone gets.
 */
export function emptyDraft(): VideoDraft {
  return {
    title: "",
    seoTitle: "",
    description: "",
    visibility: "public",
    category: "",
    language: "en",
    tags: [],

    madeForKids: null,
    paidPromotion: false,
    alteredContent: false,
    license: "standard",

    allowEmbedding: true,
    publishToFeed: true,
    remixSetting: "allow",
    commentModeration: "none",
    commentAccess: "everyone",
    allowComments: true,
    allowLikes: true,
    hideShare: false,
    allowDownload: true,

    recordingDate: "",
    recordingLocation: "",

    scheduleMode: "now",
    scheduleAt: "",
  }
}

/* ── Validation ───────────────────────────────────────────────────────────── */

/** Which step a problem belongs to, so the stepper can mark it. */
export type StudioStep = "file" | "details" | "settings" | "review"

export interface DraftIssue {
  field: string
  step: StudioStep
  message: string
}

/**
 * Everything wrong with a draft, at once.
 *
 * ── All of them, not the first one ────────────────────────────────────────
 * A stepper that reveals one problem per attempt makes somebody walk the
 * whole form three times. Returning the full list lets the step markers be
 * right the moment a field changes, and lets the review step say "two things
 * left" rather than "something is wrong".
 *
 * ── Checked HERE rather than left to the server, for one hard reason ──────
 * `POST /v1/posts` is rate limited to 20 an hour and the limiter runs BEFORE
 * field validation — a 429 is what a bad title costs, not a 400. Spending one
 * of somebody's twenty on a title that was always too long is an hour of
 * their day for a mistake the browser could see.
 */
export function validateDraft(draft: VideoDraft, now = Date.now()): DraftIssue[] {
  const issues: DraftIssue[] = []

  const title = draft.title.trim()
  if (title.length === 0) {
    issues.push({ field: "title", step: "details", message: "A video needs a title." })
  } else if (runeLength(title) > TITLE_MAX) {
    issues.push({
      field: "title",
      step: "details",
      message: `The title is ${runeLength(title)} characters. The limit is ${TITLE_MAX}.`,
    })
  }

  if (runeLength(draft.seoTitle.trim()) > SEO_TITLE_MAX) {
    issues.push({
      field: "seoTitle",
      step: "details",
      message: `The search title is longer than ${SEO_TITLE_MAX} characters.`,
    })
  }

  // Required, matching the phone: its post button is disabled with "Post
  // video. Unavailable: choose a category first." A long video with no
  // category is invisible to every category filter this platform has.
  if (draft.category.trim().length === 0) {
    issues.push({ field: "category", step: "details", message: "Choose a category." })
  }

  if (draft.tags.length > TAGS_MAX) {
    issues.push({
      field: "tags",
      step: "details",
      message: `${draft.tags.length} tags. The limit is ${TAGS_MAX}.`,
    })
  }
  const overlongTag = draft.tags.find((tag) => runeLength(tag) > TAG_MAX_LENGTH)
  if (overlongTag) {
    issues.push({
      field: "tags",
      step: "details",
      message: `"${overlongTag.slice(0, 20)}…" is longer than ${TAG_MAX_LENGTH} characters.`,
    })
  }

  if (draft.madeForKids === null) {
    issues.push({
      field: "madeForKids",
      step: "settings",
      message: "Say whether this video is made for children.",
    })
  }

  if (draft.scheduleMode === "at") {
    const at = parseLocalDateTime(draft.scheduleAt)
    if (at === null) {
      issues.push({ field: "scheduleAt", step: "settings", message: "Pick a date and a time." })
    } else if (at - now < SCHEDULE_MIN_MS) {
      // The phone's exact sentence.
      issues.push({
        field: "scheduleAt",
        step: "settings",
        message: "Pick a time at least 5 minutes from now.",
      })
    } else if (at - now > SCHEDULE_MAX_MS) {
      issues.push({
        field: "scheduleAt",
        step: "settings",
        message: "Pick a time within the next 30 days.",
      })
    }
  }

  return issues
}

/**
 * A `datetime-local` value as an epoch, or null.
 *
 * ── Why not `new Date(value)` ─────────────────────────────────────────────
 * `new Date("2026-09-10T18:30")` is local time in every modern browser, which
 * is what is wanted — but `new Date("2026-09-10")` is UTC, and a half-typed
 * `datetime-local` can produce exactly that string mid-edit. Parsing the
 * parts explicitly means a partial value is null rather than a time twelve
 * hours off, which would otherwise show "Pick a time at least 5 minutes from
 * now" for a time that plainly is.
 */
export function parseLocalDateTime(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

/* ── What actually happens on Publish ─────────────────────────────────────── */

export type PublishAction =
  /** Create, then `POST /v1/videos/{id}/publish` — live and public. */
  | "publish"
  /** Create with `publish_at`. The server flips it live on the day. */
  | "schedule"
  /** Create only. It is already at the visibility that was chosen. */
  | "create"

/**
 * Which of the three this draft means.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PUBLISH CALL IS ONLY CORRECT FOR ONE OF THEM.
 *
 * `POST /v1/videos/{id}/publish` is, in post-service's store, exactly
 * `UPDATE posts SET visibility = 'public'` — gated on the video's
 * `upload_status` being `ready` (else 409 NOT_READY) and on the caller being
 * the author (else 403). It sets no published flag and clears no schedule.
 *
 * So:
 *   · public + now      → create, then publish. The call does what it says.
 *   · anything + at     → create with `publish_at`. Calling publish would
 *                         make it public IMMEDIATELY and the schedule would
 *                         be a lie sitting in a column.
 *   · non-public + now  → create only. It is already live to the audience
 *                         that was chosen. Calling publish would overwrite
 *                         "only me" with "everyone", which is the single
 *                         worst thing this studio could do.
 *
 * The Android client never calls publish at all — `POST /v1/posts` IS the
 * publish there — which is further evidence the call is a legacy affordance
 * rather than a required step. It is kept for the `public + now` case because
 * that is the case where it is both harmless and what the route exists for.
 */
export function publishAction(draft: VideoDraft): PublishAction {
  if (draft.scheduleMode === "at") return "schedule"
  return draft.visibility === "public" ? "publish" : "create"
}

/** The Post button's word. The phone's: "Post", or "Schedule" when a time is set. */
export function publishButtonLabel(draft: VideoDraft): string {
  return draft.scheduleMode === "at" ? "Schedule" : "Post"
}

/* ── The wire ─────────────────────────────────────────────────────────────── */

/**
 * The draft, as `POST /v1/posts` wants it.
 *
 * ── Empty optionals are OMITTED, never sent as "" ─────────────────────────
 * The phone does the same and its comment says why: a blank category means
 * "none", and `"category": ""` is a category whose name is the empty string.
 * The same goes for `recording_location`, `seo_title` and `text`. What is
 * ALWAYS sent, even at its default, is anything whose absence would mean
 * "unspecified" rather than "off" — the four interaction switches and every
 * compliance flag — because a creator who deliberately left "Allow download"
 * on should have that recorded as a decision.
 *
 * ── Tags are trimmed, de-duplicated and stripped of a leading `#` ─────────
 * People type `#howto` because that is what a tag looks like everywhere else.
 * The column is a plain tag list, and `#howto` and `howto` sitting in it as
 * two different tags is a search index with a hole in it.
 */
export function toCreateRequest(
  draft: VideoDraft,
  mediaId: string,
  coverMediaId?: string | null
): CreateLongVideoRequest {
  const body: CreateLongVideoRequest = {
    content_type: "long_video",
    visibility: draft.visibility,
    title: draft.title.trim(),
    media_ids: [mediaId],

    language: draft.language,

    // The declarations. `paid_promotion` and NOT `is_paid_promotion`;
    // `is_made_for_kids` and NOT `made_for_kids`. Both spellings are one
    // letter from a field the server drops without complaint.
    is_made_for_kids: draft.madeForKids === true,
    paid_promotion: draft.paidPromotion,
    altered_content: draft.alteredContent,
    license: draft.license,

    allow_embedding: draft.allowEmbedding,
    publish_to_feed: draft.publishToFeed,
    remix_setting: draft.remixSetting,
    comment_moderation: draft.commentModeration,
    comment_access: draft.commentAccess,
    no_comments: !draft.allowComments,
    no_likes: !draft.allowLikes,
    hide_share: draft.hideShare,
    allow_download: draft.allowDownload,
  }

  const seoTitle = draft.seoTitle.trim()
  if (seoTitle) body.seo_title = seoTitle

  const text = draft.description.trim()
  if (text) body.text = text

  const category = draft.category.trim()
  if (category) body.category = category

  const tags = normaliseTags(draft.tags)
  if (tags.length) body.tags = tags

  if (draft.recordingDate) body.recording_date = draft.recordingDate
  const location = draft.recordingLocation.trim()
  if (location) body.recording_location = location

  if (coverMediaId) body.cover_media_id = coverMediaId

  if (draft.scheduleMode === "at") {
    const at = parseLocalDateTime(draft.scheduleAt)
    if (at !== null) {
      // Truncated to the second, matching the phone's ISO_INSTANT. A
      // millisecond field is legal RFC3339 and simply noise in a column
      // nothing reads at that precision.
      body.publish_at = new Date(Math.floor(at / 1000) * 1000).toISOString()
    }
  }

  return body
}

/** Trim, drop a leading `#`, drop blanks, de-duplicate case-insensitively. */
export function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().replace(/^#+/, "").trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * A sentence naming what Publish is about to do.
 *
 * Shown on the review step, because every field on this page is permanent and
 * the last chance to notice a mistake is the moment before it becomes one.
 */
export function publishSummary(draft: VideoDraft): string {
  const action = publishAction(draft)
  const audience =
    VISIBILITY_OPTIONS.find((o) => o.value === draft.visibility)?.label ?? draft.visibility

  if (action === "schedule") {
    const at = parseLocalDateTime(draft.scheduleAt)
    const when = at
      ? new Date(at).toLocaleString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "the time you picked"
    return `Scheduled for ${when}, then visible to ${audience.toLowerCase()}.`
  }
  if (action === "publish") return "Published now, visible to anyone on Momentum."
  return `Posted now, visible to ${audience.toLowerCase()}. It will not be made public.`
}
