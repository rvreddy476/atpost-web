// Pure, framework-free validators — unit-testable without React. The form
// components below render the messages these return.

export type ValidationResult = string | null // null = valid; string = error message

// validateEmail accepts the pragmatic "local@domain.tld" shape: exactly one @,
// no whitespace, and a dotted domain. Deliberately not full RFC 5322 (that
// regex is famously unusable) — this catches the real mistakes without
// rejecting valid addresses.
export function validateEmail(value: string): ValidationResult {
  const v = (value ?? "").trim()
  if (!v) return "Email is required"
  if (v.length > 254) return "Email is too long"
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(v)) return "Enter a valid email address"
  return null
}

// validateRequired is a small companion used by several fields.
export function validateRequired(value: string, label = "This field"): ValidationResult {
  return (value ?? "").trim() ? null : `${label} is required`
}
