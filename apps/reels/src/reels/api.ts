/**
 * Every URL the reels zone knows. This is the whole network surface.
 *
 * Same arrangement as `apps/social/src/feed/api.ts`, and for the same reason:
 * the packages under packages/ are network-free so that this zone can reuse
 * them, which only means anything if the wiring they are free OF lives
 * somewhere findable. This is that place.
 *
 * ── The envelope is NOT unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance with a cookie/CSRF request
 * interceptor and a 401-refresh response interceptor; it does not touch the
 * body. Every gateway response is `{data, error, meta}`, so a caller reads
 * `res.data.data` — with ONE exception, `relationshipsBatch` below, which the
 * graph service answers unenveloped. That exception is not a mistake here; it
 * is a mistake on the server, and it is recorded rather than smoothed over.
 *
 * ── Routes verified against the running gateway on 2026-09-09 ─────────────
 *   GET  /v1/feed/reels        ?limit&cursor&following_only -> [item], meta
 *   GET  /v1/feed/flicks       identical — see the note on REELS_PATH
 *   POST /v1/graph/follow      {user_id}   -> {status:"followed"|"requested"}
 *   POST /v1/graph/unfollow    {user_id}   -> {status:"unfollowed"}
 *   POST /v1/graph/relationships/batch {viewer_id,target_ids} -> UNENVELOPED
 *   POST /v1/posts/{id}/like       no body, TOGGLES -> {liked, count}
 *   POST /v1/posts/{id}/bookmark   no body, SETS    -> {bookmarked:true}
 *   DELETE /v1/posts/{id}/bookmark                  -> {bookmarked:false}
 *   POST /v1/analytics/events  {events:[...]}       -> 202 {accepted,duplicate}
 *
 * The like/bookmark/analytics shapes are lifted from apps/social's api.ts
 * rather than rediscovered: they are the same endpoints against the same
 * gateway, and two zones disagreeing about them is the failure that file's
 * header exists to prevent.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import type { AnalyticsEvent, SendOutcome } from "@momentum/analytics"
import type { FollowState } from "@momentum/interactions"

/**
 * `/reels`, not `/flicks`, and it makes no difference which.
 *
 * feed-service registers both and `GetReelFeedPage` is a one-line alias that
 * calls `GetFlickFeedPage` (internal/service/feed.go). They read the same
 * Scylla timeline for the same content types (`flick`, `reel`) and return
 * byte-identical bodies; the only difference on the wire is the informational
 * `X-Feed-Surface` response header, `reels` versus `flicks`.
 *
 * Verified live: the same two calls returned the same items and the same
 * `meta.next_cursor`. `/reels` is chosen because it is the name of this zone
 * and of the surface a person thinks they are on.
 */
const REELS_PATH = "/v1/feed/reels"

/**
 * The server clamps `limit` to 50 on this endpoint — NOT 100, which is the
 * home feed's ceiling (`rankedPageParams` in feed-service's handler.go:
 * `if limit > 50 { limit = 50 }`). A page of 12 is a deliberate choice below
 * both: a reel is a video, every page is prefetched into a scroller that will
 * try to paint posters for all of it, and asking for fifty means fifty
 * blurhashes decoded for content most people will never swipe to.
 */
const PAGE_SIZE = 12

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

export interface ReelsPage {
  items: FeedItem[]
  /**
   * `base64url("v1:" + timeuuid)`, passed back verbatim as `?cursor=`.
   *
   * NOT the home feed's cursor format. `/v1/feed/home` returns an RFC3339Nano
   * timestamp; this returns an opaque base64 token wrapping a UUID **version
   * 1**, and feed-service rejects anything else with `400 INVALID_CURSOR`.
   * Nothing here should ever construct or parse one.
   */
  nextCursor: string | null
}

/**
 * One page of reels.
 *
 * ── `following_only` is deliberately not sent ─────────────────────────────
 * The parameter exists on this endpoint and it fails CLOSED: it filters the
 * candidate set to authors the viewer follows and returns an EMPTY array for
 * an account that follows nobody, rather than backfilling with strangers.
 * That is the correct behaviour and it is exactly why this surface must not
 * ask for it — mobile's Reels has no For You / Following tabs (see the header
 * of ReelsScreen.kt: "No For You / Following tabs: Reels is one surface"), so
 * there is no control that would let somebody turn it back off. A zone that
 * silently sent `following_only=true` would show a new account an empty Reels
 * for ever with nothing on screen to explain it.
 */
export async function fetchReelsPage(cursor?: string | null): Promise<ReelsPage> {
  const res = await api.get<Envelope<FeedItem[]>>(REELS_PATH, {
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
 * ── Why this endpoint and not the two more obvious ones ───────────────────
 * A reel item carries NO follow state. `HydratedPost.Author` is four fields —
 * id, display_name, username, avatar_media_id — and nothing in feed-service's
 * hydration path calls graph-service. So the state has to be fetched, and
 * there were three candidates:
 *
 *   · `GET /v1/graph/relationship?user_id&other_id` — one call PER AUTHOR.
 *     This is what the Android client does (`FollowGraph.ensureKnown` fires
 *     one `async` per unknown id), and on a scrolling surface it is the
 *     classic N+1. It works; it is just needlessly N calls.
 *
 *   · `GET /v1/graph/{userId}/following-ids` — the route named in the brief.
 *     It is real but it is NOT what it sounds like: the id is a PATH
 *     parameter (there is no viewer-implicit `/v1/graph/following-ids`; that
 *     path 404s, verified), it cannot be filtered to a candidate set, it does
 *     not paginate, and it is hard-capped at 500 newest edges. For an account
 *     that follows more than 500 people it answers "not following" for
 *     everyone past the cap — a Follow button that reappears on someone you
 *     already follow, which is the exact failure the state is fetched to
 *     avoid.
 *
 *   · `POST /v1/graph/relationships/batch` — one call for the whole page,
 *     asks about exactly the authors on screen, and has no cap problem. Used.
 *
 * ── Two things about it that will bite ────────────────────────────────────
 * It answers with a BARE MAP and no `{data}` envelope: the handler calls
 * gin's `c.JSON` directly instead of the shared `api.JSON`, unlike every
 * neighbouring route including the singular `/v1/graph/relationship`. That is
 * a server inconsistency, it is load-bearing here, and reading `res.data.data`
 * would silently produce "nobody is followed".
 *
 * And a target ABSENT from the map means "no relationship" rather than an
 * error — the map only carries what the store found.
 *
 * The cap is 100 targets (`store.MaxRelationshipBatch`); over it the request
 * is rejected with `400 BATCH_TOO_LARGE` rather than truncated, so the caller
 * must chunk. A page is 12, and this chunks anyway rather than relying on that.
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
      if (!row) {
        out.set(id, "none")
        continue
      }
      out.set(id, followStateOf(row))
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
 * "Following" would be telling somebody they are seeing posts they will not
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
 * ── The field is `user_id` ────────────────────────────────────────────────
 * Not `target_id`, not `followee_id`. graph-service binds
 * `type UserIDRequest struct { UserID string \`json:"user_id" binding:"required"\` }`
 * and the ACTOR comes from the authenticated session, never from the body.
 * A wrong field name produces `400 INVALID_REQUEST` from the binding, and a
 * previous attempt at this reported `WRONG_ENTITY_TYPE` from sending the
 * right shape to the wrong place. Verified live, both directions:
 *   POST /v1/graph/follow   {"user_id":"<uuid>"} -> {"data":{"status":"followed"}}
 *   POST /v1/graph/unfollow {"user_id":"<uuid>"} -> {"data":{"status":"unfollowed"}}
 *
 * `X-Graph-Write-Source` is required by graph-service on its mutations, and
 * the api-gateway stamps it on proxied `/v1/graph` traffic — so a browser
 * going through the gateway, which is the only way this zone ever calls it,
 * does not send it. A direct service-to-service caller would have to.
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
 * Lifted from apps/social's `sendAnalytics` unchanged, including the outcome
 * mapping, because the endpoint's failure modes are a property of the endpoint
 * and not of the zone. The one that matters: the server validates every bound
 * and returns on the FIRST failure, so one bad event rejects the whole batch —
 * and since the rows stay queued, it does it again for ever. `permanent` is
 * what drops them.
 */
export async function sendAnalytics(events: AnalyticsEvent[]): Promise<SendOutcome> {
  try {
    const res = await api.post<Envelope<IngestBody>>("/v1/analytics/events", { events })
    return { kind: "ok", result: { accepted: res.data?.data?.accepted ?? 0, duplicate: res.data?.data?.duplicate ?? 0 } }
  } catch (error) {
    const err = error as { response?: { status?: number; data?: Envelope<unknown> } }
    const status = err.response?.status
    if (status === 401) return { kind: "unauthenticated" }
    // The content projection has not caught up with the post yet. Retrying is
    // right; dropping the watch time of a brand-new reel is not.
    if (status === 422 && err.response?.data?.error?.code === "CONTENT_NOT_READY") {
      return { kind: "transient" }
    }
    if (!status || status === 429 || status >= 500) return { kind: "transient" }
    return { kind: "permanent" }
  }
}
