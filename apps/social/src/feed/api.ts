/**
 * Every URL the feed knows. This is the whole network surface of the zone.
 *
 * It is one file on purpose. The packages under packages/ are network-free so
 * that reels and tube can reuse them, which only means anything if the wiring
 * they are free OF lives somewhere findable — this is that place. Adding a
 * `fetch` to a component is the change that quietly ends the arrangement.
 *
 * ── The envelope is NOT unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance with a cookie/CSRF request
 * interceptor and a 401-refresh response interceptor; it does not touch the
 * body. Every gateway response is `{data, error, meta}`, so a caller reads
 * `res.data.data` — which is what every hook in apps/commerce does. That is
 * ugly enough to be worth hiding once, here, rather than twenty times.
 *
 * ── Routes verified against the running gateway, not guessed ──────────────
 *   GET    /v1/feed/home            ?limit&cursor&feed_mode
 *   POST   /v1/posts/{id}/like      no body, TOGGLES  -> {liked, count}
 *   POST   /v1/posts/{id}/bookmark  no body, SETS     -> {bookmarked:true}
 *   DELETE /v1/posts/{id}/bookmark                    -> {bookmarked:false}
 *   POST   /v1/posts/{id}/repost    {type:"plain"}    -> 201
 *   DELETE /v1/posts/{id}/repost                      -> 204, EMPTY BODY
 *   GET    /v1/posts/{id}/comments  ?cursor&limit     -> [Comment], next_cursor
 *   POST   /v1/posts/{id}/comments  {text:…}          -> 201, the new comment
 *   POST   /v1/feed/feedback   {post_id|author_id, signal}  -> 200
 *   POST   /v1/reports    {entity_type,entity_id,reason,details} -> 200
 *   POST   /v1/analytics/events     {events:[...]}    -> 202 {accepted,duplicate}
 *
 * Four of those are shaped differently from their neighbours and every one is
 * easy to get wrong: like is a toggle that ignores what you wanted; bookmark
 * is a pair of idempotent setters; the repost delete answers 204 with no
 * envelope at all, so parsing its body throws; and `/v1/reports` answers
 * **200**, not the 201 a create usually gets.
 *
 * The comment routes carry the asymmetry written up at the top of
 * @momentum/content's `comments.ts`: the CREATE sends `text`, an edit would
 * send `body`, and the field that comes back is always `body`. Nothing here
 * can fix that, and nothing here hides it either.
 */

import api from "@atpost/api-client"
import type { FeedItem, FeedPage } from "@atpost/types/feed"
import type { AnalyticsEvent, SendOutcome } from "@momentum/analytics"
import {
  commentErrorMessage,
  type CommentPage,
  type CommentRow,
  type ReportReason,
} from "@momentum/content"
import {
  failureOf,
  feedbackNotice,
  reportNotice,
  type FeedbackSignal,
  type FeedbackTarget,
  type Notice,
} from "./outcomes"

/**
 * The server clamps `limit` and only returns `meta.next_cursor` when the page
 * came back FULL (`len(items) >= limit`). Ask for more than the ranker can
 * produce and you get a short page — which is indistinguishable from the end
 * of the feed, because that is exactly what a short page means. Verified: 25
 * returns 25 and a cursor, 30 returns 20 and no cursor. 20 is the size the
 * endpoint is built around.
 */
const PAGE_SIZE = 20

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/**
 * One page of the home feed.
 *
 * ── Why `ranked` and never the default ────────────────────────────────────
 * This is a product decision, not a query-string detail. `feed_mode` defaults
 * to `chronological`, which is posts from accounts you FOLLOW — so a new
 * account, which follows nobody, gets `{"data":[]}`. The front door of the
 * platform would be blank on the day someone joins it, which is the single
 * worst moment for it to be blank. `ranked` is the mode with the cold-start
 * path and it returns content for an account with no graph at all.
 *
 * (Confirmed on the live stack with the test account: `chronological` answers
 * an empty array, `ranked` answers twenty posts.)
 */
export async function fetchFeedPage(cursor?: string | null): Promise<FeedPage> {
  const res = await api.get<Envelope<FeedItem[]>>("/v1/feed/home", {
    params: {
      limit: PAGE_SIZE,
      feed_mode: "ranked",
      ...(cursor ? { cursor } : {}),
    },
  })

  return {
    items: res.data?.data ?? [],
    // Absent means end-of-feed. It is the normal terminating condition, not a
    // missing field to work around.
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/**
 * Like, or unlike.
 *
 * The route is a TOGGLE and takes no body, so `next` is not sent — it is only
 * what the caller expected. The response carries the truth for both the state
 * and the count, and the count is the interesting half: other people have been
 * liking this post too, so the server's number is not our optimistic ±1 and
 * should replace it rather than be reconciled with it.
 */
export async function toggleLike(postId: string): Promise<{ on: boolean; count: number }> {
  const res = await api.post<Envelope<{ liked: boolean; count: number }>>(
    `/v1/posts/${postId}/like`
  )
  const body = res.data?.data
  return { on: Boolean(body?.liked), count: body?.count ?? 0 }
}

/**
 * Save, or unsave.
 *
 * Not a toggle, unlike `like`: two idempotent routes, so the desired state
 * picks the method. Calling POST twice leaves it saved rather than toggling it
 * back off, which is the behaviour you want from a control that might be
 * double-tapped.
 *
 * There is also a richer `/v1/saved` collections API. It is not used here: it
 * keys deletes on the SAVED-ROW id rather than the post id, which the feed
 * does not have and would need a second request to learn.
 */
export async function setBookmark(postId: string, saved: boolean): Promise<{ on: boolean }> {
  const path = `/v1/posts/${postId}/bookmark`
  const res = saved
    ? await api.post<Envelope<{ bookmarked: boolean }>>(path)
    : await api.delete<Envelope<{ bookmarked: boolean }>>(path)
  return { on: Boolean(res.data?.data?.bookmarked) }
}

/**
 * Repost, or undo.
 *
 * `type` is required on the create — a bare `{}` is a 422. The DELETE answers
 * **204 with no body at all**, so there is nothing to read and nothing to
 * parse; the state is inferred from the fact that it did not throw.
 */
export async function setRepost(postId: string, reposted: boolean): Promise<{ on: boolean }> {
  const path = `/v1/posts/${postId}/repost`
  if (reposted) {
    await api.post(path, { type: "plain" })
    return { on: true }
  }
  await api.delete(path)
  return { on: false }
}

/* ── Comments ───────────────────────────────────────────────────────────── */

/**
 * The page size, and why it is not the maximum.
 *
 * The endpoint clamps to 50 — but not by clamping. `ListComments` in
 * post-service reads `if limit <= 0 || limit > 50 { limit = 20 }`, so asking
 * for 100 silently gets the SMALLEST page rather than the largest, which is
 * the opposite of what the caller wanted and produces no error to notice it
 * by. 20 is the server's own default and the number this asks for on purpose.
 */
const COMMENT_PAGE_SIZE = 20

/**
 * One page of a post's comments, newest first.
 *
 * The cursor is an RFC3339Nano `created_at` handed back verbatim; there is no
 * sort parameter and no way to ask for oldest-first. `meta.next_cursor` is
 * absent at the end of the list, which is the terminating condition rather
 * than a missing field — the same arrangement `/v1/feed/home` uses.
 *
 * Reads succeed unauthenticated (the handler treats `X-User-Id` as optional
 * and only uses it to reveal the viewer's own held-for-review comments), so
 * this is not gated on the session.
 */
export async function fetchComments(postId: string, cursor: string | null): Promise<CommentPage> {
  const res = await api.get<Envelope<CommentRow[]>>(`/v1/posts/${postId}/comments`, {
    params: {
      limit: COMMENT_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    },
  })
  return {
    items: res.data?.data ?? [],
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/**
 * Write one. 201, and the row the server made.
 *
 * The row is returned rather than swallowed because the id, the timestamp and
 * the counts are all the server's to assign — a client that invented them
 * would show a comment that does not match the one everyone else can see.
 *
 * What the row does NOT carry is a hydrated `author`: verified on the live
 * gateway, the create response has `author_id` and no `author`, while the
 * list has both. The sheet is told who the viewer is so it can name the row
 * anyway; see `commentAuthorName`.
 *
 * No `Idempotency-Key` is sent. The header is supported and makes the insert
 * durably idempotent, but it is only worth having where a retry exists to
 * protect, and there is no automatic retry on this path — a failed comment
 * comes back to the composer with the text still in it and a person decides.
 * Sending a key without a retry buys nothing and risks the 409
 * IDEMPOTENCY_KEY_REUSED that a reused key answers with.
 */
export async function createComment(postId: string, text: string): Promise<CommentRow> {
  const res = await api.post<Envelope<CommentRow>>(`/v1/posts/${postId}/comments`, { text })
  const row = res.data?.data
  if (!row) throw new Error("The server accepted the comment but did not return it.")
  return row
}

/**
 * Why a comment was refused, in a sentence.
 *
 * The classification itself lives in @momentum/content, which owns the
 * vocabulary of this surface and is tested as a table. All this adds is the
 * transport: axios keeps the status and the envelope's code in different
 * places, and the package may not know that axios exists.
 */
export function commentFailureMessage(error: unknown): string {
  const { status, code } = failureOf(error)
  return commentErrorMessage(code, status)
}

/* ── Steering the ranker, and reporting ─────────────────────────────────── */

/**
 * "Interested" / "Not interested" / "Don't recommend this account".
 *
 * ── Exactly one of the two ids ────────────────────────────────────────────
 * The endpoint takes `post_id` OR `author_id` and rejects both together and
 * neither with the same 400 (verified: "post_id and author_id are mutually
 * exclusive", "post_id or author_id is required"). So the target is a
 * discriminated argument here rather than two optional fields, and the
 * request body cannot be built wrong.
 *
 * ── It answers, and the answer is not thrown away ─────────────────────────
 * `not_interested` on a post removes it from every surface on the next fetch;
 * on an author it removes everything they have posted. The feed acts on that
 * immediately rather than waiting for a refetch — feed-service's own note
 * says why, and it is the reason this reports back instead of returning
 * nothing: something has to be said, and what to say depends on which of the
 * three rows was pressed and on whether the server agreed.
 *
 * `ok` is separate from the notice's tone on purpose. The tone is how it
 * LOOKS and the flag is whether it HAPPENED, and the report route below is
 * the proof that those two can differ — a 409 there is bad news that reads as
 * good. Here `ok` is what the optimistic removal is rolled back on.
 */
export async function sendFeedback(
  target: { kind: FeedbackTarget; id: string },
  signal: FeedbackSignal
): Promise<{ ok: boolean; notice: Notice }> {
  try {
    await api.post("/v1/feed/feedback", {
      ...(target.kind === "post" ? { post_id: target.id } : { author_id: target.id }),
      signal,
    })
    return { ok: true, notice: feedbackNotice(signal, target.kind) }
  } catch (error: unknown) {
    return { ok: false, notice: feedbackNotice(signal, target.kind, failureOf(error)) }
  }
}

/**
 * File a report against a post.
 *
 * ── 200, and 409 is not a failure ─────────────────────────────────────────
 * The create answers **200** rather than 201, and a second report of the same
 * post by the same person answers **409 ACTIVE_REPORT_EXISTS** — which means
 * their report is already open in the moderation queue. That is the state
 * they were trying to reach, so it comes back as a confirmation. See
 * `reportNotice`, where the distinction is made and tested.
 *
 * `reason` is the server's own allowlist (`REPORT_REASONS` mirrors
 * trust-safety-service's `validReportCategories`) and is not free text. An
 * unrecognised value answers 500, which is a server defect and is flagged in
 * the report rather than defended against here — there is no path from the
 * menu to a value that is not on the list.
 */
export async function fileReport(
  postId: string,
  reason: ReportReason,
  details: string
): Promise<Notice> {
  try {
    await api.post("/v1/reports", {
      entity_type: "post",
      entity_id: postId,
      reason,
      details,
    })
    return reportNotice()
  } catch (error: unknown) {
    return reportNotice(failureOf(error))
  }
}

/**
 * Ship a batch of analytics events.
 *
 * This is the transport @momentum/analytics is constructed with — the whole
 * reason that package takes a function instead of importing axios. It
 * classifies the failure rather than throwing, because the queue's decision
 * about whether to retry, bisect, or stop depends entirely on which kind it
 * was:
 *
 *   401              stop. The rows are real watch time; keep them for after a
 *                    re-auth rather than throwing a creator's minutes away.
 *   422 CONTENT_NOT_READY
 *                    transient, and NOT a client bug. It means the ownership
 *                    projection has not caught up with a freshly published
 *                    video yet. Dropping these would systematically lose the
 *                    first views of every new upload — the views that matter
 *                    most to the person who just posted.
 *   429 / 5xx / off  transient.
 *   400 and the rest permanent, so the queue bisects and drops one event.
 */
export async function sendAnalytics(events: AnalyticsEvent[]): Promise<SendOutcome> {
  try {
    const res = await api.post<Envelope<{ accepted: number; duplicate: number }>>(
      "/v1/analytics/events",
      { events }
    )
    const body = res.data?.data
    return {
      kind: "ok",
      result: { accepted: body?.accepted ?? 0, duplicate: body?.duplicate ?? 0 },
    }
  } catch (err: unknown) {
    const e = err as {
      response?: { status?: number; data?: { error?: { code?: string } } }
    }
    const status = e.response?.status
    const code = e.response?.data?.error?.code

    if (status === 401) return { kind: "unauthenticated" }
    if (status === 422 && code === "CONTENT_NOT_READY") return { kind: "transient" }
    if (status === undefined || status === 429 || status >= 500) return { kind: "transient" }
    return { kind: "permanent" }
  }
}
