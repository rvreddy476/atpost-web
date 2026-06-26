import { forwardRef, useId } from "react"
import { Input } from "./Input"

export interface DatePickerProps
  extends Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> {
  label?: string
  /** ISO date string, "yyyy-mm-dd". */
  value: string
  onChange: (value: string) => void
  error?: string | null
}

// Dependency-free date field built on the native date input (accessible, mobile
// pickers for free). Swap the inner control for a custom calendar later without
// changing this component's API.
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ label, value, onChange, error, id, ...props }, ref) => {
    const autoId = useId()
    const fieldId = id ?? autoId
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
          type="date"
          value={value}
          invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {error && (
          <p id={`${fieldId}-error`} className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DatePicker.displayName = "DatePicker"
