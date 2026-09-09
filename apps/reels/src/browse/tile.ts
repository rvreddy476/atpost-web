/**
 * One reel, reduced to what a grid cell can honestly show.
 *
 * Pure: no React, no network, no DOM. Every decision a tile makes about what
 * to draw is here so it can be asserted as arithmetic — which matters most for
 * the two that are easy to get subtly wrong and impossible to see in a
 * screenshot: which image is chosen, and whether it has already expired.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE IS POSTERS AND NOT PLAYERS
 *
 * The browse page shows every reel `GET /v1/feed/reels` returns. If each one
 * were the existing `Reel` — or a `PostCard` — then every tile on screen would
 * attach hls.js, fetch a master playlist, fetch a child playlist and start
 * buffering segments. That is a documented, measured behaviour rather than a
 * worry: the immersive viewer mounts the current reel and its two neighbours
 * ONLY, and the comment on `mounted` in Reel.tsx records "a page of twelve was
 * observed with four reels all at readyState 4 before anybody had swiped
 * once."
 *
 * A poster is one image request. A 720p reel segment set is megabytes. Twelve
 * of the latter, for content nobody has chosen yet, is the browse page paying
 * the immersive page's bill twelve times over on the chance one tile is
 * clicked. So:
 *
 *   · nothing on this page autoplays, and nothing mounts a player;
 *   · which is also why this page needs no `viewportInset`. The inset exists
 *     so the autoplay coordinator and the dwell tracker do not credit pixels
 *     hidden behind sticky chrome — and with no coordinator and no watch
 *     measurement on this surface there is no number for a wrong inset to
 *     corrupt. The immersive viewer still measures its own, from the element,
 *     and that is untouched.
 *
 * The alternative considered and rejected: play the hovered or focused tile.
 * It is one player rather than twelve, but it costs a real inset (the tile
 * would be measured against the viewport), a keyboard story for what "focused"
 * means on a grid, and a video that starts on a mouse passing over it — and it
 * buys a preview of something one click away from playing full-screen anyway.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH PICTURE, AND WHY IT IS NOT `pickPoster`
 *
 * `pickPoster` in @momentum/player refuses `thumb_150` for a video ON PURPOSE,
 * and its comment says why: a 150px still stretched across a 600px card looks
 * like a fault. That reasoning does not survive the move to a grid — a tile in
 * the 600px centre track is ~184px wide, which is what thumb_150 is for — and
 * it is the only image variant these rows actually carry.
 *
 * Verified on the live feed, all four reels this account has:
 *
 *     variants: 360p, 480p, 720p, original, thumb_150
 *
 * The first four are TRANSCODE RENDITIONS — video/mp4, not images — so
 * `pickPoster` correctly returns nothing for every one of them and a grid
 * built on it would be entirely blurhash. `pickThumb` in @momentum/content is
 * the function written for this case; its own comment says "for anything small
 * and square — an avatar, a grid cell".
 *
 * The blurhash underneath is not a fallback, it is the base layer: it is
 * present on every row, it never expires, and it is what remains when the
 * signed thumbnail 403s five minutes after the page was fetched.
 */

import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import { formatDuration, isExpired, pickThumb } from "@momentum/content"
import { primaryVideo } from "@momentum/player"
import { formatCount, reelAuthorLabel } from "@/reels/rail"

/**
 * Where a tile leads.
 *
 * ZONE-RELATIVE, and that is the whole subtlety. This is handed to `next/link`
 * inside a zone whose basePath is "/reels", and Next prefixes the basePath
 * itself — so "/{id}" becomes "/reels/{id}", the deep link that already
 * exists, and "/reels/{id}" would become "/reels/reels/{id}".
 *
 * There is deliberately no second route for "the expanded view". `/reels/{id}`
 * has existed since the zone did, it is what Share copies to a clipboard, and
 * a tile that opened anything else would mean two ways into one surface with
 * two sets of behaviour to keep in step.
 */
export function reelHref(item: Pick<FeedItem, "id">): string {
  return `/${item.id}`
}

/** The video on a reel, if it has one. */
export function tileMedia(item: FeedItem): FeedMedia | null {
  return primaryVideo(item) ?? null
}

/**
 * The still to draw, or nothing.
 *
 * `nowMs` is a parameter so the expiry branch is testable without waiting five
 * minutes. `isExpired` carries its own 10s skew: a URL with four seconds left
 * is one that will expire during the request it is about to be used for, and
 * drawing it means a broken-image flash rather than the blurhash.
 */
export function tilePoster(media: FeedMedia | null, nowMs = Date.now()): string | null {
  if (!media) return null
  if (isExpired(media, nowMs)) return null
  return pickThumb(media) ?? null
}

/** The blurhash to draw under it, or nothing. Never expires. */
export function tileBlurhash(media: FeedMedia | null): string | null {
  return media?.blurhash || null
}

/** "0:28". Null when the row does not say — never a guessed number. */
export function tileDuration(media: FeedMedia | null): string | null {
  return formatDuration(media?.duration_ms)
}

/**
 * The likes badge, or nothing.
 *
 * Zero is not drawn. A reel with no likes yet is the ordinary state of a new
 * reel, and a "0" under it reads as a verdict — the phone's rail makes the
 * same call (`railCountLabel` falls back to the control's NAME rather than to
 * a zero), and this is the same rule with no control to name.
 *
 * These are counts and NOT buttons. Like, save, share, comment and follow all
 * live one click away in the immersive view, where the state machines, the
 * optimistic rollbacks and the analytics already are. A second set of them
 * here would be a second implementation of every one of those, on a surface
 * that would then need its own engagement events to explain what happened.
 */
export function tileLikes(item: FeedItem): string | null {
  const likes = item.counts?.likes ?? 0
  return likes > 0 ? formatCount(likes) : null
}

/** Ditto for comments. */
export function tileComments(item: FeedItem): string | null {
  if (item.no_comments) return null
  const comments = item.counts?.comments ?? 0
  return comments > 0 ? formatCount(comments) : null
}

/** Who made it, in the phone's own words: "@handle", else the display name. */
export function tileAuthor(item: FeedItem): string {
  return reelAuthorLabel(item.author?.username, item.author?.display_name)
}

/**
 * The tile's accessible name — the WHOLE tile's, because the tile is one link.
 *
 * A grid cell that is a link with a nested "Expand" button is two controls for
 * one act, one of them inside the other, which is the nesting browsers and
 * screen readers disagree about most. So there is one anchor per reel, the
 * visible "Expand" pill inside it is `aria-hidden` decoration, and this string
 * is what a screen reader announces. Position is included because a grid gives
 * no other sense of where in a list you are.
 *
 * "Expand" and not "Open" or "Watch": it is the founder's own word for this
 * control, and it is accurate — the reel is already on screen as a picture and
 * the link makes it full-screen and playing.
 */
export function tileLabel(item: FeedItem, position: number, total: number): string {
  const parts = [`Expand reel ${position} of ${total}`, `by ${tileAuthor(item)}`]
  const text = item.text?.trim()
  if (text) parts.push(`— ${text.slice(0, 80)}`)
  return parts.join(" ")
}
