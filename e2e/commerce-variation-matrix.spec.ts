import { expect, test, type Page, type Route } from '@playwright/test'
import { seedSessionCookie } from './session'

// The variant grid: one shirt, several sizes and colours, priced as a table.
//
// Same shape as commerce-listing.spec.ts — every /v1/** call is answered here,
// so each spec asserts what the screen does with an answer rather than what a
// running commerce-service happens to hold. The bodies asserted below are the
// contract read off the Go handlers: `variation_axes` as array order with no
// `position`, `options[].value` as the enum option's CODE, and money in paise.

const CATEGORIES = [
  {
    id: 'cat-fashion',
    name: 'Fashion',
    slug: 'fashion',
    parent_id: null,
    display_order: 0,
    is_active: true,
    is_featured: false,
    is_listable: false,
    image_url: null,
    product_count: 40,
    children: [
      {
        id: 'cat-tees',
        name: 'T-shirts',
        slug: 't-shirts',
        parent_id: 'cat-fashion',
        display_order: 0,
        is_active: true,
        is_featured: false,
        is_listable: true,
        image_url: null,
        product_count: 12,
        children: [],
      },
    ],
  },
]

const TAX_CLASSES = [{ id: 'tax-5', name: 'GST 5%', rate_percent: 5 }]

const SIZES = [
  { value: 's', label: 'Small', sort_order: 0 },
  { value: 'm', label: 'Medium', sort_order: 1 },
  { value: 'l', label: 'Large', sort_order: 2 },
  { value: 'xl', label: 'Extra large', sort_order: 3 },
  { value: 'xxl', label: 'Double XL', sort_order: 4 },
]

// Colour options arrive as `{code, label, swatch_hex}` — the shape the schema
// endpoint actually serves — so the grid is exercised against it rather than
// against the older `value` spelling.
const COLOURS = [
  { code: 'blue', label: 'Blue', swatch_hex: '#2244aa', sort_order: 0 },
  { code: 'red', label: 'Red', swatch_hex: '#cc2222', sort_order: 1 },
  { code: 'green', label: 'Green', swatch_hex: '#22aa55', sort_order: 2 },
  { code: 'black', label: 'Black', swatch_hex: '#111111', sort_order: 3 },
  { code: 'white', label: 'White', swatch_hex: '#f5f5f5', sort_order: 4 },
]

const TEE_SCHEMA = {
  category_id: 'cat-tees',
  category_path: ['Fashion', 'T-shirts'],
  schema_version: 3,
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
          values: SIZES,
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
          values: COLOURS,
        },
        {
          code: 'fabric',
          label: 'Fabric',
          data_type: 'text',
          required: false,
          scope: 'item',
          // Not an axis: a buyer does not choose between fabrics on one listing.
          is_variant_axis: false,
          is_filterable: false,
          lookup_endpoint: null,
        },
      ],
    },
  ],
}

const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) })

const fail = (route: Route, status: number, code: string, message: string, details?: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code, message, details } }),
  })

interface MockOptions {
  /** What POST /products answers with. */
  createResult?: 'ok' | 'variation-invalid'
  /** Variants GET /products/:id/variants answers with, for the edit specs. */
  variants?: Record<string, unknown>[]
}

interface MockState {
  createdBody: () => Record<string, unknown> | null
  patches: () => Record<string, unknown>[]
  addedVariants: () => Record<string, unknown>[]
  variantPatches: () => { id: string; body: Record<string, unknown> }[]
}

async function mockListing(page: Page, options: MockOptions = {}): Promise<MockState> {
  let createdBody: Record<string, unknown> | null = null
  const patches: Record<string, unknown>[] = []
  const addedVariants: Record<string, unknown>[] = []
  const variantPatches: { id: string; body: Record<string, unknown> }[] = []

  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.slice(url.pathname.indexOf('/v1'))
    const method = request.method()

    if (path === '/v1/commerce/categories') return json(route, CATEGORIES)
    if (path === '/v1/commerce/tax-classes') return json(route, TAX_CLASSES)
    if (path === '/v1/commerce/onboarding/status')
      return json(route, { id: 'seller-1', status: 'approved', store_name: 'Tee Shop' })
    if (path === '/v1/commerce/sellers/me') return json(route, { id: 'seller-1' })

    if (path === '/v1/commerce/categories/cat-tees/attribute-schema')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { etag: 'W/"tee-3"' },
        body: JSON.stringify({ data: TEE_SCHEMA }),
      })

    if (path === '/v1/commerce/products' && method === 'POST') {
      createdBody = request.postDataJSON()
      if (options.createResult === 'variation-invalid') {
        return fail(route, 422, 'VARIATION_INVALID', 'the variation matrix was refused', {
          problems: [
            {
              variant: 'TEE-M-BLUE',
              code: 'colour',
              reason: '"Blue" is not one of the option codes for "colour".',
            },
            { variant: 'TEE-L-BLUE', reason: 'has the same combination of options as TEE-M-BLUE' },
          ],
        })
      }
      return json(route, { id: 'prod-1', status: 'draft', approval_status: 'draft' }, 201)
    }

    if (path === '/v1/commerce/products/prod-1/variants' && method === 'GET')
      return json(route, { items: options.variants ?? [] })

    if (path === '/v1/commerce/products/prod-1/variants' && method === 'POST') {
      const body = request.postDataJSON()
      addedVariants.push(body)
      return json(route, { id: `var-new-${addedVariants.length}`, sku: body.sku }, 201)
    }

    if (path === '/v1/commerce/products/prod-1' && method === 'PATCH') {
      patches.push(request.postDataJSON())
      return json(route, { id: 'prod-1', status: 'draft' })
    }

    const variantPatch = /^\/v1\/commerce\/variants\/([^/]+)$/.exec(path)
    if (variantPatch && method === 'PATCH') {
      variantPatches.push({ id: variantPatch[1], body: request.postDataJSON() })
      return json(route, { id: variantPatch[1] })
    }

    if (path === '/v1/commerce/products/prod-1/submit' && method === 'POST')
      return json(route, { id: 'prod-1', approval_status: 'submitted' })

    return json(route, { message: `Unhandled mock route: ${method} ${path}` }, 404)
  })

  // A session is a cookie now, not a localStorage record. See e2e/session.ts.
  await seedSessionCookie(page)

  return {
    createdBody: () => createdBody,
    patches: () => patches,
    addedVariants: () => addedVariants,
    variantPatches: () => variantPatches,
  }
}

/** Open the Offer tab of a T-shirt listing, where the grid lives. */
async function openOfferTab(page: Page) {
  await page.goto('/shop/sell/products/guided?category=cat-tees')
  await page.getByRole('tab', { name: /Offer/ }).click()
  await expect(page.getByTestId('variation-matrix')).toBeVisible()
}

/** Pick one value on an axis through the option list — the only way in. */
async function pickValue(page: Page, axisLabel: string, optionLabel: string) {
  await page.getByRole('combobox', { name: `${axisLabel} values` }).click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
  await page.keyboard.press('Escape')
}

// ── 1. The cross product is the grid ───────────────────────────

test('two axes make one row per combination', async ({ page }) => {
  await mockListing(page)
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('size')
  await page.getByLabel('Second axis').selectOption('colour')

  await pickValue(page, 'Size', 'Small')
  await pickValue(page, 'Size', 'Medium')
  await pickValue(page, 'Size', 'Large')
  await pickValue(page, 'Colour', 'Blue')
  await pickValue(page, 'Colour', 'Red')

  // Three sizes by two colours is six rows, in axis order.
  await expect(page.getByTestId('combination-count')).toContainText('6 combinations')
  const skus = page.getByRole('row').locator('css=[aria-label^="SKU for"]')
  await expect(skus).toHaveCount(6)

  // The SKU suggestion is the stem plus the option codes, and the axis columns
  // show the LABELS the seller picked.
  await page.getByLabel('SKU stem').fill('TEE')
  await expect(page.getByLabel('SKU for Small / Blue')).toHaveValue('TEE-S-BLUE')
  await expect(page.getByLabel('SKU for Large / Red')).toHaveValue('TEE-L-RED')
  await expect(page.getByTestId('row-size=m|colour=blue')).toContainText('Medium')
  await expect(page.getByTestId('row-size=m|colour=blue')).toContainText('Blue')
})

// ── 2. The cap refuses before the pick, not after ──────────────

test('the twenty-combination cap refuses the value that would cross it', async ({ page }) => {
  await mockListing(page)
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('size')
  await page.getByLabel('Second axis').selectOption('colour')

  for (const size of ['Small', 'Medium', 'Large', 'Extra large', 'Double XL']) {
    await pickValue(page, 'Size', size)
  }
  for (const colour of ['Blue', 'Red', 'Green', 'Black']) {
    await pickValue(page, 'Colour', colour)
  }

  // Exactly at the cap: five sizes by four colours.
  await expect(page.getByTestId('combination-count')).toContainText('20 combinations')

  // The fifth colour is offered disabled, with the reason, rather than being
  // accepted and then rejected by the server.
  await expect(page.getByText(/would take this past 20 combinations/)).toBeVisible()
  await page.getByRole('combobox', { name: 'Colour values' }).click()
  await expect(page.getByRole('option', { name: 'White', exact: true }).getByRole('button')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('combination-count')).toContainText('20 combinations')
})

// ── 3. Apply-to-all fills a column in one action ───────────────

test('apply-to-all fills a whole column', async ({ page }) => {
  await mockListing(page)
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('size')
  await pickValue(page, 'Size', 'Small')
  await pickValue(page, 'Size', 'Medium')
  await pickValue(page, 'Size', 'Large')

  await page.getByLabel('selling price for every row').fill('749')
  await page.getByRole('button', { name: 'Apply selling price to every row' }).click()

  await expect(page.getByLabel('Selling price for Small')).toHaveValue('749')
  await expect(page.getByLabel('Selling price for Medium')).toHaveValue('749')
  await expect(page.getByLabel('Selling price for Large')).toHaveValue('749')
  await expect(page.getByText('Filled selling price on 3 rows.')).toBeVisible()

  // One row can still disagree with the rest — the fill is a starting point,
  // not a lock.
  await page.getByLabel('Selling price for Large').fill('799')
  await expect(page.getByLabel('Selling price for Small')).toHaveValue('749')
})

// ── 4. Free text is impossible, by construction ────────────────

test('an axis value can only come from the catalogue’s own list', async ({ page }) => {
  await mockListing(page)
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('colour')

  // The picker is a listbox of the schema's options and nothing else: no text
  // box that could mint a colour, and the options are exactly what was served.
  const picker = page.getByRole('combobox', { name: 'Colour values' })
  await picker.click()
  const options = page.getByRole('option')
  await expect(options).toHaveText(['Blue', 'Red', 'Green', 'Black', 'White'])
  await expect(page.getByRole('listbox').locator('input[type="text"]')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // And the axis picker only offers what the category marks as an axis —
  // `fabric` is a text field, not something a buyer chooses between.
  await expect(page.getByLabel('First axis').locator('option')).toHaveText([
    'This product comes in one version',
    'Size',
    'Colour',
  ])
})

// ── 5. The create body is the contract ─────────────────────────

test('a two-axis product sends axes in array order and options as codes', async ({ page }) => {
  const state = await mockListing(page)
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('size')
  await page.getByLabel('Second axis').selectOption('colour')
  await pickValue(page, 'Size', 'Small')
  await pickValue(page, 'Size', 'Medium')
  await pickValue(page, 'Size', 'Large')
  await pickValue(page, 'Colour', 'Blue')
  await pickValue(page, 'Colour', 'Red')

  await page.getByLabel('SKU stem').fill('TEE')
  await page.getByLabel('MRP for every row').fill('999')
  await page.getByRole('button', { name: 'Apply MRP to every row' }).click()
  await page.getByLabel('selling price for every row').fill('749')
  await page.getByRole('button', { name: 'Apply selling price to every row' }).click()
  await page.getByLabel('stock for every row').fill('12')
  await page.getByRole('button', { name: 'Apply stock to every row' }).click()

  await page.getByRole('tab', { name: /Product/ }).click()
  await page.getByLabel('Title').fill('Heavyweight tee')
  await page.getByLabel('Tax class').selectOption('tax-5')

  await page.getByRole('button', { name: 'Submit for review' }).click()

  await expect.poll(() => state.createdBody()).not.toBeNull()
  const body = state.createdBody() as {
    variation_axes?: { code: string; position?: number }[]
    variants?: Record<string, unknown>[]
  }

  // Array order only — a position would be a second source of truth.
  expect(body.variation_axes).toEqual([{ code: 'size' }, { code: 'colour' }])
  expect(JSON.stringify(body.variation_axes)).not.toContain('position')

  expect(body.variants).toHaveLength(6)
  expect(body.variants?.[0]).toEqual({
    sku: 'TEE-S-BLUE',
    mrp_minor: 99900,
    selling_price_minor: 74900,
    stock_qty: 12,
    options: [
      { code: 'size', value: 's' },
      { code: 'colour', value: 'blue' },
    ],
  })
  // Codes, never labels — "Blue" here is what the server refuses on purpose.
  const values = body.variants?.flatMap((v) => (v.options as { value: string }[]).map((o) => o.value))
  expect(values).not.toContain('Blue')
})

// ── 6. A product with no axes is unchanged ─────────────────────

test('a listing with no axes sends exactly what it always did', async ({ page }) => {
  const state = await mockListing(page)
  await openOfferTab(page)

  // No axis chosen: the single SKU/MRP/price block, not a grid.
  await expect(page.getByLabel('SKU', { exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)

  await page.getByLabel('SKU', { exact: true }).fill('TEE-PLAIN')
  await page.getByLabel('MRP', { exact: true }).fill('999')
  await page.getByLabel('Selling price', { exact: true }).fill('749')
  await page.getByLabel('Stock qty').fill('5')

  await page.getByRole('tab', { name: /Product/ }).click()
  await page.getByLabel('Title').fill('Plain tee')
  await page.getByLabel('Tax class').selectOption('tax-5')
  await page.getByRole('button', { name: 'Submit for review' }).click()

  await expect.poll(() => state.createdBody()).not.toBeNull()
  const body = state.createdBody() as Record<string, unknown>
  expect(body.variation_axes).toBeUndefined()
  expect(body.variants).toEqual([
    { sku: 'TEE-PLAIN', mrp: 999, selling_price: 749, stock_qty: 5 },
  ])
})

// ── 7. The 422 lands on the rows ───────────────────────────────

test('a 422 puts each problem on the row the server named', async ({ page }) => {
  await mockListing(page, { createResult: 'variation-invalid' })
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('size')
  await page.getByLabel('Second axis').selectOption('colour')
  await pickValue(page, 'Size', 'Medium')
  await pickValue(page, 'Size', 'Large')
  await pickValue(page, 'Colour', 'Blue')

  await page.getByLabel('SKU stem').fill('TEE')
  await page.getByLabel('MRP for every row').fill('999')
  await page.getByRole('button', { name: 'Apply MRP to every row' }).click()
  await page.getByLabel('selling price for every row').fill('749')
  await page.getByRole('button', { name: 'Apply selling price to every row' }).click()

  await page.getByRole('tab', { name: /Product/ }).click()
  await page.getByLabel('Title').fill('Heavyweight tee')
  await page.getByLabel('Tax class').selectOption('tax-5')
  await page.getByRole('button', { name: 'Submit for review' }).click()

  await page.getByRole('tab', { name: /Offer/ }).click()

  // Each problem under its own row, keyed by the SKU the server named.
  await expect(page.getByTestId('problems-size=m|colour=blue')).toContainText(
    'is not one of the option codes',
  )
  await expect(page.getByTestId('problems-size=l|colour=blue')).toContainText(
    'has the same combination of options as TEE-M-BLUE',
  )
  // And the banner points at the rows instead of repeating their messages.
  await expect(page.getByText(/marked on the row it belongs to/)).toBeVisible()
})

// ── 8. Duplicate SKUs are caught before the round trip ─────────

test('two rows with one SKU are refused without asking the server', async ({ page }) => {
  const state = await mockListing(page)
  await openOfferTab(page)

  await page.getByLabel('First axis').selectOption('size')
  await pickValue(page, 'Size', 'Small')
  await pickValue(page, 'Size', 'Medium')

  await page.getByLabel('SKU stem').fill('TEE')
  await page.getByLabel('MRP for every row').fill('999')
  await page.getByRole('button', { name: 'Apply MRP to every row' }).click()
  await page.getByLabel('selling price for every row').fill('749')
  await page.getByRole('button', { name: 'Apply selling price to every row' }).click()
  await page.getByLabel('SKU for Medium').fill('TEE-S')

  await page.getByRole('tab', { name: /Product/ }).click()
  await page.getByLabel('Title').fill('Heavyweight tee')
  await page.getByLabel('Tax class').selectOption('tax-5')
  await page.getByRole('button', { name: 'Submit for review' }).click()

  await page.getByRole('tab', { name: /Offer/ }).click()
  await expect(page.getByTestId('problems-size=m')).toContainText('Two rows use the SKU TEE-S')
  // Nothing was sent: the seller does not spend a round trip on this.
  expect(state.createdBody()).toBeNull()
})

// ── 9. Editing: the grid loads, and a new row is created first ──

test('an edit loads the current matrix and sends variant ids', async ({ page }) => {
  const state = await mockListing(page, {
    variants: [
      {
        id: 'var-1',
        product_id: 'prod-1',
        sku: 'TEE-M-BLUE',
        option_1_name: 'Size',
        option_1_value: 'Medium',
        option_2_name: 'Colour',
        option_2_value: 'Blue',
        mrp: 999,
        selling_price: 749,
        mrp_minor: 99900,
        selling_price_minor: 74900,
        available_qty: 4,
        status: 'active',
      },
    ],
  })
  await page.goto('/shop/sell/products/guided?category=cat-tees&product=prod-1')
  await page.getByRole('tab', { name: /Offer/ }).click()

  // The axes and the row came back from the variants, reconstructed.
  await expect(page.getByLabel('First axis')).toHaveValue('size')
  await expect(page.getByLabel('Second axis')).toHaveValue('colour')
  await expect(page.getByLabel('MRP for Medium / Blue')).toHaveValue('999')
  // A variant that exists keeps its SKU: no seller route changes one.
  await expect(page.getByLabel('SKU for Medium / Blue')).toBeDisabled()

  // Add a colour: one new combination, which is a row with no variant yet.
  await pickValue(page, 'Colour', 'Red')
  await page.getByLabel('MRP for Medium / Red').fill('999')
  await page.getByLabel('Selling price for Medium / Red').fill('799')
  // And reprice the row that already exists.
  await page.getByLabel('Selling price for Medium / Blue').fill('699')

  await page.getByRole('tab', { name: /Product/ }).click()
  await page.getByLabel('Title').fill('Heavyweight tee')
  await page.getByLabel('Tax class').selectOption('tax-5')
  await page.getByRole('button', { name: 'Save draft' }).click()

  // A new row is created as a variant FIRST, so the matrix that follows can
  // name every variant the product has.
  await expect.poll(() => state.addedVariants()).toHaveLength(1)
  expect(state.addedVariants()[0]).toMatchObject({
    sku: 'TEE-M-RED',
    mrp_minor: 99900,
    selling_price_minor: 79900,
  })

  const matrixPatch = state
    .patches()
    .find((p) => Object.prototype.hasOwnProperty.call(p, 'variation_axes')) as {
    variation_axes: { code: string }[]
    variants: { variant_id: string; options: { code: string; value: string }[] }[]
  }
  expect(matrixPatch.variation_axes).toEqual([{ code: 'size' }, { code: 'colour' }])
  expect(matrixPatch.variants).toEqual([
    {
      variant_id: 'var-1',
      options: [
        { code: 'size', value: 'm' },
        { code: 'colour', value: 'blue' },
      ],
    },
    {
      variant_id: 'var-new-1',
      options: [
        { code: 'size', value: 'm' },
        { code: 'colour', value: 'red' },
      ],
    },
  ])

  // The repriced existing row goes through the variant's own route, because
  // the matrix patch carries options and nothing else.
  await expect.poll(() => state.variantPatches()).toHaveLength(1)
  expect(state.variantPatches()[0]).toEqual({
    id: 'var-1',
    body: { mrp_minor: 99900, selling_price_minor: 69900 },
  })
})
