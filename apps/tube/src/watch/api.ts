/**
 * Everything the WATCH page fetches that the browse grid does not.
 *
 * ../tube/api.ts is the zone's shared network surface — the feed, follow, like,
 * save, analytics — and it is deliberately not extended here. These endpoints
 * belong to one surface: chapters, in-video cards, end screens, series
 * episodes, related videos and watch progress are all questions about "the
 * video currently open", and nothing else in the zone asks them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE NAMED FUNCTION PER ENDPOINT, AND THAT IS THE POINT
 *
 * The contracts below were read out of post-service and feed-service and then
 * checked against the running gateway, but almost nothing in the product
 * AUTHORS this data — there is no card editor, no end-screen editor and no
 * series builder on any client, so the only rows that exist anywhere are the
 * handful a contract check seeded. The shapes are therefore correct as
 * written and barely exercised, and the first payload written by a real tool
 * may correct one of them. Every call has exactly one call site: a correction
 * is one line in this file, not a hunt through five components.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFIED AGAINST THE RUNNING GATEWAY ON 2026-09-09 (localhost:8080)
 *
 *   GET /v1/posts/{id}/chapters             → 200 {data:[MediaChapter]}
 *   GET /v1/posts/{id}/cards                → 200 {data:[VideoCard]}
 *   GET /v1/posts/{id}/end-screens          → 200 {data:[EndScreen]}
 *   GET /v1/video-series/{id}               → 200 {data:VideoSeries}
 *   GET /v1/video-series/{id}/episodes      → 200 {data:[SeriesEpisode]}
 *   GET /v1/creators/{id}/video-series      → 200 {data:[VideoSeries]}
 *   GET /v1/videos/{id}/progress            → 401 without a session
 *   GET /v1/feed/videos/{id}/related        → 401 without a session
 *
 * Two of those were broken earlier the same day and were fixed while this page
 * was being written, which is why the notes below are worth keeping rather
 * than deleting: `/chapters` answered `500 column "id" does not exist` for
 * every post — `media_chapters` has `PRIMARY KEY (post_id, chapter_index)` and
 * no `id` column at all, and the row struct selected one — and the whole
 * `/v1/video-series` prefix answered gin's bare `404 page not found`, which is
 * what an UNROUTED prefix looks like as opposed to a service's enveloped
 * `{"error":{"code":"NOT_FOUND"}}`. Both now answer. The client still treats a
 * failed fetch of any of these as "there are none" rather than as a page
 * error, because none of them is the video.
 *
 * ── The post → series lookup, added 2026-09-12 ────────────────────────────
 *
 *   GET /v1/posts/{id}/series               → 200 {data:PostSeries} | 404
 *
 * Built in parallel with this page and coded against its written contract
 * rather than against a running instance, so it is the one entry above that
 * has NOT been checked at the gateway. Until 2026-09-12 there was no reverse
 * lookup at all and this file walked the creator's series one by one, four
 * deep, on every watch page; that walk is gone. `fetchPostSeries` is the one
 * call, and the 404 it answers for a post in no series is the NORMAL case,
 * handled the way `fetchWatchProgress` handles its own 404.
 *
 * ── And `GET /v1/videos/{id}` is not the watch page's row ─────────────────
 * Checked, because it is the obvious candidate for replacing the feed walk.
 * It answers *video_metadata*: `{post_id, duration_seconds, width, height,
 * orientation, trim_start_ms, trim_end_ms, computed_category, final_category,
 * upload_status, …}`. No author, no channel, no media variants, no counts, no
 * blurhash. It is creator tooling. See the header of ./WatchScreen.tsx.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/* ── Wire shapes ────────────────────────────────────────────────────────── */

/**
 * One chapter of a long video — `media_chapters`.
 *
 * `start_ms` only; there is no `end_ms` on the row, so a chapter runs until the
 * next one starts and the last runs to the end of the video. That arithmetic is
 * in ./timeline.ts rather than here.
 */
export interface Chapter {
  post_id: string
  chapter_index: number
  title: string
  start_ms: number
  thumbnail_url?: string | null
  source?: "manual" | "ai_generated" | string
}

/** What a card or an end screen points at. The two enums differ — see below. */
export type CardTargetType = "video" | "playlist" | "poll" | "external_link"
export type EndScreenTargetType =
  | "video"
  | "playlist"
  | "channel_subscribe"
  | "external_link"

/**
 * YouTube's in-video card — `video_cards`.
 *
 * `appear_at_ms` is a moment, not a window: the row says when the card should
 * come up and nothing says when it should go away. How long it stays is a
 * client decision and it lives in ./timeline.ts as `CARD_VISIBLE_MS`.
 *
 * `title` is NOT NULL on the table; `teaser_text` is nullable. A card may
 * target a poll, which neither this page nor any other web surface can open
 * yet — ./links.ts is where an untargetable card is turned into no link rather
 * than a dead one.
 */
export interface VideoCard {
  id: string
  post_id: string
  type: CardTargetType
  target_id?: string | null
  target_url?: string | null
  title: string
  teaser_text?: string | null
  appear_at_ms: number
}

/**
 * One element of the end-screen overlay — `video_end_screens`.
 *
 * `position` is JSONB with no schema in the migration and no writer anywhere in
 * the product, so it is typed `unknown` on purpose: the one thing that must not
 * happen is a plausible-looking `{x,y,w,h}` interface that the first real
 * payload disagrees with. ./timeline.ts parses it defensively and falls back to
 * a laid-out grid when it cannot.
 *
 * `title` IS nullable here and is not on a card — a `channel_subscribe` screen
 * has no title of its own because the channel supplies it.
 */
export interface EndScreen {
  id: string
  post_id: string
  type: EndScreenTargetType
  target_id?: string | null
  target_url?: string | null
  title?: string | null
  position?: unknown
  start_ms: number
  end_ms: number
}

/** One episode of a series — `video_series_episodes`. */
export interface SeriesEpisode {
  series_id: string
  post_id: string
  episode_num: number
  title?: string | null
  added_at?: string
}

/** A series — `video_series`. Only the fields a watch page can use. */
export interface VideoSeries {
  id: string
  creator_id: string
  title: string
  description?: string
  episode_count?: number
  is_complete?: boolean
  is_public?: boolean
}

/**
 * The viewer's place in a video — `watch_progress`.
 *
 * `updated_at` on the wire is `last_watched_at` in the table; post-service
 * renames it in the struct tag and the comment there calls it "the Tube
 * contract, 2026-09-05". Do not rename it back.
 */
export interface WatchProgress {
  user_id?: string
  post_id: string
  position_ms: number
  duration_ms: number
  percent_watched: number
  completed: boolean
  updated_at?: string
}

/* ── Related videos ─────────────────────────────────────────────────────── */

export interface RelatedPage {
  items: FeedItem[]
  /**
   * `base64url("v1r:" + offset)` — a THIRD cursor family, and mixing it with a
   * feed cursor is a 400. feed-service's related.go says why it is an offset
   * rather than a timeuuid: a related list is a pool re-ranked per request, so
   * there is no row to resume after. Passed back verbatim, never parsed.
   */
  nextCursor: string | null
}

/**
 * What should play after this video.
 *
 * The rail's whole data source. feed-service returns HYDRATED POSTS here — the
 * same `FeedItem` the ranked feed returns, with media, variants, blurhash,
 * dimensions, author and channel — which is why the rail can draw a poster and
 * a channel name without a second call, and why ../tube/video.ts's helpers work
 * on these rows unchanged.
 *
 * `limit` default is 20 and the cap is 50, matching `/v1/feed/videos` exactly
 * so the two surfaces cannot disagree about what a page is. Twelve is asked for
 * here for the same reason the browse grid asks for twelve: every row draws a
 * poster, and a rail nobody scrolls to the bottom of should not fetch fifty.
 *
 * The failures are worth knowing apart and the caller is given the raw error:
 * 404 is "the seed post does not exist OR you cannot see it" (one answer for
 * both, deliberately, so the endpoint cannot be used to probe), 400
 * UNSUPPORTED_CONTENT_TYPE is a non-video seed, and 503 FEED_UNAVAILABLE is
 * hydration failing — feed-service refuses to answer with raw ids.
 */
const RELATED_PAGE_SIZE = 12

export async function fetchRelatedVideos(
  postId: string,
  cursor?: string | null
): Promise<RelatedPage> {
  const res = await api.get<Envelope<FeedItem[]>>(`/v1/feed/videos/${postId}/related`, {
    params: {
      limit: RELATED_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    },
  })
  return {
    items: res.data?.data ?? [],
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/* ── The three linked-video mechanisms ──────────────────────────────────── */

/**
 * The chapter list.
 *
 * Sorted by the SERVER on `chapter_index`, which is not necessarily `start_ms`
 * order — the index is the author's numbering and the two could disagree on a
 * row written out of order. ./timeline.ts sorts by `start_ms` before using
 * them, because a seek list that jumps backwards is worse than a renumbered one.
 */
export async function fetchChapters(postId: string): Promise<Chapter[]> {
  const res = await api.get<Envelope<Chapter[]>>(`/v1/posts/${postId}/chapters`)
  return res.data?.data ?? []
}

/** The in-video cards. 200 `{"data":[]}` for every post today. */
export async function fetchVideoCards(postId: string): Promise<VideoCard[]> {
  const res = await api.get<Envelope<VideoCard[]>>(`/v1/posts/${postId}/cards`)
  return res.data?.data ?? []
}

/** The end-screen elements. 200 `{"data":[]}` for every post today. */
export async function fetchEndScreens(postId: string): Promise<EndScreen[]> {
  const res = await api.get<Envelope<EndScreen[]>>(`/v1/posts/${postId}/end-screens`)
  return res.data?.data ?? []
}

/** The episodes of a series, in `episode_num` order. */
export async function fetchSeriesEpisodes(seriesId: string): Promise<SeriesEpisode[]> {
  const res = await api.get<Envelope<SeriesEpisode[]>>(
    `/v1/video-series/${seriesId}/episodes`
  )
  return res.data?.data ?? []
}

/** Every series a creator has made. Carries each series' own title. */
export async function fetchCreatorVideoSeries(creatorId: string): Promise<VideoSeries[]> {
  const res = await api.get<Envelope<VideoSeries[]>>(
    `/v1/creators/${creatorId}/video-series`
  )
  return res.data?.data ?? []
}

/* ── Which series this video is in ──────────────────────────────────────── */

/**
 * How many episodes a series may hold. The server's own cap: the 51st
 * `POST …/episodes` is `409 SERIES_FULL`. Episode NUMBERS go to 999, so a
 * series can be sparse (numbers 1, 2 and 40 with three rows) but never long.
 */
export const SERIES_MAX_EPISODES = 50

/** The highest episode number the server accepts. 1 is the lowest; 0 reads as absent. */
export const SERIES_EPISODE_NUM_MAX = 999

/**
 * A neighbouring episode as `GET /v1/posts/{id}/series` names it.
 *
 * Deliberately thinner than `SeriesEpisode`: the wire row for `next` and
 * `prev` carries no `series_id` and no `added_at`, and the normaliser below
 * widens the episode list rather than every consumer learning two shapes.
 */
export interface PostSeriesNeighbour {
  post_id: string
  episode_num: number
  title?: string | null
}

/**
 * The answer to "which series is this post an episode of".
 *
 * `next` and `prev` are the SERVER's opinion, computed from the same
 * `episode_num` order the client derives, and they are kept on the type
 * because a caller that only wants "what plays after this" should not have to
 * hold fifty rows to find out. `episodes` is the whole list, in order, with
 * `series_id` filled in on every row so it is the same `SeriesEpisode` the
 * rail and the links editor already draw.
 */
export interface PostSeries {
  series: VideoSeries
  episodes: SeriesEpisode[]
  current: { episode_num: number }
  next: PostSeriesNeighbour | null
  prev: PostSeriesNeighbour | null
}

/** The wire shape, loosely, before the normaliser has looked at it. */
interface RawPostSeries {
  series?: Partial<VideoSeries> | null
  episodes?: Array<Partial<SeriesEpisode> | null> | null
  current?: { episode_num?: number } | null
  next?: Partial<PostSeriesNeighbour> | null
  prev?: Partial<PostSeriesNeighbour> | null
}

function neighbour(
  raw: Partial<PostSeriesNeighbour> | null | undefined
): PostSeriesNeighbour | null {
  if (!raw || typeof raw.post_id !== "string" || !raw.post_id) return null
  if (typeof raw.episode_num !== "number" || !Number.isFinite(raw.episode_num)) return null
  return { post_id: raw.post_id, episode_num: raw.episode_num, title: raw.title ?? null }
}

/**
 * The envelope's `data`, as a `PostSeries`, or null when it is not one.
 *
 * Pure, and exported for exactly that reason: the contract this was written
 * against is a document rather than a running server, so the one thing that
 * can be asserted today is that a payload of the documented shape comes out
 * right, and that the two honest absences (no data at all, and `next: null`
 * on the last episode) stay absences rather than becoming something that
 * looks like an episode. Every row lacking a `series_id` is given the series'
 * own, because `SeriesEpisode` requires one and the rail keys its list on it.
 */
export function parsePostSeries(data: unknown): PostSeries | null {
  const raw = data as RawPostSeries | null | undefined
  const id = raw?.series?.id
  if (!raw || typeof id !== "string" || !id) return null

  const s = raw.series ?? {}
  const series: VideoSeries = {
    id,
    creator_id: s.creator_id ?? "",
    title: s.title ?? "",
    ...(s.description !== undefined ? { description: s.description } : {}),
    ...(s.episode_count !== undefined ? { episode_count: s.episode_count } : {}),
    ...(s.is_complete !== undefined ? { is_complete: s.is_complete } : {}),
    ...(s.is_public !== undefined ? { is_public: s.is_public } : {}),
  }

  const episodes: SeriesEpisode[] = []
  for (const e of raw.episodes ?? []) {
    if (!e || typeof e.post_id !== "string" || !e.post_id) continue
    if (typeof e.episode_num !== "number" || !Number.isFinite(e.episode_num)) continue
    episodes.push({
      series_id: e.series_id || id,
      post_id: e.post_id,
      episode_num: e.episode_num,
      title: e.title ?? null,
      ...(e.added_at ? { added_at: e.added_at } : {}),
    })
  }

  const currentNum = raw.current?.episode_num
  return {
    series,
    episodes,
    current: { episode_num: typeof currentNum === "number" ? currentNum : NaN },
    next: neighbour(raw.next),
    prev: neighbour(raw.prev),
  }
}

/** Is this the api-client's shape for a 404? */
export function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 404
}

/**
 * Which series this video is an episode of, or null.
 *
 * `404` is the normal answer and is not an error: most videos are in no
 * series, and the server answers the same 404 for "in a series you cannot
 * see", deliberately, so a private series cannot be probed from its episodes.
 * Both arrive here as null. Anything else is rethrown, and the caller (the
 * only one, ./useWatchLinks.ts) turns THAT into "no rail" as well, because a
 * series rail that could not be built must never be a reason a watchable page
 * shows an error. The distinction is kept at this layer anyway so the hook can
 * tell "there is none" from "we could not find out" if it ever wants to say so
 * on screen, the way it already does for chapters.
 */
export async function fetchPostSeries(postId: string): Promise<PostSeries | null> {
  try {
    const res = await api.get<Envelope<unknown>>(
      `/v1/posts/${encodeURIComponent(postId)}/series`
    )
    return parsePostSeries(res.data?.data)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/* ── Resume ─────────────────────────────────────────────────────────────── */

/**
 * Where this viewer stopped, or null.
 *
 * `404 NOT_FOUND` is the NORMAL answer for a video nobody has watched, and it
 * is not an error: it is turned into `null` here so no call site has to know
 * that "you have never watched this" arrives as an HTTP failure. Everything
 * else is rethrown — a 401 or a 500 means the resume point is UNKNOWN, which is
 * a different thing from "you were at zero", and silently starting from the
 * beginning after a 500 is how somebody loses their place without being told.
 *
 * Callers must not make this request for a signed-out viewer: it is a
 * guaranteed 401 and each one costs a failed token refresh behind it.
 */
export async function fetchWatchProgress(videoId: string): Promise<WatchProgress | null> {
  try {
    const res = await api.get<Envelope<WatchProgress>>(`/v1/videos/${videoId}/progress`)
    return res.data?.data ?? null
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404) return null
    throw error
  }
}

export interface ProgressUpdate {
  positionMs: number
  /**
   * 0 is legal and MEANINGFUL: the server reads its own duration from
   * `video_metadata` (else the viewer's previous progress row) when the client
   * sends 0, so `percent_watched` is real rather than 0%. Send 0 rather than a
   * guess while the player has not learned the duration.
   */
  durationMs: number
  /**
   * Sent only when the video actually ended. `true` is honoured as sent;
   * omitted, the server derives it from its own 90% rule — which is the right
   * answer for every case except "it played to the end", and that is the one
   * case a client knows better.
   */
  completed?: boolean
}

/**
 * Save the viewer's place.
 *
 * Negative values are `400 INVALID_REQUEST`, so both are clamped at zero here:
 * an `HTMLMediaElement.currentTime` read during a seek can be transiently odd,
 * and one bad number should not cost the save.
 *
 * The response carries the STORED row — the kept duration and the server's real
 * `updated_at` rather than what was sent — and it is returned so the caller can
 * reconcile rather than assume.
 */
export async function saveWatchProgress(
  videoId: string,
  update: ProgressUpdate
): Promise<WatchProgress | null> {
  const res = await api.post<Envelope<WatchProgress>>(`/v1/videos/${videoId}/progress`, {
    position_ms: Math.max(0, Math.round(update.positionMs)),
    duration_ms: Math.max(0, Math.round(update.durationMs)),
    ...(update.completed === true ? { completed: true } : {}),
  })
  return res.data?.data ?? null
}
