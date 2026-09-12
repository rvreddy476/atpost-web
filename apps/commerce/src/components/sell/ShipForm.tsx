"use client"

import { useState } from "react"
import { validateShipForm, type ShipFormErrors, type ShipFormValues } from "@/lib/seller"

interface ShipFormProps {
  pending: boolean
  /** The server's one-line refusal, shown under the button; null when there is none. */
  serverError: string | null
  onSubmit: (values: ShipFormValues) => void
}

/**
 * Courier name and tracking number, validated before anything is sent.
 *
 * The button is gold because shipping changes the order, which is the zone's
 * rule for gold. It is disabled while the request is in flight so a double
 * click cannot book twice (the route is idempotent per seller, but the
 * seller should not have to rely on that), and the server's own message is
 * shown inline rather than swallowed into a generic failure.
 */
export function ShipForm({ pending, serverError, onSubmit }: ShipFormProps) {
  const [values, setValues] = useState<ShipFormValues>({ courier: "", tracking_number: "" })
  const [errors, setErrors] = useState<ShipFormErrors>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = validateShipForm(values)
    setErrors(next)
    if (Object.keys(next).length === 0) onSubmit(values)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div>
        <label htmlFor="ship-courier" className="field-label">Courier</label>
        <input
          id="ship-courier"
          className="field"
          placeholder="Delhivery, Bluedart, DTDC…"
          value={values.courier}
          onChange={(e) => setValues((v) => ({ ...v, courier: e.target.value }))}
          aria-invalid={!!errors.courier}
          aria-describedby={errors.courier ? "ship-courier-error" : undefined}
          disabled={pending}
          autoComplete="off"
        />
        {errors.courier && <p id="ship-courier-error" className="field-hint text-shop-bad">{errors.courier}</p>}
      </div>
      <div>
        <label htmlFor="ship-tracking" className="field-label">Tracking number</label>
        <input
          id="ship-tracking"
          className="field font-mono"
          placeholder="AWB number from the label"
          value={values.tracking_number}
          onChange={(e) => setValues((v) => ({ ...v, tracking_number: e.target.value }))}
          aria-invalid={!!errors.tracking_number}
          aria-describedby={errors.tracking_number ? "ship-tracking-error" : undefined}
          disabled={pending}
          autoComplete="off"
        />
        {errors.tracking_number && (
          <p id="ship-tracking-error" className="field-hint text-shop-bad">{errors.tracking_number}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-gold btn-sm" disabled={pending}>
          {pending ? "Booking…" : "Mark as shipped"}
        </button>
        {serverError && <p className="text-sm text-shop-bad" role="alert">{serverError}</p>}
      </div>
    </form>
  )
}
