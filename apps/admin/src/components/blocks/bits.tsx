"use client"

import { useId, useReducer, useState } from "react"
import { Eye, EyeOff, Lock, Search, ShieldCheck, TriangleAlert } from "lucide-react"
import { humanise, shortId } from "@/lib/admin/data"
import { initialReveal, isBlurred, revealReducer } from "@/lib/blocks/reveal"
import { adminErrorMessage } from "@/lib/admin/mutation"
import { buttonPrimary, buttonSecondary, inputClass } from "./buttons"

/** A labelled form control. */
export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: (id: string) => React.ReactNode }) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold text-mo-ink">
        {label}
      </label>
      {children(id)}
      {hint ? <div className="text-xs text-mo-body">{hint}</div> : null}
    </div>
  )
}

/** An id shortened for a dense table, the full id in the tooltip. */
export function IdText({ id }: { id: unknown }) {
  return (
    <span className="font-mo-mono text-xs" title={typeof id === "string" ? id : undefined}>
      {shortId(id)}
    </span>
  )
}

const PILL: Record<string, string> = {
  bad: "border-mo-bad/50 text-mo-bad",
  warn: "border-mo-warn/50 text-mo-warn",
  good: "border-mo-good/50 text-mo-good",
  normal: "border-mo-strong text-mo-body",
}

export function StatusPill({ value, tone = "normal" }: { value: unknown; tone?: keyof typeof PILL }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${PILL[tone]}`}>{humanise(value)}</span>
}

/** A section's inline error with a retry. */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 rounded-mo border border-mo-bad/40 bg-mo-bad/10 p-3 text-sm text-mo-bad">
      <TriangleAlert className="h-4 w-4" aria-hidden="true" /> {message}
      {onRetry ? (
        <button type="button" className={buttonSecondary} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </p>
  )
}

export function Loading({ what = "Loading…" }: { what?: string }) {
  return (
    <p role="status" className="p-4 text-sm text-mo-body">
      {what}
    </p>
  )
}

/** A panel saying a read needs a fresh 2FA code, with the button that asks for one. */
export function StepUpPrompt({ message, onConfirm }: { message: string; onConfirm: () => void }) {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-6 text-center">
      <p className="mb-3 text-sm text-mo-body">{message}</p>
      <button type="button" className={buttonPrimary} onClick={onConfirm}>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Confirm with 2FA
      </button>
    </div>
  )
}

/** One text box and a button: look something up by id. */
export function LookupForm({
  label,
  placeholder,
  button = "Look up",
  validate,
  onSubmit,
}: {
  label: string
  placeholder?: string
  button?: string
  validate?: (value: string) => string | null
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const v = value.trim()
        const problem = validate?.(v) ?? (v ? null : "Enter a value.")
        setError(problem)
        if (!problem) onSubmit(v)
      }}
    >
      <div className="min-w-[16rem] flex-1 space-y-1">
        <label htmlFor={id} className="block text-sm font-semibold text-mo-ink">
          {label}
        </label>
        <input id={id} className={inputClass} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
      </div>
      <button type="submit" className={buttonSecondary}>
        <Search className="h-4 w-4" aria-hidden="true" /> {button}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-mo-bad">
          {error}
        </p>
      ) : null}
    </form>
  )
}

/**
 * Sensitive data that is not a document — a panic location, rider KYC —
 * behind the same reveal pattern as the document viewer. `onReveal` runs the
 * audited read (with its step-up); only a resolved answer is shown, a dismissed
 * 2FA prompt leaves it hidden, and "Hide" drops the data from the page.
 */
export function RevealGate<T>({
  title,
  note = "Revealing it is recorded in the audit trail and needs a fresh 2FA code.",
  onReveal,
  children,
}: {
  title: string
  note?: string
  onReveal: () => Promise<T | null>
  children: (data: T) => React.ReactNode
}) {
  const [state, dispatch] = useReducer(revealReducer, true, initialReveal)
  const [data, setData] = useState<T | null>(null)

  const reveal = async () => {
    if (state.status === "revealing") return
    dispatch({ type: "request" })
    try {
      const result = await onReveal()
      setData(result)
      dispatch({ type: "resolved", revealed: result !== null })
    } catch (err) {
      dispatch({ type: "failed", error: adminErrorMessage(err, "It could not be revealed.") })
    }
  }

  if (!isBlurred(state) && data !== null) {
    return (
      <div className="rounded-mo border border-mo bg-mo-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-mo-ink">{title}</h3>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              setData(null)
              dispatch({ type: "hide" })
            }}
          >
            <EyeOff className="h-4 w-4" aria-hidden="true" /> Hide
          </button>
        </div>
        {children(data)}
      </div>
    )
  }

  return (
    <div className="rounded-mo border border-dashed border-mo-strong bg-mo-sunken p-6 text-center" data-blurred="true">
      <Lock className="mx-auto mb-2 h-6 w-6 text-mo-body" aria-hidden="true" />
      <p className="text-sm text-mo-ink">{title}</p>
      <p className="mb-3 text-xs text-mo-body">{note}</p>
      <button type="button" className={buttonPrimary} onClick={() => void reveal()} disabled={state.status === "revealing"}>
        <Eye className="h-4 w-4" aria-hidden="true" />
        {state.status === "revealing" ? "Revealing…" : "Reveal"}
      </button>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-mo-bad">
          {state.error}
        </p>
      ) : null}
    </div>
  )
}

/** Key–value pairs for a detail view. */
export function Details({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-mo-body">{k}</dt>
          <dd className="break-words text-mo-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The small "N more / previous" control for offset-paged routes. */
export function OffsetPager({
  offset,
  limit,
  count,
  onChange,
}: {
  offset: number
  limit: number
  count: number
  onChange: (offset: number) => void
}) {
  if (offset === 0 && count < limit) return null
  return (
    <div className="mt-2 flex items-center justify-end gap-2 text-sm text-mo-body">
      <span>
        Rows {count === 0 ? 0 : offset + 1}–{offset + count}
      </span>
      <button type="button" className={buttonSecondary} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        Previous
      </button>
      <button type="button" className={buttonSecondary} disabled={count < limit} onClick={() => onChange(offset + limit)}>
        Next
      </button>
    </div>
  )
}
