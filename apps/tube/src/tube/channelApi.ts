/**
 * The URLs the Tube APPLICATION knows, as opposed to the ones its video feed
 * knows.
 *
 * ./api.ts is the feed, the follow graph, the action bar and analytics — the
 * network surface the browse grid and the watch page were built on. This file
 * is everything the shell and the two new pages need: the category taxonomy
 * behind the chip rail, a channel, a channel's videos, a channel's playlists,
 * and the two searches the top bar's box runs.
 *
 * Two files rather than one long one for the reason ./api.ts gives about
 * itself: a file whose name is a lie about half its contents is worse than
 * two short ones. This is also where the channel-subscription routes live,
 * since 2026-09-12 when they became real: see the Subscriptions section.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance; every gateway response is
 * `{data, error, meta}` and a caller reads `res.data.data`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTES VERIFIED AGAINST THE RUNNING GATEWAY, 2026-09-09, NO COOKIE JAR
 *
 *   GET /v1/posts/categories                  200 [{id,label}]      PUBLIC
 *   GET /v1/channels/{handle_or_user_id}      200 channel | 404     PUBLIC
 *   GET /v1/channels/search?q=&limit=         200 [channel]         PUBLIC
 *   GET /v1/creators/{user_id}/playlists      200 []                PUBLIC
 *   GET /v1/posts/by-author/{id}?type=&limit= 200 [bare post]       PUBLIC
 *   GET /v1/posts/recent?content_type=&limit= 200 [bare post]       PUBLIC
 *   GET /v1/search?q=&types=posts&limit=      200 grouped           PUBLIC
 *   GET /v1/feed/videos                       401 without a session
 *
 * That last line is the one that shaped the signed-out home page, and the
 * public lines above it are why it did not have to be a wall. See
 * `fetchPublicVideosPage`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTES CODED AGAINST THE SUBSCRIPTION CONTRACT, 2026-09-12, SESSION REQUIRED
 *
 * These are being built on the server while this file is written, so they
 * are the contract as agreed rather than a wire read; the first person to
 * run them against a stack should update this table.
 *
 *   GET    /v1/channels/subscriptions?limit&cursor
 *          {data:[{channel:{user_id,name,handle,avatar_url,subscriber_count},
 *                  notify_on, subscribed_at}], meta:{next_cursor}}
 *   GET    /v1/channels/{ref}/subscription
 *          {subscribed:false} | {subscribed:true, notify_on, subscribed_at}
 *   POST   /v1/channels/{ref}/subscribe   {notify_on?}         idempotent
 *          {status:"subscribed", notify_on, follow:"followed"|"requested",
 *           subscriber_count}
 *   DELETE /v1/channels/{ref}/subscribe
 *          {status:"unsubscribed", subscriber_count}
 *   PATCH  /v1/channels/{ref}/subscription {notify_on}
 *          {subscribed:true, notify_on}   400 INVALID_NOTIFY_ON, 404 NOT_SUBSCRIBED
 *
 * `{ref}` is a handle or the owner's user id, the same `{key}` the channel
 * route takes. `GET /v1/channels/{ref}` itself now carries `subscriber_count`
 * and, with a session, `is_subscribed` and `notify_on`.
 *
 * The literal path `/v1/channels/subscriptions` used to be read as a HANDLE
 * by the router and answer "Channel not found"; the contract puts the list
 * route ahead of the `{ref}` route. If the rail's channel list is empty on a
 * stack where it should not be, that ordering is the first thing to check.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import type { ChannelRef, TubeChannel } from "./channels"
import { bareHandle, isLongVideoRow } from "./channels"
import {
  parseNotifyOn,
  parseSubscription,
  subscriptionsToChannels,
  type ChannelSubscription,
  type NotifyOn,
  type SubscriptionRow,
} from "./subscription"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/* ── The category taxonomy ────────────────────────────────────────────────── */

/** One chip. `id` is the slug `?category=` takes; `label` is the word drawn. */
export interface TubeCategory {
  id: string
  label: string
}

/**
 * The server's own taxonomy, for the chip rail.
 *
 * PUBLIC — it answers 200 with no session, which is what lets a signed-out
 * visitor still filter the public grid. The list on the dev stack is
 * comedy / music / dance / food / travel / sports / … and it is the SAME
 * vocabulary the phone's chip rail draws (`categories()` in the Android
 * client's `core/feed/data/VideoFeedApi.kt`), so the two clients cannot drift
 * about what a category is called.
 *
 * A failure here is not a page failure. The rail simply renders "All" alone —
 * `TubeCategories` treats an empty list and a failed list identically,
 * because a chip rail is a narrowing of something that is already on screen.
 */
export async function fetchCategories(): Promise<TubeCategory[]> {
  const res = await api.get<Envelope<TubeCategory[]>>("/v1/posts/categories")
  const rows = res.data?.data
  if (!Array.isArray(rows)) return []
  return rows.filter((row) => typeof row?.id === "string" && row.id.length > 0)
}

/* ── One channel ──────────────────────────────────────────────────────────── */

/**
 * A channel by handle or by user id — the server takes either at `{key}`.
 *
 * Returns null on a 404 and THROWS on anything else, and the difference is
 * the whole point: "no such channel" is a page this app can draw, and "the
 * server is broken" is not. Collapsing both into null would show somebody a
 * "channel not found" page for a channel that exists.
 */
export async function fetchChannel(ref: string): Promise<TubeChannel | null> {
  const key = bareHandle(ref) ?? ref
  try {
    const res = await api.get<Envelope<TubeChannel>>(`/v1/channels/${encodeURIComponent(key)}`)
    const body = res.data?.data
    return body && typeof body.user_id === "string" ? body : null
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404) return null
    throw error
  }
}

/**
 * The viewer's own channel, or null when they have not made one.
 *
 * `GET /v1/channels/me` answers 404 `NO_CHANNEL` for an account that has
 * never published — that is the documented, expected answer and not a fault,
 * so it is null here rather than a throw. 401 is also null: a signed-out
 * browser has no channel in the only sense the rail cares about, and the rail
 * already draws its signed-out shape from the session.
 *
 * Everything else throws, because "the server is broken" and "you have no
 * channel" are different facts and the rail says different things about them.
 */
export async function fetchOwnChannel(): Promise<TubeChannel | null> {
  try {
    const res = await api.get<Envelope<TubeChannel>>("/v1/channels/me")
    const body = res.data?.data
    return body && typeof body.user_id === "string" ? body : null
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404 || status === 401) return null
    throw error
  }
}

/**
 * A channel's subscriber count, off its own row.
 *
 * There used to be a `fetchSubscriberCount` here that read the owner's
 * `follower_count` from `/v1/profiles/{user_id}`, because the follow edge was
 * the only edge. The channel row carries `subscriber_count` now and that is
 * the number the page is about, so the watch page reads it from the same
 * `GET /v1/channels/{ref}` the channel page draws its header from.
 *
 * Null rather than 0 when the row is missing the field or the request fails.
 * A row that prints "No subscribers yet" because a side request failed has
 * stated something false about somebody's channel; a row with no number
 * there has merely said less.
 */
export async function fetchChannelSubscriberCount(ref: string): Promise<number | null> {
  const channel = await fetchChannel(ref)
  const count = channel?.subscriber_count
  return typeof count === "number" ? count : null
}

/* ── A channel's videos ───────────────────────────────────────────────────── */

/** Rows plus the cursor that follows them, or null at the end. */
export interface VideoRows {
  items: FeedItem[]
  nextCursor: string | null
}

/**
 * How many rows a channel page or a search asks for at once.
 *
 * Smaller than the feed's 12 would be pointless and larger costs blurhash
 * decodes on the main thread for videos nobody scrolls to — the same argument
 * `PAGE_SIZE` in ./api.ts makes, and the same number, so the two grids fill at
 * the same rate.
 */
const PAGE_SIZE = 12

/**
 * One author's long videos, newest first — post-service `GetPostsByAuthor`.
 *
 * ── The rows are PARTLY hydrated, and the exact shortfall matters ─────────
 * Read off the live gateway on 2026-09-09 rather than assumed. A
 * `/v1/posts/by-author` row carries id, title, text, counts, `view_count`,
 * timestamps, and a `media[]` with `media_id`, `kind`, `duration_ms`,
 * `processing_status`, `moderation_status` and `hls_url`. It does NOT carry
 * `variants`, `blurhash`, `author` or `channel`.
 *
 * So a card built from one of these draws its title, its age, its counts and
 * its duration, and has no poster: `videoPoster` reads `variants.thumb_150`
 * and there is none, and there is no blurhash to soften the gap either. The
 * "No video attached" plate does NOT appear — `isWatchable` asks whether
 * there is a video at all, and there is.
 *
 * The channel page supplies the missing name itself — it HAS the channel, it
 * is the page about it — which is what `hideCreator` on `VideoCard` is for.
 *
 * ── A third cursor family ─────────────────────────────────────────────────
 * `/v1/posts/*` pages on a bare RFC3339Nano timestamp, not on the opaque
 * base64 token `/v1/feed/*` uses. ./api.ts's `VideosPage` documents all three
 * families and warns that mixing them is a 400. Nothing here constructs one:
 * it is echoed back verbatim.
 */
export async function fetchAuthorVideos(
  authorId: string,
  cursor?: string | null
): Promise<VideoRows> {
  const res = await api.get<Envelope<FeedItem[]>>(
    `/v1/posts/by-author/${encodeURIComponent(authorId)}`,
    {
      params: {
        type: "long_video",
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    }
  )
  return {
    items: res.data?.data ?? [],
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/*
 * The public long-video shelf — `GET /v1/posts/recent?content_type=long_video`
 * — is NOT here. It is the signed-out branch of `fetchVideosPage` in ./api.ts,
 * next to the ranked feed it replaces, because the two are one question
 * ("give me a page of long video") answered differently depending on whether
 * there is a session. Splitting them across two files would let a caller ask
 * one of them and forget the other exists, which is precisely how the
 * signed-out page became a wall in the first place.
 */

/* ── Playlists ────────────────────────────────────────────────────────────── */

/**
 * One playlist, as much of it as can be relied on.
 *
 * ── An honest note about this type ────────────────────────────────────────
 * `GET /v1/creators/{user_id}/playlists` is real and answers 200 — verified
 * for a live creator id and for a nonexistent one, both `{"data":[]}`. Every
 * creator on this dev stack has zero playlists, so the ROW shape has never
 * been observed. The fields below are therefore optional to a fault and the
 * rendering treats a row with no title as unrenderable rather than guessing:
 * a playlist tab that draws "undefined" for six rows is worse than one that
 * says it cannot read them.
 *
 * This is the one place in the zone where the wire shape is documented as
 * unverified, and it is documented rather than quietly assumed.
 */
export interface TubePlaylist {
  id?: string
  playlist_id?: string
  title?: string
  name?: string
  description?: string
  video_count?: number
  item_count?: number
  visibility?: string
}

export async function fetchCreatorPlaylists(userId: string): Promise<TubePlaylist[]> {
  const res = await api.get<Envelope<TubePlaylist[]>>(
    `/v1/creators/${encodeURIComponent(userId)}/playlists`
  )
  const rows = res.data?.data
  return Array.isArray(rows) ? rows : []
}

/* ── Subscriptions ────────────────────────────────────────────────────────── */

/**
 * The path for one channel's subscription routes. `{ref}` is a handle or the
 * owner's user id; the "@" is stripped for the same reason `fetchChannel`
 * strips it, and the id is encoded because a handle is user-typed text.
 */
function channelPath(ref: string, tail: string): string {
  const key = bareHandle(ref) ?? ref
  return `/v1/channels/${encodeURIComponent(key)}/${tail}`
}

/**
 * Is the viewer subscribed to this channel, and are they being told about
 * its uploads.
 *
 * Throws on a failed request rather than answering "not subscribed": the
 * caller (`useSubscription`) leaves the control ABSENT on a throw, and a
 * function that turned a timeout into `{subscribed:false}` would have it
 * offer Subscribe to somebody who already is. Never called for the viewer's
 * own channel or without a session; the hook enforces that, not this.
 */
export async function fetchSubscription(ref: string): Promise<ChannelSubscription> {
  const res = await api.get<Envelope<unknown>>(channelPath(ref, "subscription"))
  return parseSubscription(res.data?.data)
}

/** What `POST …/subscribe` answers, in this zone's words. */
export interface SubscribeOutcome {
  notifyOn: NotifyOn
  /**
   * The follow edge the subscribe created underneath. "requested" is a
   * private account, and it is carried for analytics rather than drawn: the
   * subscription itself is real in both cases (./subscription.ts, header).
   */
  follow: "followed" | "requested"
  /** The server's own count, or null when the body did not carry one. */
  subscriberCount: number | null
}

/**
 * Subscribe: follow the owner AND turn notifications on, in one request.
 *
 * Idempotent on the server, so a double-press is two identical answers
 * rather than an error; `useSubscription` still drops the second press while
 * the first is in flight, because two round trips whose net effect is nothing
 * is not what anybody wants from a double-tap.
 *
 * `notify_on` is sent only when the caller has an opinion. Omitting it lets
 * the server apply the founder's default (on), which keeps the one place that
 * default is written on the server rather than duplicated here.
 */
export async function subscribe(ref: string, notifyOn?: NotifyOn): Promise<SubscribeOutcome> {
  const res = await api.post<
    Envelope<{ status?: string; notify_on?: unknown; follow?: string; subscriber_count?: unknown }>
  >(channelPath(ref, "subscribe"), notifyOn ? { notify_on: notifyOn } : {})
  const body = res.data?.data
  if (body?.status !== "subscribed") {
    // An unrecognised status is not assumed to be success. The hook rolls
    // back and says so, which is better than a button that says Subscribed
    // over an edge nobody confirmed.
    throw new Error(`Unexpected subscribe status: ${String(body?.status)}`)
  }
  return {
    notifyOn: parseNotifyOn(body.notify_on),
    follow: body.follow === "requested" ? "requested" : "followed",
    subscriberCount: typeof body.subscriber_count === "number" ? body.subscriber_count : null,
  }
}

/** Unsubscribe: remove the notification preference and the follow edge. */
export async function unsubscribe(ref: string): Promise<{ subscriberCount: number | null }> {
  const res = await api.delete<Envelope<{ status?: string; subscriber_count?: unknown }>>(
    channelPath(ref, "subscribe")
  )
  const body = res.data?.data
  if (body?.status !== "unsubscribed") {
    throw new Error(`Unexpected unsubscribe status: ${String(body?.status)}`)
  }
  return {
    subscriberCount: typeof body.subscriber_count === "number" ? body.subscriber_count : null,
  }
}

/**
 * The bell. Changes which uploads the viewer is told about and nothing else.
 *
 * 404 NOT_SUBSCRIBED is a real answer here and it is left to throw: it means
 * the subscription went away under this page (another tab, the phone), and
 * the honest thing is for the bell's write to fail visibly rather than for
 * this function to quietly re-subscribe somebody to fix its own request.
 */
export async function setNotifyOn(ref: string, notifyOn: NotifyOn): Promise<NotifyOn> {
  const res = await api.patch<Envelope<{ subscribed?: boolean; notify_on?: unknown }>>(
    channelPath(ref, "subscription"),
    { notify_on: notifyOn }
  )
  return parseNotifyOn(res.data?.data?.notify_on)
}

/**
 * How many subscriptions the rail asks for at once, and how many pages it is
 * willing to walk. Fifty is the ceiling every `/v1/feed/*` surface clamps to
 * and is assumed to be this one's too; four pages is two hundred channels,
 * past which a rail of names is not a navigation structure anyone scrolls
 * and the page-two cursor is better spent by a dedicated list.
 */
const SUBSCRIPTIONS_PAGE = 50
const SUBSCRIPTIONS_MAX_PAGES = 4

/**
 * The channels the viewer subscribes to, in the server's order.
 *
 * This function was, until 2026-09-12, the documented one-line swap: the
 * subscriptions route was a 404 that read "subscriptions" as a handle, so
 * the list was derived from a page of `following_only` video. The route is
 * real now and the derivation is deleted, not kept as a fallback, because
 * the two lists MEAN different things ("channels you follow that have
 * posted" against "channels you subscribe to") and a rail that fell back
 * from one to the other would change its meaning on a network error.
 *
 * Every caller asks for `ChannelRef[]` and nothing else; the viewer's id is
 * no longer needed because the server knows who is asking.
 */
export async function fetchSubscribedChannels(): Promise<ChannelRef[]> {
  const rows: SubscriptionRow[] = []
  let cursor: string | undefined
  for (let page = 0; page < SUBSCRIPTIONS_MAX_PAGES; page += 1) {
    const params: { limit: number; cursor?: string } = { limit: SUBSCRIPTIONS_PAGE, cursor }
    const res = await api.get<Envelope<SubscriptionRow[]>>("/v1/channels/subscriptions", {
      params,
    })
    const body: Envelope<SubscriptionRow[]> | undefined = res.data
    if (Array.isArray(body?.data)) rows.push(...body.data)
    cursor = body?.meta?.next_cursor || undefined
    if (!cursor) break
  }
  return subscriptionsToChannels(rows)
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/**
 * Channels matching a query — post-service's own channel index.
 *
 * NOT `/v1/search?types=channels`, and that is a finding rather than a
 * preference. `types` does accept `channels` (the 400 lists the whole set:
 * posts, users, hashtags, products, communities, channels), and it answers
 * `{"channels":{"items":[]}}` for every query — including ones
 * `/v1/channels/search` answers with three real channels. The search-service
 * channel index is empty on this stack. So the box asks post-service
 * directly, which demonstrably works, and the day the index is populated this
 * call can fold into the one below.
 */
export async function searchChannels(query: string, limit = 8): Promise<ChannelRef[]> {
  const res = await api.get<Envelope<TubeChannel[]>>("/v1/channels/search", {
    params: { q: query, limit },
  })
  const rows = res.data?.data
  if (!Array.isArray(rows)) return []
  return rows
    .filter((row) => typeof row?.user_id === "string" && row.user_id.length > 0)
    .map((row) => ({
      user_id: row.user_id,
      name: row.name?.trim() || row.handle || "Channel",
      handle: bareHandle(row.handle) ?? "",
      avatar_url: row.avatar_url ?? null,
    }))
}

/** One post row of the grouped search response. Narrowed to what Tube draws. */
export interface SearchVideoRow {
  id: string
  post_id?: string
  title?: string
  text?: string
  content_type?: string
  post_type?: string
  duration_ms?: number
  created_at?: string
  like_count?: number
  comment_count?: number
  thumbnail_url?: string | null
  author?: { id?: string; display_name?: string; username?: string; avatar_url?: string | null }
}

/**
 * Long videos matching a query.
 *
 * ── `types` plural, and never `type` singular ─────────────────────────────
 * Straight out of apps/social/src/search/api.ts, which discovered it and paid
 * for it: `types=posts` selects the grouped, pageable branch
 * (`{results:{posts:{items:[…]}}}`), while `type=posts` is a DIFFERENT branch
 * of the same handler with a flat body and no cursors. A typo between them
 * does not error — it returns a shape whose every field is undefined, which
 * renders as "no results" for a query that matched.
 *
 * ── The video narrowing is done HERE, on the client ───────────────────────
 * The singular branch has a `videos` mode; the grouped one does not, and the
 * grouped one is the only one with a documented shape. So this asks for posts
 * and keeps the long ones. That is a real limitation: the server pages over
 * ALL posts, so a query whose first page is entirely photos returns nothing
 * here even though a second page might have a video on it. The results page
 * says "no videos matched" rather than "nothing matched", which is the true
 * statement of what this call can know.
 */
export async function searchVideos(query: string, limit = 20): Promise<SearchVideoRow[]> {
  const res = await api.get<Envelope<{ results?: { posts?: { items?: SearchVideoRow[] } } }>>(
    "/v1/search",
    { params: { q: query, types: "posts", limit } }
  )
  const items = res.data?.data?.results?.posts?.items
  if (!Array.isArray(items)) return []
  // The predicate lives in ./channels.ts, with the rest of this zone's pure
  // rules, so it can be asserted without a server or an axios instance.
  return items.filter((row) => isLongVideoRow(row))
}
