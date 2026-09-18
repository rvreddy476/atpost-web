import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// Mopedu Coupons against a mocked admin-service: every /v1/** call is
// answered here.

const BASE = 'http://127.0.0.1:3022/admin'

test.describe.configure({ timeout: 150_000 })

type Handler = (route: Route, url: URL, method: string) => Promise<void> | void | false

async function mockApi(page: Page, me: AdminMeFixture, handler: Handler = () => false) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (url.pathname.endsWith('/v1/admin/me')) return json(route, adminMe(me))
    if (url.pathname.endsWith('/v1/auth/admin-session/step-up') && method === 'POST') {
      return json(route, { data: { step_up_valid_until: new Date(Date.now() + 300_000).toISOString() } })
    }
    const handled = await handler(route, url, method)
    if (handled !== false) return
    if (url.pathname.endsWith('/v1/admin/approvals')) return json(route, { data: { items: [] } })
    return json(route, { data: null }, 404)
  })
}

async function completeStepUp(page: Page) {
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('6-digit code').fill('123456')
  await dialog.getByRole('button', { name: 'Verify' }).click()
  await expect(dialog).toBeHidden()
}

const NAV = [{ app: 'rider', label: 'Mopedu' }]

const COUPON = {
  id: '77777777-7777-4777-8777-777777777777',
  code: 'FIRST50',
  description: 'Half off the first ride',
  discount_type: 'percent',
  discount_value_paise: 0,
  percent_bps: 5000,
  max_discount_paise: 5000,
  min_fare_paise: 0,
  city_id: null,
  vehicle_types: ['bike', 'auto'],
  first_ride_only: true,
  per_user_limit: 1,
  total_limit: 1000,
  used_count: 12,
  starts_at: '2026-09-01T00:00:00+05:30',
  ends_at: null,
  is_active: true,
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-09-01T08:00:00Z',
}

const REDEMPTION = {
  id: '88888888-8888-4888-8888-888888888888',
  coupon_id: COUPON.id,
  customer_user_id: '22222222-2222-4222-8222-222222222222',
  ride_id: '44444444-4444-4444-8444-444444444444',
  discount_paise: 2500,
  status: 'applied',
  created_at: '2026-09-10T09:00:00Z',
  updated_at: '2026-09-10T09:20:00Z',
}

test('Mopedu coupons: the list shows value, use and limits; creating asks for step-up; redemptions follow the coupon; deactivating needs a reason', async ({ page }) => {
  const created: unknown[] = []
  const deactivated: unknown[] = []
  const redemptionQueries: string[] = []
  let createCalls = 0
  await mockApi(page, { apps: { rider: ['rider:fares.manage'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/coupons/redemptions') && method === 'GET') {
      redemptionQueries.push(url.searchParams.get('coupon_id') ?? '')
      return json(route, { data: { items: url.searchParams.get('coupon_id') === COUPON.id ? [REDEMPTION] : [] } })
    }
    if (url.pathname.endsWith('/v1/admin/rider/coupons') && method === 'GET') {
      expect(url.searchParams.get('active')).toBe('true')
      return json(route, { data: { items: [COUPON] } })
    }
    if (url.pathname.endsWith('/v1/admin/rider/coupons') && method === 'POST') {
      createCalls += 1
      created.push(route.request().postDataJSON())
      return createCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, { data: { ...COUPON, id: '99999999-9999-4999-8999-999999999999', code: 'WELCOME20' } }, 201)
    }
    if (url.pathname.endsWith(`/v1/admin/rider/coupons/${COUPON.id}/deactivate`) && method === 'POST') {
      deactivated.push(route.request().postDataJSON())
      return json(route, { data: { ...COUPON, is_active: false } })
    }
    return false
  })

  await page.goto(`${BASE}/rider`)
  await page.getByRole('tab', { name: 'Coupons' }).click()

  const row = page.getByRole('row', { name: /FIRST50/ })
  await expect(row).toContainText('50% off, up to ₹50.00')
  await expect(row).toContainText('active')
  await expect(row.locator('[data-usage]')).toHaveText('12 / 1,000')
  await expect(row).toContainText('Only')
  await expect(row).toContainText('Every city · bike, auto')

  // Create a flat coupon; the code is upper-cased and money goes as paise.
  const form = page.getByRole('form', { name: 'Create a coupon' })
  await form.getByLabel('Code', { exact: true }).fill('welcome20')
  await expect(form.getByLabel('Code', { exact: true })).toHaveValue('WELCOME20')
  await form.getByLabel('Discount', { exact: true }).selectOption('flat')
  await form.getByLabel('Amount off (₹)').fill('20')
  await form.getByLabel('Minimum fare (₹)').fill('99')
  await form.getByLabel('Per-user limit').fill('1')
  await form.getByLabel('Starts').fill('2026-10-01')
  await form.getByRole('button', { name: 'Create coupon' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Coupon created')).toBeVisible()
  expect(createCalls).toBe(2)
  expect(created[0]).toEqual({ code: 'WELCOME20', discount_type: 'flat', discount_value_paise: 2000, min_fare_paise: 9900, per_user_limit: 1, first_ride_only: false, starts_at: '2026-10-01T00:00:00+05:30', is_active: true })
  expect(created[1]).toEqual(created[0])

  // Redemptions of one coupon.
  await page.getByRole('button', { name: 'Redemptions of FIRST50' }).click()
  await expect(page.getByLabel('Coupon id')).toHaveValue(COUPON.id)
  const redemption = page.getByRole('row', { name: /applied/ })
  await expect(redemption).toContainText('₹25.00')
  expect(redemptionQueries).toContain(COUPON.id)

  // Deactivating is destructive: a reason of ten characters or more.
  await page.getByRole('button', { name: 'Deactivate coupon FIRST50' }).click()
  const dialog = page.getByRole('dialog', { name: 'Deactivate coupon FIRST50?' })
  await expect(dialog.getByText('Needs a fresh 2FA code')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Deactivate coupon' })).toBeDisabled()
  await dialog.getByLabel('Reason').fill('Launch offer has ended')
  await dialog.getByRole('button', { name: 'Deactivate coupon' }).click()
  await expect(page.getByText('Coupon deactivated')).toBeVisible()
  expect(deactivated).toEqual([{ reason: 'Launch offer has ended' }])
})

test('Mopedu coupons: editing keeps the code and type, sends a partial body, and a bad percentage is refused before sending', async ({ page }) => {
  const patched: unknown[] = []
  await mockApi(page, { apps: { rider: ['rider:fares.manage'] }, navigation: NAV, stepUpValidUntil: new Date(Date.now() + 300_000).toISOString() }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/coupons/redemptions') && method === 'GET') return json(route, { data: { items: [] } })
    if (url.pathname.endsWith('/v1/admin/rider/coupons') && method === 'GET') return json(route, { data: { items: [COUPON] } })
    if (url.pathname.endsWith(`/v1/admin/rider/coupons/${COUPON.id}`) && method === 'PATCH') {
      patched.push(route.request().postDataJSON())
      return json(route, { data: { ...COUPON, max_discount_paise: 10000 } })
    }
    return false
  })
  await page.goto(`${BASE}/rider`)
  await page.getByRole('tab', { name: 'Coupons' }).click()
  await page.getByRole('button', { name: 'Edit coupon FIRST50' }).click()

  const form = page.getByRole('form', { name: 'Update a coupon' })
  await expect(form.getByLabel('Code', { exact: true })).toHaveValue('FIRST50')
  await expect(form.getByLabel('Code', { exact: true })).toBeDisabled()
  await expect(form.getByLabel('Discount', { exact: true })).toBeDisabled()
  await expect(form.getByLabel('Per cent off')).toHaveValue('50')
  await form.getByLabel('Per cent off').fill('150')
  await form.getByRole('button', { name: 'Update coupon' }).click()
  await expect(form.getByRole('alert')).toContainText('A percent coupon needs a percentage between 0 and 100.')
  expect(patched).toEqual([])

  await form.getByLabel('Per cent off').fill('50')
  await form.getByLabel('Maximum discount (₹)').fill('100')
  await form.getByRole('button', { name: 'Update coupon' }).click()
  await expect(page.getByText('Coupon updated')).toBeVisible()
  expect(patched).toEqual([{ description: 'Half off the first ride', percent_bps: 5000, max_discount_paise: 10000, per_user_limit: 1, total_limit: 1000, first_ride_only: true, starts_at: '2026-09-01T00:00:00+05:30', is_active: true }])
})
