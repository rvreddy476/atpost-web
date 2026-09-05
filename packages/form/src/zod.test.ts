import { describe, expect, it } from 'vitest'
import type { AttributeDefinition, AttributeSchema } from '@atpost/types/commerce'
import { fieldErrorsFromZod, zodForSchema } from './zod'
import { validate } from './validate'

function def(
  over: Partial<AttributeDefinition> & Pick<AttributeDefinition, 'code' | 'data_type'>,
): AttributeDefinition {
  return {
    label: over.code,
    required: false,
    scope: 'item',
    is_variant_axis: false,
    is_filterable: false,
    lookup_endpoint: null,
    ...over,
  } as AttributeDefinition
}

const schema: AttributeSchema = {
  category_id: 'cat-1',
  category_path: ['Electronics'],
  schema_version: 3,
  variation_axes: ['colour'],
  groups: [
    {
      name: 'Basics',
      sort_order: 0,
      attributes: [
        def({ code: 'brand', data_type: 'text', required: true, max_len: 5 }),
        def({ code: 'pack', data_type: 'integer', min: 1 }),
        def({
          code: 'colour',
          data_type: 'enum',
          values: [{ value: 'red', label: 'Red' }],
        }),
        def({ code: 'holo', data_type: 'hologram' }),
      ],
    },
  ],
}

const zs = zodForSchema(schema)

describe('zodForSchema', () => {
  it('accepts a fully valid value map', () => {
    const result = zs.safeParse({
      brand: { type: 'text', value: 'Acme' },
      pack: { type: 'integer', value: 2 },
      colour: { type: 'enum', value: 'red' },
      holo: { type: 'unknown', data_type: 'hologram', value: { ratio: '1.5' } },
    })
    expect(result.success).toBe(true)
  })

  it('reaches the same verdict as validate()', () => {
    const values = {
      brand: { type: 'text', value: 'Acmeorama' } as const,
      pack: { type: 'integer', value: 0 } as const,
      colour: { type: 'enum', value: 'teal' } as const,
    }
    const result = zs.safeParse(values)
    expect(result.success).toBe(false)
    const fromZod = result.success ? {} : fieldErrorsFromZod(result.error)
    expect(fromZod).toEqual(validate(schema, values))
  })

  it('reports a missing required field', () => {
    const result = zs.safeParse({})
    expect(result.success).toBe(false)
    const errors = result.success ? {} : fieldErrorsFromZod(result.error)
    expect(errors.brand).toEqual({ kind: 'required' })
    expect(errors.pack).toBeUndefined()
  })

  it('reports a value whose type disagrees with the definition', () => {
    const result = zs.safeParse({
      brand: { type: 'integer', value: 4 },
    })
    const errors = result.success ? {} : fieldErrorsFromZod(result.error)
    expect(errors.brand).toEqual({ kind: 'type_mismatch', expected: 'text', received: 'integer' })
  })

  it('reports structurally broken data as a format problem', () => {
    const result = zs.safeParse({ brand: { type: 'text', value: 42 } })
    const errors = result.success ? {} : fieldErrorsFromZod(result.error)
    expect(errors.brand).toEqual({ kind: 'pattern', regex: null })
  })

  it('passes through extra keys on a value instead of stripping them', () => {
    const result = zs.safeParse({
      brand: { type: 'text', value: 'Acme', provenance: 'imported' },
      unlisted: { type: 'text', value: 'from a newer schema' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.brand).toEqual({
        type: 'text',
        value: 'Acme',
        provenance: 'imported',
      })
      expect(result.data.unlisted).toEqual({ type: 'text', value: 'from a newer schema' })
    }
  })

  it('does not judge an unknown data type it cannot interpret', () => {
    const result = zs.safeParse({
      brand: { type: 'text', value: 'Acme' },
      holo: { type: 'unknown', data_type: 'hologram', value: 'anything at all' },
    })
    expect(result.success).toBe(true)
  })
})

describe('fieldErrorsFromZod', () => {
  it('keeps the first error per field', () => {
    const result = zs.safeParse({ brand: { type: 'text', value: 'Acmeorama' } })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = fieldErrorsFromZod(result.error)
      expect(Object.keys(errors)).toEqual(['brand'])
      expect(errors.brand).toEqual({ kind: 'too_long', max: 5, actual: 9 })
    }
  })
})
