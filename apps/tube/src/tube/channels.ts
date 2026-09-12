/**
 * A channel — the identity a long video is published under — reduced to the
 * strings and the links a surface can make from it.
 *
 * Pure: no React, no network, no DOM. The same discipline as ./video.ts and
 * for the same reason: four surfaces in this zone now say a channel's name
 * (the grid, the rail, the subscriptions page and the channel page itself),
 * and the one thing they must never do is disagree about where its name
 * links to.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A CHANNEL IS ON THE WIRE, VERIFIED 2026-09-09
 *
 *     GET /v1/channels/{handle_or_user_id}      -> 200, no session needed
 *     {"data":{"user_id","name","handle","about","avatar_media_id",
 *              "avatar_url","video_count","created_at","updated_at"}}
 *
 * Read against the running gateway with no cookie jar at all: it is public,
 * and `GET /v1/channels/cqsproof1788722611` answers with the row above while
 * `GET /v1/channels/ada` answers 404 NOT_FOUND. The `{key}` really does
 * accept either a bare handle or a user id, which is why `channelRef` below
 * does not try to tell them apart.
 *
 * ── What the row gained on 2026-09-12, and what it still does not carry ───
 *
 *   · `subscriber_count`, and for a signed-in viewer `is_subscribed` and
 *     `notify_on`. Channel subscriptions are a real edge now, with their own
 *     routes (`/v1/channels/{ref}/subscribe`, `…/subscription`,
 *     `/v1/channels/subscriptions`), and the count under a channel's name is
 *     the count of THAT edge rather than the owner's `follower_count` read
 *     off a profile. ./subscription.ts is the pure half of it and
 *     ./channelApi.ts the network half. The count is optional in the type
 *     because the server is being built against this contract while this is
 *     written, and a row from before the column exists must not crash the
 *     page: `ChannelScreen` draws nothing for a missing number rather than
 *     zero.
 *
 *   · NO BANNER. There is no cover, header or banner field on a channel, and
 *     none on `/v1/profiles/{id}` either — that row has display_name, bio,
 *     counts and no cover_media_id. So `bannerSeed` below derives a stable
 *     gradient from the handle. It is honestly decorative: it never claims to
 *     be a picture the creator chose, and the day the API grows one this is
 *     the single function that changes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HANDLE IS THE ADDRESS, AND IT IS THE ONLY ONE
 *
 * `channel.handle` is the only "@something" a long video carries: verified on
 * the live feed, not one of the four authors behind the six videos has a
 * `username`. So a channel link is built from the handle when there is one
 * and from the user id when there is not, and `channelRef` is the function
 * that makes that choice once.
 */

import type { FeedItem } from "@atpost/types/feed"
import { formatCount } from "@momentum/content"

/** `GET /v1/channels/{ref}`, exactly as post-service sends it. */
export interface TubeChannel {
  user_id: string
  name: string
  handle: string
  about: string
  avatar_media_id: string | null
  avatar_url: string | null
  video_count: number
  /**
   * How many people subscribe. Absent from a row written before the column
   * existed; null is never SENT but is accepted so a caller can hold "not
   * read" and "zero" apart, which `subscribersLabel` needs them to be.
   */
  subscriber_count?: number | null
  /** Only when the request carried a session. Read by `useSubscription`'s
      own GET rather than from here, so the three surfaces that draw the
      control share ONE source for the viewer's edge. */
  is_subscribed?: boolean
  notify_on?: string
  created_at: string
  updated_at: string
}

/**
 * One row of the rail's subscribed-channel list, and of a search result.
 * Built from a subscriptions row by `subscriptionsToChannels` in
 * ./subscription.ts and from a search hit by `searchChannels` in
 * ./channelApi.ts; both normalise the handle so the rail's links are the
 * same links the search box makes.
 */
export interface ChannelRef {
  user_id: string
  name: string
  /** Bare — never with a leading "@". Empty when the channel has none. */
  handle: string
  avatar_url: string | null
}

/* ── Handles ──────────────────────────────────────────────────────────────── */

/**
 * A handle with no decoration: no "@", no surrounding space, no empty string.
 *
 * The "@" is stripped rather than rejected because it arrives both ways. The
 * URL segment is `@cqsproof1788722611` (the founder's YouTube shape, and what
 * `next.config.ts` rewrites), while `channel.handle` on a feed row is bare.
 * One normaliser means a link built from either is the same link.
 */
export function bareHandle(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().replace(/^@+/, "").trim()
  return trimmed || null
}

/** "@name", or null. Never a bare "@" and never a placeholder. */
export function atHandle(raw: string | null | undefined): string | null {
  const bare = bareHandle(raw)
  return bare ? `@${bare}` : null
}

/**
 * What to put in the URL for this channel: its handle, else its user id.
 *
 * Null when there is neither, and null is load-bearing — it is what stops a
 * name becoming a link to `/@` or to `/@undefined`, which is the failure this
 * whole file exists to make unexpressible.
 */
export function channelRef(
  channel: { handle?: string | null; user_id?: string | null } | null | undefined
): string | null {
  if (!channel) return null
  return bareHandle(channel.handle) ?? (channel.user_id?.trim() || null)
}

/**
 * Where a channel is read, ZONE-RELATIVE.
 *
 * "/@handle" and NOT "/tube/@handle", for exactly the reason `videoHref` in
 * ./video.ts returns "/{id}": this is handed to `next/link` inside a zone
 * whose basePath is "/tube", and Next prefixes the basePath itself. The same
 * trap that made apps/reels ask for `/reels/social` from its own empty state.
 *
 * The "@" is not cosmetic. `apps/tube/next.config.ts` rewrites `/@:handle`
 * onto the real route BEFORE the filesystem is consulted, which is what keeps
 * this out of the watch page's `[postId]` segment — the two cannot both be
 * dynamic at the root of the same app, and a channel is not a post.
 */
export function channelHref(ref: string): string {
  return `/@${bareHandle(ref) ?? ref}`
}

/** The link for a feed row's channel, or null when the row has none. */
export function itemChannelHref(item: FeedItem): string | null {
  const ref = channelRef(item.channel)
  return ref ? channelHref(ref) : null
}

/* ── Counts ───────────────────────────────────────────────────────────────── */

/**
 * "1.2K subscribers".
 *
 * Zero IS drawn, and the word is "No subscribers yet" rather than "0". Same
 * argument `viewsLabel` in ./video.ts makes for views and the opposite of the
 * one `likesLabel` makes for likes: this is the number a channel page is
 * ABOUT, so dropping it exactly when it is least flattering is a nicer lie,
 * not a truer one. Every channel on the dev stack is at 0 today.
 */
export function subscribersLabel(count: number | null | undefined): string {
  const n = count ?? 0
  if (n <= 0) return "No subscribers yet"
  if (n === 1) return "1 subscriber"
  return `${formatCount(n)} subscribers`
}

/** "12 videos". Zero is drawn, for the same reason. */
export function videosLabel(count: number | null | undefined): string {
  const n = count ?? 0
  if (n <= 0) return "No videos yet"
  if (n === 1) return "1 video"
  return `${formatCount(n)} videos`
}

/* ── The banner ───────────────────────────────────────────────────────────── */

/**
 * A stable number in [0, 360) for a channel, from its handle.
 *
 * There is no banner field anywhere in this API (see the header), and the two
 * alternatives were both worse than a gradient. A flat block of --mo-surface
 * makes every channel page look like the same unfinished page. A frame lifted
 * from the channel's newest video would be a picture the creator did not
 * choose, at whatever aspect the transcode happened to leave, and it would
 * change under them whenever they posted.
 *
 * So the banner is openly decorative and openly derived: the same channel
 * gets the same colours on every visit and on every device, and two channels
 * side by side are told apart at a glance. FNV-1a because it is four lines
 * and its avalanche is good enough that "call.userb" and "call.usera" do not
 * land on neighbouring hues — which a sum-of-char-codes hash would.
 */
export function bannerSeed(key: string | null | undefined): number {
  const source = (key ?? "").trim() || "momentum"
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    // FNV prime, in 32-bit arithmetic that JavaScript can actually do.
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 360
}

/**
 * The banner's `background-image`, as a plain string.
 *
 * An inline style and not a Tailwind class on purpose: the hue is data, and a
 * class per hue would either be 360 classes or a JIT arbitrary value Tailwind
 * cannot see in the source to compile. Saturation and lightness are fixed low
 * so the band reads as a surface behind white type rather than as a picture
 * competing with it.
 */
export function bannerImage(key: string | null | undefined): string {
  const hue = bannerSeed(key)
  const second = (hue + 42) % 360
  return `linear-gradient(120deg, hsl(${hue} 46% 26%), hsl(${second} 52% 17%))`
}

/* ── Search rows ──────────────────────────────────────────────────────────── */

/**
 * Is this search hit a long video?
 *
 * ── Why the client has to ask this at all ─────────────────────────────────
 * `/v1/search`'s grouped branch (`?types=posts`) has no video mode, and the
 * flat branch that does (`?type=videos`) has no cursors and no documented
 * shape. So the Tube results page asks for posts and keeps the long ones,
 * which is a real limitation the page states rather than hides.
 *
 * ── Both names, and both fields ───────────────────────────────────────────
 * `long_video` is the current content type and `video` is its legacy synonym:
 * feed-service's `GetLongVideoFeed` reads BOTH, so a filter that dropped
 * `video` would hide exactly the oldest videos on the platform. And the
 * search row carries the type TWICE — as `content_type` and as `post_type` —
 * with older rows filling in only one of them, so either counts.
 *
 * Structurally typed rather than importing `SearchVideoRow` from ../tube/
 * channelApi.ts: that module opens an axios instance at import time, and the
 * whole point of this file is that its rules can be asserted without one.
 */
export function isLongVideoRow(
  row: { content_type?: string; post_type?: string } | null | undefined
): boolean {
  if (!row) return false
  return [row.content_type, row.post_type].some(
    (kind) => kind === "long_video" || kind === "video"
  )
}

/*
 * The rail's subscribed-channel list used to be derived HERE from a page of
 * `following_only` video, transcribed from the Android client's channel
 * bubbles, because there was no subscriptions endpoint. There is one now
 * (`GET /v1/channels/subscriptions`), and its rows are mapped by
 * `subscriptionsToChannels` in ./subscription.ts. The derivation and its note
 * are gone rather than kept "in case": a list that meant "channels you follow
 * that have posted" is a different list from "channels you subscribe to", and
 * keeping both is how a rail ends up showing the wrong one.
 */
