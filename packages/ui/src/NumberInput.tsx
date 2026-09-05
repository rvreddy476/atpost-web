"use client"

import { forwardRef, useEffect, useState } from "react"
import { cn } from "./cn"
import { FieldShell, controlBorder, controlSurface, useFieldIds } from "./Field"

export interface NumberInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "value" | "min" | "max" | "step"> {
  label?: string
  /** `null` means the field is empty — distinct from 0, which is an answer. */
  value: number | null
  onChange: (value: number | null) => void
  /** `integer` refuses a decimal point outright; `decimal` allows one. */
  mode?: "integer" | "decimal"
  min?: number
  max?: number
  step?: number
  /** Right-hand slot for a measure field's unit — a string, or a <Select>. */
  unit?: React.ReactNode
  description?: React.ReactNode
  error?: string | null
  invalid?: boolean
}

const INTEGER_TEXT = /^-?\d*$/
const DECIMAL_TEXT = /^-?\d*(?:\.\d*)?$/

/**
 * A number field that keeps its own text while the seller types.
 *
 * The native `type="number"` is deliberately avoided: it silently drops what it
 * cannot parse, so a half-typed "1." or "-" vanishes mid-keystroke, and its
 * scroll-wheel stepping changes prices by accident. This holds the raw text,
 * reports the parsed number (or `null`) upward, and only reformats when the
 * value changes from outside.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      label,
      value,
      onChange,
      mode = "decimal",
      min,
      max,
      step,
      unit,
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
    const [text, setText] = useState(value === null ? "" : String(value))

    // Re-sync only when the outside value genuinely differs from what the text
    // already means — otherwise typing "1." would be rewritten to "1" instantly.
    useEffect(() => {
      const parsed = text.trim() === "" ? null : Number(text)
      const current = Number.isNaN(parsed as number) ? null : parsed
      if (current !== value) setText(value === null ? "" : String(value))
      // `text` is intentionally not a dependency: this effect exists to react to
      // the incoming value, not to the seller's own keystrokes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    function handleText(next: string) {
      const pattern = mode === "integer" ? INTEGER_TEXT : DECIMAL_TEXT
      if (next !== "" && !pattern.test(next)) return
      setText(next)
      if (next.trim() === "" || next === "-" || next === "." || next === "-.") {
        onChange(null)
        return
      }
      const parsed = Number(next)
      onChange(Number.isFinite(parsed) ? parsed : null)
    }

    function nudge(direction: 1 | -1) {
      const delta = step ?? 1
      const base = value ?? 0
      let next = base + direction * delta
      if (min !== undefined) next = Math.max(min, next)
      if (max !== undefined) next = Math.min(max, next)
      // Round off the float tail that adding 0.1 to 0.2 leaves behind.
      const decimals = (String(delta).split(".")[1] ?? "").length
      next = Number(next.toFixed(decimals))
      setText(String(next))
      onChange(next)
    }

    return (
      <FieldShell
        ids={ids}
        label={label}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
      >
        <div
          className={cn(
            controlSurface,
            controlBorder(isInvalid),
            "flex h-10 items-stretch overflow-hidden focus-within:ring-2",
            isInvalid ? "focus-within:ring-red-400" : "focus-within:ring-brand-text/50",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          <input
            {...props}
            ref={ref}
            id={ids.fieldId}
            type="text"
            inputMode={mode === "integer" ? "numeric" : "decimal"}
            autoComplete="off"
            value={text}
            required={required}
            disabled={disabled}
            aria-invalid={isInvalid || undefined}
            aria-describedby={ids.describedBy}
            // The control is text, but assistive tech should still announce the bounds.
            role="spinbutton"
            aria-valuenow={value ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            onChange={(e) => handleText(e.target.value)}
            onKeyDown={(e) => {
              if (disabled) return
              if (e.key === "ArrowUp") {
                e.preventDefault()
                nudge(1)
              } else if (e.key === "ArrowDown") {
                e.preventDefault()
                nudge(-1)
              }
            }}
            className="min-w-0 flex-1 bg-transparent px-3 text-sm text-brand-text placeholder:text-brand-text/40 focus-visible:outline-none"
          />
          {unit && (
            <span className="flex shrink-0 items-center border-l border-brand-text/15 bg-brand-text/5 px-3 text-xs text-brand-text/70">
              {unit}
            </span>
          )}
        </div>
      </FieldShell>
    )
  },
)
NumberInput.displayName = "NumberInput"
