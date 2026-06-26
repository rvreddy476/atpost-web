import { forwardRef } from "react"
import { cn } from "./cn"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
}

// Ported from postbook-ui src/components/ui/button.tsx so existing usages are a
// drop-in import swap (@/components/ui/button → @atpost/ui).
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default: "bg-brand-text text-brand-card hover:opacity-90 shadow-sm",
      secondary: "bg-brand-text/10 text-brand-text hover:bg-brand-text/20",
      outline: "border border-brand-text/20 bg-transparent text-brand-text hover:bg-brand-text/5",
      ghost: "bg-transparent text-brand-text hover:bg-brand-text/5",
      destructive: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
    }
    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      sm: "h-8 px-3 text-xs gap-1",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-base gap-2",
    }
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"
