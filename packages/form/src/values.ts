import type { AttributeDefinition, AttributeValue } from '@atpost/types/commerce'
import { isKnownAttributeDataType } from '@atpost/types/commerce'

/**
 * True when the field carries no answer yet.
 *
 * `false` on a boolean is deliberately *not* empty — it is an answer ("this
 * product is not returnable"), and treating it as blank would nag a seller who
 * has already decided. A consent-style "must be true" belongs in a server rule,
 * not in the emptiness test.
 */
export function isEmptyValue(value: AttributeValue | null | undefined): boolean {
  if (value === null || value === undefined) return true
  switch (value.type) {
    case 'text':
    case 'long_text':
    case 'enum':
    case 'gtin':
    case 'date':
    case 'decimal':
      return value.value.trim() === ''
    case 'measure':
      return value.value.trim() === ''
    case 'integer':
    case 'money_minor':
      return !Number.isFinite(value.value)
    case 'boolean':
      return false
    case 'multi_enum':
    case 'media':
      return value.value.length === 0
    case 'unknown':
      return (
        value.value === null ||
        value.value === undefined ||
        (typeof value.value === 'string' && value.value.trim() === '') ||
        (Array.isArray(value.value) && value.value.length === 0)
      )
  }
}

/**
 * The blank an unfilled control should hold, so a form never starts undefined.
 * Numeric fields get `null` rather than a NaN placeholder — NaN does not
 * survive JSON, and a cleared number input genuinely has no value.
 */
export function emptyValueFor(def: AttributeDefinition): AttributeValue | null {
  if (!isKnownAttributeDataType(def.data_type)) {
    return { type: 'unknown', data_type: def.data_type, value: null }
  }
  switch (def.data_type) {
    case 'text':
    case 'long_text':
    case 'enum':
    case 'gtin':
    case 'date':
    case 'decimal':
      return { type: def.data_type, value: '' }
    case 'measure':
      return { type: 'measure', value: '', unit: def.default_unit ?? def.units?.[0]?.code ?? '' }
    case 'integer':
    case 'money_minor':
      return null
    case 'boolean':
      return { type: 'boolean', value: false }
    case 'multi_enum':
      return { type: 'multi_enum', value: [] }
    case 'media':
      return { type: 'media', value: [] }
  }
}

/** Every definition in the schema, flattened in group then declaration order. */
export function allDefinitions(groups: { attributes: AttributeDefinition[] }[]): AttributeDefinition[] {
  return groups.flatMap((g) => g.attributes)
}

/** The `type` an AttributeValue must carry for a given definition. */
export function expectedValueType(def: AttributeDefinition): string {
  return isKnownAttributeDataType(def.data_type) ? def.data_type : 'unknown'
}

