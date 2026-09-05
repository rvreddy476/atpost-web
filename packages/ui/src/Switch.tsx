"use client"

import { forwardRef } from "react"
import { cn } from "./cn"
import { useFieldIds } from "./Field"

export interface SwitchProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "checked"> {
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string | null
}

/**
 * Same contract as Checkbox, drawn as a track and knob for the settings-style
 * rows. Still a real checkbox underneath (with `role="switch"`), so the label
 * click, the space key and form reset all behave without a line of JS.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, checked, onChange, error, id, disabled, className, ...props }, ref) => {
    const ids = useFieldIds(id, { error })

    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <label
          htmlFor={ids.fieldId}
          className={cn(
            "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
            error ? "border-red-400" : "border-brand-text/15 hover:bg-brand-text/5",
            disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
          )}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-tight text-brand-text">{label}</span>
            {description && (
              <span className="text-xs leading-snug text-brand-text/60">{description}</span>
            )}
          </span>
          <span className="relative inline-flex shrink-0">
            <input
              {...props}
              ref={ref}
              id={ids.fieldId}
              type="checkbox"
              role="switch"
              checked={checked}
              disabled={disabled}
              aria-invalid={!!error || undefined}
              aria-describedby={ids.describedBy}
              onChange={(e) => onChange(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "h-6 w-11 rounded-full border transition-colors",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-text/50",
                checked ? "border-brand-text bg-brand-text" : "border-brand-text/25 bg-brand-text/10",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-1 h-4 w-4 rounded-full bg-brand-card shadow transition-all",
                checked ? "left-6" : "left-1",
              )}
            />
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
Switch.displayName = "Switch"
