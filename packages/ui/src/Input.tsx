import { forwardRef } from "react"
import { cn } from "./cn"

// Ported from postbook-ui src/components/ui/input.tsx. `invalid` toggles the
// error ring so field wrappers (EmailField, DatePicker) can drive styling.
export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex h-10 w-full rounded-xl border bg-brand-card/80 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-brand-text/40 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
          invalid
            ? "border-red-400 focus-visible:ring-red-400"
            : "border-brand-text/20 focus-visible:ring-brand-text/50 focus-visible:border-brand-text/50",
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"
