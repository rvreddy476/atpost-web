/**
 * One long video, reduced to the strings and the decisions a surface can make
 * from a feed row.
 *
 * Pure: no React, no network, no DOM. Both surfaces in this zone read it — the
 * browse grid and the watch page — which is the point: a card and the page it
 * opens must not disagree about what a video is called or who made it, and the
 * only way to guarantee that is for the answer to have one implementation that
 * can be asserted as arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE VOCABULARY IS THE PHONE'S, NOT INVENTED HERE
 *
 * `channel` before `author`, `title` before `text`, "Untitled video" last —
 * that chain is `watchDetails` in the Android client's
 * `feature/tube/ui/watch/WatchDetails.kt`, transcribed rather than reasoned
 * out afresh, so the two clients cannot drift about what a video is called.
 *
 * The channel/author split is a real distinction and not a fallback for a
 * missing field. A long video is published BY A CHANNEL — post-service
 * answers `403 CHANNEL_REQUIRED` to a `long_video` post from an account that
 * has not made one — so `channel.name` is the name under the video, and the
 * author is who to fall back to for the rows that predate channels. Verified
 * on the live feed: every one of the six long videos this account can see
 * carries a `channel` with a `name` and a `handle`, while only two of the four
 * authors carry an `avatar_media_id` and NOT ONE carries a `username`.
 *
 * That last fact is why the handle matters here more than it does on reels:
 * `channel.handle` is the only "@something" this content has.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A `long_video` CAN ARRIVE WITH NO MEDIA, AND TWO OF SIX DO
 *
 * Verified on the live gateway, 2026-09-09: `e6eb184f-…` ("CQS final proof")
 * and `547d18fb-…` ("CQS proof") are `content_type: long_video`, are NOT
 * `is_processing`, are NOT `is_scheduled`, and carry no `media` key at all.
 * They are real rows in this viewer's feed and the server means to return
 * them. @atpost/types' own header records the same thing.
 *
 * So "is there a video here" is a question this file answers explicitly, and
 * the two surfaces answer it differently on purpose:
 *
 *   · the grid still draws the row. Dropping it would make somebody's own
 *     video vanish from their Tube with nothing on screen to say why, and a
 *     grid whose item count silently disagrees with the feed's is a grid
 *     nobody can debug.
 *   · the watch page still opens. It has room for a sentence, and a sentence
 *     is what this deserves; a card that refused to be clicked would leave the
 *     explanation nowhere.
 *
 * `isWatchable` is deliberately NOT @momentum/player's `isPlayable`. That one
 * asks whether a KNOWN video may be played — transcode finished, moderation
 * passed, a URL present — and it is asked at the player, where it belongs.
 * This one asks the prior question: is there a video attached to this post at
 * all.
 */

import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import { formatCount, formatDuration, isExpired, pickThumb } from "@momentum/content"
import {
  isModerationCleared,
  isPlayable,
  isTranscodeReady,
  primaryVideo,
} from "@momentum/player"

/**
 * Where a video is watched.
 *
 * ZONE-RELATIVE, and that is the whole subtlety. This is handed to `next/link`
 * inside a zone whose basePath is "/tube", and Next prefixes the basePath
 * itself — so "/{id}" becomes "/tube/{id}" and "/tube/{id}" would become
 * "/tube/tube/{id}". The same trap that made apps/reels ask for
 * `/reels/social` from its own empty state.
 */
export function videoHref(item: Pick<FeedItem, "id">): string {
  return `/${item.id}`
}

/** The video attached to this post, if there is one. */
export function videoMedia(item: FeedItem): FeedMedia | null {
  return primaryVideo(item) ?? null
}

/** Is there anything here to watch? See the header — two of six say no. */
export function isWatchable(item: FeedItem): boolean {
  return videoMedia(item) !== null
}

/**
 * Why there is no picture, or null when there is one.
 *
 * The watch page has room to say which of these it is, and they are NOT the
 * same news. A transcode still running finishes on its own and is worth
 * waiting for; a moderation hold is somebody else's decision and waiting will
 * not change it today; a row with no media at all is an upload that never
 * attached, and there is nothing to wait for at all. One "video unavailable"
 * for all three tells somebody to reload a page that will never be different.
 *
 * The order matters. `is_processing` is checked BEFORE the media state because
 * it lives on the POST and the media row can lag behind it — a video whose
 * transcode job is running can carry a media row still marked ready from a
 * previous pass, and reporting that one as playable is how a black rectangle
 * with a broken-file glyph gets on screen. @momentum/player's `isPlayable`
 * makes the same check in the same order and for the same reason; this
 * function exists to say WHICH of its conditions failed, not to second-guess
 * it, so it ends by deferring to it.
 */
export function noPictureReason(
  item: FeedItem
): "processing" | "moderation" | "missing" | null {
  const media = videoMedia(item)
  if (!media) return "missing"
  if (item.is_processing || !isTranscodeReady(media)) return "processing"
  if (!isModerationCleared(media)) return "moderation"
  // Everything is cleared and there is still no URL to play. Rare, and it is
  // "missing" rather than "processing": nothing is on its way.
  if (!isPlayable(item, media)) return "missing"
  return null
}

/**
 * What this video is called.
 *
 * `title` is a real, required field on `long_video` — post-service binds it at
 * ≤100 characters — so it is almost always the answer. The `text` fallback is
 * for the rows that predate the requirement, and it takes the FIRST LINE only:
 * a description's second paragraph is not a title, and a heading that wrapped
 * to four lines in a grid cell would push every card in its row out of line.
 */
export function videoTitle(item: FeedItem): string {
  const title = item.title?.trim()
  if (title) return title
  const firstLine = item.text?.split("\n")[0]?.trim()
  if (firstLine) return firstLine
  return "Untitled video"
}

/** The channel's name, else the author's, else the honest placeholder. */
export function creatorName(item: FeedItem): string {
  const channel = item.channel?.name?.trim()
  if (channel) return channel
  const author = item.author?.display_name?.trim()
  return author || "Someone"
}

/**
 * "@handle", or nothing.
 *
 * Null rather than a placeholder, because there is no such thing as a stand-in
 * handle: "@Ada Lovelace" is not an address, and an "@" with nothing after it
 * is worse than the name on its own. The name is always drawn; this is drawn
 * beside it when it exists.
 */
export function creatorHandle(item: FeedItem): string | null {
  const channel = item.channel?.handle?.replace(/^@/, "").trim()
  if (channel) return `@${channel}`
  const username = item.author?.username?.replace(/^@/, "").trim()
  return username ? `@${username}` : null
}

/**
 * The still to draw, or nothing.
 *
 * ── Why `pickThumb` and not `pickPoster`, and why not the author's cover ───
 * `pickPoster` in @momentum/player refuses `thumb_150` for a video ON PURPOSE
 * — a 150px still stretched across a 600px card looks like a fault — and it is
 * right about a card. In a two-across grid inside the frame's 600px centre
 * track a cell is ~292px wide, which is the case `pickThumb` in
 * @momentum/content is written for, and `thumb_150` is the only IMAGE these
 * rows carry: 360p / 480p / 720p / original are transcode renditions, so a
 * grid built on `pickPoster` would be entirely blurhash.
 *
 * The obvious better answer is `cover_media_id` — the frame the author chose
 * in the cover picker, which two of these six videos have. It cannot be used,
 * and the reason is worth writing down so nobody tries it twice:
 * `GET /v1/media/{id}` answers with metadata whose `cdn_url` and whose
 * `variants[].object_key` are UNSIGNED paths, and the media host answers 403
 * to an unsigned request. Both verified on 2026-09-09 — the metadata call and
 * then the 403 from the URL it hands back. So the cover would cost one extra
 * request per card and end in a broken image. When the API grows a signed
 * cover URL this is the one function that changes.
 *
 * `nowMs` is a parameter so the expiry branch is testable without waiting five
 * minutes. `isExpired` carries its own 10s skew: a URL with four seconds left
 * is one that will expire during the request it is about to be used for, and
 * drawing it means a broken-image flash rather than the blurhash.
 */
export function videoPoster(media: FeedMedia | null, nowMs = Date.now()): string | null {
  if (!media) return null
  if (isExpired(media, nowMs)) return null
  return pickThumb(media) ?? null
}

/** The blurhash to draw under it, or nothing. Never expires. */
export function videoBlurhash(media: FeedMedia | null): string | null {
  return media?.blurhash || null
}

/** "3:41". Null when the row does not say — never a guessed number. */
export function videoDuration(media: FeedMedia | null): string | null {
  return formatDuration(media?.duration_ms)
}

/**
 * "1.2K views", "1 view", "No views yet".
 *
 * ── Why zero IS drawn here, when a like count of zero is not ──────────────
 * `tileLikes` in apps/reels refuses to draw a "0", and it is right to: a zero
 * under a heart reads as a verdict on the video. Views are the opposite kind
 * of number. On a long video the view count is the primary fact a card states
 * about how a video has done, and omitting it at zero would mean the ONE
 * surface where the number matters silently drops it exactly when it is least
 * flattering — which is a nicer lie, not a truer one. "No views yet" says the
 * same thing "0" would, in words that are about time rather than about worth.
 *
 * It is the server's number and not a client guess: `view_count` is a
 * top-level field on the feed row, fed from the analytics counter, separate
 * from the `counts` blob. It is 0 for every video on the dev stack today.
 */
export function viewsLabel(item: FeedItem): string {
  const views = item.view_count ?? 0
  if (views <= 0) return "No views yet"
  if (views === 1) return "1 view"
  return `${formatCount(views)} views`
}

/**
 * The likes badge, or nothing. Zero is not drawn — see `viewsLabel` for the
 * distinction, which is deliberate and not an inconsistency.
 */
export function likesLabel(item: FeedItem): string | null {
  const likes = item.counts?.likes ?? 0
  return likes > 0 ? formatCount(likes) : null
}

/** Ditto for comments, and nothing at all when the author turned them off. */
export function commentsLabel(item: FeedItem): string | null {
  if (item.no_comments) return null
  const comments = item.counts?.comments ?? 0
  return comments > 0 ? formatCount(comments) : null
}

/**
 * The card's accessible name — the WHOLE card's, because a card is one link.
 *
 * A grid cell that is a link with a nested "Watch" button is two controls for
 * one act, one of them inside the other, which is the nesting browsers and
 * screen readers disagree about most. So there is one anchor per video, every
 * visible mark inside it is `aria-hidden`, and this string is what a screen
 * reader announces. Position is included because a grid gives no other sense
 * of where in a list you are.
 *
 * The verb is "Watch" and not "Expand". Expand is the founder's word for what
 * the control on the WATCH PAGE does — "when user click on Full video expand,
 * it ill play full video" — and reusing it for the card would name two
 * different acts with one word on two surfaces one click apart.
 */
export function cardLabel(item: FeedItem, position: number, total: number): string {
  const parts = [`Watch ${videoTitle(item)}`, `video ${position} of ${total}`]
  parts.push(`by ${creatorName(item)}`)
  const duration = videoDuration(videoMedia(item))
  if (duration) parts.push(duration)
  if (!isWatchable(item)) parts.push("— no video attached")
  return parts.join(", ")
}

/**
 * Whether this surface should draw the follow control for a channel.
 *
 * ── The half taken from Android, unchanged ────────────────────────────────
 * Never for the viewer's own video, and never while the edge is still UNKNOWN.
 * `edge` is undefined until `relationships/batch` answers, and refusing to
 * guess matters for a reason worth repeating: a Follow button that appears and
 * then vanishes when the real answer lands is worse than one that arrives
 * late, because the person in between has been told something false about who
 * they follow.
 *
 * ── The half that is deliberately different ───────────────────────────────
 * Android hides the control once the edge IS "following", because on the phone
 * the channel row is one tap from the channel page, which is where you would
 * go to undo it. The web has no channel page yet, so hiding the control here
 * would make a follow taken on this surface impossible to undo ANYWHERE. Once
 * the edge is known the control stays and says which of the three states it is
 * in — which is also what `@momentum/interactions`' FollowButton is built for.
 */
export function showsFollow(
  viewerId: string | null,
  authorId: string | undefined,
  edge: "none" | "following" | "requested" | undefined
): boolean {
  if (!authorId || !viewerId) return false
  if (authorId === viewerId) return false
  return edge !== undefined
}
