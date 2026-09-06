import type {
  AttributeDefinition,
  AttributeGroup,
  AttributeSchema,
  AttributeValue,
  AttributeValueMap,
} from '@atpost/types/commerce'
import { isKnownAttributeDataType } from '@atpost/types/commerce'
import type { FieldError, FieldErrorMap } from './errors'
import { expectedValueType, isEmptyValue } from './values'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL = /^-?(?:\d+)(?:\.\d+)?$/
const GTIN_LENGTHS = new Set([8, 12, 13, 14])

function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  // Month-length check, leap years included, without a Date-parse round trip
  // (which happily "corrects" 2026-02-31 into 2026-03-03).
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= lengths[m - 1]
}

/** GS1 mod-10 check digit — catches the transposed digit a typed barcode usually has. */
export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || !GTIN_LENGTHS.has(value.length)) return false
  const digits = value.split('').map(Number)
  const check = digits.pop() as number
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

function rangeError(
  def: AttributeDefinition,
  numeric: number,
  actual: string,
): FieldError | null {
  const min = def.min ?? null
  const max = def.max ?? null
  if (min !== null && numeric < min) return { kind: 'out_of_range', min, max, actual }
  if (max !== null && numeric > max) return { kind: 'out_of_range', min, max, actual }
  return null
}

function countError(def: AttributeDefinition, count: number): FieldError | null {
  if (def.min != null && count < def.min) return { kind: 'too_short', min: def.min, actual: count }
  if (def.max != null && count > def.max) return { kind: 'too_long', max: def.max, actual: count }
  return null
}

function allowedOptions(def: AttributeDefinition): string[] | null {
  // No inline list means the options live behind `lookup_endpoint`; membership
  // is the server's call and guessing here would reject a legitimate choice.
  if (!def.values || def.values.length === 0) return null
  // `value || code`: the schema endpoint serves an option's identity as `code`
  // and this type has always called it `value`. Reading only one of the two
  // builds an allowed-list of `undefined`, and then refuses the seller's own
  // pick with "a choice that is no longer offered".
  return def.values.map((v) => v.value || v.code || '').filter((v) => v !== '')
}

function textError(def: AttributeDefinition, text: string): FieldError | null {
  if (def.min != null && text.length < def.min)
    return { kind: 'too_short', min: def.min, actual: text.length }
  if (def.max_len != null && text.length > def.max_len)
    return { kind: 'too_long', max: def.max_len, actual: text.length }
  if (def.regex) {
    let re: RegExp
    try {
      re = new RegExp(def.regex)
    } catch {
      // A pattern this JS engine cannot compile is the server's problem, not
      // the seller's — never block a submit on it.
      return null
    }
    if (!re.test(text)) return { kind: 'pattern', regex: def.regex }
  }
  return null
}

/**
 * Validate one field. Exported because the zod builder and the per-field
 * blur handler both need exactly this, and two copies of these rules would
 * drift apart within a sprint.
 */
export function validateField(
  def: AttributeDefinition,
  value: AttributeValue | null | undefined,
): FieldError | null {
  if (value === null || value === undefined) {
    return def.required ? { kind: 'required' } : null
  }

  const expected = expectedValueType(def)
  if (value.type !== expected) {
    return { kind: 'type_mismatch', expected, received: value.type }
  }

  if (isEmptyValue(value)) {
    return def.required ? { kind: 'required' } : null
  }

  // An unknown data type is carried, not judged. We cannot know its rules, and
  // inventing one would reject a value the server would have accepted.
  if (!isKnownAttributeDataType(def.data_type)) return null

  switch (value.type) {
    case 'text':
    case 'long_text':
      return textError(def, value.value)

    case 'gtin': {
      const text = value.value.trim()
      if (!isValidGtin(text)) return { kind: 'pattern', regex: def.regex ?? null }
      return textError(def, text)
    }

    case 'integer': {
      if (!Number.isInteger(value.value)) return { kind: 'pattern', regex: null }
      return rangeError(def, value.value, String(value.value))
    }

    case 'decimal': {
      const text = value.value.trim()
      if (!DECIMAL.test(text)) return { kind: 'pattern', regex: def.regex ?? null }
      return rangeError(def, Number(text), text)
    }

    case 'money_minor': {
      // `min`/`max` on a money attribute are minor units too — mixing the two
      // scales is exactly how a ₹100 floor becomes a ₹1 floor.
      if (!Number.isSafeInteger(value.value)) return { kind: 'pattern', regex: null }
      return rangeError(def, value.value, String(value.value))
    }

    case 'boolean':
      return null

    case 'enum': {
      const allowed = allowedOptions(def)
      if (allowed && !allowed.includes(value.value))
        return { kind: 'not_in_enum', allowed, received: [value.value] }
      return null
    }

    case 'multi_enum': {
      const allowed = allowedOptions(def)
      if (allowed) {
        const stray = value.value.filter((v) => !allowed.includes(v))
        if (stray.length > 0) return { kind: 'not_in_enum', allowed, received: stray }
      }
      return countError(def, value.value.length)
    }

    case 'date':
      if (!isRealCalendarDate(value.value)) return { kind: 'pattern', regex: ISO_DATE.source }
      return null

    case 'measure': {
      const text = value.value.trim()
      if (!DECIMAL.test(text)) return { kind: 'pattern', regex: def.regex ?? null }
      if (def.units && def.units.length > 0) {
        const codes = def.units.map((u) => u.code)
        if (!codes.includes(value.unit))
          return { kind: 'not_in_enum', allowed: codes, received: [value.unit] }
      }
      return rangeError(def, Number(text), text)
    }

    case 'media':
      return countError(def, value.value.length)

    case 'unknown':
      return null
  }
}

/**
 * Validate a whole schema's worth of values. The result is keyed by attribute
 * code and holds at most one error per field — the first thing wrong with it,
 * which is the only one a single-line field message can show anyway. A field
 * with no error is absent from the map, so `Object.keys(errors).length === 0`
 * is the "can submit" test.
 */
export function validate(schema: AttributeSchema, values: AttributeValueMap): FieldErrorMap {
  const errors: FieldErrorMap = {}
  for (const group of schema.groups) {
    for (const def of group.attributes) {
      const error = validateField(def, values[def.code])
      if (error) errors[def.code] = error
    }
  }
  return errors
}

/**
 * Per-group completion counts for the "3 of 5" badge beside each tab. Only
 * required attributes count: optional ones would make a finished group look
 * unfinished forever.
 */
export function groupProgress(
  group: AttributeGroup,
  values: AttributeValueMap,
): { filledRequired: number; totalRequired: number } {
  let filledRequired = 0
  let totalRequired = 0
  for (const def of group.attributes) {
    if (!def.required) continue
    totalRequired += 1
    const value = values[def.code]
    // "Filled" means it would survive a submit, not merely that it is non-empty
    // — a badge that counts an invalid answer is a badge that lies.
    if (!isEmptyValue(value) && validateField(def, value) === null) filledRequired += 1
  }
  return { filledRequired, totalRequired }
}
