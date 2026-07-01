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

async function mockCommerce(page: Page) {
  let quantity = 0
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
    if (path === `/v1/commerce/products/${product.id}`) return json(route, { product, variants: [variant] })
    if (path === `/v1/commerce/products/${product.id}/reviews`) return json(route, { reviews: [], total: 0 })
    if (path === '/v1/commerce/cart' && method === 'GET') return json(route, cart)
    if (path === '/v1/commerce/cart/items' && method === 'POST') { quantity = 1; return json(route, { ok: true }, 201) }
    if (path.includes('/v1/commerce/cart/items/by-variant/') && method === 'PATCH') { quantity = Number(request.postDataJSON().quantity); return json(route, { ok: true }) }
    if (path === '/v1/commerce/addresses') return json(route, [address])
    if (path === '/v1/commerce/organizations/me') return json(route, { organizations: [] })
    if (path === '/v1/commerce/checkout/quote') return json(route, { subtotal: quantity * 2499, coupon_discount: 0, shipping: 0, tax: 0, grand_total: quantity * 2499, currency: 'INR', items: [], unavailable_items: [], cod_eligible: true, serviceable: true, seller_ids: [product.seller_id] })
    if (path === '/v1/commerce/orders/checkout' && method === 'POST') return json(route, order, 201)
    if (path === `/v1/commerce/orders/${order.id}`) return json(route, order)
    if (path === `/v1/commerce/orders/${order.id}/items`) return json(route, { order, items: [{ id: 'order-item-1', order_id: order.id, product_id: product.id, variant_id: variant.id, seller_id: product.seller_id, product_title: product.title, sku: variant.sku, quantity, unit_price: 2499, final_price: quantity * 2499, status: 'confirmed' }] })
    if (path.endsWith('/shipment') || path.endsWith('/invoice')) return json(route, { message: 'not ready' }, 404)
    return json(route, { message: `Unhandled mock route: ${method} ${path}` }, 404)
  })
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
