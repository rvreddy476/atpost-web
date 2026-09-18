import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// Mopedu Pricing (fare windows and surge) against a mocked admin-service:
// every /v1/** call is answered here.

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
const CITY = '11111111-1111-4111-8111-111111111111'

const WINDOW = {
  id: '55555555-5555-4555-8555-555555555555',
  city_id: CITY,
  vehicle_type: null,
  name: 'Morning peak',
  days_of_week: 31,
  start_minute: 480,
  end_minute: 630,
  multiplier_bps: 12500,
  priority: 10,
  is_active: true,
  effective_from: '2026-09-01T00:00:00+05:30',
  effective_to: null,
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-09-01T08:00:00Z',
}

test('Mopedu pricing: surge and fare windows per city, a window is created after step-up, and deactivating asks for a reason', async ({ page }) => {
  const created: unknown[] = []
  const deactivated: unknown[] = []
  let createCalls = 0
  await mockApi(page, { apps: { rider: ['rider:fares.manage'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/surge') && method === 'GET') {
      expect(url.searchParams.get('city_id')).toBe(CITY)
      return json(route, { data: { items: [{ vehicle_type: 'bike', requested: 12, online: 8, demand_bps: 15000, cap_bps: 20000 }, { vehicle_type: 'auto', requested: 3, online: 9, demand_bps: 10000, cap_bps: 20000 }] } })
    }
    if (url.pathname.endsWith('/v1/admin/rider/fare-windows') && method === 'GET') {
      expect(url.searchParams.get('city_id')).toBe(CITY)
      return json(route, { data: { items: [WINDOW] } })
    }
    if (url.pathname.endsWith('/v1/admin/rider/fare-windows') && method === 'POST') {
      createCalls += 1
      created.push(route.request().postDataJSON())
      return createCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, { data: { ...WINDOW, id: '66666666-6666-4666-8666-666666666666', name: 'Evening peak' } }, 201)
    }
    if (url.pathname.endsWith(`/v1/admin/rider/fare-windows/${WINDOW.id}/deactivate`) && method === 'POST') {
      deactivated.push(route.request().postDataJSON())
      return json(route, { data: { ...WINDOW, is_active: false } })
    }
    return false
  })

  await page.goto(`${BASE}/rider`)
  await expect(page.getByRole('tab')).toHaveText(['Fare rules', 'Pricing', 'Coupons'])
  await page.getByRole('tab', { name: 'Pricing' }).click()

  // Nothing is listed until a city is chosen.
  await expect(page.getByText('Choose a city to see its surge.')).toBeVisible()
  await page.getByLabel('City id').first().fill(CITY)
  await page.getByRole('button', { name: 'Show city' }).click()

  // Surge per vehicle type, multipliers as ×1.5; the fare window with its days, span and ×1.25.
  await expect(page.locator('[data-surge="bike"]')).toContainText('×1.5')
  await expect(page.locator('[data-surge="auto"]')).toContainText('×1.0')
  const row = page.getByRole('row', { name: /Morning peak/ })
  await expect(row).toContainText('08:00 – 10:30')
  await expect(row).toContainText('×1.25')
  await expect(row.getByLabel('Monday, Tuesday, Wednesday, Thursday, Friday')).toBeVisible()

  // Create an evening window that also runs on Saturday.
  const form = page.getByRole('form', { name: 'Create a fare window' })
  await expect(form.getByLabel('City id')).toHaveValue(CITY)
  await form.getByLabel('Name').fill('Evening peak')
  const saturday = form.getByRole('button', { name: 'Saturday' })
  await expect(saturday).toHaveAttribute('aria-pressed', 'false')
  await saturday.click()
  await expect(saturday).toHaveAttribute('aria-pressed', 'true')
  await form.getByLabel('Start (HH:MM)').fill('17:30')
  await form.getByLabel('End (HH:MM)').fill('20:30')
  await form.getByLabel('Multiplier (×)').fill('1.2')
  await form.getByLabel('Priority').fill('5')
  await form.getByRole('button', { name: 'Create fare window' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Fare window created')).toBeVisible()
  expect(createCalls).toBe(2)
  expect(created[0]).toEqual({ city_id: CITY, name: 'Evening peak', days_of_week: 63, start_minute: 1050, end_minute: 1230, multiplier_bps: 12000, priority: 5 })
  expect(created[1]).toEqual(created[0])

  // Deactivating is destructive: a reason of ten characters or more, kept on the audit row.
  await page.getByRole('button', { name: 'Deactivate window Morning peak' }).click()
  const dialog = page.getByRole('dialog', { name: 'Deactivate window Morning peak?' })
  await expect(dialog.getByText('Needs a fresh 2FA code')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Deactivate window' })).toBeDisabled()
  await dialog.getByLabel('Reason').fill('Replaced by the evening window')
  await dialog.getByRole('button', { name: 'Deactivate window' }).click()
  await expect(page.getByText('Fare window deactivated')).toBeVisible()
  expect(deactivated).toEqual([{ reason: 'Replaced by the evening window' }])
})

test('Mopedu pricing: a window with the same start and end, or a multiplier over ×3, is refused before anything is sent', async ({ page }) => {
  let posts = 0
  await mockApi(page, { apps: { rider: ['rider:fares.manage'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/fare-windows') && method === 'POST') {
      posts += 1
      return json(route, { data: WINDOW }, 201)
    }
    return false
  })
  await page.goto(`${BASE}/rider`)
  await page.getByRole('tab', { name: 'Pricing' }).click()
  const form = page.getByRole('form', { name: 'Create a fare window' })
  await form.getByLabel('City id').fill(CITY)
  await form.getByLabel('Name').fill('Broken')
  await form.getByLabel('Start (HH:MM)').fill('09:00')
  await form.getByLabel('End (HH:MM)').fill('09:00')
  await form.getByLabel('Multiplier (×)').fill('3.5')
  await form.getByRole('button', { name: 'Create fare window' }).click()
  const problems = form.getByRole('alert')
  await expect(problems).toContainText('Start and end cannot be the same minute.')
  await expect(problems).toContainText('Multiplier must be between ×1.00 and ×3.00.')
  expect(posts).toBe(0)
})
