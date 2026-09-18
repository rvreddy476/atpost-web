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
 * `res.data.data` — with ONE exception, `fetchFollowStates` below, which the
 * graph service answers unenveloped. That exception is not a mistake here; it
 * is a mistake on the server, and it is recorded rather than smoothed over.
 *
 * ── The routes, as verified against the running gateway ───────────────────
 *   GET    /v1/feed/flicks     ?limit&cursor&following_only  AUTH REQUIRED
 *   GET    /v1/posts/recent    ?content_type=flick,reel&limit&cursor
 *   POST   /v1/reels/{id}/react     DELETE the same          -> {liked,count}
 *   POST   /v1/reels/{id}/save      DELETE the same          -> {saved}
 *   POST   /v1/reels/{id}/share                              -> {count?}
 *   GET    /v1/reels/{id}/comments  ?limit&cursor            -> [Comment]
 *   POST   /v1/reels/{id}/comments  {text}                   -> the new row
 *   POST   /v1/comments/{id}/reply  {text}                   -> the new row
 *   POST   /v1/comments/{id}/like                            -> {liked,count}
 *   PATCH  /v1/comments/{id}        {text}                   -> the row
 *   DELETE /v1/comments/{id}
 *   POST   /v1/feed/feedback   {post_id|author_id, signal}
 *   POST   /v1/feed/mute       {author_id}
 *   POST   /v1/reports         {entity_type,entity_id,reason,details}
 *   POST   /v1/graph/follow|unfollow   {user_id}
 *   POST   /v1/graph/relationships/batch {viewer_id,target_ids} UNENVELOPED
 *   GET    /v1/audio/{id}                                    -> {title,…}
 *   POST   /v1/analytics/events {events:[…]}  -> 202 {accepted,duplicate}
 *
 * ── There is no dislike, and there must not be one ────────────────────────
 * `/react` is a two-method pair, not a three-way vote. A thumb-down drawn on
 * this rail would have nothing to call, so it is absent from the rail, from
 * `./rail.ts` and from this file.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import type { AnalyticsEvent, SendOutcome } from "@momentum/analytics"
import type { CommentPage, CommentRow } from "@momentum/content"
import type { FollowState } from "@momentum/interactions"
import type { FeedSource } from "./source"

/**
 * The server clamps `limit` to 50 on the flicks endpoint. A page of 12 is a
 * deliberate choice below that: a short is a video, every page is prefetched
 * into a scroller that will try to paint posters for all of it, and asking for
 * fifty means fifty blurhashes decoded for content most people never reach.
 */
const PAGE_SIZE = 12

/** post-service reads `if limit <= 0 || limit > 50 { limit = 20 }`. */
const COMMENT_PAGE_SIZE = 20

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

export interface ReelsPage {
  items: FeedItem[]
  /**
   * Passed back verbatim as `?cursor=`. Never constructed and never parsed —
   * the two sources below hand out different formats (an opaque base64 token
   * from feed-service, an RFC3339Nano timestamp from post-service) and the
   * only correct thing to do with either is to give it straight back.
   */
  nextCursor: string | null
}

/**
 * One page of shorts, from whichever source this viewer is entitled to.
 *
 * ── `/v1/feed/flicks` is 401 for an anonymous browser ─────────────────────
 * It ranks against a viewer, so there is no signed-out version of it — asking
 * without a session is not a request that might work, it is a guaranteed 401
 * with a failed token refresh behind it. `/v1/posts/recent` is the signed-out
 * surface: unranked, newest first, and filtered to the two content types this
 * zone plays. It is genuinely a different product (recency, not relevance),
 * which is why the source is named rather than hidden.
 *
 * ── `following_only` fails CLOSED, and that is why it needs a tab ─────────
 * It filters the candidate set to authors the viewer follows and returns an
 * EMPTY array for an account that follows nobody, rather than backfilling
 * with strangers. Correct behaviour, and exactly why it may only ever be sent
 * from a control the viewer can see and switch back off — which is what the
 * Following tab is. A zone that sent it silently would show a new account an
 * empty surface for ever with nothing on screen to explain it.
 */
export async function fetchReelsPage(
  source: FeedSource,
  cursor?: string | null
): Promise<ReelsPage> {
  const page = cursor ? { cursor } : {}
  const res =
    source === "recent"
      ? await api.get<Envelope<FeedItem[]>>("/v1/posts/recent", {
          params: { content_type: "flick,reel", limit: PAGE_SIZE, ...page },
        })
      : await api.get<Envelope<FeedItem[]>>("/v1/feed/flicks", {
          params: {
            limit: PAGE_SIZE,
            ...(source === "following" ? { following_only: true } : {}),
            ...page,
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
 * A short carries NO follow state. `HydratedPost.Author` is four fields — id,
 * display_name, username, avatar_media_id — and nothing in feed-service's
 * hydration path calls graph-service. So the state has to be fetched:
 *
 *   · `GET /v1/graph/relationship?user_id&other_id` is one call PER AUTHOR —
 *     the classic N+1 on a scrolling surface.
 *   · `GET /v1/graph/{userId}/following-ids` is hard-capped at 500 newest
 *     edges, so past the cap it answers "not following" for everyone — a
 *     Follow button that reappears on somebody you already follow.
 *   · `POST /v1/graph/relationships/batch` asks about exactly the authors on
 *     screen and has no cap problem. Used.
 *
 * It answers with a BARE MAP and no `{data}` envelope: the handler calls gin's
 * `c.JSON` directly instead of the shared `api.JSON`. That is a server
 * inconsistency, it is load-bearing here, and reading `res.data.data` would
 * silently produce "nobody is followed". A target ABSENT from the map means
 * "no relationship" rather than an error.
 *
 * The cap is 100 targets (`store.MaxRelationshipBatch`); over it the request
 * is rejected with `400 BATCH_TOO_LARGE` rather than truncated, so the caller
 * must chunk. A page is 12, and this chunks anyway rather than relying on it.
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

/* ── The rail ───────────────────────────────────────────────────────────── */

/**
 * The server's own number, when it sent one.
 *
 * `null` and not a fallback zero, and the distinction is the whole reason this
 * type exists. An optimistic ±1 is already on screen; replacing it with the
 * server's count is right, and replacing it with a zero invented here because
 * the body had no `count` field would wipe a real number off a creator's reel.
 * `applyCount` in ./rail.ts is where that rule is written down and tested.
 */
export interface ToggleResult {
  on: boolean
  count: number | null
}

interface WireToggle {
  liked?: boolean
  reacted?: boolean
  saved?: boolean
  bookmarked?: boolean
  count?: number
  like_count?: number
}

function toggleResultOf(body: WireToggle | undefined, wanted: boolean): ToggleResult {
  const on = body?.liked ?? body?.reacted ?? body?.saved ?? body?.bookmarked ?? wanted
  const count = body?.count ?? body?.like_count
  return { on: Boolean(on), count: typeof count === "number" ? count : null }
}

/**
 * Like, or unlike.
 *
 * Two idempotent methods on one path rather than a toggle, so the DESIRED
 * state picks the verb: POSTing twice leaves it liked rather than flipping it
 * back off, which is what you want from a control people double-press and from
 * one bound to a double-tap on the picture.
 */
export async function setReaction(reelId: string, on: boolean): Promise<ToggleResult> {
  const path = `/v1/reels/${reelId}/react`
  const res = on
    ? await api.post<Envelope<WireToggle>>(path)
    : await api.delete<Envelope<WireToggle>>(path)
  return toggleResultOf(res.data?.data, on)
}

/** Save, or unsave. The same two-idempotent-methods shape, same reasoning. */
export async function setSaved(reelId: string, on: boolean): Promise<ToggleResult> {
  const path = `/v1/reels/${reelId}/save`
  const res = on
    ? await api.post<Envelope<WireToggle>>(path)
    : await api.delete<Envelope<WireToggle>>(path)
  return toggleResultOf(res.data?.data, on)
}

/**
 * Tell the server a share happened.
 *
 * Fired AFTER the link has actually left — a clipboard write that succeeded or
 * a share sheet that was not dismissed — because this is a count a creator
 * sees, and crediting one for a dialog somebody closed would be a number that
 * does not correspond to anything. A failure here is swallowed: the person's
 * link is already on their clipboard and a toast about analytics would be
 * telling them about our problem.
 */
export async function recordShare(reelId: string): Promise<void> {
  try {
    await api.post(`/v1/reels/${reelId}/share`)
  } catch {
    // Deliberately silent. See above.
  }
}

/* ── Comments ───────────────────────────────────────────────────────────── */

/**
 * One page of a short's comments, newest first.
 *
 * The cursor is handed back verbatim; there is no sort parameter and no way to
 * ask for oldest-first. `meta.next_cursor` is absent at the end of the list,
 * which is the terminating condition rather than a missing field.
 *
 * Reads succeed unauthenticated — the handler treats the viewer as optional
 * and only uses it to reveal your own held-for-review rows — so the panel
 * opens for a signed-out browser and shows the thread it cannot write to.
 */
export async function fetchComments(reelId: string, cursor: string | null): Promise<CommentPage> {
  const res = await api.get<Envelope<CommentRow[]>>(`/v1/reels/${reelId}/comments`, {
    params: { limit: COMMENT_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  })
  return {
    items: res.data?.data ?? [],
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

function requiredRow(row: CommentRow | undefined, what: string): CommentRow {
  if (!row) throw new Error(`The server accepted the ${what} but did not return it.`)
  return row
}

/**
 * Write one. The row the server made, not the one we sent.
 *
 * The id, the timestamp and the counts are all the server's to assign, and a
 * client that invented any of them would show a comment that does not match
 * the one everybody else can see. What the row does NOT carry is a hydrated
 * `author` — verified on the live gateway, the create response has `author_id`
 * and no `author` while the list has both — so the panel is told who the
 * viewer is and names the row itself. See `commentAuthorName`.
 */
export async function createComment(reelId: string, text: string): Promise<CommentRow> {
  const res = await api.post<Envelope<CommentRow>>(`/v1/reels/${reelId}/comments`, { text })
  return requiredRow(res.data?.data, "comment")
}

/**
 * Reply to a comment.
 *
 * A separate route from the create, and it has to be: post-service caps the
 * thread at one reply per comment (`REPLY_EXISTS`), refuses a reply to a reply
 * (`CANNOT_REPLY_TO_REPLY`), and — the one that shapes the UI — allows it only
 * for the POST'S AUTHOR (`REPLY_OWNER_ONLY`). This is a creator-response
 * model, not a discussion thread, which is why `canReply` in ./comments.ts
 * offers the control to exactly one person.
 */
export async function replyToComment(commentId: string, text: string): Promise<CommentRow> {
  const res = await api.post<Envelope<CommentRow>>(`/v1/comments/${commentId}/reply`, { text })
  return requiredRow(res.data?.data, "reply")
}

/**
 * Like a comment.
 *
 * A TOGGLE — one method, no desired state to send — so unlike the reel's own
 * like there is nothing to make idempotent and the server's answer is the only
 * thing that knows which way it went.
 */
export async function likeComment(commentId: string): Promise<ToggleResult> {
  const res = await api.post<Envelope<WireToggle>>(`/v1/comments/${commentId}/like`)
  const body = res.data?.data
  const count = body?.count ?? body?.like_count
  return {
    on: Boolean(body?.liked ?? body?.reacted),
    count: typeof count === "number" ? count : null,
  }
}

/** Edit your own. `text`, the same field the create takes. */
export async function editComment(commentId: string, text: string): Promise<CommentRow> {
  const res = await api.patch<Envelope<CommentRow>>(`/v1/comments/${commentId}`, { text })
  return requiredRow(res.data?.data, "edit")
}

/** Delete your own. No body, and nothing useful in the response. */
export async function deleteComment(commentId: string): Promise<void> {
  await api.delete(`/v1/comments/${commentId}`)
}

/* ── The overflow menu ──────────────────────────────────────────────────── */

/**
 * "Not interested".
 *
 * The endpoint takes `post_id` OR `author_id` and rejects both together and
 * neither with the same 400, so the target is a discriminated argument here
 * rather than two optional fields and the body cannot be built wrong.
 */
export async function sendFeedback(
  target: { kind: "post" | "author"; id: string },
  signal: "interested" | "not_interested"
): Promise<void> {
  await api.post("/v1/feed/feedback", {
    ...(target.kind === "post" ? { post_id: target.id } : { author_id: target.id }),
    signal,
  })
}

/**
 * "Don't recommend this account".
 *
 * A stronger thing than `not_interested` on an author and a different route:
 * feedback is a ranking SIGNAL that decays, mute is a standing instruction.
 * The menu row says "Don't recommend this account" rather than "Mute" because
 * that is what it does — it does not stop you seeing them on their own page.
 */
export async function muteAuthor(authorId: string): Promise<void> {
  await api.post("/v1/feed/mute", { author_id: authorId })
}

/**
 * Take one short out of this viewer's feed.
 *
 * Called alongside the feedback signal, and it is not a duplicate of it: the
 * signal teaches the ranker, this removes THIS post from the queue the ranker
 * has already built. Without it the reel comes back on the next page of a feed
 * that was scored before the signal landed, which reads as the button having
 * done nothing.
 */
export async function hidePost(postId: string): Promise<void> {
  await api.post(`/v1/feed/hide/${postId}`)
}

/**
 * File a report against a short.
 *
 * The create answers **200** rather than 201, and a second report of the same
 * post by the same person answers **409 ACTIVE_REPORT_EXISTS** — which means
 * their report is already open in the moderation queue. That is the state they
 * were trying to reach, so the caller treats it as a confirmation rather than
 * a failure; see `reportOutcome` in ./menu.ts.
 *
 * `reason` is the server's own allowlist (`REPORT_REASONS` in
 * @momentum/content mirrors trust-safety-service's `validReportCategories`)
 * and is not free text.
 */
export async function fileReport(
  postId: string,
  reason: string,
  details: string
): Promise<void> {
  await api.post("/v1/reports", {
    entity_type: "post",
    entity_id: postId,
    reason,
    details,
  })
}

/* ── Audio ──────────────────────────────────────────────────────────────── */

export interface AudioTrack {
  id: string
  title?: string
  artist?: string
  artist_name?: string
}

/**
 * The track a short was made with.
 *
 * Fetched only when the post carries an `audio_track_id`, and only for the
 * short on screen — the line is one row of text and is not worth a request per
 * neighbour. A failure is not reported: the audio line simply does not appear,
 * which is the same thing a short with no track looks like.
 */
export async function fetchAudioTrack(audioId: string): Promise<AudioTrack | null> {
  try {
    const res = await api.get<Envelope<AudioTrack>>(`/v1/audio/${audioId}`)
    return res.data?.data ?? null
  } catch {
    return null
  }
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
    // right; dropping the watch time of a brand-new short is not.
    if (status === 422 && err.response?.data?.error?.code === "CONTENT_NOT_READY") {
      return { kind: "transient" }
    }
    if (!status || status === 429 || status >= 500) return { kind: "transient" }
    return { kind: "permanent" }
  }
}

/**
 * An axios failure, flattened to the two things every caller here asks about.
 *
 * The status and the envelope's `error.code` live in different places and
 * neither @momentum/content nor this zone's pure modules may know that axios
 * exists, so this is the one place the shape is unpicked.
 */
export function failureOf(error: unknown): { status?: number; code?: string } {
  const err = error as { response?: { status?: number; data?: Envelope<unknown> } }
  return { status: err.response?.status, code: err.response?.data?.error?.code }
}
