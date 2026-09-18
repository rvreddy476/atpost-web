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
import { avatarSrc } from "./avatarUrl"
import {
  QUICK_REACTIONS,
  canSend,
  commentAuthorName,
  discardComment,
  isPendingComment,
  mergeComments,
  pendingComment,
  settleComment,
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
   * The gateway prefix this zone is served under — "/social", "/reels".
   *
   * Used for one thing: building a commenter's avatar URL out of the
   * `avatar_media_id` post-service sends on `CommentAuthor`, which is an id
   * and never a URL. A prop rather than an environment read, for the reason
   * PostCard's own `apiBase` sets out.
   */
  apiBase?: string
  /**
   * Who is reading, when anyone is. Only the zone knows.
   *
   * Used for one thing: naming a row the server has not named. See
   * `commentAuthorName` — the create response carries no `author`, and an
   * optimistic row cannot, so both would otherwise say "Someone" about the
   * person looking at them.
   */
  viewerId?: string
  /**
   * Told after the server accepted one, with the row it made.
   *
   * This is where `comment_create` is fired from. It is deliberately not fired
   * inside this component: the analytics contract needs the surface, the feed
   * position and the item, none of which this sheet has or should have.
   *
   * Fired on the SERVER's answer, never on the optimistic write — an event
   * that counted comments nobody accepted would be a lie in the ranker and in
   * a creator's dashboard.
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
  apiBase,
  viewerId,
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
  /** Local, monotonic, and never seen by anyone: the pending row's key. */
  const nonce = useRef(0)

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

  /**
   * Write it now; take the server's word for it when that arrives.
   *
   * The idiom is `useOptimisticToggle`'s, deliberately — the same three
   * moves, in the same order, for the same reason. Show the change
   * immediately, because a composer that swallows what you typed for the
   * length of a round trip reads as broken. Replace the guess with the truth
   * when it lands, because the id, the timestamp and the hydrated author are
   * the server's to assign. And if it is refused, put the list BACK and say
   * why — a silent rollback is worse than never having been optimistic,
   * because it shows a state that was never true and never mentions it.
   *
   * The draft is restored with the failure rather than cleared, so nothing a
   * person wrote is lost to a 403 they did not expect.
   */
  const submit = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError("")

    // Prepended, because the list is newest-first and the server puts it
    // there too — so the row does not move when the real one replaces it.
    const optimistic = pendingComment({
      postId,
      authorId: viewerId ?? "",
      text,
      nonce: `${nonce.current++}`,
      createdAt: new Date().toISOString(),
    })
    setRows((prev) => mergeComments([optimistic], prev))
    setDraft("")

    try {
      const row = await api.create(postId, text)
      setRows((prev) => settleComment(prev, optimistic.id, row))
      onCreated?.(row)
    } catch (err) {
      setRows((prev) => discardComment(prev, optimistic.id))
      setDraft((current) => (current ? current : text))
      setError(say(err))
    } finally {
      setSending(false)
    }
  }, [draft, sending, api, postId, viewerId, onCreated, say])

  if (!open) return null

  const title = label ? `Comments on ${label}` : "Comments"

  return (
    <div
      // The scrim. Pressing it closes, which is what a bottom sheet does and
      // what a dialog on the web does.
      //
      // `bg-mo-scrim/60` and NOT `bg-mo-bg/60`, which is what stood here. A
      // backdrop's whole job is to push the page behind it away, and --mo-bg
      // is the page: in a light zone that was 60% WHITE over a white feed
      // covered by a white panel, three grounds at 1.00:1 to each other and no
      // modal boundary anywhere on screen. The scrim token is dark in both
      // scopes for exactly this; see tokens.css. .60 carries no text, which is
      // why it may sit below the .70 floor the same token has under type.
      className="fixed inset-0 z-50 flex items-end justify-center bg-mo-scrim/60 backdrop-blur-sm sm:items-center"
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
            // 44px, not 32px. This is the control a thumb reaches for at the
            // top-right corner of a phone sheet, which is the hardest place on
            // the screen to hit accurately; the glyph stays 20px and the box
            // grows around it.
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
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
                className="mt-2 inline-flex min-h-[44px] items-center rounded-mo-pill border border-mo px-4 text-sm font-semibold text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
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
                  <CommentLine row={row} viewerId={viewerId} apiBase={apiBase} />
                  {/* The post author's answer, nested. The phone indents it by
                      40dp under its parent; this is the same relationship
                      expressed as a nested list, so a screen reader hears the
                      structure rather than a gap. */}
                  {row.reply && (
                    <ul className="mt-3 pl-11">
                      <li>
                        <CommentLine row={row.reply} viewerId={viewerId} apiBase={apiBase} />
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
              // `disabled:opacity-60` on body-coloured text over a card is
              // 6.22 x .6 in the dark scope and 7.87 x .6 in the light one —
              // both slide under 4.5, and a disabled label is exempt from 1.4.3
              // only when it is genuinely a disabled CONTROL, which this is for
              // the half-second it is loading. --mo-muted-lg is the colour this
              // palette has for that job and it is honest at both ends.
              className="mt-4 min-h-[44px] w-full rounded-mo-pill border border-mo py-2 text-sm font-semibold text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:cursor-wait disabled:text-mo-muted-lg"
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
          {/*
            `alert` rather than `status`, unlike the confirmation pills
            elsewhere. This one appears at the moment a comment was taken back
            OFF the list — the screen changed under someone who was told it had
            worked — and that is precisely the case ARIA reserves interruption
            for. The draft is still in the box below it.
          */}
          {error && status === "ready" && (
            <p role="alert" className="pb-2 text-xs text-mo-bad">
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
                // A 44px box round a 20px glyph. These were `px-1` on a line of
                // text, which is roughly 24x20 — the smallest targets on the
                // sheet, sitting in a row of seven where a miss inserts the
                // wrong emoji into somebody's comment.
                className="grid h-11 w-11 shrink-0 place-items-center rounded-mo-pill text-xl leading-none transition-transform duration-150 ease-mo hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
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
              // `placeholder:text-mo-body`, not `--mo-muted-lg`, and this was
              // wrong on the dark theme too rather than only under light. A
              // placeholder is small text; --mo-muted-lg is 3.57 on the dark
              // ground and 3.93 on white, large-text-and-non-text only in both
              // scopes, and its name says so. --mo-body is 6.22 on a dark card
              // and 7.87 on a white one. SearchBox in @momentum/chrome already
              // had this right and says why in the same words.
              //
              // `min-h-[44px]` rather than 38: the composer is the one control
              // on this sheet somebody taps on every visit.
              className="max-h-28 min-h-[44px] flex-1 resize-none rounded-mo-lg border border-mo bg-mo-sunken px-3 py-2.5 text-sm text-mo-ink placeholder:text-mo-body focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mo"
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
                // Two changes, and the second is the one that mattered.
                //
                // 44px, because this is the send button on a phone composer.
                //
                // `disabled:opacity-60` is gone. tokens.css measured exactly
                // that trick on exactly this fill and rejected it: the ramp
                // collapses toward the ground while --mo-on-primary — which IS
                // a ground colour in the dark scope — does not move with it,
                // leaving 1.92:1. `.mo-btn-primary:disabled` answers it by
                // dropping the gradient for a flat raised fill with body type,
                // and this button now does the same. `bg-none` is what turns
                // the background-IMAGE off; a background-color class alone
                // leaves the gradient painted over it.
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-mo-pill bg-mo-primary bg-mo-ember text-mo-on-primary transition-colors duration-150 ease-mo hover:bg-mo-ember-hover disabled:cursor-wait disabled:bg-mo-raised disabled:bg-none disabled:text-mo-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
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

/**
 * One comment: avatar, name, age, body. The phone's row, in the same order.
 *
 * A row that has not been accepted yet says so, in the slot the timestamp
 * will occupy — "2 seconds ago" would be a claim about a comment that does not
 * exist anywhere but this browser. Dimmed as well, because the word alone is
 * easy to miss halfway down a list, and both together are what make the
 * rollback legible when it comes: the faint one is the one that vanishes.
 */
function CommentLine({
  row,
  viewerId,
  apiBase,
}: {
  row: CommentRow
  viewerId?: string
  apiBase?: string
}) {
  const name = commentAuthorName(row, viewerId)
  const pending = isPendingComment(row)
  // post-service hydrates `author` on the LIST and not on the CREATE, so the
  // row a person has just written carries no avatar id — the same asymmetry
  // `commentAuthorName` exists for. Null means initials, which is the right
  // answer for a row that has not come back from the server yet.
  const avatar = avatarSrc({ mediaId: row.author?.avatar_media_id }, apiBase)
  return (
    <div className={`flex gap-3 ${pending ? "opacity-60" : ""}`}>
      {/* 32px, which is the phone's `UsAvatarSize.Small` on this row. */}
      <Avatar name={name} id={row.author_id} src={avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold text-mo-ink">{name}</span>
          {pending ? (
            <span className="text-xs text-mo-body">Sending…</span>
          ) : (
            <time dateTime={row.created_at} className="text-xs text-mo-body">
              {relativeTime(row.created_at)}
            </time>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-mo-ink">
          {row.body}
        </p>
      </div>
    </div>
  )
}
