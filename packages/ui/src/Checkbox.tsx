"use client"

import { forwardRef } from "react"
import { cn } from "./cn"
import { useFieldIds } from "./Field"

export interface CheckboxProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "checked"> {
  label: React.ReactNode
  /** Secondary line under the label. Part of the clickable row. */
  description?: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string | null
}

/**
 * A real <input type="checkbox"> inside a <label>, so the whole row — box,
 * label and description — is clickable and focusable for free.
 *
 * The description sits inside the label rather than behind `aria-describedby`:
 * a row that reads as one thing to a mouse should read as one thing to a
 * screen reader too. `aria-describedby` is reserved for the error.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, checked, onChange, error, id, disabled, className, ...props }, ref) => {
    const ids = useFieldIds(id, { error })

    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <label
          htmlFor={ids.fieldId}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
            error ? "border-red-400" : "border-brand-text/15 hover:bg-brand-text/5",
            disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
          )}
        >
          <input
            {...props}
            ref={ref}
            id={ids.fieldId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-invalid={!!error || undefined}
            aria-describedby={ids.describedBy}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-text/30 text-brand-text accent-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-tight text-brand-text">{label}</span>
            {description && (
              <span className="text-xs leading-snug text-brand-text/60">{description}</span>
            )}
          </span>
        </label>
        {error && (
          <p id={ids.errorId} className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    )
  },
)
Checkbox.displayName = "Checkbox"
