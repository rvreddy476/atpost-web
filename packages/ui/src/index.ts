// @atpost/ui — shared design system. Import from here in every app:
//   import { Button, EmailField, DatePicker, validateEmail } from "@atpost/ui"
// Next.js apps must add `transpilePackages: ["@atpost/ui"]` (the package ships
// source TSX, no build step).
export { cn } from "./cn"
export type { ClassValue } from "./cn"
export { validateEmail, validateRequired } from "./validation"
export type { ValidationResult } from "./validation"
export { Button } from "./Button"
export type { ButtonProps } from "./Button"
export { Input } from "./Input"
export type { InputProps } from "./Input"
export { EmailField } from "./EmailField"
export type { EmailFieldProps } from "./EmailField"
export { DatePicker } from "./DatePicker"
export type { DatePickerProps } from "./DatePicker"
// Additional primitives ported from postbook-ui src/components/ui (self-contained).
export * from "./dob-picker"      // DobPicker + validateDob
export * from "./StarRating"      // StarRating
export * from "./skeleton"        // Skeleton
export * from "./card"            // Card, CardHeader, CardTitle, CardContent
export * from "./dialog"          // Dialog
export * from "./MessageToast"    // MessageToastContent
