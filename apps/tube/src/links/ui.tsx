"use client"

/**
 * The few shapes the three sections share.
 *
 * Deliberately small, and deliberately NOT `@atpost/ui`'s `Input`/`FieldShell`.
 * Those are the shop's form controls: they render through the `--brand-*`
 * contract, they carry their own label/description/error scaffolding sized for
 * a checkout form, and they would put a second visual language on a screen
 * that lives inside Tube's own shell. This is four elements' worth of markup
 * in Tube's own token vocabulary — `mo-surface`, `mo-line`, the one focus ring
 * — which is cheaper than the drift.
 *
 * What is NOT re-invented here is anything with behaviour. There is no button
 * component, no dialog, no toast: the sections use plain elements, and the one
 * thing with real interaction — the video picker — is its own file.
 */

import type { ReactNode } from "react"

/** A titled block with a sentence under it. Every section is one. */
export function Section({
  id,
  title,
  intro,
  aside,
  children,
}: {
  id: string
  title: string
  intro: string
  /** Drawn at the right of the heading — a count, a dirty mark. */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-mo border border-mo bg-mo-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2
          id={`${id}-heading`}
          className="font-mo-display text-[15px] font-semibold tracking-mo-display text-mo-ink"
        >
          {title}
        </h2>
        {aside}
      </div>
      <p className="mt-1 max-w-2xl text-[13px] text-mo-body">{intro}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/**
 * A labelled text input.
 *
 * The label is a real `<label>` bound by id rather than a placeholder, because
 * a placeholder disappears the moment somebody types and a creator coming back
 * to a half-filled form then has three unlabelled boxes. `problem` is wired
 * through `aria-describedby` and `aria-invalid` so it is announced rather than
 * merely coloured.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  problem,
  hint,
  maxLength,
  inputMode,
  width,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  problem?: string | null
  hint?: string
  maxLength?: number
  inputMode?: "text" | "numeric"
  width?: string
}) {
  const describedBy = problem ? `${id}-problem` : hint ? `${id}-hint` : undefined
  return (
    <div className={width ?? "w-full"}>
      <label htmlFor={id} className="block text-[12px] font-semibold text-mo-body">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1 w-full rounded-mo border bg-mo-surface px-3 py-2 text-[14px] text-mo-ink outline-none transition-colors duration-150 ease-mo placeholder:text-mo-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo ${
          problem ? "border-mo-bad" : "border-mo hover:border-mo-strong"
        }`}
      />
      {problem ? (
        <p id={`${id}-problem`} className="mt-1 text-[12px] text-mo-bad">
          {problem}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[12px] text-mo-body">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** A note the creator has to read — a limit, or something that cannot be done. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "bad"
  children: ReactNode
}) {
  const border =
    tone === "bad" ? "border-mo-bad/60" : tone === "warn" ? "border-mo-warn/60" : "border-mo"
  const ink = tone === "bad" ? "text-mo-bad" : tone === "warn" ? "text-mo-warn" : "text-mo-body"
  return (
    <p className={`rounded-mo border ${border} bg-mo-sunken px-3 py-2 text-[12px] ${ink}`}>
      {children}
    </p>
  )
}

/** The one button shape this editor uses, in two weights. */
export function Action({
  onClick,
  children,
  variant = "quiet",
  disabled,
  type = "button",
  label,
}: {
  onClick?: () => void
  children: ReactNode
  variant?: "primary" | "quiet"
  disabled?: boolean
  type?: "button" | "submit"
  label?: string
}) {
  const base =
    "rounded-mo-pill px-4 py-2 text-[13px] font-semibold transition-colors duration-150 ease-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo disabled:cursor-not-allowed disabled:opacity-50"
  const skin =
    variant === "primary"
      ? "bg-mo-ember text-mo-on-primary shadow-mo-ember hover:bg-mo-ember-hover"
      : "border border-mo-strong text-mo-cyan hover:bg-mo-raised"
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${base} ${skin}`}
    >
      {children}
    </button>
  )
}
