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

import { MAX_EPISODES } from "@/links/sequence"
import type { CreateLongVideoRequest } from "@/tube/uploadApi"
import { SERIES_EPISODE_NUM_MAX, SERIES_MAX_EPISODES } from "@/watch/api"

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
  { value: "public", label: "Public", hint: "Anyone can find and watch it." },
  {
    value: "unlisted",
    label: "Unlisted",
    hint: "Only people with the link. It stays off search and off your channel's grid.",
  },
  { value: "followers", label: "Followers", hint: "Only people who follow you." },
  { value: "private", label: "Private", hint: "Only you." },
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

/**
 * The server's own rule for what `posts.category` may hold, reimplemented.
 *
 * post-service `NormalizeCategory` (internal/service/categories.go), read
 * 2026-09-18: `strings.ToLower(strings.TrimSpace(raw))`, then every internal
 * run of whitespace collapsed to a single `-`. Empty in, empty out. It runs on
 * EVERY write path — create, the draft PATCH, migration 047 for the rows
 * already stored.
 *
 * ── Why the browser repeats a rule the server will apply anyway ───────────
 * Because the studio offers a free-text category and the founder asked to see
 * "what is the category type of video". A combobox that accepts "Home Repair"
 * and silently stores `home-repair` is a form that lies about its own value,
 * and the person only finds out when the chip rail on the home grid shows a
 * word they did not type. Normalising as they type means the field shows the
 * stored value, and the two can never drift.
 *
 * Long videos are NOT held to the taxonomy — `resolveCreateCategory` only
 * enforces it for `content_type: "flick"` — which is why a custom value is
 * allowed here at all. The list is still offered first, for the reason
 * FALLBACK_CATEGORIES gives.
 */
export function normaliseCategory(raw: string): string {
  const id = raw.trim().toLowerCase()
  if (!id) return ""
  return id.replace(/\s+/g, "-")
}

/* ── The smaller enumerations ─────────────────────────────────────────────── */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE VOCABULARY IS THE `reel_drafts` CHECK CONSTRAINTS, NOT A GUESS.
 *
 * `remix_setting`, `comment_moderation`, `comment_access` and `license` are
 * plain strings in `CreatePostRequest`, and the `posts` columns migration 006
 * adds carry NO check constraint — so `POST /v1/posts` accepts literally
 * anything and echoes it back. "It read back unchanged" is therefore evidence
 * of nothing at all, and an earlier pass of this file drew exactly that wrong
 * conclusion from it.
 *
 * The server DOES declare a vocabulary, in the one place it had to: migration
 * 006's `reel_drafts` table, read 2026-09-18.
 *
 *     license             CHECK (license IN ('standard', 'creative_commons'))
 *     remix_setting       CHECK (remix_setting IN ('allow', 'allow_audio_only',
 *                                                  'disallow'))
 *     comment_moderation  CHECK (comment_moderation IN ('none', 'basic',
 *                                                       'strict', 'hold_all'))
 *     comment_access      CHECK (comment_access IN ('everyone', 'followers',
 *                                                   'nobody'))
 *
 * Those are the only values any part of this server has ever named. The
 * previous menu here offered `remix_setting: "deny"` and `license: "cc-by"`,
 * neither of which appears anywhere in post-service: they would sit in the
 * column unread by every consumer, and — since ./draftPayload.ts now writes
 * drafts — a `"deny"` would fail the CHECK outright.
 *
 * So the studio speaks the constrained vocabulary, which both tables accept.
 */
export const REMIX_OPTIONS = [
  { value: "allow", label: "Allow remixing", hint: "Other people can build on this video." },
  {
    value: "allow_audio_only",
    label: "Audio only",
    hint: "People may reuse the sound, not the picture.",
  },
  { value: "disallow", label: "No remixing", hint: "Nobody can build on this video." },
] as const

/**
 * Comments, as one question instead of three switches.
 *
 * The founder's screen has one row for comments and the server has three
 * columns, so the mapping lives in `commentWire` below and is asserted field
 * by field. `basic` and `strict` are real values the drafts table names, and
 * they are deliberately NOT offered: nothing in post-service reads
 * `comment_moderation` at all yet, so the two that describe a filter nobody
 * has written would be controls that do nothing. `hold_all` is offered
 * because "nothing appears until you approve it" is a promise the column at
 * least records honestly.
 */
export type CommentsMode = "on" | "review" | "off"

export const COMMENTS_MODE_OPTIONS = [
  { value: "on", label: "Comments on", hint: "Comments appear as they are written." },
  {
    value: "review",
    label: "Comments on, with approval",
    hint: "Nothing appears under the video until you approve it.",
  },
  { value: "off", label: "Comments off", hint: "Nobody can comment on this video." },
] as const satisfies readonly { value: CommentsMode; label: string; hint: string }[]

/** `nobody` is a legal `comment_access` and is not offered: "nobody may
 *  comment" is what "Comments off" above already says, and two controls that
 *  can contradict each other is how a video ends up with comments on and an
 *  audience of no one. */
export const COMMENT_ACCESS_OPTIONS = [
  { value: "everyone", label: "Everyone", hint: "Anyone who can watch it." },
  { value: "followers", label: "Followers", hint: "Only people who follow you." },
] as const

export const LICENSE_OPTIONS = [
  { value: "standard", label: "Standard Momentum licence" },
  { value: "creative_commons", label: "Creative Commons — Attribution" },
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
 * Hashtags and mentions are their own fields, with their own ceilings.
 *
 * post-service `explicit_tags.go` (`NormalizeExplicitHashtags` /
 * `NormalizeExplicitMentions`), read 2026-09-18. Every one of these is a HARD
 * 400 on the whole create, not a dropped entry:
 *
 *   · hashtags — at most 30, each 1–50 RUNES, `^[\p{L}\p{M}\p{N}_]+$` after a
 *     leading `#` is stripped, lowercased for the index, deduped.
 *   · mentions — at most 20, each 1–30 characters of `^[A-Za-z0-9_.]+$` after
 *     a leading `@`, case KEPT (user-service owns username case), deduped
 *     case-insensitively.
 *
 * They are merged server-side with whatever the description's own parser
 * finds, so a `#tag` typed into the description arrives anyway — these fields
 * are the studio's way of adding one without cluttering the text.
 */
export const HASHTAGS_MAX = 30
export const HASHTAG_MAX_LENGTH = 50
export const MENTIONS_MAX = 20
export const MENTION_MAX_LENGTH = 30

/** The server's alphabets, as the two regexes it actually compiles. */
export const HASHTAG_PATTERN = /^[\p{L}\p{M}\p{N}_]+$/u
export const MENTION_PATTERN = /^[A-Za-z0-9_.]+$/

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
  /** Already slug-normalised — see `normaliseCategory`. The box shows this. */
  category: string
  language: string
  tags: string[]
  /** `#` stripped, lowercased, ready for the wire. */
  hashtags: string[]
  /** `@` stripped, case kept. */
  mentions: string[]

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
  /**
   * "Show in the main feed" and "Tell my subscribers".
   *
   * ── Two switches, one typed object, and one legacy column ─────────────
   * `distribution` (migration 025, `service/distribution.go`) is the typed,
   * versioned policy: `{version:1, main_feed, notify_subscribers,
   * create_reel_preview}`. When it is present it is AUTHORITATIVE and the
   * legacy `publish_to_feed` column is not consulted at all
   * (`ResolveDistributionWithLegacy`). The studio sends both, agreeing, so
   * that a consumer reading either one gets the same answer.
   *
   * `create_reel_preview` is NOT here, and that is the server's decision:
   * `ParseDistributionPolicy` answers 400 UNSUPPORTED_DISTRIBUTION for
   * `create_reel_preview: true`, in as many words — "not yet supported". A
   * switch for it would be a switch that fails the publish.
   */
  mainFeed: boolean
  notifySubscribers: boolean
  remixSetting: string
  /** One question. `commentWire` turns it into the three columns. */
  commentsMode: CommentsMode
  commentAccess: string
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

  /**
   * The series to attach this video to, and at which number. Both null when
   * it is not in one.
   *
   * ── Not part of the create body, on purpose ───────────────────────────
   * `POST /v1/posts` knows nothing about series. An episode is a second
   * write, `POST /v1/video-series/{id}/episodes`, made AFTER the post exists
   * because the row needs the post's id. So these two fields never reach
   * `toCreateRequest`, and ./fields.test.ts asserts that they do not: a
   * `series_id` that leaked into the create body would be silently dropped
   * by the server, and the creator would find out on the watch page.
   */
  seriesId: string | null
  seriesEpisodeNum: number | null
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
    hashtags: [],
    mentions: [],

    madeForKids: null,
    paidPromotion: false,
    alteredContent: false,
    license: "standard",

    allowEmbedding: true,
    mainFeed: true,
    notifySubscribers: true,
    remixSetting: "allow",
    commentsMode: "on",
    commentAccess: "everyone",
    allowLikes: true,
    hideShare: false,
    allowDownload: true,

    recordingDate: "",
    recordingLocation: "",

    scheduleMode: "now",
    scheduleAt: "",

    seriesId: null,
    seriesEpisodeNum: null,
  }
}

/* ── Series ───────────────────────────────────────────────────────────────── */

/**
 * The number a new episode gets: one past the highest, or 1.
 *
 * ── Gaps are not filled ───────────────────────────────────────────────────
 * A series numbered 1, 2, 4 offers 5, not 3. That matches the server, which
 * decided that a gap is a gap: nothing renumbers on the wire, `nextEpisode`
 * on the watch page steps over the hole rather than stopping at it, and a
 * creator who removed episode 3 may be keeping the number for a re-cut. A
 * studio that quietly slid a new upload into the hole would be filing it
 * under a number the creator had already used for something else. The
 * number is editable in the field anyway; this is only the suggestion.
 */
export function nextEpisodeNum(episodeNums: readonly number[]): number {
  let highest = 0
  for (const n of episodeNums) {
    if (Number.isFinite(n) && n > highest) highest = n
  }
  return highest + 1
}

/** What the studio knows about the chosen series when it validates. */
export interface SeriesFacts {
  /** The numbers already taken. Its length is the episode count. */
  episodeNums: readonly number[]
}

/**
 * What is wrong with the series choice, or null.
 *
 * Two caps, and they are different people's:
 *
 *   · `MAX_EPISODES` (3) is the founder's, "one to three sequence of videos",
 *     and it is what the links editor will ADD up to. The studio keeps to the
 *     same number so a creator cannot make a series here that the editor
 *     then refuses to touch.
 *   · `SERIES_MAX_EPISODES` (50) is the server's; the write past it is a
 *     409 SERIES_FULL. It is only reachable for a series something else
 *     filled, and it is checked so the message names the real limit rather
 *     than an HTTP status.
 *
 * The number itself is bounded 1..999 by the server, and 0 is the one value
 * that gets the least helpful error on the endpoint (it reads as "missing"),
 * which is why the check is here and not left to the response.
 */
export function seriesIssue(
  draft: Pick<VideoDraft, "seriesId" | "seriesEpisodeNum">,
  series: SeriesFacts | null
): string | null {
  if (!draft.seriesId) return null
  const count = series?.episodeNums.length ?? 0
  if (count >= SERIES_MAX_EPISODES) {
    return `This series already has ${count} episodes, which is the most the server allows.`
  }
  if (count >= MAX_EPISODES) {
    return `This series already has ${count} episodes, the most this studio arranges.`
  }
  const num = draft.seriesEpisodeNum
  if (num === null) return "Choose an episode number."
  if (!Number.isInteger(num) || num < 1 || num > SERIES_EPISODE_NUM_MAX) {
    return `Episode numbers run from 1 to ${SERIES_EPISODE_NUM_MAX}.`
  }
  return null
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
export function validateDraft(
  draft: VideoDraft,
  now = Date.now(),
  series: SeriesFacts | null = null
): DraftIssue[] {
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

  // Every one of these is a 400 on the WHOLE create, not a dropped entry —
  // `NormalizeExplicitHashtags` returns an error and `CreatePost` never runs.
  // So they are caught here, where a 429 is not the price of finding out.
  if (draft.hashtags.length > HASHTAGS_MAX) {
    issues.push({
      field: "hashtags",
      step: "details",
      message: `${draft.hashtags.length} hashtags. The limit is ${HASHTAGS_MAX}.`,
    })
  }
  const badHashtag = draft.hashtags.find((tag) => normaliseHashtag(tag) === null)
  if (badHashtag !== undefined) {
    issues.push({
      field: "hashtags",
      step: "details",
      message: `"${badHashtag.slice(0, 20)}" is not a hashtag the server accepts. Letters, digits and underscores only, up to ${HASHTAG_MAX_LENGTH} characters.`,
    })
  }

  if (draft.mentions.length > MENTIONS_MAX) {
    issues.push({
      field: "mentions",
      step: "details",
      message: `${draft.mentions.length} mentions. The limit is ${MENTIONS_MAX}.`,
    })
  }
  const badMention = draft.mentions.find((name) => normaliseMention(name) === null)
  if (badMention !== undefined) {
    issues.push({
      field: "mentions",
      step: "details",
      message: `"${badMention.slice(0, 20)}" is not a username the server accepts. Letters, digits, dots and underscores only, up to ${MENTION_MAX_LENGTH} characters.`,
    })
  }

  const seriesProblem = seriesIssue(draft, series)
  if (seriesProblem) {
    issues.push({ field: "series", step: "details", message: seriesProblem })
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
/**
 * @param assetReady the transcode has finished AND moderation has passed. When
 *   it has not — the "publish while it is still processing" path, which the
 *   server added on 2026-09-04 and which ../studio/machine.ts's `publishGate`
 *   decides — the `publish` call is DROPPED rather than attempted:
 *   `POST /v1/videos/{id}/publish` is gated on `video_metadata.upload_status`
 *   being `ready` and answers 409 NOT_READY until the transcode consumer flips
 *   it. The post is created anyway (`mediaConfirmed` accepts `uploaded` /
 *   `processing` / `ready`), held author-only by `hiddenWhileProcessing`, and
 *   released to everyone the moment the media row goes ready+passed. That is
 *   the same end state the publish call would have produced, reached without a
 *   409 in the middle of it.
 */
export function publishAction(draft: VideoDraft, assetReady = true): PublishAction {
  if (draft.scheduleMode === "at") return "schedule"
  if (draft.visibility !== "public") return "create"
  return assetReady ? "publish" : "create"
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
/**
 * One question on screen, three columns on the wire.
 *
 * `no_comments` is the switch the phone has and the only one anything
 * currently reads. `comment_moderation` and `comment_access` are recorded
 * alongside it so that the day something does read them, the answer is the one
 * the creator gave rather than a default.
 *
 * "Off" sends `comment_moderation: "none"` and NOT `"hold_all"`: with comments
 * closed there is nothing to hold, and a row that says "hold every comment for
 * approval" on a video that accepts none would read, to anything inspecting
 * it later, as a moderation queue that exists.
 */
export function commentWire(mode: CommentsMode): {
  no_comments: boolean
  comment_moderation: string
} {
  switch (mode) {
    case "on":
      return { no_comments: false, comment_moderation: "none" }
    case "review":
      return { no_comments: false, comment_moderation: "hold_all" }
    case "off":
      return { no_comments: true, comment_moderation: "none" }
  }
}

export function toCreateRequest(
  draft: VideoDraft,
  mediaId: string,
  coverMediaId?: string | null
): CreateLongVideoRequest {
  const comments = commentWire(draft.commentsMode)
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
    remix_setting: draft.remixSetting,
    comment_moderation: comments.comment_moderation,
    comment_access: draft.commentAccess,
    no_comments: comments.no_comments,
    no_likes: !draft.allowLikes,
    hide_share: draft.hideShare,
    allow_download: draft.allowDownload,

    // Both, agreeing. The typed policy wins wherever it is read
    // (`ResolveDistributionWithLegacy`); `publish_to_feed` is the column an
    // older consumer still reads, and leaving it at its default while the
    // policy said `main_feed: false` would give two readers two answers.
    // `create_reel_preview` is never sent — `true` is 400
    // UNSUPPORTED_DISTRIBUTION and `false` says nothing.
    publish_to_feed: draft.mainFeed,
    distribution: {
      version: 1,
      main_feed: draft.mainFeed,
      notify_subscribers: draft.notifySubscribers,
    },
  }

  const seoTitle = draft.seoTitle.trim()
  if (seoTitle) body.seo_title = seoTitle

  const text = draft.description.trim()
  if (text) body.text = text

  // Normalised again rather than trusted: `NormalizeCategory` runs on the
  // server whatever arrives, so sending the un-normalised spelling would mean
  // the studio showed one value and the column held another.
  const category = normaliseCategory(draft.category)
  if (category) body.category = category

  const tags = normaliseTags(draft.tags)
  if (tags.length) body.tags = tags

  // Already normalised by the chip inputs, and normalised again here so the
  // wire is right whatever put the values in the draft — a restored server
  // draft, for one, which has been through a different machine's form.
  const hashtags = dedupeFold(
    draft.hashtags.map(normaliseHashtag).filter((t): t is string => t !== null)
  )
  if (hashtags.length) body.hashtags = hashtags

  const mentions = dedupeFold(
    draft.mentions.map(normaliseMention).filter((m): m is string => m !== null)
  )
  if (mentions.length) body.mentions = mentions

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

/**
 * A hashtag, as `NormalizeExplicitHashtags` would store it, or null if the
 * server would refuse it.
 *
 * Null rather than "cleaned up": the server does not drop a bad entry, it
 * refuses the whole create with 400 INVALID_HASHTAG. Silently stripping the
 * characters it dislikes would put a tag the person did not write on their
 * video; refusing it at the chip input tells them while they can still fix it.
 */
export function normaliseHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#/, "")
  if (!tag) return null
  if (runeLength(tag) > HASHTAG_MAX_LENGTH) return null
  if (!HASHTAG_PATTERN.test(tag)) return null
  return tag.toLowerCase()
}

/**
 * A mention, likewise. Case is KEPT — `NormalizeExplicitMentions` keeps it
 * because user-service owns username case — but the de-duplication that
 * follows is case-insensitive, exactly as the server's is.
 *
 * The length bound is `.length` and not `runeLength`, because the server's is
 * `len(name)` on a string whose alphabet is `[A-Za-z0-9_.]`: every legal
 * character is one byte, one rune and one UTF-16 unit, so all three agree.
 */
export function normaliseMention(raw: string): string | null {
  const name = raw.trim().replace(/^@/, "")
  if (!name) return null
  if (name.length > MENTION_MAX_LENGTH) return null
  if (!MENTION_PATTERN.test(name)) return null
  return name
}

/** De-duplicate case-insensitively, keeping the first spelling. */
export function dedupeFold(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
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
  // `assetReady: true` deliberately: this sentence is about the CHOICE, and
  // the choice does not change while a transcode runs. Whether the extra
  // publish call is made is an implementation detail of that same choice —
  // `publishChecklist` is where the processing wait gets its own line.
  const action = publishAction(draft, true)
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

/* ── The checklist ────────────────────────────────────────────────────────── */

/**
 * What pressing the button will do, as a list of sentences.
 *
 * ── Why a list and not the one summary sentence above ─────────────────────
 * `publishSummary` answers "when and to whom", which was enough while the
 * studio sent nine fields. It now sends twenty-odd, and three of them are
 * things a creator would be upset to get wrong in a direction no sentence
 * mentions: a video that quietly notified forty thousand subscribers, a video
 * that never reached the main feed, a video whose comments are closed. Each
 * gets its own line, in the order somebody worries about them, and each line
 * says what WILL happen rather than what was configured.
 *
 * Pure, and returned as data rather than JSX, so ./fields.test.ts can assert
 * the sentences without rendering anything.
 */
export interface PublishStep {
  /** Stable key, for React and for the test. */
  id: string
  label: string
  /** True when this is a thing that will happen, false when it will not.
   *  The review step marks both with a WORD as well as an icon. */
  on: boolean
}

export function publishChecklist(draft: VideoDraft, assetReady = true): PublishStep[] {
  const action = publishAction(draft, assetReady)

  /**
   * The audience line is the RADIO ROW'S OWN SENTENCE, not a restatement.
   *
   * It said "Visible to followers" first, and that was wrong in a way worth
   * recording: `followers` and `unlisted` are the COLUMN's words, and the
   * whole reason the four visibility rows carry a sentence each is that those
   * words mean nothing to somebody meeting them for the first time. A
   * checklist that describes the choice differently from the control that made
   * it is two vocabularies for one decision — the same failure the phone/web
   * wording notes at the top of this file exist to prevent.
   *
   * So it reuses `VISIBILITY_OPTIONS[].hint` verbatim. Each hint is already a
   * complete sentence about who can see the video ("Only people who follow
   * you."), which is exactly what this list is for, and the two can no longer
   * drift because there is only one string.
   */
  const audience =
    VISIBILITY_OPTIONS.find((o) => o.value === draft.visibility)?.hint ?? draft.visibility

  const steps: PublishStep[] = []

  if (action === "schedule") {
    const at = parseLocalDateTime(draft.scheduleAt)
    steps.push({
      id: "when",
      label: at
        ? `It goes live on ${new Date(at).toLocaleString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}, your time.`
        : "It goes live at the time you picked.",
      on: true,
    })
  } else {
    steps.push({ id: "when", label: "It goes live as soon as you press the button.", on: true })
  }

  // The hint is a finished sentence and carries its own full stop, so nothing
  // is appended to it — "Only you.." is the kind of detail that makes a
  // careful screen look careless.
  steps.push({ id: "audience", label: `Who can see it: ${audience}`, on: true })

  if (!assetReady) {
    // The honest version of "publish now while it processes": the post exists
    // immediately and only its author can see it until the encode finishes.
    steps.push({
      id: "processing",
      label: "Until processing finishes, only you can see it. It appears for everyone else by itself.",
      on: true,
    })
  }

  steps.push({
    id: "subscribers",
    label: draft.notifySubscribers
      ? "Your subscribers are told about it."
      : "Your subscribers are not told about it.",
    on: draft.notifySubscribers,
  })

  steps.push({
    id: "feed",
    label: draft.mainFeed
      ? "It can appear in the main feed."
      : "It stays on your channel and out of the main feed.",
    on: draft.mainFeed,
  })

  steps.push({
    id: "comments",
    label:
      draft.commentsMode === "off"
        ? "Comments are closed."
        : draft.commentsMode === "review"
          ? "Comments are held until you approve them."
          : `Comments are open to ${
              COMMENT_ACCESS_OPTIONS.find((o) => o.value === draft.commentAccess)?.label.toLowerCase() ??
              draft.commentAccess
            }.`,
    on: draft.commentsMode !== "off",
  })

  if (draft.madeForKids !== null) {
    steps.push({
      id: "kids",
      label: draft.madeForKids
        ? "Declared as made for children."
        : "Declared as not made for children.",
      on: true,
    })
  }

  if (draft.paidPromotion) {
    steps.push({ id: "paid", label: "Declared as containing paid promotion.", on: true })
  }
  if (draft.alteredContent) {
    steps.push({ id: "altered", label: "Declared as altered or synthetic.", on: true })
  }

  return steps
}
