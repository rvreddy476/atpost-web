/**
 * Every URL the tube zone knows. This is the whole network surface.
 *
 * Same arrangement as `apps/social/src/feed/api.ts` and `apps/reels/src/reels/
 * api.ts`, and for the same reason: the packages under packages/ are
 * network-free so that every zone can reuse them, which only means anything if
 * the wiring they are free OF lives somewhere findable. This is that place.
 *
 * ── The envelope is NOT unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance with a cookie/CSRF request
 * interceptor and a 401-refresh response interceptor; it does not touch the
 * body. Every gateway response is `{data, error, meta}`, so a caller reads
 * `res.data.data` — with ONE exception, `fetchFollowStates` below, which the
 * graph service answers unenveloped. That exception is not a mistake here; it
 * is a mistake on the server, and it is recorded rather than smoothed over.
 *
 * ── Routes verified against the running gateway on 2026-09-09 ─────────────
 *   GET  /v1/feed/videos       ?limit&cursor&following_only&category -> [item]
 *   POST /v1/graph/relationships/batch {viewer_id,target_ids} -> UNENVELOPED
 *   POST /v1/graph/follow      {user_id}   -> {status:"followed"|"requested"}
 *   POST /v1/graph/unfollow    {user_id}   -> {status:"unfollowed"}
 *   POST /v1/posts/{id}/like       no body, TOGGLES -> {liked, count}
 *   POST /v1/posts/{id}/bookmark   no body, SETS    -> {bookmarked:true}
 *   DELETE /v1/posts/{id}/bookmark                  -> {bookmarked:false}
 *   POST /v1/analytics/events  {events:[...]}       -> 202 {accepted,duplicate}
 *
 * Everything except the first line is lifted from apps/reels' api.ts rather
 * than rediscovered: they are the same endpoints against the same gateway, and
 * two zones disagreeing about them is the failure that file's header exists to
 * prevent. What is genuinely this zone's own is the feed path and its paging,
 * and that is what the long note below is about.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import type { AnalyticsEvent, SendOutcome } from "@momentum/analytics"
import type { FollowState } from "@momentum/interactions"

/**
 * `/v1/feed/videos`, and NOT `/v1/feed/watch`, and not `/v1/videos`.
 *
 * All three are real and only one of them is this page's.
 *
 *   · `/v1/feed/videos` — feed-service's `GetLongVideoFeed`. Reads the
 *     viewer's home timeline for content types `long_video` and its legacy
 *     synonym `video`, ranks it, and — this is the part that decides it —
 *     tops a SHORT FIRST PAGE up from `/v1/posts/recent?content_type=
 *     long_video`. That discovery fill is the only reason a viewer who
 *     follows nobody sees anything at all.
 *
 *   · `/v1/feed/watch` — the same timeline window, ranked, with NO fill. It is
 *     what the Android client uses behind its "Following" chip and its
 *     Subscriptions page (VideoFeedRepository.kt: `if (query is Following)
 *     Watch else Videos`). This zone has no such chip, so asking for it would
 *     hand a new account a permanently empty Tube with nothing on screen to
 *     explain why — the same trap as `following_only`, below.
 *
 *   · `/v1/videos` — not a feed at all. The gateway proxies the prefix to
 *     post-service, where it is creator tooling and watch progress:
 *     `GET /v1/videos/{postId}` (trim/cover/upload metadata), `PATCH
 *     …/category`, `POST …/publish`, `GET|POST /v1/videos/{postId}/progress`,
 *     `GET /v1/videos/continue-watching`. `GET /v1/videos` on its own is 404 —
 *     verified. @momentum/chrome's destinations.ts named "`/v1/videos` on the
 *     gateway" as Tube's endpoint and was half right: the prefix is Tube's,
 *     the list is not there.
 */
const VIDEOS_PATH = "/v1/feed/videos"

/**
 * The server clamps `limit` to 50 on every `/v1/feed/*` surface except home,
 * whose ceiling is 100 (`rankedPageParams` in feed-service's handler.go). A
 * page of 12 is a deliberate choice well below it: the grid draws a poster and
 * a blurhash per row, and asking for fifty means fifty blurhashes decoded on
 * the main thread for videos most people will never scroll to.
 */
const PAGE_SIZE = 12

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

export interface VideosPage {
  items: FeedItem[]
  /**
   * `base64url("v1:" + timeuuid)`, passed back verbatim as `?cursor=`.
   *
   * There are THREE cursor families on this gateway and mixing them is a 400:
   * `/v1/feed/*` uses this opaque base64 token wrapping a UUID **version 1**,
   * `/v1/feed/videos/{id}/related` uses `base64url("v1r:" + offset)`, and
   * everything under `/v1/posts` uses a bare RFC3339Nano timestamp. Nothing
   * here should ever construct or parse one.
   */
  nextCursor: string | null
}

/**
 * One page of long videos.
 *
 * ── `following_only` is deliberately not sent ─────────────────────────────
 * The parameter exists on this endpoint and it fails CLOSED: it filters the
 * candidate set to authors the viewer follows and returns an EMPTY array for
 * an account that follows nobody, rather than backfilling with strangers.
 * That is the correct behaviour and it is exactly why this surface must not
 * ask for it — there is no All / Following control in this zone, so nothing on
 * screen would let somebody turn it back off.
 *
 * ── `category` is deliberately not sent either, YET ───────────────────────
 * It is real (`?category=` on this endpoint, a slug from the server's own
 * taxonomy at `GET /v1/posts/categories`) and it is what the phone's chip rail
 * drives. It is left out because a filter is only honest with a control
 * attached: an invalid slug is `400 INVALID_CATEGORY` and a valid one that
 * nothing in this corpus carries is an empty page, and neither is something a
 * page with no chips can explain. The chips are the follow-up, not a missing
 * argument to this call.
 */
export async function fetchVideosPage(cursor?: string | null): Promise<VideosPage> {
  const res = await api.get<Envelope<FeedItem[]>>(VIDEOS_PATH, {
    params: {
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    },
  })

  return {
    items: res.data?.data ?? [],
    // feed-service omits `meta` ENTIRELY on the last page — there is no
    // `next_cursor: null` to read. Absent is the normal terminating
    // condition, not a missing field to work around.
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/* ── Follow ─────────────────────────────────────────────────────────────── */

/**
 * The viewer's edge toward each of a page's authors.
 *
 * A feed item carries no follow state — feed-service's hydration path never
 * calls graph-service — so it has to be fetched, and this is the one call that
 * asks about a whole page at once. `GET /v1/graph/{userId}/following-ids` is
 * real but hard-capped at 500 newest edges, and the per-author
 * `GET /v1/graph/relationship` is an N+1. apps/reels' api.ts has the argument
 * in full; it is the same endpoint against the same service.
 *
 * Two things about it that will bite. It answers with a BARE MAP and no
 * `{data}` envelope — the handler calls gin's `c.JSON` directly instead of the
 * shared `api.JSON` — so reading `res.data.data` silently produces "nobody is
 * followed". And a target ABSENT from the map means "no relationship" rather
 * than an error: the map only carries what the store found.
 *
 * The cap is 100 targets (`store.MaxRelationshipBatch`); over it the request is
 * rejected with `400 BATCH_TOO_LARGE` rather than truncated, so the caller must
 * chunk. A page is 12, and this chunks anyway rather than relying on that.
 */
const RELATIONSHIP_BATCH_MAX = 100

interface WireRelationship {
  follows?: boolean
  follow_request_status?: string
}

export async function fetchFollowStates(
  viewerId: string,
  authorIds: string[]
): Promise<Map<string, FollowState>> {
  const out = new Map<string, FollowState>()
  const unique = [...new Set(authorIds.filter(Boolean))]
  if (!viewerId || unique.length === 0) return out

  for (let i = 0; i < unique.length; i += RELATIONSHIP_BATCH_MAX) {
    const chunk = unique.slice(i, i + RELATIONSHIP_BATCH_MAX)
    // No envelope. See the note above — this is not an oversight here.
    const res = await api.post<Record<string, WireRelationship>>(
      "/v1/graph/relationships/batch",
      { viewer_id: viewerId, target_ids: chunk }
    )
    const body = res.data ?? {}
    for (const id of chunk) {
      const row = body[id]
      // Absent means no relationship, which is "none" — not "unknown".
      out.set(id, row ? followStateOf(row) : "none")
    }
  }
  return out
}

/**
 * A graph relationship as the one button that can be drawn from it.
 *
 * `pending_sent` is the case nobody designs for and the reason
 * `@momentum/interactions`' FollowButton has three states rather than two: a
 * follow of a private account creates a REQUEST, and a button reading
 * "Following" would be telling somebody they are seeing videos they will not
 * see. `pending_received` is the other direction — they asked to follow us —
 * and says nothing about our edge toward them, so it is "none".
 */
export function followStateOf(row: WireRelationship): FollowState {
  if (row.follows) return "following"
  if (row.follow_request_status === "pending_sent") return "requested"
  return "none"
}

/**
 * Follow, or unfollow.
 *
 * The field is `user_id` — not `target_id`, not `followee_id`. graph-service
 * binds `UserIDRequest{ UserID string \`json:"user_id" binding:"required"\` }`
 * and the ACTOR comes from the authenticated session, never from the body.
 *
 * The returned state is the SERVER's, never a guess: "followed" and
 * "requested" are different outcomes of the same button press and only the
 * server knows which happened.
 */
export async function setFollow(
  authorId: string,
  next: "follow" | "unfollow"
): Promise<FollowState> {
  const path = next === "follow" ? "/v1/graph/follow" : "/v1/graph/unfollow"
  const res = await api.post<Envelope<{ status?: string }>>(path, { user_id: authorId })
  const status = res.data?.data?.status
  if (status === "requested") return "requested"
  if (status === "followed") return "following"
  if (status === "unfollowed") return "none"
  // An unrecognised status is not assumed to be success in either direction.
  throw new Error(`Unexpected follow status: ${String(status)}`)
}

/* ── The action bar ─────────────────────────────────────────────────────── */

/**
 * Like, or unlike. A TOGGLE that takes no body, so what the caller wanted is
 * not sent — the response carries the truth for both the state and the count,
 * and the count is the interesting half: other people have been liking this
 * too, so the server's number replaces our optimistic ±1 rather than being
 * reconciled with it.
 */
export async function toggleLike(postId: string): Promise<{ on: boolean; count: number }> {
  const res = await api.post<Envelope<{ liked: boolean; count: number }>>(
    `/v1/posts/${postId}/like`
  )
  const body = res.data?.data
  return { on: Boolean(body?.liked), count: body?.count ?? 0 }
}

/**
 * Save, or unsave. Not a toggle, unlike like: two idempotent routes, so the
 * desired state picks the method. POSTing twice leaves it saved rather than
 * toggling it back off, which is what you want from a control that might be
 * double-pressed.
 */
export async function setBookmark(postId: string, saved: boolean): Promise<{ on: boolean }> {
  const path = `/v1/posts/${postId}/bookmark`
  const res = saved
    ? await api.post<Envelope<{ bookmarked: boolean }>>(path)
    : await api.delete<Envelope<{ bookmarked: boolean }>>(path)
  return { on: Boolean(res.data?.data?.bookmarked) }
}

/* ── Analytics ──────────────────────────────────────────────────────────── */

interface IngestBody {
  accepted?: number
  duplicate?: number
}

/**
 * The transport `@momentum/analytics`' queue is constructed with.
 *
 * Lifted from apps/reels' `sendAnalytics` unchanged, including the outcome
 * mapping, because the endpoint's failure modes are a property of the endpoint
 * and not of the zone. The one that matters: the server validates every bound
 * and returns on the FIRST failure, so one bad event rejects the whole batch —
 * and since the rows stay queued, it does it again for ever. `permanent` is
 * what drops them.
 */
export async function sendAnalytics(events: AnalyticsEvent[]): Promise<SendOutcome> {
  try {
    const res = await api.post<Envelope<IngestBody>>("/v1/analytics/events", { events })
    return {
      kind: "ok",
      result: {
        accepted: res.data?.data?.accepted ?? 0,
        duplicate: res.data?.data?.duplicate ?? 0,
      },
    }
  } catch (error) {
    const err = error as { response?: { status?: number; data?: Envelope<unknown> } }
    const status = err.response?.status
    if (status === 401) return { kind: "unauthenticated" }
    // The content projection has not caught up with the post yet. Retrying is
    // right; dropping the watch time of a brand-new video is not.
    if (status === 422 && err.response?.data?.error?.code === "CONTENT_NOT_READY") {
      return { kind: "transient" }
    }
    if (!status || status === 429 || status >= 500) return { kind: "transient" }
    return { kind: "permanent" }
  }
}
