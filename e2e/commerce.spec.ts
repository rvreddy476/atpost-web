import { expect, test, type Page, type Route } from '@playwright/test'

const product = {
  id: '11111111-1111-4111-8111-111111111111',
  seller_id: '22222222-2222-4222-8222-222222222222',
  category_id: '33333333-3333-4333-8333-333333333333',
  title: 'Everyday Wireless Headphones',
  slug: 'everyday-wireless-headphones',
  description: 'Comfortable wireless headphones with clear sound.',
  short_description: 'Clear sound and all-day comfort',
  product_type: 'physical',
  status: 'active',
  avg_rating: 4.5,
  review_count: 128,
  min_selling_price: 2499,
  min_mrp: 3999,
  total_stock: 20,
  return_policy_type: 'replacement',
  return_policy_days: 7,
}
const variant = {
  id: '44444444-4444-4444-8444-444444444444',
  product_id: product.id,
  sku: 'HP-BLK-001',
  option_1_name: 'Colour',
  option_1_value: 'Black',
  mrp: 3999,
  selling_price: 2499,
  currency_code: 'INR',
  status: 'active',
}
const address = {
  id: '55555555-5555-4555-8555-555555555555',
  user_id: '66666666-6666-4666-8666-666666666666',
  contact_name: 'Test Customer',
  phone: '9876543210',
  address_line_1: '12 Market Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postal_code: '560001',
  country: 'IN',
  is_default: true,
  address_type: 'home',
}
const order = {
  id: '77777777-7777-4777-8777-777777777777',
  order_number: 'VC-10001',
  customer_user_id: address.user_id,
  subtotal: 4998,
  discount_amount: 0,
  shipping_charges: 0,
  tax_amount: 0,
  coupon_discount: 0,
  final_amount: 4998,
  currency_code: 'INR',
  payment_method: 'cod',
  payment_status: 'pending',
  status: 'confirmed',
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
}

function json(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) })
}

async function mockCommerce(page: Page, options: { delivered?: boolean; prepaidPending?: boolean } = {}) {
  let quantity = 0
  let reviewSubmitted = false
  let returnSubmitted = false
  let paymentConfirmed = false
  let sellerProducts: Array<typeof product & { approval_status: string }> = []
  let productSubmitted = false
  const testOrder = {
    ...order,
    ...(options.delivered ? { status: 'delivered', payment_status: 'succeeded' } : {}),
    ...(options.prepaidPending ? { status: 'payment_pending', payment_method: 'prepaid', payment_status: 'payment_pending' } : {}),
  }
  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/shop/, '')
    const method = request.method()
    const cart = {
      CartID: 'cart-1',
      Items: quantity ? [{ Item: { id: 'item-1', cart_id: 'cart-1', variant_id: variant.id, product_id: product.id, quantity, price_snapshot: 2499 }, Product: product, Variant: variant }] : [],
      Subtotal: quantity * 2499,
      ItemCount: quantity,
    }

    if (path === '/v1/commerce/categories') return json(route, [{ id: product.category_id, name: 'Electronics', slug: 'electronics' }])
    if (path === '/v1/commerce/products' && method === 'GET') return json(route, { items: [product], total: 1, limit: 24, offset: 0 })
    if (path === '/v1/commerce/onboarding/status') return json(route, { id: product.seller_id, status: 'approved', store_name: 'Sound Store' })
    if (path === '/v1/commerce/sellers/me') return json(route, { id: product.seller_id })
    if (path === `/v1/commerce/sellers/${product.seller_id}/products` && method === 'GET') return json(route, sellerProducts)
    if (path === '/v1/commerce/products' && method === 'POST') { sellerProducts = [{ ...product, approval_status: 'draft' }]; return json(route, sellerProducts[0], 201) }
    if (path === `/v1/commerce/products/${product.id}/submit` && method === 'POST') { productSubmitted = true; sellerProducts = [{ ...product, approval_status: 'submitted' }]; return json(route, { ok: true }) }
    if (path === `/v1/commerce/products/${product.id}`) return json(route, { product, variants: [variant] })
    if (path === `/v1/commerce/products/${product.id}/reviews` && method === 'GET') return json(route, { reviews: [], total: 0 })
    if (path === '/v1/commerce/cart' && method === 'GET') return json(route, cart)
    if (path === '/v1/commerce/cart/items' && method === 'POST') { quantity = 1; return json(route, { ok: true }, 201) }
    if (path.includes('/v1/commerce/cart/items/by-variant/') && method === 'PATCH') { quantity = Number(request.postDataJSON().quantity); return json(route, { ok: true }) }
    if (path === '/v1/commerce/addresses') return json(route, [address])
    if (path === '/v1/commerce/organizations/me') return json(route, { organizations: [] })
    if (path === '/v1/commerce/checkout/quote') return json(route, { subtotal: quantity * 2499, coupon_discount: 0, shipping: 0, tax: 0, grand_total: quantity * 2499, currency: 'INR', items: [], unavailable_items: [], cod_eligible: true, serviceable: true, seller_ids: [product.seller_id] })
    if (path === '/v1/commerce/orders/checkout' && method === 'POST') return json(route, testOrder, 201)
    if (path === `/v1/commerce/orders/${order.id}`) return json(route, paymentConfirmed ? { ...testOrder, status: 'confirmed', payment_status: 'succeeded' } : testOrder)
    if (path === `/v1/commerce/orders/${order.id}/items`) return json(route, { order: testOrder, items: [{ id: 'order-item-1', order_id: order.id, product_id: product.id, variant_id: variant.id, seller_id: product.seller_id, product_title: product.title, sku: variant.sku, quantity: quantity || 1, unit_price: 2499, final_price: (quantity || 1) * 2499, status: options.delivered ? 'delivered' : 'confirmed', return_eligible_until: options.delivered ? '2027-07-01T00:00:00Z' : null }] })
    if (path === `/v1/commerce/products/${product.id}/reviews` && method === 'POST') { reviewSubmitted = true; return json(route, { id: 'review-1' }, 201) }
    if (path === `/v1/commerce/orders/${order.id}/returns` && method === 'POST') { returnSubmitted = true; return json(route, { id: 'return-1' }, 201) }
    if (path === '/v1/payments/intents' && method === 'POST') return json(route, { id: 'intent-1', provider_ref: 'stub-order', amount: testOrder.final_amount, currency: 'INR', status: 'created' }, 201)
    if (path === `/v1/commerce/orders/${order.id}/payment/confirm` && method === 'POST') { paymentConfirmed = true; return json(route, { ok: true }) }
    if (path.endsWith('/shipment') || path.endsWith('/invoice')) return json(route, { message: 'not ready' }, 404)
    return json(route, { message: `Unhandled mock route: ${method} ${path}` }, 404)
  })
  return {
    reviewSubmitted: () => reviewSubmitted,
    returnSubmitted: () => returnSubmitted,
    paymentConfirmed: () => paymentConfirmed,
    productSubmitted: () => productSubmitted,
  }
}

test('customer can discover a product and complete a COD order', async ({ page }) => {
  await mockCommerce(page)
  await page.goto('/shop')

  await expect(page.getByRole('heading', { name: 'All products' })).toBeVisible()
  await expect(page.getByText(product.title)).toBeVisible()
  await expect(page.getByText('₹2499.00')).toBeVisible()
  await page.getByText(product.title).click()

  await expect(page.getByRole('heading', { name: product.title })).toBeVisible()
  await expect(page.getByText('38% off')).toBeVisible()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await page.getByRole('link', { name: /Go to cart/ }).click()

  await expect(page.getByRole('heading', { name: 'Your Cart' })).toBeVisible()
  await page.getByLabel(`Quantity for ${product.title}`).selectOption('2')
  await expect(page.getByText('₹4998.00').first()).toBeVisible()
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click()

  await page.getByText('Cash on Delivery').click()
  await expect(page.getByText('Order total').locator('..')).toContainText('₹4998.00')
  await page.getByRole('button', { name: 'Place COD Order' }).click()

  await expect(page).toHaveURL(new RegExp(`/shop/orders/${order.id}$`))
  await expect(page.getByRole('heading', { name: `Order ${order.order_number}` })).toBeVisible()
  await expect(page.getByText('confirmed').first()).toBeVisible()
})

test('customer can submit a verified review and return request', async ({ page }) => {
  const state = await mockCommerce(page, { delivered: true })
  await page.goto(`/shop/orders/${order.id}`)

  await expect(page.getByText(product.title)).toBeVisible()
  await page.getByRole('button', { name: 'Write a review' }).click()
  await page.getByPlaceholder('What should other customers know?').fill('Comfortable and clear sound.')
  await page.getByRole('button', { name: 'Submit review' }).click()
  await expect(page.getByText('Your verified-purchase review was submitted.').first()).toBeVisible()
  expect(state.reviewSubmitted()).toBe(true)

  await page.getByRole('button', { name: 'Return item' }).click()
  await page.getByPlaceholder('Describe the issue').fill('The left ear cup arrived damaged.')
  await page.getByRole('button', { name: 'Request return' }).click()
  await expect(page.getByText('Your return request was submitted.').first()).toBeVisible()
  expect(state.returnSubmitted()).toBe(true)
})

test('customer can retry a payment-pending prepaid order', async ({ page }) => {
  const state = await mockCommerce(page, { prepaidPending: true })
  await page.goto(`/shop/orders/${order.id}`)

  await page.getByRole('button', { name: 'Retry payment' }).click()
  await expect(page.getByText('Payment confirmed. Your order is being prepared.').first()).toBeVisible()
  expect(state.paymentConfirmed()).toBe(true)
})

test('seller can create a draft product and submit it for approval', async ({ page }) => {
  const state = await mockCommerce(page)
  await page.addInitScript(() => {
    localStorage.setItem('postbook_session', JSON.stringify({ id: '66666666-6666-4666-8666-666666666666' }))
  })
  await page.goto('/shop/sell')

  await expect(page.getByRole('heading', { name: 'My products' })).toBeVisible()
  await page.getByRole('link', { name: /Add product/ }).click()
  await page.getByLabel('Title').fill(product.title)
  await page.getByLabel('Description').fill(product.description)
  await page.getByLabel('SKU').fill(variant.sku)
  await page.getByLabel('MRP').fill('3999')
  await page.getByLabel('Selling price').fill('2499')
  await page.getByLabel('Stock qty').fill('20')
  await page.getByRole('button', { name: 'Create product' }).click()

  await expect(page.getByText(product.title)).toBeVisible()
  await expect(page.getByText('draft')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('submitted')).toBeVisible()
  expect(state.productSubmitted()).toBe(true)
})
