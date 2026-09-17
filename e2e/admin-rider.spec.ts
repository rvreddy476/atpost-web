import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// The Mopedu dashboard against a mocked admin-service: every /v1/** call is
// answered here.

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

const NAV = [{ app: 'rider', label: 'Mopedu' }]

const PARTNER = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  partner_type: 'individual',
  full_name: 'Asha Kumar',
  phone: '+919876543210',
  status: 'active',
  kyc_status: 'verified',
  bank_status: 'verified',
  rating: 4.6,
  total_rides_completed: 120,
  total_rides_cancelled: 3,
  acceptance_rate: 0.92,
  cancellation_rate: 0.02,
  fraud_score: 0.1,
  is_online: true,
  created_at: '2026-08-01T08:00:00Z',
}

test('Mopedu: the stats lead with partners, incidents and complaints, and blocking a partner asks for step-up', async ({ page }) => {
  let blockCalls = 0
  const bodies: unknown[] = []
  await mockApi(page, { apps: { rider: ['rider:stats.read', 'rider:partners.read', 'rider:partners.suspend'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/stats')) {
      return json(route, { data: { partners_pending_review: 4, open_safety_incidents: 1, open_complaints: 0, documents_pending: 2, live_rides_now: 7, revenue_today_paise: 150000, generated_at: '2026-09-17T09:00:00Z' } })
    }
    if (url.pathname.endsWith('/v1/admin/rider/partners') && method === 'GET') return json(route, { data: { items: [PARTNER] } })
    if (url.pathname.endsWith(`/v1/admin/rider/partners/${PARTNER.id}`) && method === 'GET') return json(route, { data: PARTNER })
    if (url.pathname.endsWith(`/v1/admin/rider/partners/${PARTNER.id}/block`) && method === 'POST') {
      blockCalls += 1
      bodies.push(route.request().postDataJSON())
      return blockCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, { data: { ok: true } })
    }
    return false
  })

  await page.goto(`${BASE}/rider`)
  await expect(page.getByRole('heading', { name: 'Mopedu' })).toBeVisible()
  const tiles = page.locator('[data-stat]')
  await expect(tiles.nth(0)).toHaveAttribute('data-stat', 'partners_pending_review')
  await expect(tiles.nth(1)).toHaveAttribute('data-stat', 'open_safety_incidents')
  await expect(tiles.nth(2)).toHaveAttribute('data-stat', 'open_complaints')
  await expect(page.locator('[data-stat="open_safety_incidents"]')).toHaveAttribute('data-tone', 'bad')
  await expect(page.locator('[data-stat="revenue_today_paise"]')).toContainText('₹1,500.00')
  // Only the sections these permissions cover.
  await expect(page.getByRole('tab')).toHaveText(['Partners'])

  // The list masks the phone number; the detail shows it.
  await page.getByLabel('Status').selectOption('active')
  await expect(page.getByText('•••• 3210')).toBeVisible()
  await expect(page.getByText('+919876543210')).toHaveCount(0)
  await page.getByRole('button', { name: `Open partner ${PARTNER.id}` }).click()
  await expect(page.getByText('+919876543210')).toBeVisible()
  // No approve permission: no Approve / Reject; suspend permission: Suspend and Block.
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible()
  await page.getByRole('button', { name: 'Block' }).click()

  const dialog = page.getByRole('dialog', { name: 'Block Asha Kumar?' })
  await expect(dialog.getByText('Needs a fresh 2FA code')).toBeVisible()
  // Destructive: nothing can be confirmed without a reason the audit row keeps.
  await expect(dialog.getByRole('button', { name: 'Block' })).toBeDisabled()
  await dialog.getByLabel('Reason').fill('Repeated fake-GPS reports confirmed by the matcher')
  await dialog.getByRole('button', { name: 'Block' }).click()

  await completeStepUp(page)
  await expect(page.getByText('Partner blocked')).toBeVisible()
  expect(blockCalls).toBe(2)
  expect(bodies[0]).toEqual({ reason: 'Repeated fake-GPS reports confirmed by the matcher' })
  expect(bodies[1]).toEqual(bodies[0])
})

test('Mopedu: the document list is a reveal that asks for step-up, and Hide drops the numbers', async ({ page }) => {
  const doc = { id: '33333333-3333-4333-8333-333333333333', partner_id: PARTNER.id, document_type: 'driving_licence', document_number: 'TS09 20260001234', file_url: 'https://files.example.com/dl.jpg', status: 'pending', created_at: '2026-09-10T08:00:00Z' }
  let listCalls = 0
  await mockApi(page, { apps: { rider: ['rider:documents.review'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/documents') && method === 'GET') {
      listCalls += 1
      expect(url.searchParams.get('status')).toBe('pending')
      return listCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, { data: { items: [doc] } })
    }
    return false
  })

  await page.goto(`${BASE}/rider`)
  await expect(page.getByRole('tab')).toHaveText(['Documents'])
  await expect(page.locator('[data-blurred="true"]')).toBeVisible()
  await expect(page.getByText('TS09 20260001234')).toHaveCount(0)
  expect(listCalls).toBe(0) // nothing is read until the admin asks

  await page.getByRole('button', { name: 'Reveal documents' }).click()
  await completeStepUp(page)
  await expect(page.locator('[data-blurred="false"]')).toBeVisible()
  await expect(page.locator('[data-document-number]')).toHaveText('TS09 20260001234')
  await expect(page.getByRole('button', { name: `Verify document ${doc.id}` })).toBeVisible()
  expect(listCalls).toBe(2)

  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(page.locator('[data-blurred="true"]')).toBeVisible()
  await expect(page.getByText('TS09 20260001234')).toHaveCount(0)
})

test('Mopedu: a dismissed step-up leaves the document list hidden', async ({ page }) => {
  let listCalls = 0
  await mockApi(page, { apps: { rider: ['rider:documents.review'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/documents') && method === 'GET') {
      listCalls += 1
      return apiError(route, 403, 'STEP_UP_REQUIRED')
    }
    return false
  })
  await page.goto(`${BASE}/rider`)
  await page.getByRole('button', { name: 'Reveal documents' }).click()
  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-blurred="true"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reveal documents' })).toBeEnabled()
  expect(listCalls).toBe(1)
})
