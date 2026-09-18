"use client"

/**
 * The box somebody writes a comment in.
 *
 * One component for the thread's composer, the reply box and the edit box —
 * they are the same act with different words on the button, and three of these
 * would be three places to get the keyboard wrong.
 *
 * ── The send control is ABSENT until there is something to send ───────────
 * Not disabled. The same rule the action bar and the overflow menu follow, and
 * the phone's `showsSend()`: a greyed button on an empty box says "you may not
 * do this", where the truth is "there is nothing to do yet".
 *
 * ── Ctrl/Cmd+Enter sends; plain Enter does not ───────────────────────────
 * A comment under a long video is frequently a paragraph — this is not a chat
 * box — and a plain Enter that posted would make every line break a published
 * half-thought. The chord is the convention everywhere a textarea can be long,
 * and the hint is drawn rather than left to be discovered.
 *
 * ── It grows with the text ────────────────────────────────────────────────
 * A fixed three-line box hides the end of what somebody is writing, and a
 * scrollbar inside a composer is how a typo survives to publication. The height
 * is set from `scrollHeight` on every change, with a ceiling so a very long
 * comment does not push the video off the screen.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Avatar } from "@momentum/content"
import { COMMENT_MAX_LENGTH, canSubmit, charactersLeft, showsCounter } from "./thread"

export interface ComposerProps {
  /** The viewer, for the avatar beside the box. */
  viewerId: string | null
  viewerName?: string
  placeholder: string
  submitLabel: string
  /** Pre-filled, for the edit box. */
  initialValue?: string
  /** Rendered beside Send. The reply and edit boxes both have one. */
  onCancel?: () => void
  onSubmit: (text: string) => Promise<boolean>
  /** Focus the box as soon as it appears — true for reply and edit. */
  autoFocus?: boolean
  /** The reply and edit boxes sit inside a row and want no avatar. */
  showAvatar?: boolean
}

const MAX_HEIGHT_PX = 320

export function Composer({
  viewerId,
  viewerName,
  placeholder,
  submitLabel,
  initialValue = "",
  onCancel,
  onSubmit,
  autoFocus = false,
  showAvatar = true,
}: ComposerProps) {
  const [draft, setDraft] = useState(initialValue)
  const [sending, setSending] = useState(false)
  const boxRef = useRef<HTMLTextAreaElement | null>(null)

  const grow = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [])

  useEffect(() => {
    grow()
    if (autoFocus) {
      const el = boxRef.current
      el?.focus()
      // The caret at the END of existing text, not at the start: an edit box
      // that opens with the caret before the first character makes typing
      // prepend, which nobody expects.
      if (el) el.selectionStart = el.selectionEnd = el.value.length
    }
  }, [autoFocus, grow])

  const send = useCallback(async () => {
    if (!canSubmit(draft) || sending) return
    setSending(true)
    const ok = await onSubmit(draft.trim())
    setSending(false)
    if (ok) {
      setDraft("")
      // The box shrinks back with the text; without this it keeps the height
      // of whatever was just sent.
      requestAnimationFrame(grow)
    }
  }, [draft, grow, onSubmit, sending])

  return (
    <div className="flex gap-3">
      {showAvatar && (
        <Avatar name={viewerName} id={viewerId ?? undefined} size="sm" className="mt-1 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <textarea
          ref={boxRef}
          value={draft}
          rows={1}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setDraft(event.target.value)
            grow()
          }}
          onKeyDown={(event) => {
            // Never let a key the composer claims reach the player underneath:
            // @momentum/player binds Space, K, M and the arrows, and a comment
            // containing the letter "k" must not pause the video.
            event.stopPropagation()
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
          className={[
            "min-h-11 w-full resize-none bg-transparent py-2.5 text-sm leading-relaxed text-mo-ink",
            "border-b border-mo outline-none transition-colors duration-150 ease-mo",
            "placeholder:text-mo-body focus:border-mo-strong",
          ].join(" ")}
        />

        <div className="mt-2 flex items-center justify-end gap-2">
          {showsCounter(draft) && (
            <span
              className={`mr-auto text-xs tabular-nums ${
                charactersLeft(draft) < 0 ? "text-mo-bad" : "text-mo-body"
              }`}
            >
              {charactersLeft(draft)}
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-11 items-center rounded-mo-pill px-3 text-sm text-mo-body hover:bg-mo-raised"
            >
              Cancel
            </button>
          )}
          {canSubmit(draft) && (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="inline-flex min-h-11 items-center gap-2 rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-60"
            >
              {sending && <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              {submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
