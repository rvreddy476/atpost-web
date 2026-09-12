"use client"

/**
 * "Clear watch history", with the second click that makes it safe.
 *
 * Drawn on two pages, the History page and the Settings page's History
 * section, and it is one component so the two cannot disagree about what
 * clearing means or how it is confirmed.
 *
 * ── Two clicks, inline, and never `window.confirm` ────────────────────────
 * `DELETE /v1/videos/history` is every row this viewer has, with no undo on
 * the server, so one click is too few. `window.confirm` is the obvious
 * second click and it is the wrong one: it blocks the thread, it is drawn by
 * the browser in the browser's font outside the app's palette, some browsers
 * let a person suppress it for the rest of the session, and a screen reader
 * loses the page's context while it is up. So the second click is on the
 * page: the first press arms the control and the Confirm and Cancel buttons
 * take its place, in the app's own vocabulary, with `aria-expanded` on the
 * trigger saying that something opened and `aria-controls` saying what.
 *
 * ── The drawing is a pure function of `armed` ─────────────────────────────
 * `ClearHistoryButtons` takes its state as props and decides nothing, so
 * ./ClearHistoryControl.test.tsx can render both shapes with
 * react-dom/server and assert the Confirm button exists only after the arm,
 * without a DOM. `ClearHistoryControl` is the thin stateful wrapper the
 * pages mount.
 *
 * ── Disarms itself when the page moves on ─────────────────────────────────
 * An armed Confirm left on screen while somebody scrolls away and comes
 * back is a destructive button they did not just ask for. So the arm is
 * dropped on blur out of the group, on Escape, and after the delete
 * settles either way.
 */

import { useCallback, useId, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"

const PILL =
  "inline-flex items-center gap-1.5 rounded-mo-pill border px-4 py-2 text-sm font-semibold " +
  "transition-colors duration-150 ease-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo " +
  "disabled:cursor-not-allowed disabled:opacity-50"

export interface ClearHistoryButtonsProps {
  armed: boolean
  pending: boolean
  /** The last attempt failed. The control says so and offers again. */
  failed: boolean
  /** Nothing to clear; the control is present and says why it is off. */
  empty?: boolean
  onArm: () => void
  onCancel: () => void
  onConfirm: () => void
  onBlurGroup?: (event: React.FocusEvent<HTMLDivElement>) => void
  onKeyDownGroup?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

export function ClearHistoryButtons({
  armed,
  pending,
  failed,
  empty = false,
  onArm,
  onCancel,
  onConfirm,
  onBlurGroup,
  onKeyDownGroup,
}: ClearHistoryButtonsProps) {
  const groupId = useId()
  const statusId = useId()

  return (
    <div className="flex flex-wrap items-center gap-2" onBlur={onBlurGroup} onKeyDown={onKeyDownGroup}>
      {!armed ? (
        <button
          type="button"
          onClick={onArm}
          disabled={empty || pending}
          aria-expanded={false}
          aria-controls={groupId}
          aria-describedby={empty ? statusId : failed ? statusId : undefined}
          className={`${PILL} border-mo-strong text-mo-ink hover:bg-mo-raised`}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Clear watch history
        </button>
      ) : (
        <div
          id={groupId}
          role="group"
          aria-label="Confirm clearing your watch history"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-mo-body">Clear every video from your history?</span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            // The destructive one is the one that says what it does. "Yes"
            // under "Clear every video?" is a button somebody presses on
            // momentum; "Confirm" with the noun beside it is one they read.
            className={`${PILL} border-mo-bad text-mo-bad hover:bg-mo-raised`}
          >
            {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            Confirm
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            autoFocus
            className={`${PILL} border-mo text-mo-ink hover:bg-mo-raised`}
          >
            Cancel
          </button>
        </div>
      )}
      {/* One live region for both sentences, so a screen reader hears the
          failure without the focus moving off the button that caused it. */}
      <span id={statusId} role="status" className="text-xs text-mo-body">
        {empty
          ? "Nothing to clear."
          : failed
            ? "Your history could not be cleared. Try again."
            : ""}
      </span>
    </div>
  )
}

export function ClearHistoryControl({
  onClear,
  empty = false,
}: {
  /** Resolve once the server has 204ed; reject and the control says so. */
  onClear: () => Promise<void>
  empty?: boolean
}) {
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const confirm = useCallback(async () => {
    setPending(true)
    setFailed(false)
    try {
      await onClear()
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
      setArmed(false)
    }
  }, [onClear])

  // Focus leaving the whole group, not moving between Confirm and Cancel:
  // `relatedTarget` is where focus went, and while it is still inside the
  // group the arm holds.
  const onBlurGroup = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setArmed(false)
  }, [])

  const onKeyDownGroup = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") setArmed(false)
  }, [])

  return (
    <ClearHistoryButtons
      armed={armed}
      pending={pending}
      failed={failed}
      empty={empty}
      onArm={() => {
        setFailed(false)
        setArmed(true)
      }}
      onCancel={() => setArmed(false)}
      onConfirm={() => void confirm()}
      onBlurGroup={onBlurGroup}
      onKeyDownGroup={onKeyDownGroup}
    />
  )
}
