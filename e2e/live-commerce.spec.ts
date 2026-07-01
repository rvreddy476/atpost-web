import { createHmac, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function localAccessToken(userId: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url({ alg: 'HS256', typ: 'JWT', kid: 'v1' })
  const payload = base64url({ sub: userId, user_id: userId, scopes: '', iat: now, exp: now + 3600 })
  const input = `${header}.${payload}`
  const signature = createHmac('sha256', process.env.ATPOST_JWT_SECRET || 'local_dev_jwt_change_me').update(input).digest('base64url')
  return `${input}.${signature}`
}

test('live customer can place a COD order through the real gateway', async ({ page }) => {
  test.skip(process.env.ATPOST_LIVE_E2E !== '1', 'Set ATPOST_LIVE_E2E=1 with the local backend stack running')

  const userId = randomUUID()
  const accessToken = localAccessToken(userId)
  await page.addInitScript(({ id, token }) => {
    localStorage.setItem('postbook_session', JSON.stringify({ id, email: `live-${id.slice(0, 8)}@example.com` }))
    localStorage.setItem('postbook_auth_tokens', JSON.stringify({ accessToken: token, refreshToken: 'unused-live-test' }))
  }, { id: userId, token: accessToken })

  await page.goto('/shop')
  const firstProduct = page.locator('a[href*="/products/"]').first()
  await expect(firstProduct).toBeVisible({ timeout: 15_000 })
  await firstProduct.click()
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeEnabled()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await page.getByRole('link', { name: /Go to cart/ }).click()
  await expect(page.getByRole('heading', { name: 'Your Cart' })).toBeVisible()
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click()

  await page.getByRole('button', { name: /Add new address/ }).click()
  await page.getByPlaceholder('Full name').fill('Live Test Buyer')
  await page.getByPlaceholder('Phone').fill('9876543210')
  await page.getByPlaceholder('Address line 1').fill('1 Integration Way')
  await page.getByPlaceholder('City').fill('Bengaluru')
  await page.getByPlaceholder('State').fill('Karnataka')
  await page.getByPlaceholder('Postal code').fill('560001')
  await page.getByLabel('Address type').selectOption('home')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByText('Cash on Delivery').click()
  const placeOrder = page.getByRole('button', { name: 'Place COD Order' })
  await expect(placeOrder).toBeEnabled({ timeout: 15_000 })
  await placeOrder.click()
  await expect(page).toHaveURL(/\/shop\/orders\/[0-9a-f-]+$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /Order ORD-/ })).toBeVisible()
  await expect(page.getByText('confirmed').first()).toBeVisible()
})
