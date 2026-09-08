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

/** The author's name, with the same fallbacks the server itself uses. */
export function commentAuthorName(row: CommentRow): string {
  const author = row.author
  if (!author) return "Someone"
  return author.display_name || (author.username ? `@${author.username}` : "Someone")
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
