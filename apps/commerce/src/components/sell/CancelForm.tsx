"use client"

import { useState } from "react"
import { CANCEL_REASON_MAX, validateCancelReason } from "@/lib/seller"

interface CancelFormProps {
  pending: boolean
  /** The server's refusal, shown under the buttons; null when there is none. */
  serverError: string | null
  onSubmit: (reason: string) => void
  onDismiss: () => void
}

/**
 * The reason a seller gives for cancelling, asked before anything is sent.
 *
 * Cancelling is destructive and the buyer will read the reason on their own
 * order page, so the form is a deliberate second step behind the Cancel
 * button rather than a confirm dialog: the seller has to write something.
 * The confirming button is the danger style, the way out is an outline,
 * and both are disabled while the request is in flight so a double click
 * cannot send two (the route is idempotent, but the seller should not have
 * to rely on that).
 */
export function CancelForm({ pending, serverError, onSubmit, onDismiss }: CancelFormProps) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = validateCancelReason(reason)
    setError(next)
    if (!next) onSubmit(reason)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-labelledby="cancel-order-heading">
      <p id="cancel-order-heading" className="text-sm font-semibold">Cancel this order</p>
      <p className="text-sm text-shop-muted">
        The buyer sees your reason on their order page and is refunded if they have paid. Stock committed to this order
        goes back on sale.
      </p>
      <div>
        <label htmlFor="cancel-reason" className="field-label">Reason</label>
        <textarea
          id="cancel-reason"
          className="field"
          placeholder="Out of stock, damaged in the warehouse, cannot ship to this pin code…"
          value={reason}
          maxLength={CANCEL_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "cancel-reason-error" : undefined}
          disabled={pending}
          autoFocus
        />
        {error && <p id="cancel-reason-error" className="field-hint text-shop-bad">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-danger btn-sm" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel order"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={onDismiss}>
          Keep order
        </button>
        {serverError && <p className="text-sm text-shop-bad" role="alert">{serverError}</p>}
      </div>
    </form>
  )
}
