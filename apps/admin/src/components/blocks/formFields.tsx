"use client"

import { Field } from "./bits"
import { inputClass } from "./buttons"

/**
 * Small controlled fields for the console's create/edit forms (coupons, bank
 * offers): every value is a string or a boolean in the form's own state, and
 * the form's check function turns them into the request body.
 */

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
  type = "text",
  inputMode,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: React.ReactNode
  disabled?: boolean
  type?: "text" | "date"
  inputMode?: "text" | "decimal" | "numeric"
  maxLength?: number
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type={type}
          className={inputClass}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function TextAreaField({ label, value, onChange, placeholder, hint, disabled, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: React.ReactNode; disabled?: boolean; rows?: number }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} rows={rows} className={inputClass} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

/** A select over a fixed list of options, which the caller passes already in reading order. */
export function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: string
  value: V
  options: readonly { value: V; label: string }[]
  onChange: (value: V) => void
  hint?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select
          id={id}
          className={inputClass}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const next = options.find((o) => o.value === e.target.value)
            if (next) onChange(next.value)
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-mo-ink">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-mo-body">{hint}</span> : null}
      </span>
    </label>
  )
}

/** Problems from a form check, shown above its submit button. */
export function FormProblems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null
  return (
    <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-mo-bad">
      {problems.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  )
}

/** A bordered panel with a title and an optional note. */
export function FormPanel({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label={title}>
      <h2 className="text-sm font-semibold text-mo-ink">{title}</h2>
      {note ? <p className="mb-3 text-xs text-mo-body">{note}</p> : <div className="mb-3" />}
      {children}
    </section>
  )
}
