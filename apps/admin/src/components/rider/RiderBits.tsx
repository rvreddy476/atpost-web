"use client"

import { useRef } from "react"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Field } from "@/components/blocks/bits"
import { inputClass } from "@/components/blocks/buttons"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey } from "@/hooks/useAdminQuery"
import { humanise } from "@/lib/admin/data"
import { RIDER_DONE, RIDER_WRITES, type RiderWrite } from "@/lib/admin/rider"

export const RIDER_KEY = adminKey("rider")

export interface RiderRequest {
  write: RiderWrite
  url: string
  method?: "post" | "patch"
  body?: unknown
}

/**
 * One mutation for a Mopedu section. Every write goes through
 * useAdminMutation, so a 403 STEP_UP_REQUIRED opens the 2FA prompt and the
 * request is sent once more; the toast names the write that was done.
 */
export function useRiderMutation({ onDone }: { onDone?: (write: RiderWrite) => void } = {}) {
  const last = useRef<RiderWrite | null>(null)
  return useAdminMutation<RiderRequest>({
    request: ({ write, url, method = "post", body }) => {
      last.current = write
      return { method, url, body: body ?? {} }
    },
    invalidate: [RIDER_KEY],
    successMessage: () => (last.current ? RIDER_DONE[last.current] : "Done"),
    errorTitle: "Mopedu action failed",
    onDone: () => {
      if (last.current) onDone?.(last.current)
    },
  })
}

/**
 * The confirm dialog for one Mopedu write: its label, what it does, whether
 * it is destructive (then a reason of ten characters or more is required)
 * and whether it needs a fresh 2FA code, all from RIDER_WRITES.
 */
export function RiderActionDialog({
  write,
  subject,
  busy,
  onConfirm,
  onClose,
  children,
  canConfirm,
}: {
  write: RiderWrite | null
  subject: string | null
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
  children?: React.ReactNode
  canConfirm?: boolean
}) {
  const def = write ? RIDER_WRITES[write] : null
  return (
    <ConfirmReasonDialog
      open={write !== null}
      title={def ? `${def.label}${subject ? ` ${subject}` : ""}?` : ""}
      description={def ? def.explain : null}
      confirmLabel={def?.label ?? "Confirm"}
      destructive={def?.destructive ?? false}
      requireReason={def?.reason ?? false}
      busy={busy}
      canConfirm={canConfirm}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {children}
    </ConfirmReasonDialog>
  )
}

/** A status filter above a queue. Changing it resets paging through `onChange`. */
export function StatusFilter({
  value,
  options,
  onChange,
  allLabel = "All",
  label = "Status",
}: {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  allLabel?: string
  label?: string
}) {
  return (
    <div className="w-56">
      <Field label={label}>
        {(id) => (
          <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{allLabel}</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  )
}

/** Problems from a form check, shown above its submit button. */
export function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null
  return (
    <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-mo-bad">
      {problems.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  )
}
