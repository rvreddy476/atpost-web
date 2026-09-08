/**
 * What `GET /v1/search` actually sends, and how a row of it becomes a card.
 *
 * Pure: no React, no network, no imports from this app. That is what lets the
 * two things worth asserting about this feature — that a post row survives the
 * trip into a `FeedItem` intact, and that a query the service will reject is
 * never sent — be tested as arithmetic rather than as a screenshot.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CONTRACT, READ OFF THE SERVICE AND THEN VERIFIED AGAINST IT
 *
 * Source: Architecture/services/search-service/internal/http/handler.go
 * (`UniversalSearch` → `universalSearchMultiEntity`) and internal/http/results.go.
 * Every claim below was also checked against the running gateway on :3000.
 *
 *   GET /v1/search
 *     ?q=<1..500 bytes>          required. Empty → 400 BAD_REQUEST
 *                                "query cannot be empty". Over 500 → 400
 *                                "query too long: maximum 500 characters".
 *                                The service measures Go `len(string)`, i.e.
 *                                BYTES, not characters — see `queryTooLong`.
 *     &types=posts,users,…       comma list. Its PRESENCE is what selects the
 *                                modern grouped response; without it the
 *                                handler takes a different, older branch (see
 *                                below). Unknown-only → 400.
 *     &limit=<1..100>            default 20, clamped server-side.
 *     &cursor.<type>=<offset>    per-entity, and independent. An integer
 *                                string — it is a `from` offset, not a
 *                                keyset — echoed back as `next_cursor`.
 *
 * Response, after the house `{data,error,meta}` envelope is unwrapped:
 *
 *   { "query_id": "uuid",                    // omitted if analytics is down
 *     "results": {
 *       "posts":    { "items": [...], "next_cursor": "3" },
 *       "users":    { "items": [...] },      // NOTE: no next_cursor key at
 *       "hashtags": { "items": [] }          // all on a last page
 *     } }
 *
 * `next_cursor` is `omitempty`, so a last page has NO SUCH KEY. @atpost/types
 * types it `string | null`, which is wrong in the one case that decides
 * whether the pager stops; everything here reads it as possibly undefined.
 *
 * ── The two response shapes, and why this file only knows one ─────────────
 * `?type=all` (singular) is the older branch and answers a flat
 * `{users:[…], posts:[…]}` with no hashtags, no cursors and no query_id. It
 * hydrates users MORE than the modern branch does — it is the only one that
 * puts `avatar_url` on a person. The modern branch hydrates POSTS more (author
 * and thumbnail) and is the only one that can return hashtags or page. The
 * grouped page needs paging and three kinds, so it uses `types=`; the cost is
 * that people are drawn as initials. Both verified live.
 *
 * ── Which entities actually have anything in them ─────────────────────────
 * Six are accepted: posts, users, hashtags, products, communities, channels.
 * Only three are asked for here.
 *   posts     — populated. 483 public posts; every probe returned rows.
 *   users     — populated, ~50. Many carry `username: ""` (see `personHandle`).
 *   hashtags  — ACCEPTED AND EMPTY. `hashtags_v1` answered `items: []` for
 *               every probe, and the dedicated /v1/search/hashtags route
 *               answered `{"hashtags": null}` — including for tags that appear
 *               in indexed post text. The bucket is requested anyway, because
 *               the contract has it and the day it fills the page works; the
 *               section is simply not drawn while it is empty.
 *   products  — deliberately NOT requested. products_v2 is the storefront's
 *               index and a product is a commerce object with a price, a
 *               seller and a zone of its own at /shop. Putting one in a social
 *               result list means either drawing it in social tokens (gold is
 *               commerce, and this page has none) or sending someone out of
 *               the zone from a list that promised posts and people.
 *   communities / channels — not requested: no web surface for either.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { HashtagHit, PostHit, UserHit } from "@atpost/types/search"
import type { FeedContentType, FeedItem, FeedMedia } from "@atpost/types/feed"

/* ── The rows, as the service really sends them ───────────────────────────── */

/**
 * The author on a post row, hydrated at query time from `users_v1`.
 *
 * `avatar_url` IS on this one (results.go resolves it through media-service in
 * the same batch as the thumbnails) even though the person rows in the `users`
 * bucket have no such field. That asymmetry is the service's, not ours.
 */
export interface SearchAuthorRef {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

/**
 * One post row.
 *
 * `PostHit` from @atpost/types models the raw OpenSearch document and stops
 * there — it predates the query-time hydration in results.go, so it is missing
 * `author`, `thumbnail_url`, `playback_url`, `content_type`, `title`,
 * `media_id`, `media_kind` and `duration_ms`: everything a result card is made
 * of. It is extended rather than replaced so the shared half stays shared and
 * the drift is visible in one place. (The upstream type wants those fields; a
 * note is in the report rather than an edit, since packages/types is not this
 * change's to alter.)
 */
export interface SearchPostRow extends PostHit {
  /** Alias of `post_id`, added by results.go. */
  id: string
  author: SearchAuthorRef | null
  thumbnail_url: string | null
  /** Gateway-relative HLS master for a video, null otherwise. */
  playback_url: string | null
  content_type?: string
  title?: string
  duration_ms?: number
  media_id?: string
  media_kind?: string
}

/**
 * One person row.
 *
 * `is_private` and `is_hidden` are on the document and are NOT filters for
 * `is_private`: search-service's own comment says private accounts stay
 * searchable on purpose (TikTok shows them) and the flag exists so a client
 * can draw the lock. `is_hidden` is unconditional suppression and never
 * reaches a client, so it is not modelled.
 */
export interface SearchUserRow extends UserHit {
  is_private?: boolean
}

export type SearchHashtagRow = HashtagHit

/** The kinds this page asks for, in the order it draws them. */
export const SEARCH_KINDS = ["posts", "users", "hashtags"] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** One entity's slice of the answer. `next_cursor` absent = last page. */
export interface SearchBucket<T> {
  items?: T[]
  next_cursor?: string | null
}

export interface SearchResponse {
  query_id?: string
  results?: {
    posts?: SearchBucket<SearchPostRow>
    users?: SearchBucket<SearchUserRow>
    hashtags?: SearchBucket<SearchHashtagRow>
  }
}

/* ── The query itself ──────────────────────────────────────────────────────── */

/** The service's own ceiling, in bytes. handler.go: `len(query) > 500`. */
export const MAX_QUERY_BYTES = 500

/**
 * The query, as it will be sent.
 *
 * Trimmed, because the service trims before deciding a query is empty and a
 * page that renders "results for '   '" while the service saw nothing is two
 * different opinions about the same string.
 */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim()
}

/**
 * Would the service reject this for length?
 *
 * BYTES, not characters. Go's `len` on a string counts bytes, so 400 emoji is
 * 1600 by the service's reckoning and 800 by `String.length`. Getting this
 * wrong means either a request that comes back 400 for a reason the page
 * cannot explain, or a refusal to send one that would have worked.
 *
 * `TextEncoder` is in every browser this app supports and in Node ≥11, so
 * there is no fallback branch to keep correct.
 */
export function queryTooLong(query: string): boolean {
  return new TextEncoder().encode(query).length > MAX_QUERY_BYTES
}

/* ── A row becomes a card ─────────────────────────────────────────────────── */

/**
 * The content types `FeedItem` admits. Anything else the index holds — and it
 * holds legacy `video` and `reel` rows, per ContentTypesForKind in the service
 * — is mapped onto the nearest one rather than passed through as a string the
 * card would not recognise.
 */
const CONTENT_TYPES: Record<string, FeedContentType> = {
  post: "post",
  flick: "flick",
  reel: "flick",
  long_video: "long_video",
  video: "long_video",
  poll: "poll",
}

/**
 * What kind of thing this row is.
 *
 * `content_type` is authoritative and PostCard says so in as many words. It is
 * omitempty on the document, and documents written before the field existed do
 * not carry it — so `post_type` is the fallback, and "post" the floor. Never
 * inferred from whether media happens to be attached: a `long_video` with no
 * media array is a real thing this corpus contains.
 */
export function contentTypeOf(row: SearchPostRow): FeedContentType {
  return CONTENT_TYPES[row.content_type ?? ""] ?? CONTENT_TYPES[row.post_type ?? ""] ?? "post"
}

/**
 * When the signed URLs on a media host stop working, read out of the signature
 * itself.
 *
 * The feed gets `expires_at` as a field. Search does not send one — but the
 * thumbnail it sends is a presigned S3 URL and the deadline is written into
 * its own query string: `X-Amz-Date=20260908T181155Z` plus
 * `X-Amz-Expires=300`. Verified on a live row.
 *
 * Without this the card believes its picture never goes stale, and a search
 * page left open for six minutes fills with 403s that nothing tries to fix.
 * With it, `isExpired` in @momentum/content fires and PostCard's `onStale`
 * gets a chance to ask for fresh URLs.
 *
 * Returns undefined for anything that is not a presigned URL — an unsigned
 * path, a relative one, a malformed date — because "no deadline" and "a
 * deadline I could not read" both mean the same thing to the caller: do not
 * claim this expires.
 */
export function signedUrlExpiry(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  let params: URLSearchParams
  try {
    params = new URL(url, "https://placeholder.invalid").searchParams
  } catch {
    return undefined
  }
  const stamp = params.get("X-Amz-Date")
  const seconds = Number(params.get("X-Amz-Expires"))
  if (!stamp || !Number.isFinite(seconds) || seconds <= 0) return undefined

  // ISO 8601 basic format, always UTC: 20260908T181155Z.
  const parts = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp)
  if (!parts) return undefined
  const [, y, mo, d, h, mi, s] = parts
  const signedAt = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  if (!Number.isFinite(signedAt)) return undefined
  return new Date(signedAt + seconds * 1000).toISOString()
}

/**
 * The one attachment a search row can describe, as a `FeedMedia`.
 *
 * The index stores ONE media id per post — `media_id` is "the first attached
 * asset" and the document has no room for the rest — so a five-photograph post
 * arrives here as one picture. That is the service's projection and not
 * something a client can widen; the card therefore never shows a carousel on
 * this page, and that is honest rather than lossy-looking: it is exactly what
 * the search response contains.
 *
 * ── Why the URL is filed under `thumb_150` ────────────────────────────────
 * `variants` is a name→URL map and every picker in the codebase walks a
 * preference list of names. results.go resolves ONE url and does not say which
 * rendition won (it prefers small_480 for images and thumb_480 for video
 * posters, falling back through to thumb_150). `thumb_150` is the only name
 * that appears in all three preference lists — IMAGE_PREFERENCE,
 * THUMB_PREFERENCE and POSTER_PREFERENCE — so it is the one key no picker can
 * miss. The name is a lookup handle here, not a claim about pixel size, and
 * getting it wrong costs a picture rather than the wrong picture.
 *
 * ── Why no `status` fields ────────────────────────────────────────────────
 * The index carries no transcode or moderation state, so there is nothing
 * truthful to put in them. `isTranscodeReady` and `isModerationCleared` both
 * read absent as "the source did not say" and let it through, which is the
 * behaviour that belongs here: search-service only emits a `playback_url` at
 * all when media-service produced one for this viewer, and media-service only
 * produces one for an asset it will actually serve. Inventing `status:"ready"`
 * would assert something this response never said.
 */
export function mediaFromRow(row: SearchPostRow): FeedMedia[] {
  if (!row.media_id) return []
  const kind = row.media_kind === "video" || row.playback_url ? "video" : "image"
  const media: FeedMedia = {
    media_id: row.media_id,
    kind,
    position: 0,
  }
  if (row.thumbnail_url) {
    media.variants = { thumb_150: row.thumbnail_url }
    const expires = signedUrlExpiry(row.thumbnail_url)
    if (expires) media.expires_at = expires
  }
  if (kind === "video") {
    if (row.playback_url) {
      media.hls_url = row.playback_url
      media.playback_kind = "hls"
    }
    if (row.duration_ms) media.duration_ms = row.duration_ms
  }
  // A video with neither a poster nor a playback url is a row media-service
  // declined to resolve. There is nothing to draw and nothing to play, so the
  // card is better off with no attachment than with an empty black frame.
  if (!media.variants && !media.hls_url) return []
  return [media]
}

/**
 * A search row as the card in @momentum/content wants it.
 *
 * Nothing is invented. Every field below is either copied across or left off:
 *
 *   · `counts` are the index's like_count / comment_count. They lag — the
 *     index is updated by a consumer, not on the write path — and they are
 *     still the only numbers this response has.
 *   · `has_reacted` / `is_bookmarked` are NOT SET, because the search index
 *     holds no viewer state at all. The action bar therefore starts every row
 *     in the "not liked, not saved" position, which for a post the viewer has
 *     already liked is wrong until they press it and the server answers with
 *     the truth. PostCard has no way to say "viewer state unknown" and it is
 *     not this change's to add one — see the report.
 *   · `reason_text` is absent, so no "Suggested for you" line appears. The
 *     ranker on this endpoint does not write one and the card must not compose
 *     its own.
 */
export function rowToFeedItem(row: SearchPostRow): FeedItem {
  const item: FeedItem = {
    id: row.id || row.post_id,
    author_id: row.author_id,
    content_type: contentTypeOf(row),
    created_at: row.created_at,
    counts: { likes: row.like_count ?? 0, comments: row.comment_count ?? 0 },
  }
  if (row.text) item.text = row.text
  if (row.title) item.title = row.title
  if (row.visibility) item.visibility = row.visibility
  if (row.post_type) item.post_type = row.post_type
  if (row.hashtags?.length) item.hashtags = row.hashtags

  const author = row.author
  if (author) {
    item.author = {
      id: author.id,
      // A display name is what the card falls back through to; an empty string
      // would win over the "Someone" floor and print a blank line where a name
      // goes. Same for the handle — see `personHandle`.
      ...(author.display_name ? { display_name: author.display_name } : {}),
      ...(author.username ? { username: author.username } : {}),
    }
  }

  const media = mediaFromRow(row)
  if (media.length) item.media = media
  return item
}

/* ── People and tags ──────────────────────────────────────────────────────── */

/**
 * What to call a person.
 *
 * Both fields can be empty on a live row — `display_name` rarely, `username`
 * OFTEN: most accounts in this corpus index with `username: ""`, because
 * usernames live in app.users behind user-service and the users_v1 projection
 * did not get them. So neither can be trusted to be a name on its own, and
 * "@" with nothing after it is the exact failure `ViewerProfile` warns about.
 */
export function personName(user: SearchUserRow): string {
  return user.display_name?.trim() || (user.username?.trim() ? `@${user.username.trim()}` : "") || "Someone"
}

/** The handle, or nothing at all. Never a bare "@". */
export function personHandle(user: SearchUserRow): string | null {
  const handle = user.username?.trim()
  if (!handle) return null
  return `@${handle}`
}

/** The tag, with exactly one leading "#" however the index spelled it. */
export function hashtagLabel(tag: SearchHashtagRow): string {
  return `#${(tag.hashtag ?? "").replace(/^#+/, "")}`
}

/** Rows in a bucket, defaulting to none. */
export function itemsOf<T>(bucket: SearchBucket<T> | undefined): T[] {
  return Array.isArray(bucket?.items) ? bucket.items : []
}

/**
 * The cursor for the next page, or null when there is none.
 *
 * Absent, null and "" all mean the same thing and all three occur: the field
 * is `omitempty` on the wire, the shared type promises `string | null`, and an
 * empty string is what the store returns when it has nothing more.
 */
export function nextCursorOf(bucket: SearchBucket<unknown> | undefined): string | null {
  const cursor = bucket?.next_cursor
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null
}
