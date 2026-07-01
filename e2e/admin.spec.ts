import { expect, test } from '@playwright/test'

test('admin can approve a submitted product', async ({ page }) => {
  let approved = false
  const product = {
    id: '11111111-1111-4111-8111-111111111111',
    seller_id: '22222222-2222-4222-8222-222222222222',
    title: 'Everyday Wireless Headphones',
    slug: 'everyday-wireless-headphones',
    product_type: 'physical',
    status: 'active',
    approval_status: 'submitted',
  }

  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/v1/admin/commerce/products/queue') && request.method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: approved ? [] : [product] }) })
    }
    if (path.endsWith(`/v1/admin/commerce/products/${product.id}/approve`) && request.method() === 'POST') {
      approved = true
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { ...product, approval_status: 'approved' } }) })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ data: null }) })
  })

  await page.goto('http://127.0.0.1:3002/admin/products')
  await expect(page.getByRole('heading', { name: 'Product queue' })).toBeVisible()
  await expect(page.getByText(product.title)).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('No products awaiting review.')).toBeVisible()
  expect(approved).toBe(true)
})
