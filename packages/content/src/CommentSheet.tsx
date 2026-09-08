"use client"

/**
 * The comment surface.
 *
 * ── What was missing ──────────────────────────────────────────────────────
 * The action bar has had a comment control since it was written and it went
 * nowhere: `onComment` was optional, the zone never passed one, and pressing
 * the glyph did nothing at all. This is the other end of it.
 *
 * ── Copied from `UsCommentsSheet.kt`, deliberately ────────────────────────
 * The phone's sheet is the design and this follows it closely:
 *
 *   · a fixed 66% of the window's height, not a measured one. The phone's own
 *     note says why: a sheet sized to its contents SHRANK once the comments
 *     loaded, which moved the composer under the thumb that was reaching for
 *     it. A constant height cannot do that.
 *   · a centred "Comments" header over a scrolling list.
 *   · the composer pinned to the BOTTOM, with the quick-reaction row directly
 *     above it, and a send control that appears only once there is a draft.
 *   · the eight reaction emoji, in the phone's order, each dropping its
 *     character into the draft rather than posting on its own.
 *   · the post author's reply nested under its parent.
 *   · no sort control, no like on a comment, no Reply control — see below.
 *
 * ── What is NOT here, and why that is the honest choice ───────────────────
 * A heart on each comment. `POST /v1/comments/{id}/like` exists and works, but
 * the list carries no viewer-liked flag, so the sheet cannot know whether YOU
 * have already liked something — it can only toggle blindly and show the wrong
 * state on every reload. The phone reached this conclusion first and wrote it
 * down: dead controls are worse than none.
 *
 * A Reply control, for the same class of reason: replying is post-owner-only
 * and one deep (`REPLY_OWNER_ONLY`, `CANNOT_REPLY_TO_REPLY`, `REPLY_EXISTS`),
 * so a Reply on every row would be a 403 for everybody but one person. The
 * replies that exist are RENDERED; writing one is a creator surface and is not
 * this one.
 *
 * ── A dialog, where the phone has a bottom sheet ──────────────────────────
 * On a narrow viewport this IS a bottom sheet, in the phone's proportions. On
 * a wide one it is a centred dialog, because a 66%-tall panel welded to the
 * bottom edge of a 1400px window is a shape that only makes sense when the
 * bottom edge is where your thumb is.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Send, X } from "lucide-react"
import { Avatar } from "./Avatar"
import {
  QUICK_REACTIONS,
  canSend,
  commentAuthorName,
  mergeComments,
  type CommentApi,
  type CommentRow,
} from "./comments"
import { relativeTime } from "./relativeTime"

export interface CommentSheetProps {
  open: boolean
  onClose: () => void
  postId: string
  /** For the dialog's accessible name. */
  label?: string
  api: CommentApi
  /**
   * Told after the server accepted one, with the row it made.
   *
   * This is where `comment_create` is fired from. It is deliberately not fired
   * inside this component: the analytics contract needs the surface, the feed
   * position and the item, none of which this sheet has or should have.
   */
  onCreated?: (row: CommentRow) => void
  /** Turns a rejected request into a sentence. The zone knows its transport. */
  errorMessage?: (error: unknown) => string
}

export function CommentSheet({
  open,
  onClose,
  postId,
  label,
  api,
  onCreated,
  errorMessage,
}: CommentSheetProps) {
  const [rows, setRows] = useState<CommentRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [loadingMore, setLoadingMore] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const inFlight = useRef(false)

  const say = useCallback(
    (err: unknown) => (errorMessage ? errorMessage(err) : "That did not work."),
    [errorMessage]
  )

  /* ── Loading ────────────────────────────────────────────────────────────── */

  const load = useCallback(
    async (next: string | null, mode: "replace" | "append") => {
      if (inFlight.current) return
      inFlight.current = true
      if (mode === "append") setLoadingMore(true)
      else setStatus("loading")
      try {
        const page = await api.list(postId, next)
        // Deduped rather than concatenated — the cursor is a timestamp and can
        // hand back a row that is already on screen. See `mergeComments`.
        setRows((prev) => (mode === "replace" ? page.items : mergeComments(prev, page.items)))
        setCursor(page.nextCursor)
        setStatus("ready")
      } catch (err) {
        if (mode === "replace") {
          setStatus("error")
          setError(say(err))
        }
        // A failed NEXT page keeps what is already on screen, exactly as the
        // feed does. Blanking a conversation somebody is reading because page
        // three failed is the worst available response to a transient error.
      } finally {
        inFlight.current = false
        setLoadingMore(false)
      }
    },
    [api, postId, say]
  )

  useEffect(() => {
    if (!open) return
    setRows([])
    setCursor(null)
    setError("")
    void load(null, "replace")
  }, [open, load])

  /* ── The dialog's obligations ───────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    // The list behind must not scroll while a modal is over it — otherwise a
    // wheel over the scrim moves the feed and the post you are commenting on
    // leaves the screen underneath you.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
      restoreFocus.current?.focus()
    }
  }, [open])

  /**
   * Escape closes, and Tab does not leave.
   *
   * A modal a keyboard user can tab out of, into a feed they cannot see, is a
   * modal in name only. The trap is the two-line kind on purpose: a focus
   * library is a dependency this package does not need for one dialog.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea, [href], input, select, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  /* ── Sending ────────────────────────────────────────────────────────────── */

  const submit = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError("")
    try {
      const row = await api.create(postId, text)
      // Prepended, because the list is newest-first and the server would put
      // it there on the next fetch. Not optimistic: the id, the timestamp and
      // the hydrated author all come from the server, and a locally invented
      // row would be replaced by a different-looking one a second later.
      setRows((prev) => mergeComments([row], prev))
      setDraft("")
      onCreated?.(row)
    } catch (err) {
      setError(say(err))
    } finally {
      setSending(false)
    }
  }, [draft, sending, api, postId, onCreated, say])

  if (!open) return null

  const title = label ? `Comments on ${label}` : "Comments"

  return (
    <div
      // The scrim. Pressing it closes, which is what a bottom sheet does and
      // what a dialog on the web does.
      className="fixed inset-0 z-50 flex items-end justify-center bg-mo-bg/60 backdrop-blur-sm sm:items-center"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "flex w-full flex-col border border-mo bg-mo-surface shadow-mo-lift",
          // The phone's 66%. On a wide window it becomes a centred dialog with
          // a ceiling, because a 66%-tall strip across a desktop is not a
          // sheet, it is a band.
          "h-[66vh] rounded-t-mo-lg",
          "sm:h-auto sm:max-h-[min(66vh,640px)] sm:w-full sm:max-w-lg sm:rounded-mo-lg",
        ].join(" ")}
      >
        {/* The grab handle. Decorative on the web — there is no drag to
            dismiss — but it is what says "this came up from the bottom", and
            it is hidden once the panel is a centred dialog and did not. */}
        <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
          <div className="h-1 w-8 rounded-mo-pill bg-mo-ink/35" />
        </div>

        <header className="flex items-center gap-2 border-b border-mo px-3 py-2.5">
          <h2 className="flex-1 text-center text-base font-semibold text-mo-ink">Comments</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="inline-flex h-8 w-8 items-center justify-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {status === "loading" && (
            <p className="py-6 text-center text-sm text-mo-body">Loading comments…</p>
          )}

          {status === "error" && (
            <div className="py-6 text-center">
              <p className="text-sm text-mo-bad">{error}</p>
              <button
                type="button"
                onClick={() => void load(null, "replace")}
                className="mt-2 rounded-mo-pill border border-mo px-3 py-1.5 text-sm text-mo-ink hover:bg-mo-raised"
              >
                Try again
              </button>
            </div>
          )}

          {status === "ready" && rows.length === 0 && (
            <div className="py-10 text-center">
              <p className="font-semibold text-mo-ink">No comments yet</p>
              <p className="mt-1 text-sm text-mo-body">Start the conversation.</p>
            </div>
          )}

          {rows.length > 0 && (
            <ul className="space-y-4">
              {rows.map((row) => (
                <li key={row.id}>
                  <CommentLine row={row} />
                  {/* The post author's answer, nested. The phone indents it by
                      40dp under its parent; this is the same relationship
                      expressed as a nested list, so a screen reader hears the
                      structure rather than a gap. */}
                  {row.reply && (
                    <ul className="mt-3 pl-11">
                      <li>
                        <CommentLine row={row.reply} />
                      </li>
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {cursor && (
            <button
              type="button"
              onClick={() => void load(cursor, "append")}
              disabled={loadingMore}
              className="mt-4 w-full rounded-mo-pill border border-mo py-2 text-sm text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more comments"}
            </button>
          )}
        </div>

        {/*
          The composer, pinned. `sticky`/flex rather than absolutely placed so
          that on a phone the soft keyboard shortens the panel and the list
          gives up the space — which is what `imePadding()` buys on Android.
        */}
        <div className="border-t border-mo px-3 py-2">
          {error && status === "ready" && (
            <p role="status" className="pb-2 text-xs text-mo-bad">
              {error}
            </p>
          )}

          {/* The eight, in the phone's order. Each one appends to the DRAFT —
              they are a keyboard, not a set of one-tap reactions. */}
          <div className="flex justify-between pb-2">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft((value) => value + emoji)
                  inputRef.current?.focus()
                }}
                aria-label={`Add ${emoji} to your comment`}
                className="rounded-mo-pill px-1 text-xl leading-none transition-transform duration-150 ease-mo hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line — the convention
                // every chat composer on the web already has.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
              rows={1}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              className="max-h-28 min-h-[38px] flex-1 resize-none rounded-mo-lg border border-mo bg-mo-sunken px-3 py-2 text-sm text-mo-ink placeholder:text-mo-muted-lg focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mo"
            />

            {/* Appears with the draft, exactly as `showsSend()` does. An always
                -present greyed disc would be the disabled control this
                codebase keeps deciding against. */}
            {canSend(draft) && (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={sending}
                aria-label="Post comment"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-mo-pill bg-mo-ember text-mo-on-primary transition-opacity duration-150 ease-mo hover:bg-mo-ember-hover disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                {sending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One comment: avatar, name, age, body. The phone's row, in the same order. */
function CommentLine({ row }: { row: CommentRow }) {
  const name = commentAuthorName(row)
  return (
    <div className="flex gap-3">
      {/* 32px, which is the phone's `UsAvatarSize.Small` on this row. */}
      <Avatar name={name} id={row.author_id} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold text-mo-ink">{name}</span>
          <time dateTime={row.created_at} className="text-xs text-mo-body">
            {relativeTime(row.created_at)}
          </time>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-mo-ink">
          {row.body}
        </p>
      </div>
    </div>
  )
}
