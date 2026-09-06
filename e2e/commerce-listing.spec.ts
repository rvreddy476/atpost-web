import { expect, test, type Page, type Route } from '@playwright/test'

// The seller's category-driven listing form, driven against a mocked gateway.
// Same shape as commerce.spec.ts: every /v1/** call is answered here, so each
// spec asserts what the screen does with an answer rather than what a running
// commerce-service happens to hold.

const SELLER_USER_ID = '66666666-6666-4666-8666-666666666666'

const CATEGORIES = [
  {
    id: 'cat-electronics',
    name: 'Electronics',
    slug: 'electronics',
    parent_id: null,
    display_order: 0,
    is_active: true,
    is_featured: false,
    // A grouping node: a seller may open it, never list against it.
    is_listable: false,
    image_url: null,
    product_count: 240,
    children: [
      {
        id: 'cat-headphones',
        name: 'Headphones',
        slug: 'headphones',
        parent_id: 'cat-electronics',
        display_order: 0,
        is_active: true,
        is_featured: false,
        is_listable: true,
        image_url: null,
        product_count: 94,
        children: [],
      },
      {
        id: 'cat-cables',
        name: 'Cables',
        slug: 'cables',
        parent_id: 'cat-electronics',
        display_order: 1,
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

const TAX_CLASSES = [
  { id: 'tax-18', name: 'GST 18%', rate_percent: 18 },
  { id: 'tax-5', name: 'GST 5%', rate_percent: 5 },
]

/**
 * Headphones has a form authored against it. Note `certification`, whose
 * data_type this build has never heard of, and `dispatch_days`, which is
 * offer-scope and therefore belongs on the Offer tab whatever group it was
 * authored in.
 */
const HEADPHONE_SCHEMA = {
  category_id: 'cat-headphones',
  category_path: ['Electronics', 'Headphones'],
  schema_version: 4,
  variation_axes: ['colour'],
  groups: [
    {
      name: 'Basics',
      sort_order: 0,
      attributes: [
        {
          code: 'brand',
          label: 'Brand',
          help_text: 'The name printed on the box.',
          data_type: 'text',
          required: true,
          scope: 'item',
          is_variant_axis: false,
          is_filterable: true,
          max_len: 60,
          lookup_endpoint: null,
        },
        {
          code: 'warranty_months',
          label: 'Warranty months',
          data_type: 'integer',
          required: false,
          scope: 'item',
          is_variant_axis: false,
          is_filterable: false,
          min: 0,
          max: 60,
          lookup_endpoint: null,
        },
        {
          code: 'certification',
          label: 'Certification',
          // Deliberately not one of the twelve types this build knows.
          data_type: 'attachment_ref',
          required: false,
          scope: 'item',
          is_variant_axis: false,
          is_filterable: false,
          lookup_endpoint: null,
        },
      ],
    },
    {
      name: 'Pricing',
      sort_order: 1,
      attributes: [
        {
          code: 'list_price',
          label: 'List price',
          data_type: 'money_minor',
          required: true,
          scope: 'item',
          is_variant_axis: false,
          is_filterable: false,
          lookup_endpoint: null,
        },
      ],
    },
    {
      name: 'Logistics',
      sort_order: 2,
      attributes: [
        {
          code: 'dispatch_days',
          label: 'Dispatch days',
          data_type: 'integer',
          required: false,
          scope: 'offer',
          is_variant_axis: false,
          is_filterable: false,
          min: 0,
          max: 30,
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
  createResult?: 'ok' | 'attribute-invalid'
}

interface MockState {
  createdBody: () => Record<string, unknown> | null
}

async function mockListing(page: Page, options: MockOptions = {}): Promise<MockState> {
  let createdBody: Record<string, unknown> | null = null

  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    // The zone is served under /shop; the gateway path is what follows /v1.
    const path = url.pathname.slice(url.pathname.indexOf('/v1'))
    const method = request.method()

    if (path === '/v1/commerce/categories') return json(route, CATEGORIES)
    if (path === '/v1/commerce/tax-classes') return json(route, TAX_CLASSES)
    if (path === '/v1/commerce/onboarding/status')
      return json(route, { id: 'seller-1', status: 'approved', store_name: 'Sound Store' })
    if (path === '/v1/commerce/sellers/me') return json(route, { id: 'seller-1' })

    if (path === '/v1/commerce/categories/cat-headphones/attribute-schema')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { etag: 'W/"schema-4"' },
        body: JSON.stringify({ data: HEADPHONE_SCHEMA }),
      })

    // Cables has nothing authored against it yet — the fallback's whole reason
    // to exist.
    if (path === '/v1/commerce/categories/cat-cables/attribute-schema')
      return fail(route, 404, 'CATEGORY_NOT_FOUND', 'No schema for this category.')

    if (path === '/v1/commerce/products' && method === 'POST') {
      createdBody = request.postDataJSON()
      if (options.createResult === 'attribute-invalid') {
        return fail(route, 422, 'ATTRIBUTE_VALUES_INVALID', 'Some answers were refused.', {
          fields: [
            { code: 'brand', reason: 'That brand is not approved for this category.' },
            { code: 'dispatch_days', reason: 'Dispatch cannot be longer than 7 days here.' },
          ],
        })
      }
      return json(route, { id: 'prod-1', status: 'draft', approval_status: 'draft' }, 201)
    }

    return json(route, { message: `Unhandled mock route: ${method} ${path}` }, 404)
  })

  await page.addInitScript((userId) => {
    localStorage.setItem('postbook_session', JSON.stringify({ id: userId }))
  }, SELLER_USER_ID)

  return { createdBody: () => createdBody }
}

// ── 1. A category with a schema renders its own fields ─────────

test('a category with a schema renders the fields that category asks for', async ({ page }) => {
  await mockListing(page)
  await page.goto('/shop/sell/products/guided')

  // The picker first. Electronics is a grouping node: clicking it opens it
  // rather than selecting it.
  await page.getByRole('button', { name: /Grouping only/ }).click()
  await page.getByRole('button', { name: /Headphones/ }).click()

  await expect(page.getByRole('heading', { name: 'List in Headphones' })).toBeVisible()
  await expect(page.getByText('Electronics › Headphones')).toBeVisible()
  await expect(page.getByText('form version 4')).toBeVisible()

  // Groups became tabs: the built-in Product tab, the authored item groups, and
  // Offer last.
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveText([/Product/, /Basics/, /Pricing/, /Offer/])

  await page.getByRole('tab', { name: /Basics/ }).click()
  await expect(page.getByLabel('Brand')).toBeVisible()
  await expect(page.getByText('The name printed on the box.')).toBeVisible()
  await expect(page.getByLabel('Warranty months')).toBeVisible()
  await expect(page.getByText('0 of 1 ready')).toBeVisible()

  await page.getByLabel('Brand').fill('Nordheim')
  await expect(page.getByText('1 of 1 ready')).toBeVisible()

  // Offer is last, carries the seller's own fields, and says why.
  await page.getByRole('tab', { name: /Offer/ }).click()
  await expect(
    page.getByText('These are yours. The details above are shared with other sellers.'),
  ).toBeVisible()
  // dispatch_days is offer-scope, so it is here rather than under "Logistics".
  await expect(page.getByLabel('Dispatch days')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Logistics/ })).toHaveCount(0)
})

// ── 2. A category without one falls back to today's form ───────

test('a category with no schema falls back to the standard form', async ({ page }) => {
  await mockListing(page)
  await page.goto('/shop/sell/products/guided?category=cat-cables')

  await expect(page.getByRole('heading', { name: 'List in Cables' })).toBeVisible()
  await expect(page.getByText(/has no questions of its own yet/)).toBeVisible()

  // Today's fields, and no tabs — this is the same form as /sell/products/new.
  await expect(page.getByLabel('Title')).toBeVisible()
  await expect(page.getByLabel('SKU')).toBeVisible()
  await expect(page.getByLabel('MRP')).toBeVisible()
  await expect(page.getByLabel('Selling price')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible()
})

// ── 3. An unknown data type is shown read-only, never dropped ──

test('a data type this build does not know renders read-only instead of vanishing', async ({
  page,
}) => {
  await mockListing(page)
  // The pre-create scratch is where a value for an unrecognised field comes
  // from: it was carried in, and it must survive being carried back out.
  await page.addInitScript(() => {
    localStorage.setItem(
      'atpost.sell.scratch.cat-headphones',
      JSON.stringify({
        categoryId: 'cat-headphones',
        savedAt: Date.now(),
        values: {
          attributes: {
            certification: { type: 'unknown', data_type: 'attachment_ref', value: 'BIS-R-4100' },
          },
        },
      }),
    )
  })
  await page.goto('/shop/sell/products/guided?category=cat-headphones')

  await page.getByRole('tab', { name: /Basics/ }).click()

  const certification = page.locator('#attr-certification')
  await expect(certification).toBeVisible()
  await expect(certification).toHaveValue('BIS-R-4100')
  await expect(certification).toHaveAttribute('readonly', '')
  await expect(page.getByText(/does not know the field type “attachment_ref”/)).toBeVisible()
})

// ── 4. Money refuses a third decimal rather than rounding ──────

test('a money field refuses a third decimal instead of rounding it', async ({ page }) => {
  await mockListing(page)
  await page.goto('/shop/sell/products/guided?category=cat-headphones')

  await page.getByRole('tab', { name: /Pricing/ }).click()
  const price = page.locator('#attr-list_price')
  await expect(price).toBeVisible()

  await price.fill('1299.50')
  await expect(page.locator('#attr-list_price-error')).toHaveCount(0)

  await price.fill('1299.505')
  await expect(page.locator('#attr-list_price-error')).toContainText('at most two decimals')
  // The text the seller typed is still theirs — nothing was silently rounded to
  // 1299.50 or 1299.51 behind them.
  await expect(price).toHaveValue('1299.505')
})

// ── 5. A 422 puts each message under its own control ───────────

test('a 422 puts each refused answer under its own field', async ({ page }) => {
  const state = await mockListing(page, { createResult: 'attribute-invalid' })
  await page.goto('/shop/sell/products/guided?category=cat-headphones')

  await page.getByLabel('Title').fill('Nordheim Studio 40')
  await page.getByLabel('Tax class').selectOption('tax-18')

  await page.getByRole('tab', { name: /Basics/ }).click()
  await page.getByLabel('Brand').fill('Nordheim')

  await page.getByRole('tab', { name: /Pricing/ }).click()
  await page.locator('#attr-list_price').fill('1299')

  await page.getByRole('tab', { name: /Offer/ }).click()
  await page.getByLabel('SKU').fill('NRD-40-BLK')
  await page.getByLabel('MRP').fill('3999')
  await page.getByLabel('Selling price').fill('2499')
  await page.getByLabel('Dispatch days').fill('14')

  await page.getByRole('button', { name: 'Submit for review' }).click()

  // Rupees went out as integer minor units.
  await expect.poll(() => state.createdBody()).not.toBeNull()
  const body = state.createdBody() as {
    status?: string
    attribute_schema_version?: number
    attribute_values?: Record<string, { type: string; value: unknown }>
  }
  expect(body.attribute_values?.list_price).toMatchObject({ type: 'money_minor', value: 129900 })
  expect(body.attribute_schema_version).toBe(4)
  expect(body.status).toBe('draft')

  // Each refusal lands under the control it belongs to, not in one banner.
  await expect(page.locator('#attr-dispatch_days-error')).toContainText(
    'Dispatch cannot be longer than 7 days here.',
  )
  await page.getByRole('tab', { name: /Basics/ }).click()
  await expect(page.locator('#attr-brand-error')).toContainText(
    'That brand is not approved for this category.',
  )
  // The banner points at the fields rather than repeating their messages.
  await expect(page.getByText(/marked on the field it belongs to/)).toBeVisible()
})
