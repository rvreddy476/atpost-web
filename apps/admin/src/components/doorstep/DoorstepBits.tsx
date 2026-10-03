"use client"

import { useRef, useState } from "react"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Dialog } from "@/components/blocks/Dialog"
import { Field } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { CheckField, FormProblems } from "@/components/blocks/formFields"
import { useAdmin } from "@/components/shell/AdminShell"
import { useQuery } from "@tanstack/react-query"
import { useAdminMutation, useStepUpRead } from "@/hooks/useAdminMutation"
import { adminKey } from "@/hooks/useAdminQuery"
import { humanise } from "@/lib/admin/data"
import { DOORSTEP_WRITES, doorstepRequest, stepUpFor, type DoorstepTarget, type DoorstepWrite, type FormCheck, type FormValues } from "@/lib/admin/doorstep"
import { adminErrorMessage } from "@/lib/admin/mutation"
import { can } from "@/lib/admin/sections"
import { stepUpWindowOpen } from "@/lib/admin/stepUp"

export const DOORSTEP_KEY = adminKey("doorstep")

export interface DoorstepVars {
  write: DoorstepWrite
  target: DoorstepTarget
  body?: Record<string, unknown>
}

/**
 * One mutation for a Doorstep section. Every write goes through
 * useAdminMutation, with an Idempotency-Key minted once per action and
 * reused across the step-up retry. A write that needs a fresh 2FA code
 * (always, or for this body: a resolve that lifts a suspension) asks for it
 * BEFORE sending unless a step-up window is open; a 403 STEP_UP_REQUIRED
 * still gets one prompt and one retry. A 202 is "Sent for approval", never
 * "done".
 */
export function useDoorstepMutation({ onDone }: { onDone?: (write: DoorstepWrite, kind: "done" | "approval", data: unknown) => void } = {}) {
  const { me } = useAdmin()
  const last = useRef<DoorstepWrite | null>(null)
  const lastBody = useRef<Record<string, unknown>>({})
  return useAdminMutation<DoorstepVars>({
    request: ({ write, target, body }) => {
      last.current = write
      lastBody.current = body ?? {}
      return doorstepRequest(write, target, body)
    },
    // Called after request(): true ("window open") sends straight away.
    stepUpFirst: () => (last.current !== null && stepUpFor(last.current, lastBody.current) ? stepUpWindowOpen(me.stepUpValidUntil, Date.now()) : true),
    invalidate: [DOORSTEP_KEY],
    successMessage: () => (last.current ? DOORSTEP_WRITES[last.current].done : "Done"),
    errorTitle: "Doorstep action failed",
    onDone: (data, _vars, kind) => {
      if (last.current) onDone?.(last.current, kind, data)
    },
  })
}

class StepUpDismissed extends Error {}

/**
 * A step-up READ (the professional detail, the document queue): sent as it
 * is; a 403 STEP_UP_REQUIRED opens the 2FA prompt and the read goes once
 * more. A dismissed prompt is not an error: `dismissed` is true and
 * `retry()` asks again. Keyed under ["admin", "doorstep", url], so a
 * Doorstep write re-reads it (inside the step-up window, without a prompt).
 */
export function useDoorstepStepUpRead(url: string, { enabled = true }: { enabled?: boolean } = {}) {
  const read = useStepUpRead()
  const q = useQuery({
    queryKey: adminKey("doorstep", url),
    queryFn: async () => {
      const raw = await read(url)
      if (raw === null) throw new StepUpDismissed("dismissed")
      return raw
    },
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const dismissed = q.error instanceof StepUpDismissed
  return {
    raw: q.data,
    isLoading: enabled && q.isLoading,
    dismissed,
    error: q.isError && !dismissed ? adminErrorMessage(q.error, "This could not be loaded.") : null,
    retry: () => void q.refetch(),
  }
}

/** What a step-up read shows when the admin dismissed the 2FA prompt. */
export function StepUpDismissedNote({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="rounded-mo border border-dashed border-mo-strong bg-mo-sunken p-6 text-center">
      <p className="mb-3 text-sm text-mo-body">{what} needs a fresh 2FA code. The read is recorded in the audit trail.</p>
      <button type="button" className={buttonPrimary} onClick={onRetry}>
        Enter the code
      </button>
    </div>
  )
}

/** Does the signed-in admin hold this write's permission? */
export function useMayWrite() {
  const { me } = useAdmin()
  return (write: DoorstepWrite) => can(me, "doorstep", DOORSTEP_WRITES[write].permission)
}

/**
 * The confirm dialog for one Doorstep write: its label, what it does,
 * whether a reason is required (ten characters or more) and whether it
 * needs a fresh 2FA code, all from DOORSTEP_WRITES.
 */
export function DoorstepActionDialog({
  write,
  subject,
  busy,
  onConfirm,
  onClose,
  children,
  canConfirm,
  reasonLabel,
}: {
  write: DoorstepWrite | null
  subject: string | null
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
  children?: React.ReactNode
  canConfirm?: boolean
  reasonLabel?: string
}) {
  const def = write ? DOORSTEP_WRITES[write] : null
  return (
    <ConfirmReasonDialog
      open={write !== null}
      title={def ? `${def.label}${subject ? ` ${subject}` : ""}?` : ""}
      description={def ? def.explain : null}
      confirmLabel={def?.label ?? "Confirm"}
      destructive={def?.destructive ?? false}
      requireReason={def?.reason ?? false}
      reasonLabel={reasonLabel}
      busy={busy}
      canConfirm={canConfirm}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {children}
    </ConfirmReasonDialog>
  )
}

/** A select of fixed values above a queue, with an "all" choice. */
export function ValueFilter({ value, options, onChange, label = "Status", allLabel = "All" }: { value: string; options: readonly string[]; onChange: (v: string) => void; label?: string; allLabel?: string }) {
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

/** "Next page" for a cursor-paged list; "First page" returns to the start. */
export function CursorPager({ cursor, next, onChange }: { cursor: string; next: string; onChange: (cursor: string) => void }) {
  if (!cursor && !next) return null
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" className={buttonSecondary} disabled={!cursor} onClick={() => onChange("")}>
        First page
      </button>
      <button type="button" className={buttonSecondary} disabled={!next} onClick={() => onChange(next)}>
        Next page
      </button>
    </div>
  )
}

export interface FieldSpec {
  key: string
  label: string
  kind?: "text" | "textarea" | "select" | "check" | "date" | "datetime"
  options?: readonly { value: string; label: string }[]
  hint?: string
  placeholder?: string
}

/**
 * A create or edit form driven by field specs: values stay strings and
 * booleans in local state, `check` turns them into the request body or the
 * problems to show, and the write's own explanation (including whether it
 * needs a fresh 2FA code) sits above the submit button.
 */
export function SpecForm({
  write,
  target,
  fields,
  initial,
  check,
  submitLabel,
  onDone,
  resetOnDone = true,
}: {
  write: DoorstepWrite
  target: DoorstepTarget | ((values: FormValues) => DoorstepTarget)
  fields: readonly FieldSpec[]
  initial: FormValues
  check: (values: FormValues) => FormCheck
  submitLabel?: string
  onDone?: () => void
  resetOnDone?: boolean
}) {
  const [values, setValues] = useState<FormValues>(initial)
  const [problems, setProblems] = useState<string[]>([])
  const mutation = useDoorstepMutation({
    onDone: () => {
      if (resetOnDone) setValues(initial)
      onDone?.()
    },
  })
  const def = DOORSTEP_WRITES[write]
  const set = (key: string, value: string | boolean) => setValues((v) => ({ ...v, [key]: value }))

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const result = check(values)
        if (!result.ok) {
          setProblems(result.problems)
          return
        }
        setProblems([])
        mutation.mutate({ write, target: typeof target === "function" ? target(values) : target, body: result.body })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => {
          const value = values[f.key]
          if (f.kind === "check") {
            return <CheckField key={f.key} label={f.label} hint={f.hint} checked={value === true} onChange={(c) => set(f.key, c)} />
          }
          return (
            <div key={f.key} className={f.kind === "textarea" ? "sm:col-span-2 lg:col-span-3" : undefined}>
              <Field label={f.label} hint={f.hint}>
                {(id) =>
                  f.kind === "select" ? (
                    <select id={id} className={inputClass} value={typeof value === "string" ? value : ""} onChange={(e) => set(f.key, e.target.value)}>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === "textarea" ? (
                    <textarea id={id} rows={4} className={inputClass} value={typeof value === "string" ? value : ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                  ) : (
                    <input
                      id={id}
                      type={f.kind === "date" ? "date" : f.kind === "datetime" ? "datetime-local" : "text"}
                      className={inputClass}
                      value={typeof value === "string" ? value : ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )
                }
              </Field>
            </div>
          )
        })}
      </div>
      <FormProblems problems={problems} />
      <p className="text-xs text-mo-body">{def.explain}</p>
      <button type="submit" className={buttonPrimary} disabled={mutation.isPending}>
        {mutation.isPending ? "Working…" : (submitLabel ?? def.label)}
      </button>
    </form>
  )
}

/** A SpecForm in a dialog, for edits opened from a row. */
export function EditDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open={open} title={title} onClose={onClose} size="xl">
      {children}
    </Dialog>
  )
}

/** Show/hide (or open/close) one row with a PATCH of `active`. Rendered only for a holder of the write's permission. */
export function ActiveToggle({ write, target, active, label }: { write: DoorstepWrite; target: DoorstepTarget; active: boolean; label: string }) {
  const mayWrite = useMayWrite()
  const mutation = useDoorstepMutation()
  if (!mayWrite(write)) return null
  return (
    <button
      type="button"
      className={buttonSecondary}
      disabled={mutation.isPending}
      aria-label={`${active ? "Deactivate" : "Activate"} ${label}`}
      onClick={() => mutation.mutate({ write, target, body: { active: !active } })}
    >
      {active ? "Deactivate" : "Activate"}
    </button>
  )
}

/** A short line when the section is read-only for this admin. */
export function ReadOnlyNote({ show, children }: { show: boolean; children: React.ReactNode }) {
  return show ? <p className="mb-3 text-xs text-mo-body">{children}</p> : null
}

/** A segmented control between the areas of one section. */
export function AreaSwitch<A extends string>({ value, areas, onChange, label }: { value: A; areas: readonly { id: A; label: string }[]; onChange: (a: A) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="mb-4 inline-flex flex-wrap gap-1 rounded-mo-sm border border-mo p-1">
      {areas.map((a) => (
        <button key={a.id} type="button" className={`${buttonSecondary} border-0 ${value === a.id ? "bg-mo-raised" : ""}`} aria-pressed={value === a.id} onClick={() => onChange(a.id)}>
          {a.label}
        </button>
      ))}
    </div>
  )
}
