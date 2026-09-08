/**
 * What may be played, and what may be played WITHOUT being asked.
 *
 * Two different questions with two different answers, which is why they are
 * two functions. A video that is still transcoding may not be played at all —
 * there is nothing at the other end of the URL. A video that is perfectly
 * playable may still not be allowed to start on its own, because the person
 * watching asked their operating system for less motion.
 *
 * All pure, all synchronous, no React. This is the file to read to find out
 * why something on the feed is a still image instead of a player.
 */

import type { FeedItem, FeedMedia } from "@atpost/types/feed"

/**
 * `status` and `processing_status` both carry the transcode state and the feed
 * sets them together; either being unready is enough to disqualify. An ABSENT
 * value is treated as ready, because the media rows that predate the field
 * exist and are fine — the check is for a value that says "not yet", not for
 * the presence of the field.
 */
export function isTranscodeReady(media: FeedMedia): boolean {
  const states = [media.status, media.processing_status]
  return states.every((s) => s === undefined || s === "ready")
}

/**
 * Moderation is a separate gate from transcoding and fails differently: a
 * `pending` asset is one nothing has looked at yet, and playing it would put
 * unreviewed video in front of someone. Absent is treated as passed for the
 * same reason as above — older rows, not a missing check.
 */
export function isModerationCleared(media: FeedMedia): boolean {
  return media.moderation_status === undefined || media.moderation_status === "passed"
}

/**
 * Is there anything to play, and is it allowed to be played?
 *
 * `is_processing` lives on the POST, not the media, and is the flag a video
 * carries while its transcode job is still running. It is checked here rather
 * than left to the media state because a post can be `is_processing` with a
 * media row that has not been updated yet, and the visible consequence of
 * getting this wrong is a black rectangle with a broken-file icon.
 */
export function isPlayable(item: Pick<FeedItem, "is_processing">, media: FeedMedia): boolean {
  if (media.kind !== "video") return false
  if (item.is_processing) return false
  if (!isTranscodeReady(media)) return false
  if (!isModerationCleared(media)) return false
  return Boolean(media.playback_url || media.hls_url || pickProgressive(media))
}

/**
 * Should this start by itself?
 *
 * Everything `isPlayable` demands, plus consent. `prefers-reduced-motion` is
 * an accessibility setting, not a preference to weigh against engagement: for
 * someone with a vestibular disorder an autoplaying video is a symptom
 * trigger. It is read here rather than at the call site so that no surface can
 * forget it.
 */
export function mayAutoplay(
  item: Pick<FeedItem, "is_processing">,
  media: FeedMedia,
  opts: { reducedMotion: boolean }
): boolean {
  if (opts.reducedMotion) return false
  return isPlayable(item, media)
}

/** Read the media query once. Returns false on the server. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Progressive variants, best-first, as a fallback when HLS will not attach.
 *
 * The names are NOT a fixed set and differ by kind — a video carries
 * 360p/480p/720p/original, an image carries thumb_150/small_480/medium_1080/
 * original — so this orders by preference and takes the first that exists
 * rather than reaching for a key it assumes is there. 360p first, deliberately:
 * this path is only reached when adaptive streaming already failed, and the
 * cheapest thing that plays beats the best thing that stalls.
 */
const PROGRESSIVE_PREFERENCE = ["360p", "480p", "720p", "original"] as const

export function pickProgressive(media: FeedMedia): string | undefined {
  const v = media.variants
  if (!v) return undefined
  for (const name of PROGRESSIVE_PREFERENCE) {
    if (v[name]) return v[name]
  }
  return undefined
}

/**
 * A still frame to show before the first video frame arrives — or nothing,
 * which for a video today is the honest answer.
 *
 * ── What was wrong ────────────────────────────────────────────────────────
 * This preferred `480p` and then `360p`, and on a VIDEO row those are not
 * images. They are the transcode renditions — `video/mp4`, verified by
 * fetching one and reading its bytes — so every video element on the feed
 * carried `poster="…/480p"`, a poster attribute pointed at a video file. A
 * browser cannot decode that as an image and shows nothing, silently: no
 * console error, no network failure, nothing to notice. It looked fine only
 * because @momentum/content paints a blurhash behind the frame, so the thing
 * that was actually working was never the poster.
 *
 * Selecting by NAME is what caused it — the names differ by kind (images carry
 * thumb_150 / small_480 / medium_1080 / original, videos carry thumb_150 /
 * 360p / 480p / 720p / original) and a list that spans both kinds is a list
 * that will pick the wrong one for one of them. So the ladders are separate
 * and the kind chooses, which is also what keeps the image path intact.
 *
 * ── Why a video now gets no poster ────────────────────────────────────────
 * The only image a video row carries is `thumb_150`: a 150x150 SQUARE crop.
 * The video element renders `object-contain` (see PostMedia — nothing is
 * cropped, only bounded), so a square poster in a 9:16 frame is drawn as a
 * band across the middle at 4x upscale, with the placeholder showing above and
 * below it. That is worse than what is already there, on every axis that
 * matters: the blurhash is the right shape, is derived from the real frame, is
 * in the first HTML before any request is made, and costs no round trip. A
 * 150px square crop would replace it with a blurrier, wrongly-framed picture
 * AND spend a request to do it.
 *
 * So the rule is that a poster must be a real image big enough to be one, and
 * a video row has none. The ladder below is not empty and not dead: it is
 * where a genuine poster plugs in the day the transcode pipeline emits one,
 * and it means the rule is written down rather than the conclusion.
 *
 * Callers already handle undefined — it is the reason this returns undefined
 * rather than a placeholder path — and undefined leaves the blurhash showing,
 * which is what was showing all along.
 */
const IMAGE_POSTER_PREFERENCE = ["medium_1080", "small_480", "thumb_150"] as const

/**
 * Image variants a VIDEO row could carry that are large enough to be a poster.
 * No video row carries either of these today; `thumb_150` is excluded on
 * purpose and the block above says why.
 */
const VIDEO_POSTER_PREFERENCE = ["medium_1080", "small_480"] as const

export function pickPoster(media: FeedMedia): string | undefined {
  const v = media.variants
  if (!v) return undefined
  const preference: readonly string[] =
    media.kind === "video" ? VIDEO_POSTER_PREFERENCE : IMAGE_POSTER_PREFERENCE
  for (const name of preference) {
    if (v[name]) return v[name]
  }
  return undefined
}

/**
 * Have the signed URLs in `variants` expired?
 *
 * The live gateway signs them for 300 seconds, which is short enough that a
 * feed left open on a second monitor will routinely cross it. `expires_at`
 * covers `variants` only — `hls_url` and `playback_url` are unsigned relative
 * gateway paths, and the signing for HLS happens inside the child playlist,
 * which is fetched at play time and so is always fresh.
 *
 * `skewMs` exists because "expired in four seconds" is not a URL worth
 * starting a request with.
 */
export function areVariantsExpired(
  media: Pick<FeedMedia, "expires_at">,
  nowMs: number = Date.now(),
  skewMs = 10_000
): boolean {
  if (!media.expires_at) return false
  const t = Date.parse(media.expires_at)
  if (Number.isNaN(t)) return false
  return t - skewMs <= nowMs
}

/**
 * The label the analytics contract wants for a piece of video.
 *
 * Classified by DURATION, not by the post's `content_type`: the server does
 * the same (`AnalyticsContentType.classify`, 90s) and picks the milestone
 * ladder from it, so a client that classified by post type would fire a ladder
 * the server does not expect. The post's own `content_type` remains
 * authoritative for how the CARD renders — these are different questions.
 */
export function analyticsContentType(durationMs: number): "flick" | "long_video" {
  return durationMs <= 90_000 ? "flick" : "long_video"
}

/** The first video attachment on a post, in position order. */
export function primaryVideo(item: FeedItem): FeedMedia | undefined {
  if (!item.media || item.media.length === 0) return undefined
  return [...item.media].sort((a, b) => a.position - b.position).find((m) => m.kind === "video")
}
