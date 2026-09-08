import { expect, test, type Page } from '@playwright/test'

const SHELL = 'http://127.0.0.1:3020'

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com' }

/**
 * What `POST /v1/auth/login` returns: a session.
 */
const loginResponse = {
  data: { user, tokens: { access_token: 'access-token', refresh_token: 'refresh-token' } },
}

/**
 * What `POST /v1/auth/register` actually returns — and, importantly, what it
 * does NOT.
 *
 * There are no tokens here. The backend withholds them on purpose: an address
 * nobody has confirmed is not yet an identity anyone should be able to act as.
 * This file used to mock a token-bearing register response, which made the
 * suite pass while the real flow could not complete at all — the fabricated
 * answer was the only thing the form knew how to handle.
 */
const registerResponse = {
  data: {
    user,
    requires_verification: true,
    verification_token: 'verification-token-abc',
    verification_expires_at: '2026-09-08T10:00:00.000Z',
  },
}

/**
 * A login that behaves like the real one: it returns a body AND sets a cookie.
 *
 * auth-service sets three (access_token and refresh_token httpOnly, csrf_token
 * readable) and the zone's proxy forwards them. Only the readable one matters
 * to a mocked suite — it is the presence signal the client renders from — but
 * it has to be here, because it is now the entire mechanism by which signing in
 * makes the app look signed in.
 */
async function mockLogin(page: Page) {
  await page.route('**/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'csrf_token=csrf-from-login; Path=/; SameSite=Lax',
      },
      body: JSON.stringify(loginResponse),
    }),
  )
}

/** What JS can see of the session: the one cookie that is not httpOnly. */
function sessionCookie(page: Page) {
  return page.evaluate(
    () => document.cookie.split('; ').find((c) => c.startsWith('csrf_token='))?.split('=')[1] ?? null,
  )
}

/** Mocks register and hands back the payload the form sent, once it has sent it. */
function mockRegister(page: Page, body: unknown = registerResponse, status = 201) {
  const sent: Record<string, unknown>[] = []
  const ready = page.route('**/v1/auth/register', (route) => {
    sent.push(JSON.parse(route.request().postData() ?? '{}'))
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { sent, ready }
}

async function fillRegistration(page: Page) {
  await page.getByLabel('First name').fill('Test')
  await page.getByLabel('Last name').fill('Buyer')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Date of birth').fill('1990-04-11')
  await page.getByLabel('Password').fill('StrongPassword123!')
  await page.getByRole('checkbox').check()
}

test('registration sends the payload the backend requires and stops at "confirm your email"', async ({ page }) => {
  const register = mockRegister(page)
  await register.ready
  await page.goto(`${SHELL}/register?redirect=%2Fshop%2Fcheckout`)
  await expect(page.getByText('Continue to the shop')).toBeVisible()

  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account' }).click()

  // The success state is the verification notice, not a redirect and not an error.
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  await expect(page.locator('.auth-lede strong')).toHaveText(user.email)
  await expect(page).toHaveURL(`${SHELL}/register?redirect=%2Fshop%2Fcheckout`)

  // No session is invented out of a response that carries no tokens. The
  // server set no cookie, so the browser holds none — and the two localStorage
  // slots the old client used stay empty, because nothing writes them any more.
  expect(await sessionCookie(page)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('postbook_session'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('postbook_auth_tokens'))).toBeNull()

  expect(register.sent).toHaveLength(1)
  expect(register.sent[0]).toEqual({
    email: user.email,
    password: 'StrongPassword123!',
    first_name: 'Test',
    last_name: 'Buyer',
    dob: '1990-04-11',
    accepted_terms: true,
    terms_version: '2026-08-01',
    platform: 'web',
  })
})

test('registration will not submit without a date of birth and accepted terms', async ({ page }) => {
  const register = mockRegister(page)
  await register.ready
  await page.goto(`${SHELL}/register`)

  await page.getByLabel('First name').fill('Test')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('StrongPassword123!')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.locator('.auth-field-error')).toHaveText([
    'Enter your date of birth.',
    /accept the terms/i,
  ])
  expect(register.sent).toHaveLength(0)
})

test('a refused registration shows the server complaint under the field it names', async ({ page }) => {
  const register = mockRegister(
    page,
    {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'We could not create your account.',
        details: { fields: [{ code: 'email', reason: 'That address is already registered.' }] },
      },
    },
    422,
  )
  await register.ready
  await page.goto(`${SHELL}/register`)
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.locator('.auth-field-error')).toHaveText('That address is already registered.')
  await expect(page.getByRole('alert')).toHaveText('We could not create your account.')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
})

test('login without a redirect lands on the shop', async ({ page }) => {
  await mockLogin(page)
  await page.goto(`${SHELL}/login`)
  await page.getByLabel('Email or phone').fill(user.email)
  await page.getByLabel('Password').fill('StrongPassword123!')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(`${SHELL}/shop`)
  // The session is the cookie the server set, not a record this client wrote —
  // which is precisely why it is now valid on every zone and every tab at once.
  expect(await sessionCookie(page)).toBe('csrf-from-login')
  expect(await page.evaluate(() => localStorage.getItem('postbook_auth_tokens'))).toBeNull()
})

test('an explicit redirect still wins over the default landing', async ({ page }) => {
  await mockLogin(page)
  await page.goto(`${SHELL}/login?redirect=%2Fshop%2Fcart`)
  await expect(page.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register?redirect=%2Fshop')
  await page.getByLabel('Email or phone').fill(user.email)
  await page.getByLabel('Password').fill('StrongPassword123!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(`${SHELL}/shop`)
})

test('the shared form knows which zone it is continuing to', async ({ page }) => {
  await page.goto(`${SHELL}/register?redirect=%2Fadmin`)
  await expect(page.getByText('Continue to the admin console')).toBeVisible()
  // Exact: the terms link is also named "Momentum Terms of Service".
  await expect(page.getByRole('link', { name: 'Momentum', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirect=%2Fadmin')
})
