import { expect, test, type Page, type Request } from '@playwright/test'
import { adminMe, apiError, json } from './admin-fixtures'

// Sign-in on the console's own host, against a mocked auth-service
// /v1/auth/admin-session/* and admin-service /v1/admin/me.

const BASE = 'http://127.0.0.1:3022/admin'

interface Mock {
  signedIn: boolean
  requests: Array<{ method: string; path: string; body: unknown; csrf: string | undefined }>
  login?: (body: { identifier?: string; password?: string }) => { status: number; body: unknown }
}

async function mockAuth(page: Page, mock: Mock) {
  await page.route('**/v1/**', async (route) => {
    const req: Request = route.request()
    const path = new URL(req.url()).pathname.replace(/^\/admin/, '')
    const method = req.method()
    const body = method === 'GET' ? null : req.postDataJSON()
    mock.requests.push({ method, path, body, csrf: req.headers()['x-csrf-token'] })

    if (path === '/v1/admin/me') return mock.signedIn ? json(route, adminMe()) : apiError(route, 401, 'UNAUTHORIZED')
    if (path === '/v1/auth/admin-session/refresh') return apiError(route, 401, 'AUTH_FAILED')
    if (path === '/v1/auth/admin-session' && method === 'GET') {
      return mock.signedIn ? json(route, { data: { email: 'founder@example.test', admin_mfa: true } }) : apiError(route, 401, 'UNAUTHORIZED')
    }
    if (path === '/v1/auth/admin-session/login' && method === 'POST') {
      const answer = mock.login?.(body) ?? {
        status: 200,
        body: { data: { requires_2fa: true, pending_token: 'pending-1', expires_at: '2026-09-16T12:05:00Z' } },
      }
      return json(route, answer.body, answer.status)
    }
    if (path === '/v1/auth/admin-session/verify-2fa' && method === 'POST') {
      if ((body as { code?: string }).code !== '246810') return apiError(route, 401, 'INVALID_OTP')
      mock.signedIn = true
      return json(route, { data: { session_id: 's-1', admin_mfa: true, user: { id: 'u-1', email: 'founder@example.test' } } })
    }
    if (path === '/v1/auth/admin-session/logout' && method === 'POST') {
      mock.signedIn = false
      return json(route, { data: { status: 'ok' } })
    }
    if (path === '/v1/admin/commerce/sellers/queue') return json(route, { data: [] })
    if (path === '/v1/admin/approvals') return json(route, { data: [] })
    return json(route, { data: null }, 404)
  })
}

const consumerAuthCalls = (mock: Mock) =>
  mock.requests.filter((r) => r.path.startsWith('/v1/auth/') && !r.path.startsWith('/v1/auth/admin-session'))

test('sign-in: password, then authenticator code, then the console', async ({ page }) => {
  test.slow() // compiles /login and /sellers on a cold dev server
  const mock: Mock = { signedIn: false, requests: [] }
  await mockAuth(page, mock)

  await page.goto(`${BASE}/sellers`)
  await expect(page).toHaveURL(`${BASE}/login?next=%2Fsellers`, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Sign in to the admin console' })).toBeVisible()

  await page.getByLabel('Email or phone').fill('founder@example.test')
  await page.getByLabel('Password').fill('correct horse')
  await page.getByRole('button', { name: 'Continue' }).click()

  const code = page.getByLabel('6-digit code')
  await expect(code).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)

  // A wrong code keeps the admin on the code step with a clear message.
  await code.fill('111111')
  await page.getByRole('button', { name: 'Verify and sign in' }).click()
  // Not getByRole('alert'): Next's route announcer is an alert too.
  await expect(page.locator('#sign-in-error')).toContainText('That code is not right')
  await expect(code).toBeVisible()

  await code.fill('246810')
  await page.getByRole('button', { name: 'Verify and sign in' }).click()

  await expect(page).toHaveURL(`${BASE}/sellers`, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Seller queue' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('admin-identity')).toHaveText('founder@example.test')

  const login = mock.requests.find((r) => r.path === '/v1/auth/admin-session/login')
  expect(login?.body).toEqual({ identifier: 'founder@example.test', password: 'correct horse' })
  const verifies = mock.requests.filter((r) => r.path === '/v1/auth/admin-session/verify-2fa')
  expect(verifies.at(-1)?.body).toEqual({ pending_token: 'pending-1', code: '246810' })
  expect(consumerAuthCalls(mock)).toEqual([])
})

test('sign-in refusals: not an admin, no authenticator, rate limited', async ({ page }) => {
  const answers = [
    { status: 403, body: { error: { code: 'NOT_ADMIN', message: 'this account has no admin access' } } },
    { status: 403, body: { error: { code: 'MFA_NOT_ENROLLED', message: 'enrol' } } },
    { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } } },
    { status: 401, body: { error: { code: 'AUTH_FAILED', message: 'Authentication failed' } } },
  ]
  test.slow()
  const mock: Mock = { signedIn: false, requests: [], login: () => answers.shift()! }
  await mockAuth(page, mock)
  await page.goto(`${BASE}/login`)

  await page.getByLabel('Email or phone').fill('seller@example.test')
  await page.getByLabel('Password').fill('a password')
  const submit = page.getByRole('button', { name: 'Continue' })
  // Not getByRole('alert'): Next's route announcer is an alert too.
  const alert = page.locator('#sign-in-error')

  await submit.click()
  await expect(alert).toContainText('does not have admin access')
  await expect(page.getByLabel('6-digit code')).toHaveCount(0)

  await submit.click()
  await expect(alert).toContainText('authenticator app')

  await submit.click()
  await expect(alert).toContainText('Too many attempts')

  await submit.click()
  await expect(alert).toContainText('password is not right')

  expect(mock.requests.filter((r) => r.path === '/v1/auth/admin-session/verify-2fa')).toEqual([])
  expect(mock.signedIn).toBe(false)
})

test('sign-out ends the admin session and returns to sign-in', async ({ page, context }) => {
  test.slow()
  await context.addCookies([
    { name: 'csrf_token', value: 'consumer-csrf', domain: '127.0.0.1', path: '/' },
    { name: 'admin_csrf_token', value: 'admin-csrf', domain: '127.0.0.1', path: '/' },
  ])
  const mock: Mock = { signedIn: true, requests: [] }
  await mockAuth(page, mock)

  await page.goto(`${BASE}/sellers`)
  await expect(page.getByRole('heading', { name: 'Seller queue' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page).toHaveURL(`${BASE}/login`, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Sign in to the admin console' })).toBeVisible()
  const logout = mock.requests.filter((r) => r.path === '/v1/auth/admin-session/logout')
  expect(logout).toHaveLength(1)
  expect(logout[0].csrf).toBe('admin-csrf')
  expect(consumerAuthCalls(mock)).toEqual([])

  // Back in the console, the ended session sends the admin to sign-in again.
  await page.goto(`${BASE}/sellers`)
  await expect(page).toHaveURL(`${BASE}/login?next=%2Fsellers`, { timeout: 30_000 })
})
