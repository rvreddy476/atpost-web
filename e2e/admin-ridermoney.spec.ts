import { expect, test, type Page, type Route } from '@playwright/test'
import { adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// Mopedu Money (ride payments, outstanding fees, refunds) against a mocked
// admin-service: every /v1/** call is answered here. The refund and the
// waiver are two-person: the first admin's confirmation answers 202 and
// lands in the approvals inbox.

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
const RIDE = '44444444-4444-4444-8444-444444444444'
const CUSTOMER = '22222222-2222-4222-8222-222222222222'

const PAYMENT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ride_id: RIDE,
  customer_user_id: CUSTOMER,
  partner_id: '11111111-1111-4111-8111-111111111111',
  amount_paise: 25000,
  payment_method: 'upi',
  status: 'succeeded',
  intent_id: 'pi_123',
  refunded_paise: 5000,
  failure_reason: null,
  created_at: '2026-09-15T09:00:00Z',
  settled_at: '2026-09-15T09:01:00Z',
}

const FAILED = { ...PAYMENT, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ride_id: '45454545-4545-4545-8545-454545454545', status: 'failed', refunded_paise: 0, failure_reason: 'UPI timed out', settled_at: null }

const FEE = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  customer_user_id: CUSTOMER,
  ride_id: RIDE,
  amount_paise: 10000,
  reason: 'Cancelled after the partner arrived',
  status: 'pending',
  created_at: '2026-09-16T10:00:00Z',
}

const REFUND = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  ride_id: RIDE,
  payment_id: PAYMENT.id,
  intent_id: 'pi_123',
  amount_paise: 5000,
  reason: 'Detour charged',
  status: 'requested',
  requested_by: '00000000-0000-4000-8000-00000000a001',
  created_at: '2026-09-16T11:00:00Z',
  updated_at: '2026-09-16T11:00:00Z',
}

const APPROVAL = (id: string, operation: string) => ({ data: { approval: { id, status: 'pending', app: 'rider', operation, summary: 'pending', requested_by: '00000000-0000-4000-8000-00000000a001' } } })

test('Mopedu money: payments list from paise, a refund is capped at what remains, needs step-up and lands in the approvals inbox', async ({ page }) => {
  const refunds: unknown[] = []
  let refundCalls = 0
  await mockApi(page, { apps: { rider: ['rider:payments.read', 'rider:payments.settle'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/ride-payments') && method === 'GET') {
      if (url.searchParams.get('cursor') === 'c2') return json(route, { data: { items: [FAILED] } })
      expect(url.searchParams.get('status')).toBeNull()
      return json(route, { data: { items: [PAYMENT, FAILED], next_cursor: 'c2' } })
    }
    if (url.pathname.endsWith(`/v1/admin/rider/rides/${RIDE}/refund`) && method === 'POST') {
      refundCalls += 1
      refunds.push(route.request().postDataJSON())
      return refundCalls === 1 ? apiError(route, 403, 'STEP_UP_REQUIRED') : json(route, APPROVAL('ap-1', 'rider.ride.refund'), 202)
    }
    return false
  })

  await page.goto(`${BASE}/rider`)
  await expect(page.getByRole('tab')).toHaveText(['Payments', 'Money'])
  await page.getByRole('tab', { name: 'Money' }).click()

  const paid = page.getByRole('row', { name: /succeeded/ })
  await expect(paid.locator('[data-paise="25000"]')).toHaveText('₹250.00')
  await expect(paid).toContainText('₹50.00') // already refunded
  await expect(paid).toContainText('Upi')
  const failed = page.getByRole('row', { name: /failed/ })
  await expect(failed).toContainText('UPI timed out')
  // Only collected money can be refunded.
  await expect(page.getByRole('button', { name: `Refund ride ${RIDE}` })).toBeVisible()
  await expect(page.getByRole('button', { name: `Refund ride ${FAILED.ride_id}` })).toHaveCount(0)

  await page.getByRole('button', { name: `Refund ride ${RIDE}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Refund ride 44444444?' })
  await expect(dialog.getByText('second admin holding rider:payments.settle must approve')).toBeVisible()
  await expect(dialog.locator('[data-refund-remaining="20000"]')).toContainText('Up to ₹200.00 can be returned')
  const confirm = dialog.getByRole('button', { name: 'Refund ride' })
  await dialog.getByLabel('Reason').fill('Partner took a long detour')
  // More than what remains is refused in the dialog.
  await dialog.getByLabel('Amount (₹)').fill('250')
  await expect(dialog.getByText('At most ₹200.00 can still be refunded.')).toBeVisible()
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Amount (₹)').fill('150')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await completeStepUp(page)
  // 202: sent for approval, never "Refund issued".
  await expect(page.getByText('Sent for approval')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open the approvals inbox' })).toHaveAttribute('href', /\/approvals$/)
  await expect(page.getByText('Refund issued')).toHaveCount(0)
  await expect(dialog).toBeHidden()
  expect(refundCalls).toBe(2)
  expect(refunds[0]).toEqual({ amount_paise: 15000, reason: 'Partner took a long detour' })
  expect(refunds[1]).toEqual(refunds[0])

  // Cursor paging follows the server's next_cursor.
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Page 2')).toBeVisible()
  await expect(page.getByRole('row', { name: /succeeded/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('Mopedu money: waiving an outstanding fee is two-person; refunds list their status', async ({ page }) => {
  const waives: unknown[] = []
  await mockApi(page, { apps: { rider: ['rider:payments.read', 'rider:payments.settle'] }, navigation: NAV, stepUpValidUntil: new Date(Date.now() + 300_000).toISOString() }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/ride-payments') && method === 'GET') return json(route, { data: { items: [] } })
    if (url.pathname.endsWith('/v1/admin/rider/outstanding') && method === 'GET') {
      expect(url.searchParams.get('status')).toBe('pending')
      return json(route, { data: { items: [FEE] } })
    }
    if (url.pathname.endsWith(`/v1/admin/rider/outstanding/${FEE.id}/waive`) && method === 'POST') {
      waives.push(route.request().postDataJSON())
      return json(route, APPROVAL('ap-2', 'rider.outstanding.waive'), 202)
    }
    if (url.pathname.endsWith('/v1/admin/rider/refunds') && method === 'GET') return json(route, { data: { items: [REFUND] } })
    return false
  })

  await page.goto(`${BASE}/rider`)
  await page.getByRole('tab', { name: 'Money' }).click()
  await page.getByRole('button', { name: 'Outstanding fees' }).click()

  const fee = page.getByRole('row', { name: /Cancelled after the partner arrived/ })
  await expect(fee.locator('[data-paise="10000"]')).toHaveText('₹100.00')
  await page.getByRole('button', { name: `Waive fee ${FEE.id}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Waive fee of ₹100.00?' })
  await expect(dialog.getByText('second admin holding rider:payments.settle must approve')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Waive fee' })).toBeDisabled()
  await dialog.getByLabel('Reason').fill('Partner cancelled, fee charged in error')
  await dialog.getByRole('button', { name: 'Waive fee' }).click()
  await expect(page.getByText('Sent for approval')).toBeVisible()
  await expect(page.getByText('Fee waived')).toHaveCount(0)
  expect(waives).toEqual([{ reason: 'Partner cancelled, fee charged in error' }])

  await page.getByRole('button', { name: 'Refunds' }).click()
  const refund = page.getByRole('row', { name: /Detour charged/ })
  await expect(refund.locator('[data-paise="5000"]')).toHaveText('₹50.00')
  await expect(refund).toContainText('requested')
})

test('Mopedu money: a reader sees the lists without Refund or Waive buttons', async ({ page }) => {
  await mockApi(page, { apps: { rider: ['rider:payments.read'] }, navigation: NAV }, (route, url, method) => {
    if (url.pathname.endsWith('/v1/admin/rider/ride-payments') && method === 'GET') return json(route, { data: { items: [PAYMENT] } })
    if (url.pathname.endsWith('/v1/admin/rider/outstanding') && method === 'GET') return json(route, { data: { items: [FEE] } })
    return false
  })
  await page.goto(`${BASE}/rider`)
  await page.getByRole('tab', { name: 'Money' }).click()
  await expect(page.getByRole('row', { name: /succeeded/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Refund ride/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Outstanding fees' }).click()
  await expect(page.getByRole('row', { name: /Cancelled after the partner arrived/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Waive fee/ })).toHaveCount(0)
})
