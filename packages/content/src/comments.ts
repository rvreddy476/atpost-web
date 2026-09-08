/**
 * The comment surface's wire shape and its rules — no React, no DOM.
 *
 * ── Transcribed from post-service, not guessed ────────────────────────────
 * Every field below is a `json` tag on a Go struct that this endpoint actually
 * returns. The paths, for the zone that has to call them (this package never
 * does — see the boundary note in index.ts):
 *
 *   GET    /v1/posts/{postId}/comments?cursor=&limit=   list, newest first
 *   POST   /v1/posts/{postId}/comments   {"text": …}    201, the new comment
 *   POST   /v1/comments/{id}/reply       {"text": …}    201, POST OWNER ONLY
 *   POST   /v1/comments/{id}/like                       toggle
 *   PATCH  /v1/comments/{id}             {"body": …}    within 15 minutes
 *   DELETE /v1/comments/{id}
 *
 * Four things about that list are load-bearing and none of them are obvious:
 *
 *   · The LIST is under `/v1/posts`, not `/v1/comments`. Only the operations
 *     on one existing comment live under `/v1/comments`.
 *   · Create sends `text`. Edit sends `body`. The field that comes BACK is
 *     always `body`. That asymmetry is in the server and cannot be fixed here.
 *   · The cursor is an RFC3339Nano `created_at` passed back verbatim, and the
 *     page size is clamped to 20 by default and 50 at most — but an over-max
 *     value falls back to 20 rather than clamping to 50, so asking for 100
 *     quietly gets you the smallest page.
 *   · There is NO viewer-liked flag on a comment. See `CommentRow` below.
 *
 * A fifth, found on the live gateway after the first four were written: the
 * CREATE response does not hydrate `author`, and the LIST does. So the row a
 * person has just written is the one row on the list with no name on it,
 * which is why `commentAuthorName` takes the viewer.
 */

/** `CommentAuthor` in post-service. Absent when hydration was skipped. */
export interface CommentAuthor {
  id: string
  username?: string
  display_name?: string
  avatar_media_id?: string
}

/**
 * One comment.
 *
 * `reply` is singular and that is not a simplification: post-service caps the
 * thread at one reply per comment (`REPLY_EXISTS`) and refuses a reply to a
 * reply (`CANNOT_REPLY_TO_REPLY`), and only the POST'S AUTHOR may write one
 * (`REPLY_OWNER_ONLY`). This is a creator-response model, not a discussion
 * thread, and a UI that offered everyone a Reply control would be offering
 * something the server refuses for all but one person.
 */
export interface CommentRow {
  id: string
  post_id: string
  author_id: string
  parent_id?: string
  body: string
  like_count: number
  dislike_count: number
  reply_count: number
  is_reply: boolean
  created_at: string
  updated_at?: string
  reply?: CommentRow
  author?: CommentAuthor
}

export interface CommentPage {
  items: CommentRow[]
  /** `meta.next_cursor`. Null at the end of the list. */
  nextCursor: string | null
}

/**
 * What the zone supplies. No `api-client` reaches this package — see index.ts
 * — so the sheet takes functions and knows nothing about a gateway.
 *
 * `create` returns the row the server made rather than void, because the
 * server assigns the id, the timestamp and the hydrated author, and a client
 * that invented any of those would show a comment that does not match the one
 * everybody else can see.
 */
export interface CommentApi {
  list: (postId: string, cursor: string | null) => Promise<CommentPage>
  create: (postId: string, text: string) => Promise<CommentRow>
}

/** The server's cap. Asking for more than this silently gets you 20. */
export const COMMENT_PAGE_MAX = 50

/**
 * The eight the phone offers, in the phone's order.
 *
 * `QUICK_REACTIONS` in `UsCommentsSheet.kt`. They are not reactions in the
 * `has_reacted` sense — each one drops that character into the draft, which is
 * why they sit with the composer and not with the like button.
 */
export const QUICK_REACTIONS = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"] as const

/**
 * What went wrong, in words a person can act on.
 *
 * The two that matter are the author's own switches arriving as a refusal.
 * `no_comments` should mean the control was never rendered — that is the rule
 * PostCard holds — but a post can be edited while somebody has the sheet open,
 * and "Something went wrong" for a deliberate choice by the author is the
 * least useful sentence available.
 *
 * Takes a code and a status rather than an Error so it can be tested as a
 * table, and so the zone's transport (axios, fetch, a mock) is not baked in.
 */
export function commentErrorMessage(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "COMMENTS_DISABLED":
      return "The author turned off comments on this post."
    case "COMMENTS_RESTRICTED":
      return "Only friends can comment on this post."
    case "RATE_LIMITED":
      return "That is a lot of comments at once. Try again in a moment."
    case "POST_NOT_FOUND":
      return "This post is no longer available."
  }
  if (status === 401) return "Sign in to comment."
  if (status === 429) return "That is a lot of comments at once. Try again in a moment."
  if (status && status >= 500) return "Comments did not answer. It may be a moment before they do."
  return "That comment did not send."
}

/**
 * The author's name, with the same fallbacks the server itself uses.
 *
 * ── Why the viewer is an argument ─────────────────────────────────────────
 * `POST /v1/posts/{id}/comments` answers with the row it made and does NOT
 * hydrate `author` on it — only the LIST does (verified on the live gateway:
 * the create response carries `author_id` and no `author`, the list carries
 * both). So the comment somebody has just written renders as "Someone" until
 * the sheet is reopened, which is the one row on the list they are certain
 * about. The same is true of an optimistic row, which cannot have an author
 * because it has never been anywhere near the server.
 *
 * Told who is looking, both cases answer "You" — which is not a guess and not
 * a placeholder, it is the only name that is definitely correct. A hydrated
 * author still wins: once the list has said "Momentum Tester", that is what
 * everyone else sees and what this shows.
 */
export function commentAuthorName(row: CommentRow, viewerId?: string): string {
  const author = row.author
  const named = author?.display_name || (author?.username ? `@${author.username}` : "")
  if (named) return named
  if (viewerId && row.author_id === viewerId) return "You"
  return "Someone"
}

/**
 * Whether a draft may be sent.
 *
 * Whitespace is not a comment. The send control appears on exactly this
 * condition — `showsSend()` on the phone — rather than sitting there greyed
 * out, which is the same absent-not-disabled rule the action bar follows.
 */
export function canSend(draft: string): boolean {
  return draft.trim().length > 0
}

/**
 * Insert a page into the list without duplicating anything.
 *
 * The cursor is a timestamp, so two comments written in the same nanosecond,
 * a comment posted between two page fetches, or a retry after a failed page
 * can all deliver a row that is already on screen. React keys off `id`, and a
 * duplicate key is a silent rendering corruption rather than a visible bug.
 */
export function mergeComments(existing: CommentRow[], incoming: CommentRow[]): CommentRow[] {
  const seen = new Set(existing.map((row) => row.id))
  return [...existing, ...incoming.filter((row) => !seen.has(row.id))]
}

/* ── Posting optimistically ─────────────────────────────────────────────── */

/**
 * The id a comment carries before the server has given it one.
 *
 * A prefix rather than a flag on the row, because the row IS a `CommentRow`
 * everywhere else — it is keyed, rendered and merged by exactly the same code
 * as a real one — and a second shape for "almost a comment" would have to be
 * threaded through all of it. The colon cannot collide with a real id: the
 * server's are UUIDs.
 */
const PENDING_PREFIX = "pending:"

export function isPendingComment(row: CommentRow): boolean {
  return row.id.startsWith(PENDING_PREFIX)
}

/**
 * The row to show while the request is in the air.
 *
 * ── Why optimistic, given the create response is authoritative ────────────
 * Waiting is the wrong answer for the same reason it is wrong for a like:
 * a comment that appears when the round trip finishes reads as a composer
 * that swallowed what you typed. `useOptimisticToggle` in
 * @momentum/interactions is the idiom this follows — write it now, take the
 * server's version when it lands, and if it is refused put the state BACK and
 * say so. A rollback nobody is told about is worse than no optimism at all.
 *
 * ── What it deliberately does not invent ──────────────────────────────────
 * The id is local and marked as such, so nothing downstream can mistake it
 * for something addressable — a pending row must never be the target of an
 * edit or a delete, and `isPendingComment` is how the sheet knows. The counts
 * are zero because they are, and `author` is left absent rather than faked:
 * the viewer's display name is not something the zone has (`/v1/auth/me`
 * answers an id and an address), and `commentAuthorName` already answers
 * "You" for a row whose `author_id` is the viewer's.
 */
export function pendingComment(input: {
  postId: string
  authorId: string
  text: string
  /** A value unique within this sheet. The caller owns uniqueness. */
  nonce: string
  /** RFC3339. Injected so the row can be tested without a clock. */
  createdAt: string
}): CommentRow {
  return {
    id: `${PENDING_PREFIX}${input.nonce}`,
    post_id: input.postId,
    author_id: input.authorId,
    body: input.text,
    like_count: 0,
    dislike_count: 0,
    reply_count: 0,
    is_reply: false,
    created_at: input.createdAt,
  }
}

/**
 * The server accepted it: swap the local row for the real one.
 *
 * The real row can already be on the list — a page fetched while the create
 * was in flight will contain it, and the create is idempotent on a
 * fingerprint of the text, so a retry answers with the SAME row a second
 * time. Either way the pending row goes and the real one appears once, in the
 * place the pending row held rather than jumping to the top.
 */
export function settleComment(
  rows: CommentRow[],
  pendingId: string,
  saved: CommentRow
): CommentRow[] {
  const settled: CommentRow[] = []
  let placed = false
  for (const row of rows) {
    if (row.id === pendingId) {
      if (!placed) {
        settled.push(saved)
        placed = true
      }
      continue
    }
    if (row.id === saved.id) {
      if (placed) continue
      settled.push(saved)
      placed = true
      continue
    }
    settled.push(row)
  }
  if (!placed) settled.unshift(saved)
  return settled
}

/** The server refused it: take the row back off the list. */
export function discardComment(rows: CommentRow[], pendingId: string): CommentRow[] {
  return rows.filter((row) => row.id !== pendingId)
}
