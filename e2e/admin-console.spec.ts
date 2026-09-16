import { expect, test, type Page, type Route } from '@playwright/test'
import { ADMIN_USER_ID, ALL_COMMERCE, adminMe, apiError, json, type AdminMeFixture } from './admin-fixtures'

// The admin console shell against a mocked admin-service: every /v1/** call is
// answered here, so these specs assert what the shell does with each answer.

const BASE = 'http://127.0.0.1:3022/admin'

type Handler = (route: Route, path: string, method: string) => Promise<void> | void | false

async function mockApi(page: Page, me: AdminMeFixture | { status: number; code: string }, handler: Handler = () => false) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    if (path.endsWith('/v1/admin/me')) {
      return 'status' in me ? apiError(route, me.status, me.code) : json(route, adminMe(me))
    }
    const handled = await handler(route, path, method)
    if (handled !== false) return
    return json(route, { data: null }, 404)
  })
}

/** Collects Content-Security-Policy violations reported in the console. */
function watchCsp(page: Page) {
  const violations: string[] = []
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(msg.text())) violations.push(msg.text())
  })
  return violations
}

test('an admin whose session is not 2FA-verified sees only the blocking screen', async ({ page }) => {
  await mockApi(page, { verified: false }, (route, path) => {
    if (path.endsWith('/v1/auth/me/capabilities')) return json(route, { data: { admin: { mfa_enrolled: false } } })
    return false
  })
  await page.goto(`${BASE}/sellers`)

  await expect(page.getByRole('heading', { name: 'Two-factor authentication is required' })).toBeVisible()
  await expect(page.getByTestId('mfa-enrol')).toContainText('no authenticator enrolled')
  await expect(page.getByTestId('mfa-verify')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Seller queue' })).toHaveCount(0)
})

test('403 MFA_REQUIRED from /me also blocks the console', async ({ page }) => {
  await mockApi(page, { status: 403, code: 'MFA_REQUIRED' })
  await page.goto(BASE)
  await expect(page.getByRole('heading', { name: 'Two-factor authentication is required' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0)
})

test('the console stays closed when permissions cannot be checked', async ({ page }) => {
  await mockApi(page, { status: 503, code: 'PERMISSIONS_UNAVAILABLE' })
  await page.goto(BASE)
  await expect(page.getByRole('heading', { name: 'We could not check your admin access' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0)
})

test('navigation shows only the applications this admin holds permissions for', async ({ page }) => {
  // Visits three routes; on a cold dev server each compiles on first request.
  test.slow()
  const violations = watchCsp(page)
  await mockApi(
    page,
    {
      apps: { dating: ['dating:reports.act'], food: [], commerce: ['commerce:products.moderate'] },
      navigation: [
        { app: 'dating', label: 'Dating' },
        { app: 'food', label: 'Feast' },
        { app: 'commerce', label: 'MStore' },
        { app: 'rider', label: 'Mopedu' },
      ],
    },
    (route, path) => (path.endsWith('/v1/admin/approvals') ? json(route, { data: [] }) : false),
  )
  const response = await page.goto(BASE)

  const nav = page.getByRole('navigation', { name: 'Admin' })
  await expect(nav.getByRole('link', { name: 'Dating' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'MStore' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Feast' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Mopedu' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Approvals' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Access' })).toHaveCount(0)

  // A typed URL for an app outside the navigation is refused too.
  await page.goto(`${BASE}/food`)
  await expect(page.getByRole('heading', { name: 'This area is not available to you' })).toBeVisible()

  // Inside MStore, only the section this permission covers is offered.
  await page.goto(`${BASE}/commerce`)
  await expect(nav.getByRole('link', { name: 'Products' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Sellers' })).toHaveCount(0)

  const csp = response?.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
  expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  expect(violations).toEqual([])
})

test('a mutation that needs step-up opens the 2FA dialog and retries once', async ({ page }) => {
  const seller = { id: '33333333-3333-4333-8333-333333333333', store_name: 'Asha Stores', email: 'asha@example.com', seller_type: 'individual', status: 'pending' }
  let kycCalls = 0
  let stepUpBody: unknown = null
  let stepUpDone = false

  await mockApi(page, { apps: { commerce: ALL_COMMERCE } }, (route, path, method) => {
    if (path.endsWith('/v1/admin/commerce/sellers/queue')) return json(route, { data: [seller] })
    if (path.endsWith(`/sellers/${seller.id}/kyc/verify`) && method === 'POST') {
      kycCalls += 1
      if (!stepUpDone) return apiError(route, 403, 'STEP_UP_REQUIRED', 'step-up required')
      return json(route, { data: { status: 'verified' } })
    }
    if (path.endsWith('/v1/auth/step-up') && method === 'POST') {
      stepUpBody = route.request().postDataJSON()
      stepUpDone = true
      return json(route, { data: { step_up_valid_until: new Date(Date.now() + 300_000).toISOString() } })
    }
    return false
  })

  await page.goto(`${BASE}/sellers`)
  await expect(page.getByText('Asha Stores')).toBeVisible()
  await page.getByRole('button', { name: 'Verify KYC' }).click()

  const dialog = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(dialog).toBeVisible()
  expect(kycCalls).toBe(1)
  await dialog.getByLabel('6-digit code').fill('123456')
  await dialog.getByRole('button', { name: 'Verify' }).click()

  await expect(page.getByText('KYC verified')).toBeVisible()
  await expect(dialog).toBeHidden()
  expect(stepUpBody).toEqual({ otp: '123456' })
  expect(kycCalls).toBe(2)
})

test('another 403 does not open the 2FA dialog', async ({ page }) => {
  const seller = { id: '44444444-4444-4444-8444-444444444444', store_name: 'Deccan Foods', email: 'd@example.com', seller_type: 'business', status: 'pending' }
  let approveCalls = 0
  await mockApi(page, {}, (route, path, method) => {
    if (path.endsWith('/v1/admin/commerce/sellers/queue')) return json(route, { data: [seller] })
    if (path.endsWith(`/sellers/${seller.id}/approve`) && method === 'POST') {
      approveCalls += 1
      return apiError(route, 403, 'FORBIDDEN', 'permission denied')
    }
    return false
  })
  await page.goto(`${BASE}/sellers`)
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Seller approved failed')).toBeVisible()
  await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toHaveCount(0)
  expect(approveCalls).toBe(1)
})

test('a two-person action answering 202 says it was sent for approval', async ({ page }) => {
  const product = { id: '55555555-5555-4555-8555-555555555555', title: 'Brass Lamp', approval_status: 'submitted' }
  await mockApi(page, {}, (route, path, method) => {
    if (path.endsWith('/v1/admin/commerce/products/queue')) return json(route, { data: [product] })
    if (path.endsWith(`/products/${product.id}/approve`) && method === 'POST') {
      return json(route, { data: { approval: { id: 'ap-9', status: 'pending' } } }, 202)
    }
    return false
  })
  await page.goto(`${BASE}/products`)
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Sent for approval')).toBeVisible()
  await expect(page.getByText('Product approved')).toHaveCount(0)
  await page.getByRole('link', { name: 'Open the approvals inbox' }).click()
  await expect(page).toHaveURL(`${BASE}/approvals`)
})

test('the approvals inbox lists requests and approves one with a reason', async ({ page }) => {
  let decided = false
  let approveBody: unknown = null
  const approval = {
    id: 'ap-1',
    status: 'pending',
    app: 'commerce',
    operation: 'cod.settle',
    summary: 'Settle COD remittance for Asha Stores',
    requested_by: '00000000-0000-4000-8000-00000000b002',
    requested_at: '2026-09-16T09:00:00Z',
    expires_at: '2026-09-17T09:00:00Z',
    reason: 'Courier remitted in full',
  }
  await mockApi(page, { platform: ['platform:roles.grant'], apps: { commerce: ALL_COMMERCE } }, (route, path, method) => {
    if (path.endsWith('/v1/admin/approvals') && method === 'GET') return json(route, { data: decided ? [] : [approval] })
    if (path.endsWith('/v1/admin/approvals/ap-1/approve') && method === 'POST') {
      approveBody = route.request().postDataJSON()
      decided = true
      return json(route, { data: { status: 'executed' } })
    }
    return false
  })

  await page.goto(`${BASE}/approvals`)
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible()
  await expect(page.getByText('Settle COD remittance for Asha Stores')).toBeVisible()

  await page.getByRole('button', { name: 'Approve Settle COD remittance for Asha Stores' }).click()
  const dialog = page.getByRole('dialog', { name: 'Approve this request?' })
  await expect(dialog.getByRole('button', { name: 'Approve' })).toBeDisabled()
  await dialog.getByLabel('Reason').fill('Checked the courier statement')
  await dialog.getByRole('button', { name: 'Approve' }).click()

  await expect(page.getByText('Approved and carried out')).toBeVisible()
  await expect(page.getByText('No approvals are waiting for you.')).toBeVisible()
  expect(approveBody).toEqual({ reason: 'Checked the courier statement' })
  expect(ADMIN_USER_ID).not.toBe(approval.requested_by)
})
