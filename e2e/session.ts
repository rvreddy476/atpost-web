import type { Page } from '@playwright/test'

/**
 * Put a signed-in session in the browser, the way the product does.
 *
 * These specs used to seed `localStorage.postbook_session`, because that is
 * where the web client kept its session. It does not any more: auth-service
 * sets `access_token` and `refresh_token` as httpOnly cookies and `csrf_token`
 * as a readable one, and the client reads the readable one to know whether
 * anybody is signed in. Cookies ignore the port, which is what makes one login
 * valid across the shell, the shop and the console.
 *
 * So a seeded session is a cookie now. `csrf_token` alone is enough for these
 * suites: it is the presence signal the UI renders from, and every API call in
 * them is intercepted before it could need a real token. A suite that talks to
 * a live backend must sign in properly instead — see live-commerce.spec.ts.
 */
export const E2E_CSRF = 'e2e-csrf-token'

export async function seedSessionCookie(page: Page, csrf = E2E_CSRF) {
  await page.context().addCookies([
    { name: 'csrf_token', value: csrf, domain: '127.0.0.1', path: '/' },
  ])
}

/** Remove it again, for a spec that wants to observe the signed-out surface. */
export async function clearSessionCookie(page: Page) {
  await page.context().clearCookies({ name: 'csrf_token' })
}
