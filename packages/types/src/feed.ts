/**
 * The home feed wire shape, as `GET /v1/feed/home` actually returns it.
 *
 * These live in @atpost/types rather than in a rendering package because the
 * feed, reels, tube and a profile grid all read the SAME hydrated post — it is
 * one struct in feed-service (`internal/service/hydration.go`) and it should be
 * one type here. A view package that owned it would force the next consumer to
 * either import a rendering package for a type or redeclare the struct, and
 * redeclared wire types drift silently.
 *
 * Everything optional below is optional in the response, verified against the
 * live gateway rather than inferred: a `long_video` can arrive with no `media`
 * array at all, a flick can arrive with no `title`, and `channel` is present
 * only for channel-published content.
 */

/** What kind of thing a post is. Authoritative — do not infer from `media`. */
export type FeedContentType = "post" | "flick" | "long_video" | "poll"

/**
 * Why an item is in the feed. `reason_text` is the human sentence and is
 * written by the server, so the client never composes one of its own.
 */
export interface FeedReason {
  reason?: string
  reason_text?: string
}

/**
 * Media processing state.
 *
 * `status` and `processing_status` both exist and both mean transcoding; the
 * feed sets them together. `moderation_status` is the separate question of
 * whether a human or a classifier has cleared it. A client must satisfy BOTH
 * before it plays anything — see `isPlayable` in @momentum/player.
 */
export type MediaStatus = "pending" | "processing" | "ready" | "failed" | string
export type ModerationStatus = "pending" | "passed" | "rejected" | string

/**
 * One image or video attached to a post.
 *
 * `variants` maps a variant NAME to a fully-signed absolute URL on the media
 * host. The names differ by kind and are not a fixed set:
 *   images — thumb_150, small_480, medium_1080, original
 *   videos — thumb_150, 360p, 480p, 720p, original
 * Code that hardcodes "480p" breaks on images. Use the pickers in
 * @momentum/content, which order by preference and fall back.
 *
 * `expires_at` applies to every signed URL in `variants` — the live gateway
 * signs them for 300 seconds. It does NOT apply to `hls_url`/`playback_url`,
 * which are unsigned gateway-relative paths; the signing there happens inside
 * the child playlist, which is fetched at play time and so is fresh.
 */
export interface FeedMedia {
  media_id: string
  kind: "image" | "video"
  position: number
  alt_text?: string
  alt_decorative?: boolean
  status?: MediaStatus
  width?: number
  height?: number
  /** BlurHash string. Present on every ready asset the live feed returns. */
  blurhash?: string
  duration_ms?: number
  variants?: Record<string, string>
  /** Gateway-relative, e.g. `/v1/media/{id}/hls/master.m3u8`. Never absolute. */
  hls_url?: string
  playback_url?: string
  playback_kind?: "hls" | "original"
  /** RFC3339. When the signed `variants` URLs stop working. */
  expires_at?: string
  processing_status?: MediaStatus
  moderation_status?: ModerationStatus
}

export interface FeedAuthor {
  id: string
  display_name?: string
  username?: string
  /**
   * The id of an avatar asset — NOT a URL, and not resolvable in one hop:
   * `GET /v1/media/{id}` returns metadata whose `cdn_url` is unsigned and 403s.
   * See the note in @momentum/content/Avatar for why the feed draws initials.
   */
  avatar_media_id?: string
}

export interface FeedChannel {
  user_id: string
  name?: string
  handle?: string
  avatar_url?: string | null
}

export interface FeedCounts {
  likes: number
  comments: number
}

export interface FeedPollOption {
  id: string
  text?: string
  votes?: number
}

export interface FeedPoll {
  id?: string
  question?: string
  options?: FeedPollOption[]
  total_votes?: number
  viewer_option_id?: string | null
  closes_at?: string | null
}

/** One item of `data` from `GET /v1/feed/home`. */
export interface FeedItem extends FeedReason {
  id: string
  author_id: string
  text?: string
  title?: string
  visibility?: string
  content_type: FeedContentType
  feed_content_type?: FeedContentType
  post_type?: string
  category?: string
  is_pinned?: boolean
  cover_media_id?: string
  created_at: string
  updated_at?: string

  media?: FeedMedia[]
  poll?: FeedPoll
  hashtags?: string[]
  mentions?: string[]
  location_name?: string

  counts: FeedCounts
  view_count?: number
  has_reacted?: boolean
  is_bookmarked?: boolean
  repost_count?: number
  has_reposted?: boolean
  is_repostable?: boolean

  /**
   * Author switches. These are permissions the server WILL enforce — posting a
   * comment to a `no_comments` post is a 403 COMMENTS_DISABLED — so a client
   * that renders the control anyway is promising something it cannot deliver.
   */
  no_comments?: boolean
  hide_share?: boolean
  allow_download?: boolean
  remix_setting?: string

  is_processing?: boolean
  is_scheduled?: boolean
  score?: number

  author?: FeedAuthor
  channel?: FeedChannel
}

/**
 * `meta` is present ONLY when the page came back full (feed-service returns it
 * when `len(items) >= limit`). A short page therefore means end-of-feed, and an
 * absent `meta` is the normal terminating condition rather than an error.
 */
export interface FeedPageMeta {
  next_cursor?: string
  request_id?: string
}

export interface FeedPage {
  items: FeedItem[]
  /** RFC3339Nano timestamp, passed back verbatim as `?cursor=`. */
  nextCursor: string | null
}

/**
 * `chronological` — the server default — is posts from accounts you FOLLOW,
 * so a new account gets `{"data":[]}`. `ranked` carries the cold-start path.
 * See the note at the call site in apps/social for why the feed always asks
 * for `ranked`.
 */
export type FeedMode = "ranked" | "chronological" | "shadow"
