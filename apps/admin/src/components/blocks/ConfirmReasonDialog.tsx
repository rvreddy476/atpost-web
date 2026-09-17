"use client"

import { useEffect, useId, useState } from "react"
import { Dialog } from "./Dialog"
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "./buttons"
import { MAX_REASON_LENGTH, checkReason } from "@/lib/blocks/confirm"

/**
 * Confirm an admin action, with a written reason.
 *
 * A destructive action (reject, suspend, ban, reverse) cannot be confirmed
 * without a reason of at least ten characters; admin-service stores it in the
 * audit row. `requireReason` asks for one on a non-destructive action too —
 * approvals, which the backend refuses without a reason.
 */
export function ConfirmReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  requireReason = false,
  busy = false,
  onConfirm,
  onClose,
  children,
  canConfirm = true,
  reasonLabel = "Reason",
  maxReasonLength = MAX_REASON_LENGTH,
}: {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  requireReason?: boolean
  busy?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
  /** Extra fields (an amount, a status), rendered above the reason. */
  children?: React.ReactNode
  /** False while those extra fields are incomplete. */
  canConfirm?: boolean
  reasonLabel?: string
  /** A product with its own limit (Q&A allows 2000); a counter is shown when it differs from the default. */
  maxReasonLength?: number
}) {
  const [reason, setReason] = useState("")
  const [touched, setTouched] = useState(false)
  const fieldId = useId()
  const errorId = useId()

  useEffect(() => {
    if (open) {
      setReason("")
      setTouched(false)
    }
  }, [open])

  const check = checkReason(reason, { destructive, required: requireReason, max: maxReasonLength })
  const asksReason = destructive || requireReason
  const showCounter = maxReasonLength !== MAX_REASON_LENGTH

  return (
    <Dialog open={open} title={title} description={description} onClose={onClose} dismissible={!busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setTouched(true)
          if (check.ok && canConfirm && !busy) onConfirm(reason.trim())
        }}
        className="space-y-3"
      >
        {children}
        <label htmlFor={fieldId} className="block text-sm font-semibold text-mo-ink">
          {reasonLabel}{asksReason ? "" : " (optional)"}
        </label>
        <textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={maxReasonLength + 1}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          className={inputClass}
          aria-invalid={touched && !check.ok ? true : undefined}
          aria-describedby={touched && !check.ok ? errorId : undefined}
          placeholder="What happened, and why this action"
        />
        {showCounter ? (
          <p className="text-xs text-mo-body" data-testid="reason-counter">
            {reason.trim().length} / {maxReasonLength} characters
          </p>
        ) : null}
        {touched && !check.ok ? (
          <p id={errorId} role="alert" className="text-sm text-mo-bad">
            {check.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={destructive ? buttonDanger : buttonPrimary} disabled={busy || !canConfirm || (asksReason && !check.ok)}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
