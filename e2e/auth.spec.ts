import { expect, test } from '@playwright/test'

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com' }
const authResponse = { data: { user, tokens: { access_token: 'access-token', refresh_token: 'refresh-token' } } }

async function mockAuth(page: import('@playwright/test').Page) {
  await page.route('**/v1/auth/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(authResponse),
  }))
}

test('commerce registration returns to the commerce home', async ({ page }) => {
  await mockAuth(page)
  await page.goto('http://127.0.0.1:3020/register?redirect=%2Fshop%2Fcheckout')
  await expect(page.getByText('Continue to shop')).toBeVisible()
  await page.getByLabel('First name').fill('Test')
  await page.getByLabel('Last name').fill('Buyer')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('StrongPassword123!')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('http://127.0.0.1:3020/shop')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('postbook_session') || '{}').id)).toBe(user.id)
})

test('commerce login returns to commerce and preserves the destination on register link', async ({ page }) => {
  await mockAuth(page)
  await page.goto('http://127.0.0.1:3020/login?redirect=%2Fshop')
  await expect(page.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register?redirect=%2Fshop')
  await page.getByLabel('Email or phone').fill(user.email)
  await page.getByLabel('Password').fill('StrongPassword123!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('http://127.0.0.1:3020/shop')
})
