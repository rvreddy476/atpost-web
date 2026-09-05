"use client"

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { cn } from "./cn"
import { FieldShell, controlBorder, controlSurface, useFieldIds } from "./Field"

export interface TextareaProps
  extends Omit<React.ComponentProps<"textarea">, "onChange" | "value" | "rows"> {
  label?: string
  value: string
  onChange: (value: string) => void
  description?: React.ReactNode
  error?: string | null
  invalid?: boolean
  /** Starting height, in rows. The field grows past it as the seller types. */
  minRows?: number
  /** Height ceiling, in rows; past it the field scrolls instead of growing. */
  maxRows?: number
  /** Shows "123 / 500" under the field. Turns red once the limit is passed. */
  showCounter?: boolean
}

// useLayoutEffect measures before paint, which is what this needs — but it warns
// during SSR, where there is nothing to measure. Pick once, at module scope.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const LINE_HEIGHT_PX = 20
const VERTICAL_PADDING_PX = 16

/**
 * Auto-growing textarea. Height is set from `scrollHeight` on every change
 * rather than from the character count — the count has no idea how the text
 * wrapped.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      value,
      onChange,
      description,
      error,
      invalid,
      minRows = 3,
      maxRows = 12,
      showCounter,
      maxLength,
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
    const innerRef = useRef<HTMLTextAreaElement | null>(null)

    const resize = useCallback(() => {
      const el = innerRef.current
      if (!el) return
      const min = minRows * LINE_HEIGHT_PX + VERTICAL_PADDING_PX
      const max = maxRows * LINE_HEIGHT_PX + VERTICAL_PADDING_PX
      // Collapse first, or scrollHeight only ever reports the height we already set.
      el.style.height = "auto"
      const next = Math.min(Math.max(el.scrollHeight, min), max)
      el.style.height = `${next}px`
      el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden"
    }, [minRows, maxRows])

    // Sized before paint, so a value restored from a draft does not snap taller
    // a frame after it appears.
    useIsomorphicLayoutEffect(resize, [resize, value])

    const overLimit = maxLength !== undefined && value.length > maxLength

    return (
      <FieldShell
        ids={ids}
        label={label}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
      >
        <textarea
          {...props}
          ref={(node) => {
            innerRef.current = node
            if (typeof ref === "function") ref(node)
            else if (ref) ref.current = node
          }}
          id={ids.fieldId}
          value={value}
          rows={minRows}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={ids.describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            controlSurface,
            controlBorder(isInvalid),
            "resize-none px-3 py-2 leading-5 text-brand-text placeholder:text-brand-text/40",
            className,
          )}
        />
        {showCounter && (
          <p
            className={cn(
              "text-right text-[11px] tabular-nums",
              overLimit ? "text-red-500" : "text-brand-text/50",
            )}
          >
            {value.length}
            {maxLength !== undefined && ` / ${maxLength}`}
          </p>
        )}
      </FieldShell>
    )
  },
)
Textarea.displayName = "Textarea"
