"use client"

/**
 * The comments, beside the short rather than instead of it.
 *
 * ── The one requirement that shapes everything else ───────────────────────
 * It must not unmount the video. That rules out a route, it rules out
 * conditionally rendering the scroller, and it is why this is a sibling of the
 * scroller in `ReelsViewer` rather than something the scroller opens. The
 * short keeps playing, keeps its playhead and keeps its watch session — which
 * matters beyond politeness, because a watch session torn down and remade
 * halfway through a view is two half-views in a creator's payout data.
 *
 * ── A side sheet on desktop, a bottom sheet on a phone ────────────────────
 * Two shapes, one component, and the split is at `md`. On a phone the sheet
 * comes up from the bottom edge at 66% of the height — the phone's own
 * proportion, and a FIXED one, because a sheet sized to its contents shrinks
 * when the comments load and moves the composer out from under the thumb
 * reaching for it. On a wide window it is a column down the right edge: a
 * 66%-tall panel welded to the bottom of a 1400px window is a shape that only
 * makes sense when the bottom edge is where your thumb is, and a centred
 * dialog would cover the video this panel exists not to cover.
 *
 * ── Focus ────────────────────────────────────────────────────────────────
 * Trapped while open, Escape closes, and focus goes back where it came from —
 * which is the comment button when the panel was opened by pressing it, and
 * the scroller when it was opened with `c`. Restoring the ELEMENT rather than
 * looking up the button is what makes both correct without the viewer having
 * to thread a ref through every mounted short.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Heart, Loader2, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react"
import { Avatar, canSend, commentAuthorName, isPendingComment, relativeTime, type CommentRow } from "@momentum/content"
import { canDelete, canEdit, canReply, wasEdited } from "./comments"
import { formatCount } from "./rail"
import type { CommentsThread } from "./useComments"

/** Everything that can hold focus inside the panel. */
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface CommentsPanelProps {
  open: boolean
  onClose: () => void
  thread: CommentsThread
  /** Names the panel, so a screen reader hears whose comments these are. */
  authorName: string
  /** The short's author — the one person the server lets write a reply. */
  postAuthorId: string | undefined
  viewerId: string | null
  canWrite: boolean
  /** Where an unauthenticated viewer is sent to get a session. */
  signInHref: string
  /** The author turned comments off. Reads still work; writing does not. */
  commentsClosed: boolean
}

export function CommentsPanel({
  open,
  onClose,
  thread,
  authorName,
  postAuthorId,
  viewerId,
  canWrite,
  signInHref,
  commentsClosed,
}: CommentsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()

  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  /** The row being edited or replied to, and which of the two it is. */
  const [editing, setEditing] = useState<{ id: string; mode: "edit" | "reply"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  /* ── Focus ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    // The composer, not the panel: the reason somebody opens this is usually
    // to write, and a keyboard user landing on the heading has to tab past the
    // whole thread to reach the one control they came for.
    const focus = window.setTimeout(() => composerRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(focus)
      // Back where it came from. Without this a keyboard user is returned to
      // the top of the document, which on a full-screen scroller means losing
      // their place in the feed entirely.
      restoreFocus.current?.focus?.()
    }
  }, [open])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // The panel is over a surface whose every letter is a shortcut — `m`,
      // `l`, `c`, `j`, `k`, Space. Nothing typed in here may reach it.
      event.stopPropagation()

      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return

      const root = panelRef.current
      if (!root) return
      const stops = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (stops.length === 0) return
      const first = stops[0]
      const last = stops[stops.length - 1]
      // A real trap and not a hint. The panel is over a playing video with a
      // rail of its own behind it, and a Tab that escaped would land on a Like
      // button the person cannot see.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  /* ── Writing ─────────────────────────────────────────────────────────── */

  const submit = useCallback(async () => {
    if (!canSend(draft) || sending) return
    setSending(true)
    const ok = await thread.post(draft.trim())
    setSending(false)
    // The text stays in the composer on a failure, so nothing anybody typed is
    // thrown away by a network that was down for a second.
    if (ok) setDraft("")
  }, [draft, sending, thread])

  const submitEdit = useCallback(async () => {
    if (!editing || !canSend(editing.text) || busy) return
    setBusy(true)
    const ok =
      editing.mode === "edit"
        ? await thread.edit(editing.id, editing.text.trim())
        : await thread.reply(editing.id, editing.text.trim())
    setBusy(false)
    if (ok) setEditing(null)
  }, [busy, editing, thread])

  if (!open) return null

  const composerDisabled = !canWrite || commentsClosed

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className={[
        "absolute z-40 flex flex-col bg-mo-surface shadow-mo-lift",
        // Phone: a bottom sheet in the phone's own proportions, with the
        // rounded top edge that says it can be dismissed downwards.
        "inset-x-0 bottom-0 h-[66%] rounded-t-mo-lg border-t border-mo",
        // Wide: a column down the right edge, full height, no bottom radius.
        "md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[380px] md:rounded-none md:border-l md:border-t-0",
      ].join(" ")}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-mo px-4 py-3">
        <h2 id={titleId} className="font-mo-display text-base font-semibold text-mo-ink">
          Comments
          <span className="sr-only"> on the short by {authorName}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="inline-flex h-9 w-9 items-center justify-center rounded-mo-pill text-mo-body hover:bg-mo-raised hover:text-mo-ink"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {thread.status === "loading" && (
          <p className="py-8 text-center text-sm text-mo-body">Loading comments…</p>
        )}

        {thread.status === "error" && (
          <div className="py-8 text-center">
            <p className="text-sm text-mo-body">{thread.error || "Comments could not be loaded."}</p>
            <button
              type="button"
              onClick={thread.retry}
              className="mt-3 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan hover:bg-mo-raised"
            >
              Try again
            </button>
          </div>
        )}

        {thread.status === "ready" && thread.rows.length === 0 && (
          <p className="py-8 text-center text-sm text-mo-body">
            No comments yet.{!composerDisabled && " Be the first."}
          </p>
        )}

        <ul className="flex flex-col gap-4">
          {thread.rows.map((row) => (
            <li key={row.id}>
              <Row
                row={row}
                thread={thread}
                viewerId={viewerId}
                postAuthorId={postAuthorId}
                canWrite={canWrite}
                editing={editing}
                busy={busy}
                onEditingChange={setEditing}
                onSubmitEditing={submitEdit}
              />
            </li>
          ))}
        </ul>

        {thread.hasMore && (
          <button
            type="button"
            onClick={thread.loadMore}
            disabled={thread.loadingMore}
            className="mt-4 w-full rounded-mo border border-mo px-4 py-2 text-sm font-semibold text-mo-cyan hover:bg-mo-raised disabled:text-mo-body"
          >
            {thread.loadingMore ? "Loading…" : "Load more comments"}
          </button>
        )}

        {/* A later page that failed keeps the thread and says so underneath,
            rather than replacing what is already readable with an apology. */}
        {thread.status === "ready" && thread.error && (
          <p role="status" className="mt-4 text-sm text-mo-bad">
            {thread.error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-mo px-4 py-3">
        {composerDisabled ? (
          <p className="text-sm text-mo-body">
            {commentsClosed ? (
              "The author turned off comments on this short."
            ) : (
              <>
                {/* Another zone, so a plain `<a>` to an absolute path — the
                    rule @momentum/chrome's NavItem.tsx wrote down first. */}
                <a href={signInHref} className="font-semibold text-mo-cyan underline underline-offset-2">
                  Sign in
                </a>{" "}
                to join the conversation.
              </>
            )}
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter is a new line — the composer
                // convention every messaging surface on the web shares.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
              rows={1}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              className="min-h-10 flex-1 resize-none rounded-mo border border-mo bg-mo-sunken px-3 py-2 text-sm text-mo-ink placeholder:text-mo-body focus:border-mo-focus focus:outline-none"
            />
            {/* Appears only once there is something to send, which is the
                phone's rule: a permanently lit Send on an empty box is a
                control that does nothing most of the time it is visible. */}
            {canSend(draft) && (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={sending}
                aria-label="Post comment"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-mo-pill bg-mo-raised text-mo-cyan hover:bg-mo-surface disabled:text-mo-body"
              >
                {sending ? (
                  <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                ) : (
                  <Send aria-hidden className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── One comment ──────────────────────────────────────────────────────────── */

interface RowProps {
  row: CommentRow
  thread: CommentsThread
  viewerId: string | null
  postAuthorId: string | undefined
  canWrite: boolean
  editing: { id: string; mode: "edit" | "reply"; text: string } | null
  busy: boolean
  onEditingChange: (next: { id: string; mode: "edit" | "reply"; text: string } | null) => void
  onSubmitEditing: () => void
}

function Row({
  row,
  thread,
  viewerId,
  postAuthorId,
  canWrite,
  editing,
  busy,
  onEditingChange,
  onSubmitEditing,
}: RowProps) {
  const pending = isPendingComment(row)
  const name = commentAuthorName(row, viewerId ?? undefined)
  const likes = thread.likeCountOf(row)
  const isLiked = thread.liked.get(row.id) === true
  const mine = editing?.id === row.id ? editing : null

  return (
    <div className={pending ? "opacity-60" : undefined}>
      <div className="flex gap-3">
        <Avatar name={name} id={row.author_id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-mo-ink">{name}</span>
            <span className="text-xs text-mo-body">{relativeTime(row.created_at)}</span>
            {wasEdited(row) && <span className="text-xs text-mo-body">edited</span>}
          </p>

          {mine?.mode === "edit" ? (
            <InlineComposer
              label="Edit your comment"
              value={mine.text}
              busy={busy}
              onChange={(text) => onEditingChange({ ...mine, text })}
              onCancel={() => onEditingChange(null)}
              onSubmit={onSubmitEditing}
            />
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-mo-ink">{row.body}</p>
          )}

          <div className="mt-1 flex items-center gap-1">
            {/* Absent rather than disabled, and rendered conditionally rather
                than with `hidden`: a `hidden` attribute is `display:none` at
                the same specificity as the `inline-flex` utility on the same
                element, so which one wins is a question about stylesheet order
                — not something a control's visibility should depend on. A
                press with no session is a 401 and a heart that flickers. */}
            {canWrite && !pending && (
              <button
                type="button"
                onClick={() => thread.toggleLike(row.id)}
                aria-pressed={isLiked}
                aria-label={isLiked ? "Remove like" : "Like this comment"}
                className="inline-flex items-center gap-1 rounded-mo-pill px-2 py-1 text-xs font-semibold text-mo-body hover:bg-mo-raised hover:text-mo-ink"
              >
                <Heart
                  aria-hidden
                  className={`h-3.5 w-3.5 ${isLiked ? "fill-current text-mo-bad" : ""}`}
                />
                {likes > 0 && <span className="tabular-nums">{formatCount(likes)}</span>}
              </button>
            )}

            {canReply(row, viewerId, postAuthorId) && (
              <RowAction
                icon={MessageCircle}
                label="Reply"
                onClick={() => onEditingChange({ id: row.id, mode: "reply", text: "" })}
              />
            )}
            {canEdit(row, viewerId) && (
              <RowAction
                icon={Pencil}
                label="Edit"
                onClick={() => onEditingChange({ id: row.id, mode: "edit", text: row.body })}
              />
            )}
            {canDelete(row, viewerId) && (
              <RowAction icon={Trash2} label="Delete" destructive onClick={() => void thread.remove(row.id)} />
            )}
          </div>

          {mine?.mode === "reply" && (
            <InlineComposer
              label="Write a reply"
              value={mine.text}
              busy={busy}
              onChange={(text) => onEditingChange({ ...mine, text })}
              onCancel={() => onEditingChange(null)}
              onSubmit={onSubmitEditing}
            />
          )}
        </div>
      </div>

      {/* The creator's reply, nested — the only nesting there is, because the
          server caps the thread at one deep. */}
      {row.reply && (
        <div className="ml-11 mt-3 border-l border-mo pl-3">
          <Row
            row={row.reply}
            thread={thread}
            viewerId={viewerId}
            postAuthorId={postAuthorId}
            canWrite={canWrite}
            editing={editing}
            busy={busy}
            onEditingChange={onEditingChange}
            onSubmitEditing={onSubmitEditing}
          />
        </div>
      )}
    </div>
  )
}

function RowAction({
  icon: Icon,
  label,
  destructive,
  onClick,
}: {
  icon: typeof Heart
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1 rounded-mo-pill px-2 py-1 text-xs font-semibold",
        destructive ? "text-mo-bad hover:bg-mo-raised" : "text-mo-body hover:bg-mo-raised hover:text-mo-ink",
      ].join(" ")}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function InlineComposer({
  label,
  value,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  label: string
  value: string
  busy: boolean
  onChange: (text: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        aria-label={label}
        autoFocus
        className="w-full resize-none rounded-mo border border-mo bg-mo-sunken px-3 py-2 text-sm text-mo-ink focus:border-mo-focus focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !canSend(value)}
          className="rounded-mo-pill bg-mo-raised px-3 py-1.5 text-xs font-semibold text-mo-cyan hover:bg-mo-surface disabled:text-mo-body"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-mo-pill px-3 py-1.5 text-xs font-semibold text-mo-body hover:bg-mo-raised"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
