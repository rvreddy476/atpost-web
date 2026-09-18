"use client"

/**
 * One comment, and the creator's single reply to it.
 *
 * ── The controls are computed, not conditioned on a role string ───────────
 * Every one of Reply, Edit, Delete and Report comes from a predicate in
 * ./thread.ts that mirrors a refusal in post-service. A control the server
 * would refuse is ABSENT rather than disabled — the rule @momentum/content's
 * postMenu.ts states and the reason it gives: a greyed Reply says "not yet"
 * where the truth is "not you, and not on this post".
 *
 * The one that surprises people is Reply: only the VIDEO'S OWNER may write one,
 * only on a top-level comment, and only once. That is `REPLY_OWNER_ONLY`,
 * `CANNOT_REPLY_TO_REPLY` and `REPLY_EXISTS`, and it makes this a creator-
 * response model rather than a discussion thread. A Reply button under every
 * comment would be offering something the server refuses for all but one
 * person.
 *
 * ── The body is rich text ─────────────────────────────────────────────────
 * The same ../watch/RichText.tsx the description uses, so "2:13 is the good
 * bit" in a comment seeks the player exactly as it does under the video. A
 * viewer who learns that in one place and finds it dead in the other has
 * learned something false.
 *
 * ── A pending row is visibly pending and addressable by nothing ───────────
 * It is dimmed and it has no controls at all, because it has no id yet:
 * `isPendingComment` gates every predicate in ./thread.ts. The alternative —
 * a full row that fails every button for half a second — is worse than a
 * quiet one.
 */

import { useState } from "react"
import { Heart, Loader2, Pencil, Trash2 } from "lucide-react"
import {
  Avatar,
  absoluteTime,
  commentAuthorName,
  formatCount,
  isPendingComment,
  relativeTime,
  type CommentRow,
  type ReportReason,
} from "@momentum/content"
import { RichText } from "@/watch/RichText"
import { Composer } from "./Composer"
import { ReportControl } from "./ReportControl"
import { canDelete, canEdit, canReplyTo, canReport } from "./thread"

export interface CommentItemProps {
  row: CommentRow
  viewerId: string | null
  /** Who owns the video. Only they may reply. */
  postAuthorId: string | null
  /**
   * The ids this viewer has liked and reported in THIS session.
   *
   * Sets rather than two booleans, because a row draws its own nested reply
   * with this same component and a boolean computed for the parent would then
   * be applied to the child — a reply wearing its parent's heart.
   */
  liked: ReadonlySet<string>
  reported: ReadonlySet<string>
  durationMs: number
  /** Highlighted because a notification linked to it. */
  focused?: boolean
  onSeek: (ms: number) => void
  onToggleLike: (commentId: string) => void
  onReply: (commentId: string, text: string) => Promise<boolean>
  onEdit: (commentId: string, body: string) => Promise<boolean>
  onDelete: (commentId: string) => Promise<boolean>
  onReport: (commentId: string, reason: ReportReason, details: string) => Promise<boolean>
}

const ACTION =
  "inline-flex items-center gap-1.5 rounded-mo-pill px-2.5 py-1.5 text-xs text-mo-body " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"

export function CommentItem(props: CommentItemProps) {
  const { row, viewerId, postAuthorId, durationMs, focused } = props
  const liked = props.liked.has(row.id)
  const reported = props.reported.has(row.id)
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pending = isPendingComment(row)
  const name = commentAuthorName(row, viewerId ?? undefined)
  const isOwner = Boolean(postAuthorId) && row.author_id === postAuthorId
  const edited = Boolean(row.updated_at && row.updated_at !== row.created_at)

  return (
    <article
      id={`comment-${row.id}`}
      className={[
        "flex gap-3 rounded-mo px-2 py-3 transition-colors duration-150 ease-mo",
        focused ? "bg-mo-raised" : "",
        pending ? "opacity-60" : "",
      ].join(" ")}
    >
      <Avatar
        name={name}
        id={row.author?.id ?? row.author_id}
        size="sm"
        className="mt-0.5 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-mo-body">
          <span className="font-semibold text-mo-ink">{name}</span>
          {/* The video's own creator, marked. On a long video the owner's
              voice in a thread is the one people look for, and a comment from
              them is different from a comment about them. */}
          {isOwner && (
            <span className="rounded-mo-pill bg-mo-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mo-ink">
              Creator
            </span>
          )}
          {pending ? (
            <span>Sending…</span>
          ) : (
            <time dateTime={row.created_at} title={absoluteTime(row.created_at)}>
              {relativeTime(row.created_at)}
            </time>
          )}
          {edited && !pending && <span>(edited)</span>}
        </p>

        {editing ? (
          <div className="mt-2">
            <Composer
              viewerId={viewerId}
              viewerName={name}
              placeholder="Edit your comment"
              submitLabel="Save"
              initialValue={row.body}
              autoFocus
              showAvatar={false}
              onCancel={() => setEditing(false)}
              onSubmit={async (text) => {
                const ok = await props.onEdit(row.id, text)
                if (ok) setEditing(false)
                return ok
              }}
            />
          </div>
        ) : (
          <RichText
            text={row.body}
            durationMs={durationMs}
            onSeek={props.onSeek}
            className="mt-1 block whitespace-pre-wrap text-sm leading-relaxed text-mo-ink"
          />
        )}

        {!pending && !editing && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => props.onToggleLike(row.id)}
              aria-pressed={liked}
              aria-label={`Like this comment by ${name}`}
              disabled={!viewerId}
              className={`${ACTION} ${liked ? "text-mo-cyan" : ""} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Heart aria-hidden className="h-3.5 w-3.5" fill={liked ? "currentColor" : "none"} />
              {row.like_count > 0 && <span className="tabular-nums">{formatCount(row.like_count)}</span>}
            </button>

            {canReplyTo(row, viewerId, postAuthorId) && (
              <button type="button" onClick={() => setReplying(true)} className={ACTION}>
                Reply
              </button>
            )}

            {canEdit(row, viewerId, Date.now()) && (
              <button type="button" onClick={() => setEditing(true)} className={ACTION}>
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                Edit
              </button>
            )}

            {canDelete(row, viewerId) &&
              (confirmingDelete ? (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true)
                      const ok = await props.onDelete(row.id)
                      setDeleting(false)
                      if (!ok) setConfirmingDelete(false)
                    }}
                    className={`${ACTION} text-mo-bad`}
                  >
                    {deleting && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                    Delete for good
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className={ACTION}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                /* Two presses, because a delete cannot be undone and the
                   control sits a few pixels from Edit. Inline rather than a
                   dialog: a modal over a playing video to confirm removing
                   one sentence is heavier than the act. */
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className={ACTION}
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  Delete
                </button>
              ))}

            {canReport(row, viewerId) && (
              <ReportControl
                size="compact"
                label={`Report this comment by ${name}`}
                reported={reported}
                onReport={(reason, details) => props.onReport(row.id, reason, details)}
              />
            )}
          </div>
        )}

        {replying && (
          <div className="mt-3 border-l border-mo pl-3">
            <Composer
              viewerId={viewerId}
              placeholder={`Reply to ${name}`}
              submitLabel="Reply"
              autoFocus
              showAvatar={false}
              onCancel={() => setReplying(false)}
              onSubmit={async (text) => {
                const ok = await props.onReply(row.id, text)
                if (ok) setReplying(false)
                return ok
              }}
            />
          </div>
        )}

        {/* The creator's reply, nested once and only once — the server allows
            no deeper thread, so there is no recursion here and no "show more
            replies". `CommentItem` is reused rather than a second component,
            so a reply gets the same rich text, the same like and the same
            report as anything else. */}
        {row.reply && (
          <div className="mt-3 border-l border-mo pl-3">
            <CommentItem {...props} row={row.reply} focused={false} />
          </div>
        )}
      </div>
    </article>
  )
}
