import { expect, test, type Page, type Route } from '@playwright/test'
import { ALL_COMMERCE, adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// The application dashboards against a mocked admin-service: every /v1/** call
// is answered here.

const BASE = 'http://127.0.0.1:3022/admin'

// Each test opens a dashboard route that a cold dev server compiles on first request.
test.describe.configure({ timeout: 150_000 })

type Handler = (route: Route, url: URL, method: string) => Promise<void> | void | false

async function mockApi(page: Page, me: AdminMeFixture, handler: Handler = () => false) {
  const seen: string[] = []
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    seen.push(`${method} ${url.pathname}${url.search}`)
    if (url.pathname.endsWith('/v1/admin/me')) return json(route, adminMe(me))
    if (url.pathname.endsWith('/v1/auth/admin-session/step-up') && method === 'POST') {
      return json(route, { data: { step_up_valid_until: new Date(Date.now() + 300_000).toISOString() } })
    }
    const handled = await handler(route, url, method)
    if (handled !== false) return
    if (url.pathname.endsWith('/v1/admin/approvals')) return json(route, { data: { items: [] } })
    return json(route, { data: null }, 404)
  })
  return seen
}

async function completeStepUp(page: Page) {
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('6-digit code').fill('123456')
  await dialog.getByRole('button', { name: 'Verify' }).click()
  await expect(dialog).toBeHidden()
}

const ALL_NAV = [
  { app: 'dating', label: 'Dating' },
  { app: 'food', label: 'Feast' },
  { app: 'commerce', label: 'MStore' },
  { app: 'trust_safety', label: 'Trust & safety' },
]

test('the overview for an admin with only Dating permissions shows only Dating', async ({ page }) => {
  const seen = await mockApi(
    page,
    { apps: { dating: ['dating:stats.read', 'dating:reports.read'] }, navigation: ALL_NAV },
    (route, url) =>
      url.pathname.endsWith('/v1/admin/dating/stats')
        ? json(route, { data: { panic_open: 2, reports_pending: 7, photos_pending_review: 0, selfies_in_review: 1 } })
        : false,
  )
  await page.goto(BASE)

  const dating = page.locator('[data-app-card="dating"]')
  await expect(dating.getByRole('heading', { name: 'Dating' })).toBeVisible()
  await expect(dating.locator('[data-stat="panic_open"]')).toContainText('Open panics')
  await expect(dating.locator('[data-stat="panic_open"]')).toContainText('2')
  await expect(dating.locator('[data-stat="panic_open"]')).toHaveAttribute('data-tone', 'bad')
  await expect(dating.locator('[data-stat="photos_pending_review"]')).toContainText('0')

  for (const app of ['food', 'commerce', 'trust_safety']) await expect(page.locator(`[data-app-card="${app}"]`)).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: 'Admin' })
  await expect(nav.getByRole('link', { name: 'Feast' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Trust & safety' })).toHaveCount(0)
  expect(seen.filter((s) => /\/(food|commerce|trust)\/stats/.test(s))).toEqual([])
})

test('an overview card whose stats call fails says unavailable, not 0', async ({ page }) => {
  await mockApi(page, { apps: { trust_safety: ['trust_safety:stats.read'] }, navigation: ALL_NAV }, (route, url) =>
    url.pathname.endsWith('/v1/admin/trust/stats') ? apiError(route, 503, 'PRODUCT_UNAVAILABLE') : false,
  )
  await page.goto(BASE)
  const card = page.locator('[data-app-card="trust_safety"]')
  await expect(card.locator('[data-stat="grievances_overdue"]')).toContainText('unavailable')
  await expect(card.locator('[data-stat="grievances_overdue"]')).not.toContainText('0')
})

test('a Dating suspend asks for step-up, then succeeds', async ({ page }) => {
  const report = {
    id: '11111111-1111-4111-8111-111111111111',
    reporter_id: '22222222-2222-4222-8222-222222222222',
    target_id: '33333333-3333-4333-8333-333333333333',
    category: 'harassment',
    reason: 'threats',
    details: 'Sent threats after unmatching',
    status: 'submitted',
    created_at: '2026-09-16T08:00:00Z',
  }
  let enforceCalls = 0
  let stepped = false
  const bodies: unknown[] = []
  await mockApi(
    page,
    { apps: { dating: ['dating:reports.read', 'dating:reports.act', 'dating:users.ban'] }, navigation: ALL_NAV },
    (route, url, method) => {
      if (url.pathname.endsWith('/v1/admin/dating/reports') && method === 'GET') return json(route, { data: { items: [report], limit: 50, offset: 0 } })
      if (url.pathname.endsWith(`/reports/${report.id}/enforce`) && method === 'POST') {
        enforceCalls += 1
        bodies.push(route.request().postDataJSON())
        if (!stepped) {
          stepped = true
          return apiError(route, 403, 'STEP_UP_REQUIRED')
        }
        return json(route, { data: { status: 'suspended' } })
      }
      return false
    },
  )
  await page.goto(`${BASE}/dating`)
  await expect(page.getByText('Sent threats after unmatching')).toBeVisible()
  await page.getByRole('button', { name: `Enforce on report ${report.id}` }).click()

  const dialog = page.getByRole('dialog', { name: 'Suspend or reinstate this profile' })
  await dialog.getByLabel('Enforcement').selectOption('suspend')
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await dialog.getByLabel('Reason').fill('Threatening messages confirmed in the evidence')
  await dialog.getByRole('button', { name: 'Apply' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Enforcement applied')).toBeVisible()
  expect(enforceCalls).toBe(2)
  expect(bodies[1]).toEqual({ action: 'suspend', reason: 'Threatening messages confirmed in the evidence', target_user_id: report.target_id })
})

test('a Feast refund of ₹5,000 returns 202 and says it was sent for approval', async ({ page }) => {
  const order = {
    id: '44444444-4444-4444-8444-444444444444',
    order_number: 'FE-1001',
    user_id: '55555555-5555-4555-8555-555555555555',
    restaurant_name: 'Hyderabad House',
    status: 'DELIVERED',
    payment_status: 'PAID',
    payment_method: 'UPI',
    totals: { final_amount: 6200 },
    placed_at: '2026-09-16T07:00:00Z',
  }
  let refundHeaders: Record<string, string> = {}
  let refundBody: unknown = null
  await mockApi(page, { apps: { food: ['food:orders.read', 'food:refund.issue'] }, navigation: ALL_NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/food/orders') && method === 'GET') return json(route, { data: { items: [order], pagination: { limit: 50, offset: 0 } } })
    if (url.pathname.endsWith(`/v1/admin/food/orders/${order.id}`) && method === 'GET') {
      return json(route, { data: { ...order, items: [], history: [], money: { totals_paise: { final_amount_paise: 620000 } } } })
    }
    if (url.pathname.endsWith(`/orders/${order.id}/refund`) && method === 'POST') {
      refundHeaders = route.request().headers()
      refundBody = route.request().postDataJSON()
      return json(route, { data: { approval: { id: 'ap-7', status: 'pending', summary: 'Refund Feast order 44444444 for ₹5,000.00' } } }, 202)
    }
    return false
  })

  await page.goto(`${BASE}/food`)
  await page.getByRole('button', { name: 'Open order FE-1001' }).click()
  await expect(page.getByRole('heading', { name: 'Order FE-1001' })).toBeVisible()
  await page.getByRole('button', { name: 'Refund', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: 'Refund this order' })
  await dialog.getByLabel('Amount in rupees (leave empty for a full refund)').fill('4999.99')
  await expect(dialog.getByTestId('refund-hint')).not.toContainText('second admin')
  await dialog.getByLabel('Amount in rupees (leave empty for a full refund)').fill('5000')
  await expect(dialog.getByTestId('refund-hint')).toContainText('second admin must approve')
  await dialog.getByLabel('Reason').fill('Order arrived cold and incomplete')
  await dialog.getByRole('button', { name: 'Refund' }).click()

  await expect(page.getByText('Sent for approval')).toBeVisible()
  await expect(page.getByText('Refund issued')).toHaveCount(0)
  expect(refundBody).toEqual({ reason: 'Order arrived cold and incomplete', amount_paise: 500000 })
  expect(refundHeaders['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
})

test('the MStore dashboard keeps the catalogue editor and older screens reachable', async ({ page }) => {
  await mockApi(page, { apps: { commerce: [...ALL_COMMERCE, 'commerce:banners.edit'] }, navigation: ALL_NAV }, (route, url) => {
    if (url.pathname.endsWith('/v1/admin/commerce/sellers/queue')) return json(route, { data: [] })
    if (url.pathname.endsWith('/v1/admin/commerce/products/queue')) return json(route, { data: [] })
    if (url.pathname.endsWith('/v1/admin/commerce/banners')) return json(route, { data: { items: [] } })
    return false
  })
  await page.goto(`${BASE}/commerce`)
  const screens = page.getByRole('list', { name: 'MStore screens' })
  await expect(screens.getByRole('link', { name: /Catalogue/ })).toHaveAttribute('href', '/admin/catalogue')
  await expect(screens.getByRole('link', { name: /Sellers/ })).toContainText('0 waiting')
  await expect(page.getByRole('tab', { name: 'Banners' })).toBeVisible()
  await expect(page.getByText('No banners.')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Dead-letter jobs' })).toHaveCount(0)
})

test('Trust & safety: overturning an appeal asks for step-up', async ({ page }) => {
  const appeal = {
    id: '66666666-6666-4666-8666-666666666666',
    user_id: '77777777-7777-4777-8777-777777777777',
    content_type: 'post',
    content_id: '88888888-8888-4888-8888-888888888888',
    action_taken: 'removed',
    appeal_reason: 'It was satire, not hate speech',
    status: 'open',
    submitted_at: '2026-09-15T08:00:00Z',
  }
  let patchCalls = 0
  let lastBody: unknown = null
  await mockApi(page, { apps: { trust_safety: ['trust_safety:appeals.read', 'trust_safety:appeals.act'] }, navigation: ALL_NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/trust/appeals') && method === 'GET') return json(route, { data: { items: [appeal] } })
    if (url.pathname.endsWith(`/v1/admin/trust/appeals/${appeal.id}`) && method === 'PATCH') {
      patchCalls += 1
      lastBody = route.request().postDataJSON()
      return patchCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, { data: { status: 'updated' } })
    }
    return false
  })

  await page.goto(`${BASE}/trust`)
  await expect(page.getByText('It was satire, not hate speech')).toBeVisible()
  await page.getByRole('button', { name: `Decide appeal ${appeal.id}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Decide this appeal' })
  await dialog.getByLabel('Outcome').selectOption('overturned')
  await expect(dialog.getByText('needs a fresh 2FA code')).toBeVisible()
  await dialog.getByLabel('Note').fill('Context shows clear satire; restore the post')
  await dialog.getByRole('button', { name: 'Confirm' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Appeal decided')).toBeVisible()
  expect(patchCalls).toBe(2)
  expect(lastBody).toEqual({ status: 'overturned', note: 'Context shows clear satire; restore the post' })
})

test('the audit trail pages by cursor and filters by outcome', async ({ page }) => {
  const row = (n: number) => ({
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    app: 'food',
    operation: `food.op.page${n}`,
    actor: '00000000-0000-4000-8000-00000000b002',
    target_type: 'food_order',
    target_id: '44444444-4444-4444-8444-444444444444',
    outcome: 'success',
    status_code: 200,
    request_id: 'req-1',
    created_at: '2026-09-16T09:00:00Z',
  })
  const requests: URLSearchParams[] = []
  await mockApi(page, { platform: ['*:audit.read'], apps: { food: ['food:orders.read'] }, navigation: ALL_NAV }, (route, url) => {
    if (!url.pathname.endsWith('/v1/admin/audit')) return false
    requests.push(url.searchParams)
    const cursor = url.searchParams.get('cursor')
    return cursor === 'c2' ? json(route, { data: { items: [row(2)], next_cursor: '' } }) : json(route, { data: { items: [row(1)], next_cursor: 'c2' } })
  })

  await page.goto(`${BASE}/audit`)
  await expect(page.getByText('food.op.page1')).toBeVisible()
  await expect(page.getByText('b002')).toHaveCount(0) // ids are shortened; no names or emails appear
  await page.getByRole('button', { name: 'Older rows' }).click()
  await expect(page.getByText('food.op.page2')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Older rows' })).toBeDisabled()
  expect(requests.at(-1)?.get('cursor')).toBe('c2')

  await page.getByRole('button', { name: 'Newer rows' }).click()
  await expect(page.getByText('food.op.page1')).toBeVisible()

  await page.getByLabel('Outcome').selectOption('denied')
  await page.getByLabel('From (India time)').fill('2026-09-01')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect.poll(() => requests.at(-1)?.get('outcome')).toBe('denied')
  expect(requests.at(-1)?.get('from')).toBe('2026-09-01T00:00:00+05:30')
  expect(requests.at(-1)?.has('cursor')).toBe(false)
})
