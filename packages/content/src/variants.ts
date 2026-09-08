/**
 * Choosing a picture, and knowing when its URL has gone stale.
 *
 * ── The variant names are not a fixed set ─────────────────────────────────
 * They differ by kind, which is the trap: an image carries thumb_150 /
 * small_480 / medium_1080 / original and a video carries thumb_150 / 360p /
 * 480p / 720p / original. Code that reaches for `variants["480p"]` works
 * perfectly on the video posts in a test fixture and renders nothing for every
 * photograph. So everything here states a PREFERENCE ORDER and takes the first
 * that exists, and falls back to `original` last rather than first — original
 * is the camera's full-size file, and putting a 4000px JPEG behind a 600px
 * card is megabytes spent on pixels nobody sees.
 *
 * ── Signed URLs expire in five minutes ────────────────────────────────────
 * Verified against the live gateway: `X-Amz-Expires=300`. That is short enough
 * that an ordinary session crosses it — open the feed, read something, come
 * back — so it cannot be treated as an edge case. `expires_at` on the media
 * object is the deadline for everything in `variants`.
 */

import type { FeedMedia } from "@atpost/types/feed"

/**
 * For a picture inside a feed card, which is at most ~600 CSS px wide and so
 * wants roughly 1080 device pixels on a 2x screen.
 */
const IMAGE_PREFERENCE = ["medium_1080", "small_480", "original", "thumb_150"] as const

/** For anything small and square — an avatar, a grid cell. */
const THUMB_PREFERENCE = ["small_480", "thumb_150", "medium_1080", "original"] as const

function pick(media: FeedMedia, order: readonly string[]): string | undefined {
  const v = media.variants
  if (!v) return undefined
  for (const name of order) {
    if (v[name]) return v[name]
  }
  // Anything at all beats nothing, but only after the preferences missed.
  const first = Object.values(v)[0]
  return first
}

export const pickImage = (media: FeedMedia): string | undefined => pick(media, IMAGE_PREFERENCE)
export const pickThumb = (media: FeedMedia): string | undefined => pick(media, THUMB_PREFERENCE)

/**
 * When do this page's signed URLs start going bad?
 *
 * Returns the EARLIEST expiry across every media item, which is the moment the
 * page as a whole stops being wholly valid, or null when nothing expires.
 * Taking the earliest rather than tracking each one separately is deliberate:
 * the gateway signs a whole feed response at once, so they all expire within
 * milliseconds of each other and twenty timers would do one timer's job.
 */
export function earliestExpiry(items: { media?: FeedMedia[] }[]): number | null {
  let earliest: number | null = null
  for (const item of items) {
    for (const media of item.media ?? []) {
      if (!media.expires_at) continue
      const t = Date.parse(media.expires_at)
      if (Number.isNaN(t)) continue
      if (earliest === null || t < earliest) earliest = t
    }
  }
  return earliest
}

/**
 * Is a media item's signed URL set past its deadline?
 *
 * `skewMs` is not paranoia about clocks: a URL with four seconds left is one
 * that will expire during the request it is about to be used for.
 */
export function isExpired(media: Pick<FeedMedia, "expires_at">, nowMs = Date.now(), skewMs = 10_000): boolean {
  if (!media.expires_at) return false
  const t = Date.parse(media.expires_at)
  if (Number.isNaN(t)) return false
  return t - skewMs <= nowMs
}

/**
 * A rendered aspect ratio, so the card reserves the right space before the
 * picture arrives.
 *
 * The whole point of the blurhash placeholder is undone if the box it sits in
 * is the wrong shape and everything below jumps when the real image lands.
 * Clamped rather than honoured exactly: a 1:9 panorama or a 1:20 strip would
 * otherwise be allowed to own the entire column.
 */
export function aspectRatio(media: Pick<FeedMedia, "width" | "height">): number {
  const w = media.width ?? 0
  const h = media.height ?? 0
  if (w <= 0 || h <= 0) return 1
  return Math.min(2, Math.max(0.5, w / h))
}
