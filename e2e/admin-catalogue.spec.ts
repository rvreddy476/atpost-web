import { expect, test, type Page, type Route } from '@playwright/test'

// The catalogue console, driven against a mocked admin-service. Same shape as
// admin.spec.ts: every /v1/** call is fulfilled here, so the specs assert what
// the screens do with an answer rather than what the gateway happens to hold.

const FASHION = {
  id: 'cat-fashion',
  name: 'Fashion',
  slug: 'fashion',
  parent_id: null,
  display_order: 0,
  is_active: true,
  is_featured: false,
  is_listable: false,
  image_url: null,
  product_count: 412,
  children: [
    {
      id: 'cat-shirts',
      name: 'Shirts',
      slug: 'shirts',
      parent_id: 'cat-fashion',
      display_order: 0,
      is_active: true,
      is_featured: false,
      is_listable: true,
      image_url: null,
      product_count: 94,
      children: [],
    },
  ],
}

const BRAND = {
  id: 'def-brand',
  code: 'brand',
  label: 'Brand',
  help_text: 'The name on the label.',
  placeholder: null,
  data_type: 'text',
  display_group: 'Basics',
  scope: 'item',
  is_required: false,
  is_variant_axis: false,
  is_filterable: true,
  is_searchable: true,
  is_active: true,
  min: null,
  max: null,
  min_len: null,
  max_len: 60,
  regex: null,
  max_values: null,
  unit_family: null,
  default_unit: null,
}

const FASHION_BINDINGS = [
  {
    attribute_definition_id: 'def-brand',
    code: 'brand',
    label: 'Brand',
    data_type: 'text',
    scope: 'item',
    is_required: false,
    is_variant_axis: false,
    is_filterable: true,
    is_excluded: false,
    sort_order: 0,
  },
]

const PUBLIC_SCHEMA = {
  category_id: 'cat-shirts',
  category_path: ['Fashion', 'Shirts'],
  schema_version: 7,
  variation_axes: ['size'],
  groups: [
    {
      name: 'Basics',
      sort_order: 0,
      attributes: [
        {
          code: 'brand',
          label: 'Brand',
          data_type: 'text',
          required: true,
          scope: 'item',
          is_variant_axis: false,
          is_filterable: true,
          max_len: 60,
          lookup_endpoint: null,
        },
      ],
    },
    {
      name: 'Sizing',
      sort_order: 1,
      attributes: [
        {
          code: 'size',
          label: 'Size',
          data_type: 'enum',
          required: false,
          scope: 'item',
          is_variant_axis: true,
          is_filterable: true,
          values: [
            { value: 's', label: 'Small' },
            { value: 'm', label: 'Medium' },
          ],
          lookup_endpoint: null,
        },
      ],
    },
  ],
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

interface MockOptions {
  /** Status for every admin catalogue route — 403 exercises the gate. */
  adminStatus?: number
  onPatchDefinition?: (search: string) => void
}

async function mockCatalogue(page: Page, options: MockOptions = {}) {
  const adminStatus = options.adminStatus ?? 200

  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()

    // Public routes — no auth, and the same payloads the shop consumes.
    if (path.endsWith('/v1/commerce/categories') && url.searchParams.get('tree') === 'true') {
      return json(route, { data: [FASHION] })
    }
    if (path.includes('/v1/commerce/categories/') && path.endsWith('/attribute-schema')) {
      return json(route, { data: PUBLIC_SCHEMA })
    }

    if (path.includes('/v1/admin/commerce/catalogue/')) {
      if (adminStatus !== 200) {
        return json(route, { error: { code: 'FORBIDDEN', message: 'admin scope required' } }, adminStatus)
      }

      if (path.endsWith('/catalogue/attribute-schema') && method === 'GET') {
        return json(route, { data: { draft_dirty: true, published_version: 4, draft_version: 5 } })
      }
      if (path.endsWith('/catalogue/attribute-definitions') && method === 'GET') {
        return json(route, { data: [BRAND] })
      }
      if (path.endsWith('/impact') && method === 'GET') {
        return json(route, { data: { live_products: 12, missing: 3, out_of_range: 0, affected: 3 } })
      }
      if (path.endsWith('/enum-values') && method === 'GET') {
        return json(route, { data: [] })
      }
      if (path.endsWith('/attributes') && method === 'GET') {
        return json(route, { data: path.includes('cat-fashion') ? FASHION_BINDINGS : [] })
      }
      if (path.endsWith('/attribute-definitions/def-brand') && method === 'PATCH') {
        options.onPatchDefinition?.(url.search)
        // A narrowing edit is refused until a human has read the number.
        if (url.searchParams.get('ack_impact') !== '3') {
          return json(
            route,
            {
              error: {
                code: 'IMPACT_ACK_REQUIRED',
                message: 'Resend with ?ack_impact=3 to confirm.',
                affected: 3,
                details: [
                  {
                    code: 'brand',
                    label: 'Brand',
                    live_products: 12,
                    missing: 3,
                    out_of_range: 0,
                    affected: 3,
                  },
                ],
              },
            },
            409,
          )
        }
        return json(route, { data: { ...BRAND, is_required: true } })
      }
      return json(route, { data: {} })
    }

    return json(route, { data: null }, 404)
  })
}

const CATALOGUE_URL = 'http://127.0.0.1:3022/admin/catalogue'
const EDITOR_URL = 'http://127.0.0.1:3022/admin/catalogue/attributes?definition=def-brand'

test('the admin gate hides the console when the API answers 403', async ({ page }) => {
  await mockCatalogue(page, { adminStatus: 403 })
  await page.goto(CATALOGUE_URL)

  await expect(page.getByRole('heading', { name: 'You do not have admin access' })).toBeVisible()
  // A real component boundary: the nav is not rendered at all, not hidden.
  await expect(page.getByRole('link', { name: 'Catalogue' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Catalogue', exact: true })).toHaveCount(0)
})

test('the admin gate renders the console when the API answers 200', async ({ page }) => {
  await mockCatalogue(page)
  await page.goto(CATALOGUE_URL)

  await expect(page.getByRole('heading', { name: 'Catalogue', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Catalogue' })).toBeVisible()
  await expect(page.getByText('You do not have admin access')).toHaveCount(0)
})

test('the tree renders nested categories and opens their attributes', async ({ page }) => {
  await mockCatalogue(page)
  await page.goto(CATALOGUE_URL)

  const tree = page.getByRole('tree', { name: 'Product categories' })
  // exact: true — each row also carries a meta line ("shirts · 94 products"),
  // which a loose substring match would hit as well.
  await expect(tree.getByText('Fashion', { exact: true })).toBeVisible()
  await expect(tree.getByText('Shirts', { exact: true })).toBeVisible()

  // Collapsing hides the child; expanding brings it back.
  await tree.getByRole('button', { name: 'Collapse' }).first().click()
  await expect(tree.getByText('Shirts', { exact: true })).toHaveCount(0)
  await tree.getByRole('button', { name: 'Expand' }).first().click()
  await expect(tree.getByText('Shirts', { exact: true })).toBeVisible()

  // Fashion owns Brand outright…
  await expect(page.getByText('set here')).toBeVisible()

  // …and Shirts inherits it, saying so.
  await tree.getByRole('button', { name: /^Shirts/ }).click()
  await expect(page.getByText('inherited from Fashion')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Override' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exclude' })).toBeVisible()
})

test('a saved attribute code cannot be edited', async ({ page }) => {
  await mockCatalogue(page)
  await page.goto(EDITOR_URL)

  const code = page.getByTestId('definition-code')
  await expect(code).toHaveValue('brand')
  await expect(code).toBeDisabled()
  await expect(page.getByText(/wire identity/i).first()).toBeVisible()
})

test('the regex tester says pass or fail on the sample as it is typed', async ({ page }) => {
  await mockCatalogue(page)
  await page.goto(EDITOR_URL)

  const pattern = page.getByLabel('Validation pattern')
  const sample = page.getByLabel('Sample value to test against the pattern')
  await expect(page.getByTestId('regex-verdict')).toContainText('any text is accepted')

  await pattern.fill('[A-Z]{2}-\\d{4}')
  await expect(page.getByTestId('regex-verdict')).toContainText('Type a sample value')

  await sample.fill('AB-1234')
  await expect(page.getByTestId('regex-verdict')).toContainText('Sample passes')

  await sample.fill('ab-1')
  await expect(page.getByTestId('regex-verdict')).toContainText('Sample fails')

  // A pattern that does not compile is caught here rather than at a seller.
  await pattern.fill('[unclosed')
  await expect(page.getByTestId('regex-verdict')).toContainText('not a valid pattern')
})

test('a narrowing edit shows its impact, then succeeds with the acknowledgement', async ({
  page,
}) => {
  const searches: string[] = []
  await mockCatalogue(page, { onPatchDefinition: (search) => searches.push(search) })
  await page.goto(EDITOR_URL)

  await page.getByRole('checkbox', { name: /^Required/ }).check()
  await page.getByRole('button', { name: 'Save changes' }).click()

  // The 409, in plain words, with the count the server sent.
  await expect(
    page.getByRole('heading', { name: 'This change narrows what sellers may enter' }),
  ).toBeVisible()
  await expect(page.getByText(/3 live listings would stop matching/)).toBeVisible()
  await expect(page.getByText(/12 products use it today/)).toBeVisible()

  // The first attempt carried no acknowledgement — that is the whole point.
  expect(searches).toHaveLength(1)
  expect(searches[0]).not.toContain('ack_impact')

  await page.getByRole('button', { name: /Apply anyway — I accept 3 affected/ }).click()

  await expect(page.getByText('“Brand” saved')).toBeVisible()
  expect(searches).toHaveLength(2)
  expect(searches[1]).toContain('ack_impact=3')
})

test('the seller form preview renders the public schema, group by group', async ({ page }) => {
  await mockCatalogue(page)
  await page.goto(CATALOGUE_URL)

  await page.getByRole('tab', { name: 'Seller form preview' }).click()
  await expect(page.getByText(/schema version/)).toBeVisible()

  const groups = page.getByRole('tablist', { name: 'Seller form groups' })
  await expect(groups.getByRole('tab', { name: /Basics/ })).toBeVisible()
  await expect(groups.getByRole('tab', { name: /Sizing/ })).toBeVisible()

  // Brand is required and empty, so the Basics badge reads 0 / 1.
  await expect(groups.getByRole('tab', { name: /Basics/ })).toContainText('0 / 1')
  await page.getByLabel('Brand').fill('Levi’s')
  await expect(groups.getByRole('tab', { name: /Basics/ })).toContainText('1 / 1')
})

test('the publish bar shows unpublished changes and publishes', async ({ page }) => {
  await mockCatalogue(page)
  await page.goto(CATALOGUE_URL)

  const bar = page.getByTestId('publish-bar')
  await expect(bar).toContainText('Unpublished changes')
  await expect(bar).toContainText('Live version 4')
  await bar.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText(/Taxonomy published/)).toBeVisible()
})
