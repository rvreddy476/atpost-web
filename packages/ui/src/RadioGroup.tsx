"use client"

import { useId } from "react"
import { cn } from "./cn"
import { FieldShell, useFieldIds } from "./Field"

export interface RadioOption {
  value: string
  label: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
}

export interface RadioGroupProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: RadioOption[]
  description?: React.ReactNode
  error?: string | null
  invalid?: boolean
  /** Lay the options out in a row. Only sensible for two or three short labels. */
  orientation?: "vertical" | "horizontal"
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Native radios in a labelled group — for the small option sets where a Select
 * would hide the choices behind a tap. Each row is a <label>, so the whole
 * card is clickable, and arrow-key roving comes from the platform.
 */
export function RadioGroup({
  label,
  value,
  onChange,
  options,
  description,
  error,
  invalid,
  orientation = "vertical",
  id,
  name,
  required,
  disabled,
  className,
}: RadioGroupProps) {
  const ids = useFieldIds(id, { error, description })
  const autoName = useId()
  const groupName = name ?? autoName
  const isInvalid = invalid ?? !!error

  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      labelAsGroup
      className={className}
    >
      <div
        role="radiogroup"
        aria-labelledby={label ? `${ids.fieldId}-label` : undefined}
        aria-describedby={ids.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-wrap")}
      >
        {options.map((option) => {
          const optionId = `${ids.fieldId}-${option.value}`
          const rowDisabled = disabled || option.disabled
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                value === option.value
                  ? "border-brand-text bg-brand-text/5"
                  : isInvalid
                    ? "border-red-400"
                    : "border-brand-text/15 hover:bg-brand-text/5",
                rowDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={groupName}
                value={option.value}
                checked={value === option.value}
                disabled={rowDisabled}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-current text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight text-brand-text">
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-xs leading-snug text-brand-text/60">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </FieldShell>
  )
}
