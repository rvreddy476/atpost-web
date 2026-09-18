/**
 * Who may do what to a comment, and what the panel says when the server says
 * no. No React, no DOM, no network.
 *
 * ── What is reused and what is decided here ───────────────────────────────
 * The VOCABULARY is @momentum/content's and is not restated: `CommentRow`,
 * the optimistic row lifecycle (`pendingComment` / `settleComment` /
 * `discardComment`), `mergeComments`, `canSend`, `commentAuthorName` and the
 * error table all come from there, because two surfaces disagreeing about what
 * a 403 COMMENTS_DISABLED means is a bug rather than a variation.
 *
 * What is decided here is PERMISSION, and only because the server's rules are
 * genuinely per-surface and were not encoded anywhere:
 *
 *   · `REPLY_OWNER_ONLY` — only the short's author may reply;
 *   · `CANNOT_REPLY_TO_REPLY` — the thread is one deep;
 *   · `REPLY_EXISTS` — one reply per comment, ever.
 *
 * `@momentum/content`'s sheet responds to those three by offering no Reply
 * control at all, which is the right call for a card in a feed where the
 * viewer is usually not the author. On a creator's own short it is the wrong
 * one: the person most likely to open this panel IS the one person allowed to
 * reply. So the control exists here and `canReply` is the gate.
 *
 * ── The heart on a comment, and the honest thing about it ─────────────────
 * `POST /v1/comments/{id}/like` is real and it works. What the LIST does not
 * carry is a viewer-liked flag — there is no `viewer_liked` on the row — so
 * this surface cannot know, on load, whether you have already liked something.
 * @momentum/content drew the conclusion that a control which shows the wrong
 * state on every reload is worse than none.
 *
 * This surface draws it anyway, and the difference is that it does not claim
 * to know: a comment renders unpressed until the viewer presses it in this
 * session, and from then on the state is the SERVER's own answer to that press
 * rather than a guess. `likedStateOf` below is that rule, written down so it
 * cannot quietly become an assumption. When the list grows a viewer flag this
 * is the one function that has to change.
 */

import { isPendingComment, type CommentRow } from "@momentum/content"

/**
 * Whether a comment is the viewer's own.
 *
 * `viewerId` is null for a signed-out browser and undefined until
 * `GET /v1/auth/me` lands, and both mean "nobody" here rather than "everybody"
 * — a surface that offered Delete while it was still finding out who was
 * looking would be offering it to the wrong person for a beat.
 */
export function isOwnComment(row: CommentRow, viewerId: string | null | undefined): boolean {
  return Boolean(viewerId) && row.author_id === viewerId
}

/**
 * May the viewer edit this?
 *
 * Their own, and not one that is still in flight. A PATCH to the id of an
 * optimistic row would 404: the id is a local nonce and the server has never
 * heard of it.
 */
export function canEdit(row: CommentRow, viewerId: string | null | undefined): boolean {
  return isOwnComment(row, viewerId) && !isPendingComment(row)
}

/** Ditto for delete, and for exactly the same reason. */
export function canDelete(row: CommentRow, viewerId: string | null | undefined): boolean {
  return isOwnComment(row, viewerId) && !isPendingComment(row)
}

/**
 * May the viewer reply to this comment?
 *
 * All four of the server's conditions, in one place, because getting any of
 * them wrong renders a control that answers 403:
 *
 *   · the viewer is the SHORT's author (`REPLY_OWNER_ONLY`) — not the
 *     comment's, which is the easy one to get backwards;
 *   · the row is a top-level comment (`CANNOT_REPLY_TO_REPLY`);
 *   · it has no reply yet (`REPLY_EXISTS`);
 *   · it is not still in flight, for the same reason edit is not.
 */
export function canReply(
  row: CommentRow,
  viewerId: string | null | undefined,
  postAuthorId: string | undefined
): boolean {
  if (!viewerId || !postAuthorId) return false
  if (viewerId !== postAuthorId) return false
  if (row.is_reply || row.parent_id) return false
  if (row.reply) return false
  return !isPendingComment(row)
}

/**
 * Has this been edited since it was written?
 *
 * Both fields are timestamps the server sets, and post-service sets
 * `updated_at` on the insert as well as on the edit — so "has an updated_at"
 * is not the question and would mark every comment edited. The question is
 * whether they DIFFER, and a string comparison is enough because both are
 * RFC3339Nano from the same clock.
 */
export function wasEdited(row: CommentRow): boolean {
  return Boolean(row.updated_at) && row.updated_at !== row.created_at
}

/**
 * Whether the heart is lit.
 *
 * `local` is what the viewer has done in THIS session, and it is the only
 * evidence there is — see the header. Absent means unpressed, which is the
 * safe direction: a heart that is dark on something you liked last week
 * understates, a heart that is lit on something you did not like is the UI
 * telling you about an action you never took.
 */
export function likedStateOf(local: boolean | undefined): boolean {
  return local === true
}

/**
 * The like count to show, given the count the row arrived with.
 *
 * The optimistic ±1 is applied on top of the ROW's number rather than on top
 * of the previous displayed one, so pressing, un-pressing and pressing again
 * cannot drift. A server count, when the response carries one, replaces it
 * outright.
 */
export function commentLikeCount(
  row: CommentRow,
  local: boolean | undefined,
  serverCount: number | null | undefined
): number {
  if (typeof serverCount === "number") return Math.max(0, serverCount)
  const base = row.like_count ?? 0
  return Math.max(0, local === true ? base + 1 : base)
}

/**
 * Replace one row wherever it is, including inside a parent's reply.
 *
 * The thread is one deep, so "wherever" is exactly two places — and the second
 * is the one a plain `rows.map` misses, which is how an edited creator reply
 * snaps back to its old text on the next render.
 */
export function replaceComment(
  rows: CommentRow[],
  id: string,
  change: (row: CommentRow) => CommentRow
): CommentRow[] {
  return rows.map((row) => {
    if (row.id === id) return change(row)
    if (row.reply?.id === id) return { ...row, reply: change(row.reply) }
    return row
  })
}

/**
 * Take one row out, wherever it is.
 *
 * Deleting a parent takes its reply with it, which is what the server does and
 * what the person pressing Delete on their own comment expects — a reply left
 * floating under nothing is a thread that cannot be read.
 */
export function removeComment(rows: CommentRow[], id: string): CommentRow[] {
  const out: CommentRow[] = []
  for (const row of rows) {
    if (row.id === id) continue
    out.push(row.reply?.id === id ? { ...row, reply: undefined } : row)
  }
  return out
}

/**
 * How much a write changes the count on the rail.
 *
 * Deleting a parent removes its reply too, so it is worth more than one — and
 * the rail's number is what a person checks to see whether their comment
 * landed, so a count that drifts by one every time somebody tidies up their
 * own thread is a small, permanent lie.
 */
export function countDelta(change: "created" | "deleted", row?: CommentRow): number {
  if (change === "created") return 1
  return -(1 + (row?.reply ? 1 : 0))
}
