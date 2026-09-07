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

// Field scaffolding — label, description, error and aria-describedby wiring
// shared by every control below.
export { FieldShell, useFieldIds, controlSurface, controlBorder } from "./Field"
export type { FieldIds, FieldShellProps } from "./Field"

// Form controls for the category-driven listing form.
export { Select } from "./Select"
export type { SelectProps, SelectOption } from "./Select"
export { MultiSelect } from "./MultiSelect"
export type { MultiSelectProps } from "./MultiSelect"
export { Checkbox } from "./Checkbox"
export type { CheckboxProps } from "./Checkbox"
export { Switch } from "./Switch"
export type { SwitchProps } from "./Switch"
export { Textarea } from "./Textarea"
export type { TextareaProps } from "./Textarea"
export { NumberInput } from "./NumberInput"
export type { NumberInputProps } from "./NumberInput"
export { RadioGroup } from "./RadioGroup"
export type { RadioGroupProps, RadioOption } from "./RadioGroup"

// Cross-zone navigation. One definition, mounted in both the shop header and
// the admin header; see the comment at the top of the component for why
// choosing an entry navigates and does nothing else.
export { RoleSwitcher } from "./RoleSwitcher"
export type { RoleSwitcherProps } from "./RoleSwitcher"

// Layout and structure.
export { Table, THead, TBody, TR, TH, TD } from "./Table"
export type { TableProps } from "./Table"
export { Tabs } from "./Tabs"
export type { TabsProps, TabItem } from "./Tabs"
export { Tree } from "./Tree"
export type { TreeProps, TreeNode } from "./Tree"

// Feedback.
export { ToastProvider, useToast } from "./Toast"
export type { Toast, ToastApi, ToastOptions, ToastProviderProps, ToastVariant } from "./Toast"

// Additional primitives ported from postbook-ui src/components/ui (self-contained).
export * from "./dob-picker"      // DobPicker + validateDob
export * from "./StarRating"      // StarRating
export * from "./skeleton"        // Skeleton
export * from "./card"            // Card, CardHeader, CardTitle, CardContent
export * from "./dialog"          // Dialog
export * from "./MessageToast"    // MessageToastContent
