import { forwardRef, useId, useState } from "react"
import { Input } from "./Input"
import { validateEmail } from "./validation"

export interface EmailFieldProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> {
  label?: string
  value: string
  onChange: (value: string) => void
  /** External error (e.g. server-side) — overrides the built-in validator. */
  error?: string | null
  /** Fired on blur with the field's validity. */
  onValidityChange?: (valid: boolean) => void
}

// Reusable, self-validating email field. Built-in validation shows after blur;
// pass `error` to override with a server message. The validator (validateEmail)
// is exported separately so non-UI callers can reuse the same rule.
export const EmailField = forwardRef<HTMLInputElement, EmailFieldProps>(
  ({ label = "Email", value, onChange, error, onValidityChange, id, onBlur, ...props }, ref) => {
    const autoId = useId()
    const fieldId = id ?? autoId
    const [touched, setTouched] = useState(false)
    const message = error !== undefined ? error : touched ? validateEmail(value) : null

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={fieldId} className="text-sm font-medium text-brand-text">
            {label}
          </label>
        )}
        <Input
          {...props}
          ref={ref}
          id={fieldId}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          invalid={!!message}
          aria-describedby={message ? `${fieldId}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            setTouched(true)
            onValidityChange?.(validateEmail(e.target.value) === null)
            onBlur?.(e)
          }}
        />
        {message && (
          <p id={`${fieldId}-error`} className="text-xs text-red-500">
            {message}
          </p>
        )}
      </div>
    )
  },
)
EmailField.displayName = "EmailField"
