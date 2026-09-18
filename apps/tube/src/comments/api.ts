/**
 * Everything the comment thread under a video calls.
 *
 * Its own module rather than a section of ../watch/api.ts because the surface
 * is its own: nothing here is a question about "the video currently open", and
 * the same seven calls would serve a comment thread anywhere in this zone.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRANSCRIBED FROM post-service, AND FOUR THINGS ARE NOT OBVIOUS
 *
 *   GET    /v1/posts/{postId}/comments?cursor=&limit=      → {data:[Comment]}
 *   GET    /v1/posts/{postId}/comments/around/{commentId}  → {data:[Comment]}
 *   POST   /v1/posts/{postId}/comments   {"text": …}       → 201 Comment
 *   POST   /v1/comments/{id}/reply       {"text": …}       → 201 Comment
 *   POST   /v1/comments/{id}/like                          → {liked,count,…}
 *   PATCH  /v1/comments/{id}             {"body": …}       → {"status":…}
 *   DELETE /v1/comments/{id}                               → {"status":…}
 *
 *   · The LIST lives under `/v1/posts`; only operations on one existing
 *     comment live under `/v1/comments`.
 *
 *   · Create sends `text`. Edit sends `body`. The field that comes BACK is
 *     always `body`. The asymmetry is in the server's own structs
 *     (`CommentRequest.Text`, `EditCommentRequest.Body`) and cannot be tidied
 *     from here.
 *
 *   · Edit and delete answer `{"status":"updated"}` / `{"status":"deleted"}`
 *     and NOT the changed row. So the thread applies its own change locally
 *     and has nothing to reconcile against — which is why ./thread.ts owns
 *     `replaceBody` and `removeComment` as pure functions rather than the
 *     component patching state inline.
 *
 *   · There is NO sort parameter. `ListComments` reads `cursor` and `limit`
 *     and nothing else, so the order is the server's — newest first, cursored
 *     on `created_at` — and this client offers no "Top comments" control,
 *     because there is no endpoint behind one. A sort picker that reorders
 *     twenty loaded rows while the next page arrives in a different order is
 *     worse than no picker.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE IDEMPOTENCY KEY IS SENT, AND IT IS OPTIONAL
 *
 * `POST /v1/posts/{id}/comments` is wrapped in post-service's `Idempotency`
 * middleware, which reads `Idempotency-Key` and, **when the header is absent,
 * passes the request straight through** — checked in the handler's own binding
 * before assuming: `clientKey == ""` is an explicit early `c.Next()`. So this
 * is not `POST /v1/posts`, which 400s without one.
 *
 * It is sent anyway, because the thread posts optimistically and therefore
 * retries: without a key, a create that timed out after the row was written
 * produces a second comment. With one, the retry answers the SAME row (the
 * server also fingerprints the normalized text, so a retry that loses the key
 * is still deduplicated in PostgreSQL), and a DIFFERENT text under the same key
 * is `409 IDEMPOTENCY_KEY_REUSED` rather than a silent overwrite.
 *
 * The key must survive a retry, so it is minted by the caller (./useComments.ts
 * mints one per composed comment, not per request) rather than in here.
 *
 * The header reaches the gateway only because `@atpost/api-client`'s proxy
 * route names `idempotency-key` in its forwarded-header ALLOWLIST. A header the
 * browser sets and that list does not name is dropped silently.
 */

import api from "@atpost/api-client"
import type { CommentPage, CommentRow, ReportReason } from "@momentum/content"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/**
 * The server's default and its cap.
 *
 * 20 is `ListComments`'s `DefaultQuery("limit", "20")`. The handler accepts any
 * positive integer, so there is no clamp to work around here — but a page of
 * twenty is what the phone asks for and what the cursor was sized against, and
 * a watch page that fetched a hundred comments before the video's first frame
 * would be spending the viewer's connection on the wrong thing.
 */
export const COMMENT_PAGE_SIZE = 20

/** One page of the thread, newest first. */
export async function listComments(
  postId: string,
  cursor: string | null
): Promise<CommentPage> {
  const res = await api.get<Envelope<CommentRow[]>>(
    `/v1/posts/${encodeURIComponent(postId)}/comments`,
    { params: { limit: COMMENT_PAGE_SIZE, ...(cursor ? { cursor } : {}) } }
  )
  return {
    items: res.data?.data ?? [],
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/**
 * The window around one comment, for a notification deep link.
 *
 * `?focusComment={id}` on the watch page lands here, and this is the only way
 * to open a thread ON a specific comment: the cursored list would have to be
 * walked until the row turned up, which for a comment six months down a busy
 * video is a great many requests to find one paragraph.
 *
 * It returns a WINDOW and **no cursor** — `ListCommentsAround` passes `nil`
 * meta — so there is no "load more" from it in either direction. That is a real
 * limitation and it is handled in ./useComments.ts by keeping the window as the
 * opening state and letting the ordinary list take over from the top; it is not
 * papered over by inventing a cursor from the last row's timestamp, which would
 * silently skip every comment written between the two.
 *
 * `404 NOT_FOUND` is the normal answer for a comment that has since been
 * deleted, and it arrives here as null so a stale notification opens the video
 * with its ordinary thread rather than an error.
 */
export async function commentsAround(
  postId: string,
  commentId: string
): Promise<CommentRow[] | null> {
  try {
    const res = await api.get<Envelope<CommentRow[]>>(
      `/v1/posts/${encodeURIComponent(postId)}/comments/around/${encodeURIComponent(commentId)}`,
      { params: { limit: COMMENT_PAGE_SIZE } }
    )
    return res.data?.data ?? []
  } catch (error) {
    if (status(error) === 404) return null
    throw error
  }
}

/**
 * Write a comment.
 *
 * 201 with the created row. The row is NOT author-hydrated — only the list is —
 * so the comment somebody has just written arrives with `author_id` and no
 * `author`. `commentAuthorName` in @momentum/content answers "You" for exactly
 * that case, which is not a placeholder: it is the one name that is certainly
 * correct.
 */
export async function createComment(
  postId: string,
  text: string,
  idempotencyKey: string
): Promise<CommentRow> {
  const res = await api.post<Envelope<CommentRow>>(
    `/v1/posts/${encodeURIComponent(postId)}/comments`,
    { text },
    { headers: { "Idempotency-Key": idempotencyKey } }
  )
  const row = res.data?.data
  if (!row?.id) throw new Error("The server accepted the comment but did not return it.")
  return row
}

/**
 * Reply to a comment. **The post's author only.**
 *
 * Three refusals, and they are the shape of the feature rather than edge cases:
 * `REPLY_OWNER_ONLY` (403 — only the post owner may reply),
 * `CANNOT_REPLY_TO_REPLY` (400) and `REPLY_EXISTS` (409 — one reply per
 * comment, ever). This is a creator-response model, not a discussion thread,
 * and ./thread.ts's `canReplyTo` is what stops the control being offered to
 * anybody the server would refuse.
 */
export async function replyToComment(
  commentId: string,
  text: string,
  idempotencyKey: string
): Promise<CommentRow> {
  const res = await api.post<Envelope<CommentRow>>(
    `/v1/comments/${encodeURIComponent(commentId)}/reply`,
    { text },
    { headers: { "Idempotency-Key": idempotencyKey } }
  )
  const row = res.data?.data
  if (!row?.id) throw new Error("The server accepted the reply but did not return it.")
  return row
}

export interface CommentLikeResult {
  liked: boolean
  count: number
}

/**
 * Toggle a like on a comment.
 *
 * The server answers `{liked, count, dislike_count}` — the settled state, not a
 * delta — so the caller replaces its optimistic number rather than reconciling
 * it. `dislike_count` is read and dropped on purpose: post comments have no
 * dislike control on this surface and adding one because a field exists is how
 * a UI grows a feature nobody asked for.
 */
export async function likeComment(commentId: string): Promise<CommentLikeResult> {
  const res = await api.post<Envelope<{ liked?: boolean; count?: number }>>(
    `/v1/comments/${encodeURIComponent(commentId)}/like`
  )
  return {
    liked: Boolean(res.data?.data?.liked),
    count: Math.max(0, res.data?.data?.count ?? 0),
  }
}

/**
 * Edit your own comment, within fifteen minutes of writing it.
 *
 * `EDIT_WINDOW_EXPIRED` (403) is the server's own rule and ./thread.ts mirrors
 * it so the control disappears rather than failing. The response carries no
 * row, so the caller applies the new body itself.
 */
export async function editComment(commentId: string, body: string): Promise<void> {
  await api.patch(`/v1/comments/${encodeURIComponent(commentId)}`, { body })
}

/** Delete your own comment. A soft delete; the row stops being listed. */
export async function deleteComment(commentId: string): Promise<void> {
  await api.delete(`/v1/comments/${encodeURIComponent(commentId)}`)
}

/**
 * Report a comment.
 *
 * `/v1/reports` is trust-safety-service — the gateway routes that prefix away
 * from post-service — so the body is `{entity_type, entity_id, reason,
 * details}` and `entity_type` is `"comment"`, which that service's binding
 * accepts alongside `user`, `post`, `reel` and `video`.
 *
 * 200 rather than 201, and 409 `ACTIVE_REPORT_EXISTS` when this person has
 * already reported this comment — their report is open in the queue, which is
 * the state they were trying to reach, so it comes back as success.
 */
export async function reportComment(
  commentId: string,
  reason: ReportReason,
  details: string
): Promise<boolean> {
  try {
    await api.post("/v1/reports", {
      entity_type: "comment",
      entity_id: commentId,
      reason,
      details,
    })
    return true
  } catch (error) {
    return status(error) === 409
  }
}

/* ── Reading a failure ──────────────────────────────────────────────────── */

export function status(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

/** The service's own error code, for `commentErrorMessage`. */
export function errorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { error?: { code?: string } } } } | null)?.response?.data
    ?.error?.code
}
