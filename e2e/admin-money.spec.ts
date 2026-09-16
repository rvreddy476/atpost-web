import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// The Money dashboards (Monetization, Payments) against a mocked admin-service:
// every /v1/** call is answered here.

const BASE = 'http://127.0.0.1:3022/admin'

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

const NOT_LAUNCHED = { data: { state: 'not_launched', app: 'monetization', code: 'MONETIZATION_NOT_LAUNCHED', message: 'Monetization is not launched: money actions are not available yet.' } }

test('Monetization while not launched shows the calm switched-off state, never zeros', async ({ page }) => {
  await mockApi(
    page,
    {
      apps: { monetization: ['monetization:stats.read', 'monetization:fraud.review'] },
      navigation: [{ app: 'monetization', label: 'Monetization' }],
    },
    (route, url) => (url.pathname.includes('/v1/admin/monetization/') ? json(route, NOT_LAUNCHED) : false),
  )

  await page.goto(`${BASE}/monetization`)
  await expect(page.getByRole('heading', { name: 'Monetization' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Fraud reviews' })).toBeVisible()
  await expect(page.locator('[data-state="not_launched"]')).toHaveCount(2) // the numbers and the fraud queue
  await expect(page.getByText('Money actions are switched off for the beta').first()).toBeVisible()
  await expect(page.locator('[data-stat]')).toHaveCount(0)
  await expect(page.getByText('No fraud reviews waiting.')).toHaveCount(0)
  await expect(page.getByText(/unavailable/i)).toHaveCount(0)

  await page.goto(BASE)
  const card = page.locator('[data-app-card="monetization"]')
  await expect(card.getByText('Money actions are switched off for the beta')).toBeVisible()
  await expect(card.locator('[data-stat]')).toHaveCount(0)
})

test('a creator fund rate change returns 202 and says it was sent for approval', async ({ page }) => {
  const rate = { id: '11111111-1111-4111-8111-111111111111', content_type: 'reel', region_code: 'IN', rpm_paise: 1200, effective_from: '2026-09-01T00:00:00Z' }
  let putBody: unknown = null
  await mockApi(
    page,
    { apps: { monetization: ['monetization:fund.read', 'monetization:fund.rates'] }, navigation: [{ app: 'monetization', label: 'Monetization' }] },
    (route, url, method) => {
      if (url.pathname.endsWith('/v1/admin/monetization/creator-fund/rates') && method === 'GET') return json(route, { data: [rate] })
      if (url.pathname.endsWith('/v1/admin/monetization/creator-fund/budgets') && method === 'GET') return json(route, { data: { cadence: 'monthly', budgets: [] } })
      if (url.pathname.endsWith('/v1/admin/monetization/creator-fund/rates') && method === 'PUT') {
        putBody = route.request().postDataJSON()
        return json(route, { data: { approval: { id: 'ap-rate', status: 'pending', summary: 'Change the reel rate' } } }, 202)
      }
      return false
    },
  )

  await page.goto(`${BASE}/monetization`)
  await expect(page.getByRole('tab', { name: 'Creator fund' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Change rate reel IN' }).click()

  const dialog = page.getByRole('dialog', { name: 'Change this rate' })
  await expect(dialog.getByText('always goes to a second admin')).toBeVisible()
  await dialog.getByLabel('New rate in rupees per 1,000 views').fill('15')
  await expect(dialog.getByTestId('rate-change')).toContainText('₹12.00 → ₹15.00')
  await dialog.getByLabel('Reason').fill('Raising the reel rate for September')
  await dialog.getByRole('button', { name: 'Send for approval' }).click()

  await expect(page.getByText('Sent for approval', { exact: true })).toBeVisible()
  await expect(page.getByText('Rate changed')).toHaveCount(0)
  expect(putBody).toEqual({ content_type: 'reel', region_code: 'IN', rpm_paise: 1500, notes: 'Raising the reel rate for September', previous_rpm_paise: 1200 })
})

test('a Feast-confined admin sees only Feast payments and no application picker', async ({ page }) => {
  const refund = {
    id: '22222222-2222-4222-8222-222222222222',
    intent_id: '33333333-3333-4333-8333-333333333333',
    application_id: 'feast',
    reference_type: 'food_order',
    reference_id: '44444444-4444-4444-8444-444444444444',
    amount_minor: 120000,
    currency: 'INR',
    status: 'needs_attention',
    attempts: 5,
    last_error: 'provider timeout',
    created_at: '2026-09-16T08:00:00Z',
  }
  const seen = await mockApi(
    page,
    {
      apps: { food: ['food:payments_refunds.read', 'food:payments_stats.read'] },
      navigation: [
        { app: 'food', label: 'Feast' },
        { app: 'payments', label: 'Payments', applications: ['feast'] },
      ],
    },
    (route, url) => {
      if (url.pathname.endsWith('/v1/admin/payments/stats')) {
        return json(route, { data: { applications: { feast: { refunds_needing_attention: 1, stuck_intents: 0, refund_failed_alerts_open: 0, failed_payments_24h: 0, captured_today_minor: 0 } }, total: { refunds_needing_attention: 1 } } })
      }
      if (url.pathname.endsWith('/v1/admin/payments/refunds/needs-attention')) return json(route, { data: { items: [refund], next_cursor: null } })
      if (url.pathname.endsWith('/v1/admin/food/stats')) return json(route, { data: {} })
      return false
    },
  )

  await page.goto(`${BASE}/payments`)
  await expect(page.getByTestId('payments-application')).toContainText('Feast')
  await expect(page.getByRole('combobox', { name: 'Application' })).toHaveCount(0)
  await expect(page.getByText('provider timeout')).toBeVisible()
  await expect(page.locator('[data-stat="refunds_needing_attention"]')).toContainText('1')
  await expect(page.getByRole('tab')).toHaveText(['Refunds needing attention'])
  await expect(page.getByRole('button', { name: `Resolve refund ${refund.id}` })).toHaveCount(0) // no refund.issue

  const paymentsCalls = seen.filter((s) => s.includes('/v1/admin/payments/'))
  expect(paymentsCalls.length).toBeGreaterThan(0)
  for (const call of paymentsCalls) expect(call).toContain('application_id=feast')
  expect(seen.some((s) => /mstore|dating/.test(s))).toBe(false)
})

test('a ₹5,000 manual refund resolve asks for step-up, then goes for approval', async ({ page }) => {
  const refund = {
    id: '55555555-5555-4555-8555-555555555555',
    intent_id: '66666666-6666-4666-8666-666666666666',
    application_id: 'mstore',
    reference_type: 'commerce_order',
    reference_id: '77777777-7777-4777-8777-777777777777',
    amount_minor: 500000,
    currency: 'INR',
    status: 'needs_attention',
    attempts: 8,
    last_error: 'bank account closed',
    created_at: '2026-09-15T08:00:00Z',
  }
  let calls = 0
  const bodies: unknown[] = []
  await mockApi(
    page,
    { apps: { payments: ['payments:refunds.read', 'payments:refund.issue'] }, navigation: [{ app: 'payments', label: 'Payments' }] },
    (route, url, method) => {
      if (url.pathname.endsWith('/v1/admin/payments/refunds/needs-attention')) return json(route, { data: { items: [refund], next_cursor: null } })
      if (url.pathname.endsWith(`/v1/admin/payments/refunds/${refund.id}/resolve`) && method === 'POST') {
        calls += 1
        bodies.push(route.request().postDataJSON())
        if (calls === 1) return apiError(route, 403, 'STEP_UP_REQUIRED')
        return json(route, { data: { approval: { id: 'ap-resolve', status: 'pending', summary: 'Resolve refund as refunded manually' } } }, 202)
      }
      return false
    },
  )

  await page.goto(`${BASE}/payments`)
  await expect(page.getByRole('combobox', { name: 'Application' })).toHaveValue('')
  await page.getByRole('button', { name: `Resolve refund ${refund.id}` }).click()

  const dialog = page.getByRole('dialog', { name: 'Resolve this refund' })
  await dialog.getByLabel('Resolution').selectOption('refunded_manually')
  await expect(dialog.getByTestId('resolve-hint')).toContainText('₹5,000.00 is ₹5,000.00 or more, so a second admin must approve')
  await dialog.getByLabel('Note').fill('Paid back by NEFT, UTR 1234567890')
  await dialog.getByRole('button', { name: 'Resolve' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Sent for approval', { exact: true })).toBeVisible()
  await expect(page.getByText('Refund resolved')).toHaveCount(0)
  expect(calls).toBe(2)
  expect(bodies[1]).toEqual({ resolution: 'refunded_manually', note: 'Paid back by NEFT, UTR 1234567890' })
})
