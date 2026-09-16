"use client"

import { useEffect, useState } from "react"
import { ConfirmReasonDialog } from "./ConfirmReasonDialog"
import { Field } from "./bits"
import { inputClass } from "./buttons"
import { humanise } from "@/lib/admin/data"

export interface Choice {
  value: string
  label?: string
  /** Shown under the select when this choice is picked (e.g. "needs a fresh 2FA code"). */
  hint?: string
  destructive?: boolean
}

/**
 * Confirm-with-reason, with one choice first: an outcome, an action, a new
 * status. Destructive choices require the written reason.
 */
export function ChoiceDialog({
  open,
  title,
  description,
  choiceLabel,
  choices,
  confirmLabel = "Confirm",
  reasonLabel,
  requireReason = false,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: React.ReactNode
  choiceLabel: string
  choices: Choice[]
  confirmLabel?: string
  reasonLabel?: string
  requireReason?: boolean
  busy: boolean
  onConfirm: (choice: string, reason: string) => void
  onClose: () => void
}) {
  const [choice, setChoice] = useState("")
  const only = choices.length === 1 ? choices[0].value : ""
  useEffect(() => {
    if (open) setChoice(only)
  }, [open, only])
  const picked = choices.find((c) => c.value === choice)

  return (
    <ConfirmReasonDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive={picked?.destructive ?? false}
      requireReason={requireReason}
      reasonLabel={reasonLabel}
      busy={busy}
      canConfirm={!!picked}
      onConfirm={(reason) => picked && onConfirm(picked.value, reason)}
      onClose={onClose}
    >
      <Field label={choiceLabel} hint={picked?.hint}>
        {(id) => (
          <select id={id} className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose…</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label ?? humanise(c.value)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </ConfirmReasonDialog>
  )
}
