"use client"

import { forwardRef } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "./cn"
import { FieldShell, controlBorder, controlSurface, useFieldIds } from "./Field"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<React.ComponentProps<"select">, "onChange" | "value" | "children"> {
  label?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Rendered as a disabled, selected-when-empty first option. */
  placeholder?: string
  description?: React.ReactNode
  error?: string | null
  invalid?: boolean
}

/**
 * A native <select> wearing Input's clothes. Native on purpose: it gets the
 * platform's own picker on a phone, keyboard type-ahead on a desktop, and needs
 * no listbox of our own to keep accessible.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      value,
      onChange,
      options,
      placeholder,
      description,
      error,
      invalid,
      id,
      required,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    const ids = useFieldIds(id, { error, description })
    const isInvalid = invalid ?? !!error

    return (
      <FieldShell
        ids={ids}
        label={label}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
      >
        <div className="relative">
          <select
            {...props}
            ref={ref}
            id={ids.fieldId}
            value={value}
            required={required}
            disabled={disabled}
            aria-invalid={isInvalid || undefined}
            aria-describedby={ids.describedBy}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              controlSurface,
              controlBorder(isInvalid),
              "h-10 appearance-none py-2 pl-3 pr-9",
              value === "" && placeholder ? "text-brand-text/40" : "text-brand-text",
              className,
            )}
          >
            {placeholder && (
              <option value="" disabled={required}>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text/40"
          />
        </div>
      </FieldShell>
    )
  },
)
Select.displayName = "Select"
