"use client"

import { useId } from "react"
import { cn } from "./cn"

/**
 * The label / description / error scaffolding every field in this package
 * shares, extracted from EmailField so the eleven controls added for the
 * category-driven listing form wire `aria-describedby` identically instead of
 * each inventing its own id scheme.
 */
export interface FieldIds {
  fieldId: string
  errorId: string
  descriptionId: string
  /** Pass straight to the control; undefined when there is nothing to point at. */
  describedBy: string | undefined
}

export function useFieldIds(
  id: string | undefined,
  opts: { error?: string | null; description?: React.ReactNode } = {},
): FieldIds {
  const autoId = useId()
  const fieldId = id ?? autoId
  const errorId = `${fieldId}-error`
  const descriptionId = `${fieldId}-description`
  const parts: string[] = []
  if (opts.description) parts.push(descriptionId)
  if (opts.error) parts.push(errorId)
  return {
    fieldId,
    errorId,
    descriptionId,
    describedBy: parts.length > 0 ? parts.join(" ") : undefined,
  }
}

export interface FieldShellProps {
  ids: FieldIds
  label?: React.ReactNode
  description?: React.ReactNode
  error?: string | null
  required?: boolean
  disabled?: boolean
  className?: string
  /** Renders the label as a plain <span> — for controls with no single focusable target. */
  labelAsGroup?: boolean
  children: React.ReactNode
}

export function FieldShell({
  ids,
  label,
  description,
  error,
  required,
  disabled,
  className,
  labelAsGroup,
  children,
}: FieldShellProps) {
  const labelContent = (
    <>
      {label}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-red-500">
          *
        </span>
      )}
    </>
  )
  const labelClass = cn(
    "text-sm font-medium text-brand-text",
    disabled && "opacity-50",
  )

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label &&
        (labelAsGroup ? (
          <span id={`${ids.fieldId}-label`} className={labelClass}>
            {labelContent}
          </span>
        ) : (
          <label htmlFor={ids.fieldId} className={labelClass}>
            {labelContent}
          </label>
        ))}
      {children}
      {description && (
        <p id={ids.descriptionId} className="text-xs text-brand-text/60">
          {description}
        </p>
      )}
      {error && (
        <p id={ids.errorId} className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}

/** The border/ring treatment Input uses, so every control matches it exactly. */
export const controlSurface =
  "w-full rounded-xl border bg-brand-card/80 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"

export function controlBorder(invalid: boolean | undefined): string {
  return invalid
    ? "border-red-400 focus-visible:ring-red-400"
    : "border-brand-text/20 focus-visible:ring-brand-text/50 focus-visible:border-brand-text/50"
}
