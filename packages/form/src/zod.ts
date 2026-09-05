import { z } from 'zod'
import type { AttributeDefinition, AttributeSchema, AttributeValue } from '@atpost/types/commerce'
import { isKnownAttributeDataType } from '@atpost/types/commerce'
import type { FieldError, FieldErrorMap } from './errors'
import { fieldErrorMessage } from './errors'
import { expectedValueType } from './values'
import { validateField } from './validate'

/**
 * The structural shape of one attribute's value — the JS types only. Range,
 * length, pattern and enum-membership rules deliberately live in
 * `validateField` instead, so the resolver and the on-blur validator can never
 * disagree about whether a listing is submittable.
 *
 * `.loose()` throughout: an AttributeValue the server has extended must
 * round-trip back untouched rather than be quietly stripped on parse.
 */
function structureFor(def: AttributeDefinition): z.ZodType {
  if (!isKnownAttributeDataType(def.data_type)) {
    return z
      .object({ type: z.literal('unknown'), data_type: z.string(), value: z.unknown() })
      .loose()
  }
  switch (def.data_type) {
    case 'text':
    case 'long_text':
    case 'enum':
    case 'gtin':
    case 'date':
    case 'decimal':
      return z.object({ type: z.literal(def.data_type), value: z.string() }).loose()
    case 'measure':
      return z.object({ type: z.literal('measure'), value: z.string(), unit: z.string() }).loose()
    case 'integer':
      return z.object({ type: z.literal('integer'), value: z.number().int() }).loose()
    case 'money_minor':
      return z
        .object({
          type: z.literal('money_minor'),
          value: z.number().int(),
          currency_code: z.string().optional(),
        })
        .loose()
    case 'boolean':
      return z.object({ type: z.literal('boolean'), value: z.boolean() }).loose()
    case 'multi_enum':
      return z.object({ type: z.literal('multi_enum'), value: z.array(z.string()) }).loose()
    case 'media':
      return z.object({ type: z.literal('media'), value: z.array(z.string()) }).loose()
  }
}

/** The FieldError this package attaches to every issue it raises. */
const FIELD_ERROR_KEY = 'fieldError'

/** The verdict for one attribute, structural check included. */
function errorForField(def: AttributeDefinition, raw: unknown): FieldError | null {
  if (raw === null || raw === undefined) return validateField(def, null)

  const parsed = structureFor(def).safeParse(raw)
  if (!parsed.success) {
    const expected = expectedValueType(def)
    const received = (raw as { type?: unknown }).type
    return typeof received === 'string' && received !== expected
      ? { kind: 'type_mismatch', expected, received }
      : { kind: 'pattern', regex: null }
  }

  return validateField(def, parsed.data as AttributeValue)
}

/**
 * Build a zod object over an AttributeSchema's values, keyed by attribute code
 * — hand it to `zodResolver` and react-hook-form drives the same rules the rest
 * of this package uses. Codes the schema does not declare are passed through
 * rather than stripped, so an unknown attribute survives an edit.
 *
 * Every check runs in one object-level refinement rather than per key. A key
 * schema that rejects `undefined` would make an unfilled optional attribute a
 * parse failure, and one that accepts it short-circuits before any refinement
 * can raise the `required` verdict — so the object is the only level at which
 * "this required field is simply missing" is expressible.
 */
export function zodForSchema(schema: AttributeSchema) {
  const definitions = schema.groups.flatMap((group) => group.attributes)
  const shape: Record<string, z.ZodType> = {}
  for (const def of definitions) {
    shape[def.code] = z.unknown().optional()
  }

  return z
    .object(shape)
    .loose()
    .superRefine((values: Record<string, unknown>, ctx) => {
      for (const def of definitions) {
        const error = errorForField(def, values[def.code])
        if (!error) continue
        ctx.addIssue({
          code: 'custom',
          path: [def.code],
          message: fieldErrorMessage(error, def.label),
          params: { [FIELD_ERROR_KEY]: error },
        })
      }
    })
}

/**
 * Pull this package's FieldErrors back out of a zod failure, so a resolver
 * result lands in the same map `validate()` returns and the same map the
 * server's submit errors merge into.
 */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrorMap {
  const map: FieldErrorMap = {}
  for (const issue of error.issues) {
    const code = issue.path[0]
    if (typeof code !== 'string' || map[code]) continue
    const params = (issue as { params?: Record<string, unknown> }).params
    const carried = params?.[FIELD_ERROR_KEY] as FieldError | undefined
    map[code] = carried ?? { kind: 'server', message: issue.message }
  }
  return map
}
