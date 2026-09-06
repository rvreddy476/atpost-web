import { describe, expect, it } from 'vitest'
import type { AttributeSchema } from '@atpost/types/commerce'
import {
  MAX_COMBINATIONS,
  applyToAll,
  axesPayload,
  axisCandidates,
  combinationKey,
  combinationsFor,
  countIfAdded,
  createVariantsPayload,
  localProblems,
  matrixFromVariants,
  matrixRows,
  patchVariantsPayload,
  problemsOntoRows,
  rupeesToMinor,
  suggestSku,
  type MatrixRow,
  type MatrixState,
} from './variation'

// A tee: size (three) and colour (two, with swatches), plus one attribute that
// is not an axis and one that is marked as one but has no options published.
const SCHEMA = {
  category_id: 'cat-tees',
  category_path: ['Fashion', 'T-shirts'],
  schema_version: 2,
  variation_axes: ['size', 'colour'],
  groups: [
    {
      name: 'Fabric and fit',
      sort_order: 0,
      attributes: [
        {
          code: 'size',
          label: 'Size',
          data_type: 'enum',
          required: true,
          scope: 'item',
          is_variant_axis: true,
          is_filterable: true,
          lookup_endpoint: null,
          values: [
            { value: 's', label: 'Small', sort_order: 0 },
            { value: 'm', label: 'Medium', sort_order: 1 },
            { value: 'l', label: 'Large', sort_order: 2 },
          ],
        },
        {
          code: 'colour',
          label: 'Colour',
          data_type: 'enum',
          required: true,
          scope: 'item',
          is_variant_axis: true,
          is_filterable: true,
          lookup_endpoint: null,
          // `code` rather than `value`: the shape the schema endpoint actually
          // serves, and the reason optionCode reads both.
          values: [
            { code: 'blue', label: 'Blue', swatch_hex: '#2244aa', sort_order: 0 },
            { code: 'red', label: 'Red', swatch_hex: '#cc2222', sort_order: 1 },
          ],
        },
        {
          code: 'fabric',
          label: 'Fabric',
          data_type: 'text',
          required: false,
          scope: 'item',
          is_variant_axis: false,
          is_filterable: false,
          lookup_endpoint: null,
        },
        {
          code: 'finish',
          label: 'Finish',
          data_type: 'enum',
          required: false,
          scope: 'item',
          is_variant_axis: true,
          is_filterable: false,
          lookup_endpoint: null,
          values: [],
        },
      ],
    },
  ],
} as unknown as AttributeSchema

const CANDIDATES = axisCandidates(SCHEMA)

function state(axes: string[], values: Record<string, string[]>): MatrixState {
  return { axes, values, rows: {} }
}

describe('axisCandidates', () => {
  it('offers only what the category says may be an axis', () => {
    expect(CANDIDATES.map((c) => c.code)).toEqual(['size', 'colour', 'finish'])
    expect(CANDIDATES.find((c) => c.code === 'fabric')).toBeUndefined()
  })

  it('reads an option identity from `code` as well as `value`', () => {
    const colour = CANDIDATES.find((c) => c.code === 'colour')
    expect(colour?.options.map((o) => o.code)).toEqual(['blue', 'red'])
    expect(colour?.options[0].swatchHex).toBe('#2244aa')
  })

  it('marks an axis with no published options unavailable rather than hiding it', () => {
    const finish = CANDIDATES.find((c) => c.code === 'finish')
    expect(finish?.options).toEqual([])
    expect(finish?.unavailable).toContain('no published options')
  })
})

describe('the cross product', () => {
  it('is one row per combination, last axis varying fastest', () => {
    const combos = combinationsFor(['size', 'colour'], { size: ['s', 'm'], colour: ['blue', 'red'] })
    expect(combos).toEqual([
      { size: 's', colour: 'blue' },
      { size: 's', colour: 'red' },
      { size: 'm', colour: 'blue' },
      { size: 'm', colour: 'red' },
    ])
  })

  it('is empty until every axis has a value', () => {
    expect(combinationsFor(['size', 'colour'], { size: ['s'], colour: [] })).toEqual([])
  })

  it('keys a row the way the database does', () => {
    expect(combinationKey(['size', 'colour'], { size: 'm', colour: 'blue' })).toBe(
      'size=m|colour=blue',
    )
  })
})

describe('the cap', () => {
  it('says what one more value would cost, before it is picked', () => {
    // 5 sizes x 4 colours is exactly 20; a fifth colour would be 25.
    const at20 = state(['size', 'colour'], {
      size: ['s', 'm', 'l', 'xl', 'xxl'],
      colour: ['blue', 'red', 'green', 'black'],
    })
    expect(countIfAdded(at20, 'colour', 'white')).toBe(25)
    expect(countIfAdded(at20, 'colour', 'white')).toBeGreaterThan(MAX_COMBINATIONS)
    // A value already picked costs nothing — it is not a new combination.
    expect(countIfAdded(at20, 'colour', 'red')).toBe(20)
  })
})

describe('SKU help', () => {
  it('suggests a stem plus the option codes, upper-cased', () => {
    expect(suggestSku('tee', ['size', 'colour'], { size: 'm', colour: 'blue' })).toBe('TEE-M-BLUE')
  })

  it('flags two rows that claim one SKU, before the server has to', () => {
    const rows = matrixRows(state(['size'], { size: ['s', 'm'] }), 'tee').map((row) => ({
      ...row,
      sku: 'TEE',
      mrp: '999',
      price: '749',
    }))
    const problems = localProblems(rows)
    expect(Object.keys(problems)).toHaveLength(2)
    expect(problems['size=s'][0]).toContain('Two rows use the SKU TEE')
  })

  it('asks for the money each row is missing', () => {
    const rows = matrixRows(state(['size'], { size: ['s'] }), 'tee')
    expect(localProblems(rows)['size=s']).toEqual(['Needs an MRP.', 'Needs a selling price.'])
  })
})

describe('apply to all', () => {
  it('fills one column in one action', () => {
    const filled = applyToAll(state(['size'], { size: ['s', 'm', 'l'] }), 'tee', 'price', '749')
    const rows = matrixRows(filled, 'tee')
    expect(rows.map((r) => r.price)).toEqual(['749', '749', '749'])
    expect(rows.map((r) => r.sku)).toEqual(['TEE-S', 'TEE-M', 'TEE-L'])
  })
})

describe('money', () => {
  it('converts rupees to paise off the text, never through a float', () => {
    expect(rupeesToMinor('999')).toBe(99900)
    expect(rupeesToMinor('749.90')).toBe(74990)
    expect(rupeesToMinor('1299.99')).toBe(129999)
    expect(rupeesToMinor('0.05')).toBe(5)
  })

  it('refuses what is not a plain amount rather than guessing', () => {
    expect(rupeesToMinor('')).toBeNull()
    expect(rupeesToMinor('749.999')).toBeNull()
    expect(rupeesToMinor('₹749')).toBeNull()
  })
})

describe('the request', () => {
  const rows: MatrixRow[] = matrixRows(
    state(['size', 'colour'], { size: ['s', 'm'], colour: ['blue'] }),
    'tee',
  ).map((row) => ({ ...row, mrp: '999', price: '749', stock: '12' }))

  it('sends array order only — never a position', () => {
    expect(axesPayload(['size', 'colour'])).toEqual([{ code: 'size' }, { code: 'colour' }])
    expect(JSON.stringify(axesPayload(['size']))).not.toContain('position')
  })

  it('sends paise, and an option value that is the enum code', () => {
    expect(createVariantsPayload(['size', 'colour'], rows)).toEqual([
      {
        sku: 'TEE-S-BLUE',
        mrp_minor: 99900,
        selling_price_minor: 74900,
        stock_qty: 12,
        options: [
          { code: 'size', value: 's' },
          { code: 'colour', value: 'blue' },
        ],
      },
      {
        sku: 'TEE-M-BLUE',
        mrp_minor: 99900,
        selling_price_minor: 74900,
        stock_qty: 12,
        options: [
          { code: 'size', value: 'm' },
          { code: 'colour', value: 'blue' },
        ],
      },
    ])
  })

  it('leaves an excluded combination out of the create', () => {
    const excluded = rows.map((row, i) => (i === 0 ? { ...row, included: false } : row))
    expect(createVariantsPayload(['size', 'colour'], excluded).map((v) => v.sku)).toEqual([
      'TEE-M-BLUE',
    ])
  })

  it('names every existing variant on a patch, by id', () => {
    const withIds = rows.map((row, i) => ({ ...row, variantId: `var-${i}` }))
    expect(patchVariantsPayload(['size', 'colour'], withIds)).toEqual([
      {
        variant_id: 'var-0',
        options: [
          { code: 'size', value: 's' },
          { code: 'colour', value: 'blue' },
        ],
      },
      {
        variant_id: 'var-1',
        options: [
          { code: 'size', value: 'm' },
          { code: 'colour', value: 'blue' },
        ],
      },
    ])
  })
})

describe('the 422', () => {
  const rows = matrixRows(state(['size'], { size: ['s', 'm'] }), 'tee')

  it('puts a problem on the row the server named by SKU', () => {
    const { rows: onRows, unattached } = problemsOntoRows(
      [{ variant: 'TEE-M', code: 'size', reason: 'is not one of the option codes' }],
      rows,
    )
    expect(onRows['size=m']).toEqual(['size: is not one of the option codes'])
    expect(unattached).toEqual([])
  })

  it('puts a problem on the row the server named by position', () => {
    const { rows: onRows } = problemsOntoRows([{ variant: 'variant 1', reason: 'needs a SKU' }], rows)
    expect(onRows['size=s']).toEqual(['needs a SKU'])
  })

  it('keeps a problem that belongs to no row rather than dropping it', () => {
    const { rows: onRows, unattached } = problemsOntoRows(
      [{ reason: '25 variants were sent; a product is capped at 20 combinations' }],
      rows,
    )
    expect(onRows).toEqual({})
    expect(unattached[0]).toContain('capped at 20')
  })
})

describe('reading a product back into the grid', () => {
  it('reconstructs the axes and options from the legacy label columns', () => {
    const loaded = matrixFromVariants(CANDIDATES, [
      {
        id: 'var-1',
        sku: 'TEE-M-BLUE',
        option_1_name: 'Size',
        option_1_value: 'Medium',
        option_2_name: 'Colour',
        option_2_value: 'Blue',
        mrp_minor: 99900,
        selling_price_minor: 74900,
        available_qty: 4,
      },
    ])
    expect(loaded?.axes).toEqual(['size', 'colour'])
    expect(loaded?.values).toEqual({ size: ['m'], colour: ['blue'] })
    const row = loaded?.rows['size=m|colour=blue']
    expect(row?.variantId).toBe('var-1')
    expect(row?.mrp).toBe('999')
    expect(row?.price).toBe('749')
    expect(row?.stock).toBe('4')
  })

  it('keeps a variant whose value no longer resolves, so it can be fixed rather than dropped', () => {
    const loaded = matrixFromVariants(CANDIDATES, [
      {
        id: 'var-9',
        sku: 'TEE-M-TEAL',
        option_1_name: 'Size',
        option_1_value: 'Medium',
        option_2_name: 'Colour',
        option_2_value: 'Teal',
      },
    ])
    const row = loaded?.rows['unresolved:var-9']
    expect(row?.stranded).toBe(true)
    expect(localProblems([{ ...(row as MatrixRow) }])['unresolved:var-9'][0]).toContain(
      'no longer in the grid',
    )
  })

  it('says a product does not vary when no variant carries options', () => {
    expect(matrixFromVariants(CANDIDATES, [{ id: 'v', sku: 'TEE' }])).toBeNull()
  })
})
