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
