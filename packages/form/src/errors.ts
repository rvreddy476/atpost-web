// One error vocabulary for the whole listing form. Local checks and the
// server's per-field submit errors both produce these, so a submit response can
// be merged straight into the same map the local validator returns and the
// field renderer never has to know which side found the problem.

export type FieldError =
  /** Required, and empty. */
  | { kind: 'required' }
  /** Below the definition's `min` (characters for text, elements for lists). */
  | { kind: 'too_short'; min: number; actual: number }
  /** Past the definition's `max_len` (characters) or `max` (elements). */
  | { kind: 'too_long'; max: number; actual: number }
  /** Numeric value outside [min, max]. `actual` is the exact string, never a float. */
  | { kind: 'out_of_range'; min: number | null; max: number | null; actual: string }
  /** Failed the definition's regex, or is malformed for its type (date, decimal, GTIN). */
  | { kind: 'pattern'; regex: string | null }
  /** One or more choices are not in the definition's option list. */
  | { kind: 'not_in_enum'; allowed: string[]; received: string[] }
  /** The value's `type` disagrees with the definition's `data_type`. */
  | { kind: 'type_mismatch'; expected: string; received: string }
  /** The schema moved under the seller; the form must reload before it can submit. */
  | { kind: 'stale'; expected_version: number | null; actual_version: number | null }
  /** Anything only the server can decide — duplicate GTIN, banned brand, policy. */
  | { kind: 'server'; message: string; code?: string }

export type FieldErrorMap = Record<string, FieldError>

// Default English copy. Callers with a localiser should switch on `kind`
// themselves; this exists so a field can always render *something*.
export function fieldErrorMessage(error: FieldError, label = 'This field'): string {
  switch (error.kind) {
    case 'required':
      return `${label} is required`
    case 'too_short':
      return `${label} must be at least ${error.min} (got ${error.actual})`
    case 'too_long':
      return `${label} must be at most ${error.max} (got ${error.actual})`
    case 'out_of_range': {
      if (error.min !== null && error.max !== null)
        return `${label} must be between ${error.min} and ${error.max}`
      if (error.min !== null) return `${label} must be at least ${error.min}`
      if (error.max !== null) return `${label} must be at most ${error.max}`
      return `${label} is out of range`
    }
    case 'pattern':
      return `${label} is not in the expected format`
    case 'not_in_enum':
      return `${label} has a choice that is no longer offered`
    case 'type_mismatch':
      return `${label} expected ${error.expected} but received ${error.received}`
    case 'stale':
      return 'This category’s form changed. Reload before submitting.'
    case 'server':
      return error.message
  }
}

/**
 * Fold a server's per-field submit errors into a local error map. Server
 * errors win: they are the reason the submit failed, and re-running the local
 * validator would just paint over them.
 */
export function mergeServerErrors(
  local: FieldErrorMap,
  server: Record<string, { message: string; code?: string }>,
): FieldErrorMap {
  const merged: FieldErrorMap = { ...local }
  for (const [code, detail] of Object.entries(server)) {
    merged[code] = { kind: 'server', message: detail.message, code: detail.code }
  }
  return merged
}
