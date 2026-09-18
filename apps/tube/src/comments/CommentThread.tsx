"use client"

/**
 * The thread under the video.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE THREE STATES THAT ARE NOT "LOADING"
 *
 * They are different facts and they get different sentences, which is the same
 * discipline ../watch/states.tsx keeps for the four reasons a video will not
 * play:
 *
 *   · the author turned comments OFF — `no_comments` on the post. There is no
 *     composer and no list, because there is no thread: a box that 403s with
 *     `COMMENTS_DISABLED` is worse than an honest line of text. The rule is
 *     the one @momentum/content's PostCard already holds, applied here.
 *
 *   · nobody is SIGNED IN — the thread is readable and the box is replaced by
 *     a prompt. Reading is the point: a video page whose comments are hidden
 *     behind a login is a page that tells a visitor nothing about whether the
 *     video is worth their account.
 *
 *   · there are NO comments yet — an invitation, not an apology, and only
 *     where somebody could actually write one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COUNT IS THE POST'S, NOT THE LIST'S
 *
 * `commentCount` in ./thread.ts: the post's own `counts.comments` moved by this
 * thread's writes. The action bar above shows the same number from the same
 * source, so the two cannot disagree — and neither of them ever says "20"
 * because twenty rows happen to be loaded.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEEP LINK SAYS SO
 *
 * Arriving from a notification, the thread opens on a WINDOW around one comment
 * (`…/comments/around/{id}`) and that endpoint returns no cursor. Rather than
 * pretend the window is the top of the thread, the heading says what is being
 * shown and offers the way out. See the header of ./useComments.ts.
 */

import { useEffect, useRef } from "react"
import { AlertTriangle, MessageSquareOff } from "lucide-react"
import { signInHref } from "@momentum/chrome"
import { formatCount, type CommentRow, type ReportReason } from "@momentum/content"
import { ZONE } from "@/zone"
import { CommentItem } from "./CommentItem"
import { Composer } from "./Composer"
import type { CommentsState } from "./useComments"

export interface CommentThreadProps {
  state: CommentsState
  viewerId: string | null
  postAuthorId: string | null
  /** The author's switch, straight off the post. */
  disabled: boolean
  durationMs: number
  onSeek: (ms: number) => void
  /** For the anchor the action bar's comment control scrolls to. */
  headingId?: string
}

const ACTION =
  "rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised"

export function CommentThread({
  state,
  viewerId,
  postAuthorId,
  disabled,
  durationMs,
  onSeek,
  headingId = "tube-comments",
}: CommentThreadProps) {
  /**
   * Bring the linked comment into view, once.
   *
   * A ref on the section rather than `element.scrollIntoView()` from the hook,
   * because the row does not exist until this component has rendered it — and
   * `scrollIntoView` on a page whose player is still laying out lands in the
   * wrong place. One frame after paint is enough and is the cheapest correct
   * answer.
   */
  const scrolled = useRef(false)
  useEffect(() => {
    if (!state.focused || scrolled.current || state.rows.length === 0) return
    scrolled.current = true
    const id = requestAnimationFrame(() => {
      document
        .getElementById(`comment-${state.rows[0].id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" })
    })
    return () => cancelAnimationFrame(id)
  }, [state.focused, state.rows])

  if (disabled) {
    return (
      <section aria-labelledby={headingId} className="mt-8 border-t border-mo pt-6">
        <h2
          id={headingId}
          className="font-mo-display text-sm font-semibold tracking-mo-display text-mo-ink"
        >
          Comments
        </h2>
        <p className="mt-3 flex items-center gap-2 text-sm text-mo-body">
          <MessageSquareOff aria-hidden className="h-4 w-4" />
          Comments are turned off for this video.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby={headingId} className="mt-8 border-t border-mo pt-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* `tabIndex={-1}` so the action row's comment control can move focus
            here after it scrolls. Without it `focus()` on a heading is a no-op
            and a keyboard user is scrolled to a thread they are not in. It is
            -1 and not 0: this is a focus TARGET, not a tab stop. */}
        <h2
          id={headingId}
          tabIndex={-1}
          className="font-mo-display text-base font-semibold tracking-mo-display text-mo-ink outline-none"
        >
          {state.count === 1 ? "1 comment" : `${formatCount(state.count)} comments`}
        </h2>
        {state.focused && (
          <>
            <span className="text-sm text-mo-body">Showing one comment you were linked to.</span>
            <button
              type="button"
              onClick={state.showAll}
              className="text-sm font-semibold text-mo-cyan underline underline-offset-2"
            >
              Show all comments
            </button>
          </>
        )}
      </div>

      {/* The composer, or the reason there is not one. */}
      <div className="mt-4">
        {viewerId ? (
          <Composer
            viewerId={viewerId}
            placeholder="Add a comment"
            submitLabel="Comment"
            onSubmit={state.post}
          />
        ) : (
          <p className="text-sm text-mo-body">
            <a href={signInHref(ZONE)} className="font-semibold text-mo-cyan underline underline-offset-2">
              Sign in
            </a>{" "}
            to leave a comment.
          </p>
        )}
      </div>

      {state.writeError && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-mo-bad">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.writeError}</span>
          <button
            type="button"
            onClick={state.dismissWriteError}
            className="ml-auto shrink-0 text-mo-body underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}

      {state.loading && state.rows.length === 0 && <CommentsSkeleton />}

      {state.error && state.rows.length === 0 && (
        <div role="alert" className="mt-4 rounded-mo bg-mo-surface p-4">
          <p className="text-sm text-mo-body">{state.error}</p>
          <button type="button" onClick={state.retry} className={`${ACTION} mt-3`}>
            Try again
          </button>
        </div>
      )}

      {!state.loading && !state.error && state.rows.length === 0 && (
        <p className="mt-6 text-sm text-mo-body">
          {viewerId ? "No comments yet. Be the first." : "No comments yet."}
        </p>
      )}

      <div className="mt-2 flex flex-col">
        {state.rows.map((row: CommentRow, index) => (
          <CommentItem
            key={row.id}
            row={row}
            viewerId={viewerId}
            postAuthorId={postAuthorId}
            liked={state.liked}
            reported={state.reported}
            durationMs={durationMs}
            focused={state.focused && index === 0}
            onSeek={onSeek}
            onToggleLike={state.toggleLike}
            onReply={state.reply}
            onEdit={state.edit}
            onDelete={state.remove}
            onReport={(commentId, reason: ReportReason, details) =>
              state.report(commentId, reason, details)
            }
          />
        ))}
      </div>

      {/* A button and not an intersection observer.
          The rail above already auto-loads on scroll; a thread that also did
          would make the bottom of this page unreachable — every scroll to the
          end adds twenty rows and the "All videos" link below never arrives. */}
      {!state.ended && state.rows.length > 0 && (
        <button
          type="button"
          onClick={state.loadMore}
          disabled={state.loadingMore}
          className={`${ACTION} mt-4 disabled:opacity-60`}
        >
          {state.loadingMore ? "Loading…" : "Show more comments"}
        </button>
      )}
    </section>
  )
}

/**
 * The shape of the rows that are coming.
 *
 * Three, because that is about what fits under the fold on the widest layout,
 * and reserving more space than will be filled makes the page jump upwards
 * when they land — the opposite of what a skeleton is for.
 */
function CommentsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-6 flex animate-pulse flex-col gap-5">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 rounded-mo-pill bg-mo-raised" />
          <div className="min-w-0 flex-1">
            <div className="h-3 w-1/4 rounded bg-mo-raised" />
            <div className="mt-2 h-3 w-full rounded bg-mo-raised" />
            <div className="mt-1.5 h-3 w-3/5 rounded bg-mo-raised" />
          </div>
        </div>
      ))}
    </div>
  )
}
