/**
 * What may be done to a comment, and how a list of them changes.
 *
 * No React, no DOM, no network — so every rule below can be read as a table and
 * asserted as one. The components are the keyboard and the pixels; this is the
 * arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PERMISSIONS ARE THE SERVER'S, MIRRORED, NOT INVENTED
 *
 * Every predicate here has a matching refusal in post-service, and the reason
 * to mirror them is the rule @momentum/content's postMenu.ts states for the
 * overflow menu and PostCard states for the action bar: **a control the server
 * will refuse is not rendered**. Not disabled — absent. A greyed Reply says
 * "not yet"; the truth is "not you, not ever, on this post".
 *
 *   canReplyTo    ← REPLY_OWNER_ONLY (403), CANNOT_REPLY_TO_REPLY (400),
 *                   REPLY_EXISTS (409)
 *   canEdit       ← NOT_COMMENT_AUTHOR (403), EDIT_WINDOW_EXPIRED (403)
 *   canDelete     ← NOT_COMMENT_AUTHOR (403)
 *
 * Mirroring is not trusting: the server still decides, and every call site
 * handles the refusal. What this buys is a thread that does not offer somebody
 * a Reply box on a video that is not theirs.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY ABSENT
 *
 * There is **no pin** and **no dislike** for a post comment on this surface.
 * `ToggleCommentDislike` exists on the server and `dislike_count` is on the
 * wire, and neither is drawn: a dislike is a judgement the product does not
 * publish anywhere else, and a count nobody can act on is decoration on a row
 * that already has four controls. There is no pin endpoint for a comment at
 * all — `PUT /v1/posts/{id}/pin` pins a POST to a profile — so a pin control
 * would have been a button with nothing behind it.
 *
 * There is also **no viewer-liked flag on the wire**. `postgres.Comment` has
 * `like_count` and no "you liked this", and `ListCommentsPG` takes a viewer
 * only to gate visibility. So the heart starts empty for every row on every
 * load, and fills for the ones this viewer presses in this session —
 * `likedInSession` below is the whole of that state, and it is honest about
 * what it is: not a reconstruction of history, just what happened here. A
 * client that guessed would show a filled heart on a comment the viewer has
 * never touched.
 */

import type { CommentRow } from "@momentum/content"
import { isPendingComment } from "@momentum/content"

/** post-service's window: `EditComment` refuses after fifteen minutes. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000

/* ── What may be done ───────────────────────────────────────────────────── */

/** Is this row the viewer's own? False for a signed-out viewer, always. */
export function isOwnComment(row: CommentRow, viewerId: string | null): boolean {
  return Boolean(viewerId) && row.author_id === viewerId
}

/**
 * May the viewer edit this?
 *
 * Own, not pending, and inside the window. `updated_at` is deliberately NOT
 * used to restart the clock — the server measures from `created_at`, and a
 * client that measured from the last edit would show an Edit control for a
 * comment the server then refuses.
 */
export function canEdit(row: CommentRow, viewerId: string | null, nowMs: number): boolean {
  if (!isOwnComment(row, viewerId) || isPendingComment(row)) return false
  const created = Date.parse(row.created_at)
  if (Number.isNaN(created)) return false
  return nowMs - created < EDIT_WINDOW_MS
}

/** May the viewer delete this? Own and settled; there is no window on delete. */
export function canDelete(row: CommentRow, viewerId: string | null): boolean {
  return isOwnComment(row, viewerId) && !isPendingComment(row)
}

/**
 * May the viewer reply to this?
 *
 * Only the POST's author, only to a top-level comment, only once. All three are
 * the server's, and the third is why `row.reply` is singular.
 */
export function canReplyTo(
  row: CommentRow,
  viewerId: string | null,
  postAuthorId: string | null
): boolean {
  if (!viewerId || !postAuthorId || viewerId !== postAuthorId) return false
  if (isPendingComment(row)) return false
  if (row.is_reply || row.parent_id) return false
  return !row.reply
}

/**
 * May the viewer report this?
 *
 * Anyone signed in, except on their own comment — reporting yourself files a
 * moderation ticket nobody wants and the answer to "I regret this" is Delete,
 * which is right there.
 */
export function canReport(row: CommentRow, viewerId: string | null): boolean {
  return Boolean(viewerId) && !isOwnComment(row, viewerId) && !isPendingComment(row)
}

/* ── Changing the list ──────────────────────────────────────────────────── */

/** Replace one row, by id, leaving its position alone. */
function mapRow(
  rows: CommentRow[],
  id: string,
  change: (row: CommentRow) => CommentRow
): CommentRow[] {
  return rows.map((row) => {
    if (row.id === id) return change(row)
    // A reply is a row too, and it is the target of a like and a report.
    if (row.reply?.id === id) return { ...row, reply: change(row.reply) }
    return row
  })
}

/** Apply the server's settled like state to a row. */
export function applyLike(rows: CommentRow[], id: string, count: number): CommentRow[] {
  return mapRow(rows, id, (row) => ({ ...row, like_count: Math.max(0, count) }))
}

/**
 * Move a like optimistically, before the server has answered.
 *
 * `delta` is +1 or −1 and the floor is zero: a count that has drifted below the
 * truth must not be able to render "−1", which is the one number that is
 * certainly wrong.
 */
export function nudgeLike(rows: CommentRow[], id: string, delta: number): CommentRow[] {
  return mapRow(rows, id, (row) => ({
    ...row,
    like_count: Math.max(0, (row.like_count ?? 0) + delta),
  }))
}

/** The new text of an edited comment, applied locally — see ./api.ts. */
export function replaceBody(rows: CommentRow[], id: string, body: string): CommentRow[] {
  return mapRow(rows, id, (row) => ({
    ...row,
    body,
    // The server stamps its own `updated_at`; this is the client's marker that
    // the row has been edited, which is what the "edited" label reads.
    updated_at: new Date().toISOString(),
  }))
}

/**
 * Take a comment off the list.
 *
 * A top-level row goes with its reply, because the reply is attached to it and
 * the server's soft delete takes the thread. A REPLY alone is detached from its
 * parent, leaving the parent in place.
 */
export function removeComment(rows: CommentRow[], id: string): CommentRow[] {
  return rows
    .filter((row) => row.id !== id)
    .map((row) => (row.reply?.id === id ? { ...row, reply: undefined } : row))
}

/** Attach the creator's reply to the comment it answers. */
export function attachReply(
  rows: CommentRow[],
  parentId: string,
  reply: CommentRow
): CommentRow[] {
  return rows.map((row) =>
    row.id === parentId
      ? { ...row, reply, reply_count: Math.max(1, (row.reply_count ?? 0) + 1) }
      : row
  )
}

/* ── The count under the video ──────────────────────────────────────────── */

/**
 * The number the thread's heading shows.
 *
 * It starts as the post's own `counts.comments` — the number the action bar
 * above already shows, so the two cannot disagree on arrival — and moves by the
 * thread's own writes. It never becomes "the number of rows loaded": a thread
 * showing twenty of four hundred would otherwise claim the video has twenty
 * comments.
 *
 * Replies count. They are comments, the server counts them, and a viewer who
 * added one and watched the number not move would reasonably conclude it had
 * not saved.
 */
export function commentCount(base: number, delta: number): number {
  return Math.max(0, Math.round(base) + delta)
}

/* ── The deep link ──────────────────────────────────────────────────────── */

/**
 * The comment a notification asked us to open on, from the query string.
 *
 * `?focusComment={uuid}`. Validated as a UUID rather than passed through: it
 * goes straight into a path segment, and an id shaped like anything else is a
 * link somebody built by hand. Anything that is not one is treated as no deep
 * link at all, which opens the thread normally.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function focusCommentId(search: string | null | undefined): string | null {
  if (!search) return null
  try {
    const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
      "focusComment"
    )
    return value && UUID.test(value) ? value : null
  } catch {
    return null
  }
}

/* ── What the composer is allowed to be ─────────────────────────────────── */

/**
 * The longest comment this client will send.
 *
 * post-service sets no maximum on `CommentRequest.Text` — the only ceiling is
 * the idempotency middleware's capped body read, which is a defence against a
 * huge payload rather than a content rule. So this number is the CLIENT's, and
 * it is here to be honest about that: it stops somebody pasting a novel into a
 * thread and discovering the limit from a truncated row, and it is the phone's
 * own (`UsCommentsSheet.kt`).
 */
export const COMMENT_MAX_LENGTH = 2_200

/** How many characters are left, for the counter that appears near the end. */
export function charactersLeft(draft: string): number {
  return COMMENT_MAX_LENGTH - draft.length
}

/** Show the counter only when it is about to matter. */
export function showsCounter(draft: string): boolean {
  return charactersLeft(draft) <= 200
}

/** Is this draft sendable? Non-blank and within the client's limit. */
export function canSubmit(draft: string): boolean {
  const trimmed = draft.trim()
  return trimmed.length > 0 && draft.length <= COMMENT_MAX_LENGTH
}
