"use client"

/**
 * The form primitives the studio's three steps share.
 *
 * ── Why not @atpost/ui ────────────────────────────────────────────────────
 * The package is real and its controls do land in this theme — tokens.css
 * points every `--brand-*` at a Momentum value for exactly that reason. They
 * are not used here because this zone is not drawn in that vocabulary: every
 * other surface in apps/tube — the browse grid, the watch page, the channel
 * page, the rail — is `mo-*` classes on bare elements, and a settings step
 * built out of `rounded-xl bg-brand-card/80` controls sits visibly half an
 * inch outside the app it is in. The tokens file even records the specific
 * mismatch: its note on `--brand-text` says the shared Button's default
 * variant "uses the type colour as a background", which is a light pill in a
 * dark app.
 *
 * These are deliberately thin — a label, a control, a note, and the
 * `aria-describedby` wiring between them. Anything more belongs in the
 * package rather than here.
 */

import { useId } from "react"

/* ── One labelled control ─────────────────────────────────────────────────── */

export const studioInputClass =
  "w-full rounded-mo border border-mo bg-mo-raised px-3 py-2 text-sm text-mo-ink placeholder:text-mo-muted-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mo disabled:opacity-50"

export function StudioField({
  label,
  hint,
  error,
  description,
  children,
}: {
  label: string
  /** The right-hand counter, e.g. "42/100". */
  hint?: string
  error?: string | null
  description?: string
  children: (props: { id: string; describedBy: string | undefined }) => React.ReactNode
}) {
  const id = useId()
  const describeId = `${id}-note`
  const note = error ?? description
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-mo-ink">
          {label}
        </label>
        {hint ? (
          <span className="text-xs tabular-nums text-mo-body" aria-hidden>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5">{children({ id, describedBy: note ? describeId : undefined })}</div>
      {note ? (
        <p
          id={describeId}
          className={`mt-1 text-xs ${error ? "text-mo-bad" : "text-mo-body"}`}
          role={error ? "alert" : undefined}
        >
          {note}
        </p>
      ) : null}
    </div>
  )
}

/* ── A switch row ─────────────────────────────────────────────────────────── */

/**
 * A real `<input type="checkbox" role="switch">` under a drawn track.
 *
 * The native input is what makes the label click, the space key, focus order
 * and every assistive technology work without a line of JavaScript. Drawing a
 * `<div>` with an `onClick` is how a settings page becomes unusable from a
 * keyboard, and a compliance page that cannot be operated from a keyboard is
 * one somebody will fill in wrongly.
 */
export function StudioSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm text-mo-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-mo-body">{description}</span>
        ) : null}
      </label>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={`h-6 w-11 rounded-mo-pill border transition-colors duration-150 ease-mo peer-focus-visible:ring-2 peer-focus-visible:ring-mo ${
            checked ? "border-mo-strong bg-mo-cyan/30" : "border-mo bg-mo-raised"
          }`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1 h-4 w-4 rounded-mo-pill bg-mo-ink transition-all duration-150 ease-mo ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </div>
  )
}

/* ── A radio group ────────────────────────────────────────────────────────── */

export interface StudioChoice<T extends string> {
  value: T
  label: string
  hint?: string
}

/**
 * A fieldset of radios. Used for the audience and the two declarations that
 * have no safe default.
 *
 * `<fieldset>` + `<legend>` rather than a heading and a div: it is what makes
 * a screen reader announce "Made for children, radio group" before the
 * options, so the question is heard before the answers. On a compliance
 * question that is the difference between an informed answer and a guess.
 */
export function StudioRadioGroup<T extends string>({
  legend,
  description,
  options,
  value,
  onChange,
  error,
}: {
  legend: string
  description?: string
  options: readonly StudioChoice<T>[]
  value: T | null
  onChange: (next: T) => void
  error?: string | null
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-mo-ink">{legend}</legend>
      {description ? <p className="mt-1 text-xs text-mo-body">{description}</p> : null}
      <div className="mt-2 space-y-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-mo px-2 py-2 transition-colors duration-150 ease-mo hover:bg-mo-raised"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-current text-mo-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mo"
            />
            <span className="min-w-0">
              <span className="block text-sm text-mo-ink">{option.label}</span>
              {option.hint ? (
                <span className="block text-xs text-mo-body">{option.hint}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-mo-bad">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

/* ── A titled card ────────────────────────────────────────────────────────── */

export function StudioCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-mo border border-mo bg-mo-surface p-5 shadow-mo">
      <h3 className="font-mo-display text-sm uppercase tracking-mo-eyebrow text-mo-body">
        {title}
      </h3>
      {description ? <p className="mt-1 text-xs text-mo-body">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}
