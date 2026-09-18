/**
 * The network the CHANNEL PAGE adds, on top of what ../tube/channelApi.ts
 * already knows.
 *
 * That file belongs to the zone: it is the channel row, the subscription
 * edge, the playlists and the searches, and four surfaces read from it. This
 * one is the channel page's own, and it exists because the page grew three
 * questions the zone does not otherwise ask:
 *
 *   GET /v1/posts/by-author/{id}?type=…&cursor=   one tab's page of rows
 *   GET /v1/posts/by-author/{id}/counts           what the tabs are worth
 *   GET /v1/profiles/{user_id}                    the banner and the join date
 *
 * `fetchAuthorVideos` in ../tube/channelApi.ts is NOT extended to take a type,
 * and that is deliberate rather than shy. It is called by name from the zone's
 * own surfaces with "give me this author's long video" as its whole meaning,
 * and widening it would make every caller pass a parameter to get the
 * behaviour they already had. `fetchChannelPosts` below asks the same route a
 * different question, from the one page that has two tabs to fill.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance; every gateway response is
 * `{data, error, meta}` and a caller reads `res.data.data`. Same as everywhere.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/* ── One tab's rows ───────────────────────────────────────────────────────── */

/**
 * Which kind of thing a content tab is about.
 *
 * Two words rather than a raw `type=` string at each call site, because the
 * SECOND value is the one that gets mistyped: shorts are `flick` today and
 * `reel` in every row written before the rename, and a tab that asked for one
 * of them would silently hide exactly the oldest shorts on the channel. The
 * pairing is ../tube/discoverApi.ts's and is restated here rather than
 * imported so this module has no dependency on the home page's shelves.
 */
export type ChannelFeedKind = "videos" | "shorts"

/** The `type=` each tab sends. `flick,reel` is the canonical name AND its legacy synonym. */
export const CHANNEL_FEED_TYPE: Record<ChannelFeedKind, string> = {
  videos: "long_video",
  shorts: "flick,reel",
}

/**
 * How many rows a tab asks for at once.
 *
 * Twelve, the same number `PAGE_SIZE` uses in ../tube/api.ts and in
 * ../tube/channelApi.ts, so the Videos tab and the browse grid fill at the
 * same rate and a person switching between them does not perceive one of them
 * as the slow page.
 */
const PAGE_SIZE = 12

/** Rows plus the cursor that follows them, or null at the end. */
export interface ChannelPostsPage {
  items: FeedItem[]
  nextCursor: string | null
}

/**
 * One author's posts of one kind, newest first.
 *
 * ── The rows are PARTLY hydrated, and the shortfall is the same one ───────
 * `/v1/posts/by-author` sends bare `PostDetail`: id, title, text, counts,
 * `view_count`, timestamps, and a `media[]` with `media_id`, `kind`,
 * `duration_ms`, `hls_url` and the two status fields. No `variants`, so no
 * poster; no `blurhash`, so nothing to soften the gap; no `author` and no
 * `channel`, which is why every card on this page is drawn `hideCreator` —
 * the page IS the creator. Read off the live gateway on 2026-09-09 and
 * recorded in full in ../tube/channelApi.ts.
 *
 * ── The cursor is echoed, never constructed ───────────────────────────────
 * `/v1/posts/*` pages on a bare RFC3339Nano timestamp while `/v1/feed/*` uses
 * an opaque base64 token, and handing one family's cursor to the other is a
 * 400. Nothing here builds one: `meta.next_cursor` goes back out verbatim.
 */
export async function fetchChannelPosts(
  authorId: string,
  kind: ChannelFeedKind,
  cursor?: string | null
): Promise<ChannelPostsPage> {
  const res = await api.get<Envelope<FeedItem[]>>(
    `/v1/posts/by-author/${encodeURIComponent(authorId)}`,
    {
      params: {
        type: CHANNEL_FEED_TYPE[kind],
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

/* ── What the tabs are worth ──────────────────────────────────────────────── */

/**
 * How many of each kind this author has, or null for a number we could not
 * read.
 *
 * Null and not zero, throughout — the rule the whole zone keeps. A tab label
 * reading "Shorts 0" because a side request timed out has stated something
 * false about somebody's channel; a tab label with no number beside it has
 * merely said less.
 */
export interface AuthorCounts {
  videos: number | null
  shorts: number | null
}

export const NO_COUNTS: AuthorCounts = { videos: null, shorts: null }

/**
 * Read a count out of a counts body, whatever it decided to call the key.
 *
 * ── Why this is permissive, and why that is not laziness ──────────────────
 * `GET /v1/posts/by-author/{id}/counts` is a real route and this dev stack's
 * gateway was not running when this was written (`http://localhost:8080`
 * refused the connection), so the KEYS of its body are the one thing here
 * that has not been read off a wire. The plausible spellings are few and they
 * are all content types this repo already names, so each one is tried and a
 * body that matches none of them yields null rather than zero.
 *
 * `long_video` carries `video` as its legacy synonym and shorts carry
 * `flick` and `reel` for the same historical reason, so a key that is present
 * twice is SUMMED rather than picked between: a channel with four `flick`
 * rows and two older `reel` rows has six shorts, and reporting four would be
 * wrong in exactly the way the dual-name filter in ../tube/channels.ts exists
 * to prevent.
 */
function countFrom(body: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!body) return null
  let total: number | null = null
  for (const key of keys) {
    const value = body[key]
    if (typeof value === "number" && Number.isFinite(value)) total = (total ?? 0) + value
  }
  return total
}

/**
 * The per-type counts for one author.
 *
 * Never throws: a tab label is decoration on a tab that works, and a failed
 * count must not be able to take down the page it decorates. The caller gets
 * `NO_COUNTS` and draws the labels without numbers.
 */
export async function fetchAuthorCounts(authorId: string): Promise<AuthorCounts> {
  try {
    const res = await api.get<Envelope<Record<string, unknown>>>(
      `/v1/posts/by-author/${encodeURIComponent(authorId)}/counts`
    )
    const body = res.data?.data
    if (!body || typeof body !== "object") return NO_COUNTS
    // Some services nest the map under `counts`; both shapes are read.
    const inner = body.counts
    const row = (inner && typeof inner === "object" ? inner : body) as Record<string, unknown>
    return {
      videos: countFrom(row, ["long_video", "video"]),
      shorts: countFrom(row, ["flick", "reel"]),
    }
  } catch {
    return NO_COUNTS
  }
}

/* ── Playlists ────────────────────────────────────────────────────────────── */

/**
 * One playlist, with the two things the zone's own type does not carry.
 *
 * ── Why this is not `TubePlaylist` from ../tube/channelApi.ts ─────────────
 * That type was written when a playlist ROW had never been observed — every
 * creator on the dev stack had zero of them — so every field on it is
 * optional to a fault and it stops at the summary. The route has since grown
 * two things this tab needs and that type does not describe:
 *
 *   · `visibility`, which is now MEANINGFUL rather than incidental. The
 *     server returns public playlists to everyone and public + unlisted +
 *     private to the creator themselves, so a private row in this response is
 *     proof the viewer owns it. Same shape as the video grid: the rows only
 *     reach the owner, and the badge exists so the owner is not misled about
 *     what a stranger sees. See ./visibility.ts.
 *   · `items[].post`, HYDRATED. A playlist row can draw a real thumbnail
 *     without a second batch call, which is the difference between a list of
 *     titles and a list of playlists.
 *
 * The zone's narrow type is left alone because four other surfaces read it
 * and none of them wants either field. Widening a shared type to serve one
 * page is how a shared type stops describing anything.
 */
export interface ChannelPlaylistItem {
  /** The post itself, already hydrated by the server. Feed-shaped. */
  post?: FeedItem | null
}

export interface ChannelPlaylist {
  id?: string
  playlist_id?: string
  title?: string
  name?: string
  description?: string
  video_count?: number
  item_count?: number
  /** "public" | "unlisted" | "private", as the creator set it. */
  visibility?: string
  /** Enough of the first items to draw a cover. Absent on an empty playlist. */
  items?: ChannelPlaylistItem[] | null
}

/**
 * `GET /v1/creators/{creator_id}/playlists`.
 *
 * ── No client-side visibility filter, and that is now a server guarantee ──
 * The server decides who sees what: public to everyone, public + unlisted +
 * private to the creator. A filter here would be a second, weaker copy of
 * that rule which could only ever disagree with it — and the rows would
 * already have crossed the wire, which is the part that would actually
 * matter. So the tab renders whatever comes back and marks it.
 *
 * Throws on a failed request. The tab tells the two apart: an empty list is a
 * creator with no playlists, and a throw is a section that could not load,
 * and printing the first sentence for the second case would be the page
 * inventing a fact about somebody's channel.
 */
export async function fetchChannelPlaylists(creatorId: string): Promise<ChannelPlaylist[]> {
  const res = await api.get<Envelope<ChannelPlaylist[]>>(
    `/v1/creators/${encodeURIComponent(creatorId)}/playlists`
  )
  const rows = res.data?.data
  return Array.isArray(rows) ? rows : []
}

/**
 * The first item of a playlist that has a post on it, or null.
 *
 * The FIRST with a post rather than simply `items[0]`: a playlist whose
 * opening entry has been deleted or hidden still has a cover further down,
 * and a row that drew an empty well because of one missing hydration would be
 * a worse list than one that reached past it. Only a handful are looked at —
 * a playlist of two hundred whose first ten are all unhydrated is a data
 * problem, not something to iterate through on the render path.
 *
 * Pure, so ./playlistCover.test.ts can assert it with no network.
 */
export function playlistCoverPost(playlist: ChannelPlaylist): FeedItem | null {
  const items = playlist.items
  if (!Array.isArray(items)) return null
  for (const item of items.slice(0, 10)) {
    if (item?.post) return item.post
  }
  return null
}

/* ── The profile behind the channel ───────────────────────────────────────── */

/**
 * The two things the channel page wants from a profile and cannot get from a
 * channel: a banner, and the day this person arrived.
 */
export interface ChannelProfileExtras {
  /**
   * A usable `<img src>` for the banner, or null.
   *
   * Emphatically a URL and not a media id. `@atpost/types/profile`'s
   * `UserProfile` carries `cover_media_id`, which is NOT a URL: the one
   * derivable from a media id is unsigned and 403s — the same trap
   * `avatar_media_id` sets, recorded in ../tube/channels.ts and in
   * ../browse/VideoCard.tsx. So only a field that is already a signed URL is
   * accepted here, and a row carrying nothing but the id yields null and the
   * page draws its designed fallback instead of a broken picture.
   */
  coverUrl: string | null
  /** RFC3339, or null. The channel row's own `created_at` is the fallback. */
  joinedAt: string | null
}

export const NO_PROFILE_EXTRAS: ChannelProfileExtras = { coverUrl: null, joinedAt: null }

/** A string that a browser could actually load as a picture. */
function imageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^(https?:\/\/|\/)/.test(trimmed) ? trimmed : null
}

/**
 * `GET /v1/profiles/{user_id}` — read for a cover and a join date, and for
 * nothing else.
 *
 * ── What this call actually gave us, stated plainly ───────────────────────
 * The brief asked whether the profile carries a cover image, and the honest
 * answer is that the gateway could not be asked: nothing was listening on
 * `API_GATEWAY_URL` (`http://localhost:8080`) while this was built. What IS
 * known from the repository rather than from the wire:
 *
 *   · `packages/types/src/profile.ts` declares `cover_media_id` and
 *     `created_at`. A media id is not a URL (see `coverUrl` above), and no
 *     surface in this repo resolves one into a signed URL from the browser —
 *     `/v1/media/batch` is something feed-service does server-side.
 *   · ../tube/channels.ts records a 2026-09-09 read of this same route which
 *     found "display_name, bio, counts and no cover_media_id" on it at all.
 *
 * So this is written to USE a cover the day one appears — three plausible
 * URL-shaped spellings are accepted — and to return null today, which is the
 * case ./ChannelBanner.tsx is designed around rather than apologising for.
 * Never throws; a header is not allowed to fail because of its wallpaper.
 */
export async function fetchChannelProfileExtras(userId: string): Promise<ChannelProfileExtras> {
  try {
    const res = await api.get<Envelope<Record<string, unknown>>>(
      `/v1/profiles/${encodeURIComponent(userId)}`
    )
    const row = res.data?.data
    if (!row || typeof row !== "object") return NO_PROFILE_EXTRAS
    const created = row.created_at
    return {
      coverUrl: imageUrl(row.cover_url) ?? imageUrl(row.cover_image_url) ?? imageUrl(row.banner_url),
      joinedAt: typeof created === "string" && created.trim() ? created : null,
    }
  } catch {
    return NO_PROFILE_EXTRAS
  }
}
