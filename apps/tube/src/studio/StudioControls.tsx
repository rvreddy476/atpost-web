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

import { useCallback, useId, useState } from "react"
import { X } from "lucide-react"

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

/* ── A chip input ─────────────────────────────────────────────────────────── */

/**
 * A list of short values, entered one at a time. Tags, hashtags, mentions.
 *
 * ── Enter, comma, and blur all commit ─────────────────────────────────────
 * People separate a list with commas because that is what a list looks like,
 * and they walk away from a half-typed entry because they think they have
 * finished. Committing on blur is the one that matters: a tag left in the box
 * when somebody clicks Continue is a tag they meant to add, and dropping it is
 * a loss nobody notices until the video has no tags.
 *
 * ── `normalise` returns null for "the server would refuse this" ───────────
 * Not "clean it up". For hashtags and mentions the server refuses the WHOLE
 * create over one bad entry, so quietly stripping the characters it dislikes
 * would put a word on somebody's video that they did not write. A rejected
 * entry stays in the box, with `rejection` under it, where it can be fixed.
 *
 * ── The chips are a real list and the removes are real buttons ────────────
 * A `<ul>` so a screen reader says how many there are, and a labelled button
 * per chip so each one can be removed from a keyboard. The counter is in the
 * field's own hint, which `StudioField` ties to the input with
 * `aria-describedby`.
 */
export function StudioChipInput({
  label,
  description,
  placeholder,
  values,
  max,
  onChange,
  normalise,
  rejection,
  error,
  prefix,
}: {
  label: string
  description?: string
  placeholder?: string
  values: string[]
  max: number
  onChange: (next: string[]) => void
  /** The stored form, or null when the server would not take it. */
  normalise: (raw: string) => string | null
  /** What to say about an entry `normalise` refused. */
  rejection: string
  error?: string | null
  /** Drawn on the chip, not stored — the `#` and `@` people expect to see. */
  prefix?: string
}) {
  const [entry, setEntry] = useState("")
  const [refused, setRefused] = useState(false)
  const full = values.length >= max

  const commit = useCallback(
    (raw: string): boolean => {
      const trimmed = raw.trim()
      if (!trimmed) return true
      if (full) return false
      const value = normalise(trimmed)
      if (value === null) return false
      if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return true
      onChange([...values, value])
      return true
    },
    [full, normalise, onChange, values]
  )

  const commitAndClear = useCallback(
    (raw: string) => {
      if (commit(raw)) {
        setEntry("")
        setRefused(false)
      } else {
        setRefused(true)
      }
    },
    [commit]
  )

  return (
    <StudioField
      label={label}
      hint={`${values.length}/${max}`}
      error={error ?? (refused ? rejection : null)}
      description={description}
    >
      {({ id, describedBy }) => (
        <div>
          {values.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {values.map((value) => (
                <li key={value}>
                  <span className="inline-flex items-center gap-1.5 rounded-mo-pill border border-mo bg-mo-raised py-1 pl-3 pr-1.5 text-xs text-mo-ink">
                    {prefix ? <span aria-hidden className="text-mo-body">{prefix}</span> : null}
                    {value}
                    <button
                      type="button"
                      aria-label={`Remove ${prefix ?? ""}${value}`}
                      className="rounded-mo-pill p-0.5 text-mo-body transition-colors duration-150 ease-mo hover:text-mo-ink"
                      onClick={() => onChange(values.filter((v) => v !== value))}
                    >
                      <X aria-hidden className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={refused || Boolean(error) ? true : undefined}
            className={studioInputClass}
            value={entry}
            disabled={full}
            placeholder={full ? "That's the limit" : placeholder}
            onChange={(e) => {
              const value = e.target.value
              if (value.includes(",")) {
                let ok = true
                let leftover = ""
                for (const part of value.split(",")) {
                  if (!part.trim()) continue
                  if (!commit(part)) {
                    ok = false
                    leftover = part.trim()
                  }
                }
                setEntry(leftover)
                setRefused(!ok)
                return
              }
              setEntry(value)
              setRefused(false)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitAndClear(entry)
              } else if (e.key === "Backspace" && entry === "" && values.length > 0) {
                onChange(values.slice(0, -1))
              }
            }}
            onBlur={() => commitAndClear(entry)}
          />
        </div>
      )}
    </StudioField>
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
