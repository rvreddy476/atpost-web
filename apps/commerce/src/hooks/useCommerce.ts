import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@atpost/api-client'
import { useSession as usePlatformSession } from '@atpost/api-client/session'

// ── Types ─────────────────────────────────────────────────────────────

export type CartItem = {
  Item: {
    id: string
    cart_id: string
    variant_id: string
    product_id: string
    quantity: number
    price_snapshot: number
  }
  Product: {
    id: string
    title: string
    slug: string
    primary_image_media_id?: string | null
    source_image_url?: string | null
    retailer_name?: string | null
  } | null
  Variant: { id: string; sku: string; mrp: number; selling_price: number; image_media_id?: string | null } | null
}

export type CartSummary = {
  CartID: string
  Items: CartItem[]
  Subtotal: number
  ItemCount: number
}

export type Address = {
  id: string
  user_id: string
  contact_name: string
  phone: string
  address_line_1: string
  address_line_2?: string
  city: string
  state: string
  postal_code: string
  country: string
  is_default: boolean
  address_type: string
}

export type Order = {
  id: string
  order_number: string
  customer_user_id: string
  subtotal: number
  discount_amount: number
  shipping_charges: number
  tax_amount: number
  coupon_code?: string
  coupon_discount: number
  final_amount: number
  currency_code: string
  payment_method?: string
  payment_status: string
  delivery_address_id?: string
  status: string
  created_at: string
  updated_at: string
  // Phase 5 — optional B2B fields. Retail orders have these as null/undefined.
  organization_id?: string | null
  po_number?: string | null
  cost_center?: string | null
  invoice_email?: string | null
  approval_status?: 'not_required' | 'pending' | 'approved' | 'rejected' | null
  approved_by_user_id?: string | null
  approved_at?: string | null
  approval_notes?: string | null
  credit_terms_days?: number
  payment_due_date?: string | null
}

export type Shipment = {
  id: string
  order_id: string
  courier: string
  tracking_number?: string
  tracking_url?: string
  label_url?: string
  status: string
  eta?: string
  shipped_at?: string
  delivered_at?: string
}

export type ShipmentEvent = {
  id: string
  shipment_id: string
  status: string
  location?: string
  remark?: string
  occurred_at: string
}

export type Invoice = {
  id: string
  order_id: string
  invoice_number: string
  grand_total: number
  currency_code: string
  issued_at: string
}

export type ProductVariant = {
  id: string
  product_id: string
  sku: string
  option_1_name?: string | null
  option_1_value?: string | null
  option_2_name?: string | null
  option_2_value?: string | null
  option_3_name?: string | null
  option_3_value?: string | null
  mrp: number
  selling_price: number
  currency_code: string
  status: string
  image_media_id?: string | null
}

export type Product = {
  id: string
  seller_id: string
  category_id?: string | null
  tax_class_id?: string | null
  title: string
  short_title?: string | null
  description?: string | null
  short_description?: string | null
  slug: string
  product_type: string
  status: string
  hsn_code?: string | null
  weight_grams?: number | null
  primary_image_media_id?: string | null
  source_image_url?: string | null
  // Presigned absolute renditions the catalogue read model returns alongside
  // the media id — fallbacks for productImage(), never the first choice.
  image_url?: string | null
  thumbnail_url?: string | null
  retailer_name?: string | null
  category_name?: string | null
  brand_name?: string | null
  warranty_info?: string | null
  return_policy_type?: string
  return_policy_days?: number
  avg_rating?: number
  review_count?: number
  default_variant_id?: string | null
  min_selling_price?: number | null
  min_mrp?: number | null
  total_stock?: number | null
}

export type Review = {
  id: string
  product_id: string
  seller_id: string
  reviewer_id: string
  rating: number
  title?: string | null
  body?: string | null
  is_verified_purchase: boolean
  is_published: boolean
  created_at: string
}

export type Category = {
  id: string
  name: string
  slug: string
  description?: string | null
  parent_id?: string | null
  // Catalogue metadata the storefront browses by: the tile shows the
  // description and the live product count, and hides a count of zero behind
  // "coming soon" rather than advertising an empty shelf.
  display_order?: number
  is_active?: boolean
  is_featured?: boolean
  image_media_id?: string | null
  product_count?: number
}

export type ReturnRequest = {
  id: string
  order_id: string
  order_item_id: string
  customer_user_id: string
  seller_id: string
  reason_code: string
  reason_description?: string | null
  status: string
  requested_at: string
  approved_at?: string | null
  rejected_at?: string | null
  rejection_reason?: string | null
  refund_amount?: number | null
}

// ── Catalog ───────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['commerce', 'categories'],
    queryFn: async () => (await api.get('/v1/commerce/categories')).data.data ?? [],
  })
}

export function useSellerProducts(sellerId: string | undefined, limit = 24, offset = 0) {
  return useQuery<Product[]>({
    queryKey: ['commerce', 'seller-products', sellerId, limit, offset],
    queryFn: async () =>
      (await api.get(`/v1/commerce/sellers/${sellerId}/products`, { params: { limit, offset } })).data.data ?? [],
    enabled: !!sellerId,
  })
}

// useProducts hits the global product catalog — published + approved only.
// Backed by GET /v1/commerce/products. Pagination is offset-based.
export interface ProductListPage {
  items: Product[]
  total: number
  limit: number
  offset: number
}

export function useProducts(opts: { category?: string; q?: string; minRating?: number; inStock?: boolean; limit?: number; offset?: number } = {}) {
  const { category, q, minRating, inStock, limit = 24, offset = 0 } = opts
  return useQuery<ProductListPage>({
    queryKey: ['commerce', 'products', category ?? null, q ?? null, minRating ?? null, inStock ?? false, limit, offset],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit }
      // The backend's legacy offset path does not apply rating/stock filters.
      // Use the enriched catalog path whenever those filters are active.
      if (!minRating && !inStock) params.offset = offset
      if (category) params.category = category
      if (q) params.q = q
      if (minRating) params.min_rating = minRating
      if (inStock) params.in_stock = 'true'
      const res = (await api.get('/v1/commerce/products', { params })).data.data
      // Tolerate both wrapped {items,total} and a bare array if a future
      // backend variant returns one — keeps the hook resilient.
      if (Array.isArray(res)) {
        return { items: res, total: res.length, limit, offset }
      }
      return {
        items: res?.items ?? [],
        total: res?.total ?? 0,
        limit: res?.limit ?? limit,
        offset: res?.offset ?? offset,
      }
    },
  })
}

// useInfiniteProducts is the cursor-paginated companion to useProducts.
// Use this for infinite-scroll surfaces (browse, search results) — the
// backend's keyset pagination stays O(log n) at any catalog depth, so
// a long scroll session doesn't pay the OFFSET 1M penalty.
//
// Filters: min_price, max_price, min_rating, seller, in_stock_only.
// Returns an InfiniteQuery; consumers should call fetchNextPage() when
// the user scrolls past the current tail.
export interface ProductListCursorPage {
  items: Product[]
  next_cursor: string
  limit: number
}

export interface InfiniteProductsOpts {
  category?: string
  q?: string
  limit?: number
  minPrice?: number
  maxPrice?: number
  minRating?: number
  sellerId?: string
  inStockOnly?: boolean
}

export function useInfiniteProducts(opts: InfiniteProductsOpts = {}) {
  const limit = opts.limit ?? 24
  return useInfiniteQuery<ProductListCursorPage>({
    queryKey: [
      'commerce',
      'products',
      'cursor',
      opts.category ?? null,
      opts.q ?? null,
      opts.minPrice ?? null,
      opts.maxPrice ?? null,
      opts.minRating ?? null,
      opts.sellerId ?? null,
      opts.inStockOnly ?? false,
      limit,
    ],
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number> = { limit }
      if (opts.category) params.category = opts.category
      if (opts.q) params.q = opts.q
      if (opts.minPrice && opts.minPrice > 0) params.min_price = opts.minPrice
      if (opts.maxPrice && opts.maxPrice > 0) params.max_price = opts.maxPrice
      if (opts.minRating && opts.minRating > 0) params.min_rating = opts.minRating
      if (opts.sellerId) params.seller = opts.sellerId
      if (opts.inStockOnly) params.in_stock = 'true'
      // Empty pageParam = first page; the gateway treats it as no cursor.
      if (typeof pageParam === 'string' && pageParam !== '') {
        params.cursor = pageParam
      } else {
        // Explicit hint to the backend that we want cursor-mode response
        // (items + next_cursor) even on page 1.
        params.paginate = 'cursor'
      }
      const res = (await api.get('/v1/commerce/products', { params })).data.data
      if (Array.isArray(res)) {
        return { items: res, next_cursor: '', limit }
      }
      return {
        items: res?.items ?? [],
        next_cursor: res?.next_cursor ?? '',
        limit: res?.limit ?? limit,
      }
    },
    getNextPageParam: (last) => (last.next_cursor ? last.next_cursor : undefined),
  })
}

/**
 * One resolved attribute on a published product, as the catalogue returns it.
 * `display_group` is the server's own grouping (e.g. "Product Details") and is
 * what the product page renders its spec sections from — the storefront never
 * invents a grouping of its own.
 */
export type ProductAttribute = {
  code: string
  label: string
  data_type: string
  value: string | number | boolean | string[] | null
  unit?: string | null
  display_group?: string | null
}

export function useProduct(productId: string | undefined) {
  return useQuery<{ product: Product; variants: ProductVariant[]; attributes?: ProductAttribute[] }>({
    queryKey: ['commerce', 'product', productId],
    queryFn: async () => (await api.get(`/v1/commerce/products/${productId}`)).data.data,
    enabled: !!productId,
  })
}

export function useProductReviews(productId: string | undefined) {
  return useQuery<{ reviews: Review[]; total: number }>({
    queryKey: ['commerce', 'product-reviews', productId],
    queryFn: async () => (await api.get(`/v1/commerce/products/${productId}/reviews`)).data.data,
    enabled: !!productId,
  })
}

export function useCreateReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      product_id: string
      seller_id: string
      order_item_id: string
      rating: number
      title?: string
      body?: string
    }) =>
      (await api.post(`/v1/commerce/products/${input.product_id}/reviews`, {
        seller_id: input.seller_id,
        order_item_id: input.order_item_id,
        rating: input.rating,
        title: input.title,
        body: input.body,
      })).data.data as Review,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'product-reviews', vars.product_id] })
    },
  })
}

// ── Returns ───────────────────────────────────────────────────────────

export interface CreateReturnItem {
  order_item_id: string
  seller_id: string
  reason_code: string
  reason_description?: string
}

// useCreateReturn supports both the legacy single-item shape and the
// Phase-2.3 multi-item shape ({items:[...]}). The backend accepts both —
// pass `items` for multi-item bulk creation, or the top-level fields for
// a single-item create.
export function useCreateReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input:
        | {
            order_id: string
            order_item_id: string
            seller_id: string
            reason_code: string
            reason_description?: string
          }
        | {
            order_id: string
            items: CreateReturnItem[]
            pickup_address_id?: string
          },
    ) => {
      const { order_id, ...body } = input as { order_id: string } & Record<string, unknown>
      const res = await api.post(`/v1/commerce/orders/${order_id}/returns`, body)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commerce', 'returns'] })
      qc.invalidateQueries({ queryKey: ['commerce', 'orders'] })
    },
  })
}

export function useMyReturns() {
  return useQuery<ReturnRequest[]>({
    queryKey: ['commerce', 'returns'],
    queryFn: async () => (await api.get('/v1/commerce/me/returns')).data.data ?? [],
  })
}

// useReturn fetches a single return by id — Phase 2.2. Replaces the
// mobile "list /me/returns and find the one I want" workaround.
export function useReturn(returnId: string | undefined) {
  return useQuery<ReturnRequest>({
    queryKey: ['commerce', 'return', returnId],
    enabled: !!returnId,
    queryFn: async () =>
      (await api.get(`/v1/commerce/returns/${returnId}`)).data.data as ReturnRequest,
  })
}

// ── Cart ──────────────────────────────────────────────────────────────

/**
 * A 401 means the shopper is signed out, not that something broke.
 *
 * Worth telling apart everywhere it can happen: treated as an ordinary
 * failure, a signed-out bag retries and then blames itself, when the honest
 * answer is "sign in and it is still there".
 */
export function isSignedOut(error: unknown): boolean {
  return (error as { response?: { status?: number } } | undefined)?.response?.status === 401
}

/**
 * Whether a shopper is signed in.
 *
 * A thin re-export of the platform's own `useSession`, kept under this name
 * and this shape because a dozen call sites in the zone already destructure
 * `{ signedIn, known }` and none of them care where the answer comes from.
 * That is the point of the indirection, not an accident of it: the shop asks
 * the shared package what a session is, rather than deciding for itself.
 *
 * What changed underneath it: the session is no longer a localStorage record
 * this zone reads after mount, but a cookie set by auth-service and shared
 * across every zone and every tab. `known` is therefore true on the FIRST
 * paint here, because the layout seeds the provider from the request's own
 * cookies — so the landing page no longer renders a signed-out shell for a
 * frame before correcting itself.
 */
export function useSession(): { signedIn: boolean; known: boolean } {
  const { signedIn, known } = usePlatformSession()
  return { signedIn, known }
}

export function useCart() {
  const { signedIn, known } = useSession()
  return useQuery<CartSummary>({
    queryKey: ['commerce', 'cart'],
    queryFn: async () => (await api.get('/v1/commerce/cart')).data.data,
    // A signed-out shopper has no bag to fetch, so do not ask.
    //
    // Not an optimisation. An errored query is always stale, so it refetches
    // on every mount — and the cart page's loading and error branches mount
    // the header differently, so each 401 re-rendered the tree, remounted the
    // header and fired another request. The page sat on "Preparing your bag…"
    // for ever while calling the API about three times a second. Not asking
    // breaks that at its source.
    enabled: known && signedIn,
  })
}

// CouponPreview — commerce TODO M#1. Read-only preview of what a
// coupon would do to the current cart total. No write side-effect;
// the actual application happens at checkout.
export interface CouponPreview {
  coupon_code: string
  coupon_discount: number
  subtotal: number
  grand_total: number
  applied: boolean
}

export function useCouponPreview(code: string) {
  return useQuery<CouponPreview>({
    queryKey: ['commerce', 'cart', 'coupon-preview', code],
    queryFn: async () => {
      const res = await api.get<{ data: CouponPreview }>(
        `/v1/commerce/cart/coupon-preview?code=${encodeURIComponent(code)}`,
      )
      return res.data.data
    },
    enabled: code.trim().length > 0,
    retry: false,
    // Coupon validation server-side is the canonical truth; don't
    // hammer it with refetches.
    staleTime: 30 * 1000,
  })
}

export function useAddToCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { variant_id: string; quantity: number }) =>
      (await api.post('/v1/commerce/cart/items', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'cart'] }),
    // Without this the rejection was unhandled: a signed-out shopper pressed
    // Add and NOTHING happened — no message, no sign-in, just a button that
    // did not work. Adding to a bag is the one thing this page exists for, so
    // it takes them where they can finish, and comes back to where they were.
    onError: (error) => {
      if (typeof window === 'undefined') return
      if (isSignedOut(error)) {
        const back = window.location.pathname + window.location.search
        window.location.assign(`/login?redirect=${encodeURIComponent(back)}`)
      }
    },
  })
}

export function useRemoveFromCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (variantId: string) =>
      (await api.delete(`/v1/commerce/cart/items/${variantId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'cart'] }),
  })
}

// useUpdateCartItem (Phase 1.2) — atomic set-to-N for a variant. Quantity
// 0 deletes the line. Server upserts under a single row-level write, so
// concurrent calls converge instead of racing (the old mobile delete+add
// roundtrip could briefly empty the cart).
export function useUpdateCartItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { variant_id: string; quantity: number }) =>
      (
        await api.patch(`/v1/commerce/cart/items/by-variant/${input.variant_id}`, {
          quantity: input.quantity,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'cart'] }),
  })
}

// ── Checkout quote (Phase 1.1) ────────────────────────────────────────

export interface QuoteItem {
  variant_id: string
  product_id: string
  seller_id: string
  product_title: string
  sku?: string
  quantity: number
  unit_price: number
  line_subtotal: number
}

export interface UnavailableQuoteItem {
  variant_id: string
  product_id: string
  product_title: string
  available: number
  requested: number
}

export interface CheckoutQuote {
  subtotal: number
  coupon_discount: number
  coupon_code?: string
  shipping: number
  tax: number
  grand_total: number
  currency: string
  items: QuoteItem[]
  unavailable_items: UnavailableQuoteItem[]
  cod_eligible: boolean
  serviceable: boolean
  seller_ids: string[]
}

// useCheckoutQuote returns the server-authoritative pricing for the
// current cart. Mobile + web must render this BEFORE "Place order" so the
// client never recomputes prices locally — the audit found the mobile
// commerce_repository was doing exactly that.
export function useCheckoutQuote(input: {
  address_id: string
  payment_method: 'prepaid' | 'cod'
  coupon_code?: string
} | null) {
  return useQuery<CheckoutQuote | null>({
    queryKey: ['commerce', 'checkout-quote', input],
    enabled: !!input,
    queryFn: async () => {
      if (!input) return null
      const res = await api.post('/v1/commerce/checkout/quote', input)
      return res.data.data as CheckoutQuote
    },
  })
}

// ── Serviceability (Phase 1.3) ────────────────────────────────────────

export interface ServiceabilityResult {
  serviceable: boolean
  cod_supported: boolean
  estimated_days: number
  estimated_eta: string
  courier: string
  reason?: string
}

// useServiceability fetches the courier-backed serviceability for a
// pincode + product. Replaces the mobile pincode heuristic — production
// uses the seller's pickup pincode and the product weight.
export function useServiceability(args: {
  pincode: string
  product_id: string
  variant_id?: string
  seller_id?: string
  payment_method?: 'prepaid' | 'cod'
} | null) {
  return useQuery<ServiceabilityResult | null>({
    queryKey: ['commerce', 'serviceability', args],
    enabled: !!args && args.pincode.length === 6,
    queryFn: async () => {
      if (!args) return null
      const params = new URLSearchParams({
        pincode: args.pincode,
        product_id: args.product_id,
      })
      if (args.variant_id) params.set('variant_id', args.variant_id)
      if (args.seller_id) params.set('seller_id', args.seller_id)
      if (args.payment_method) params.set('payment_method', args.payment_method)
      const res = await api.get(`/v1/commerce/serviceability?${params.toString()}`)
      return res.data.data as ServiceabilityResult
    },
  })
}

// ── Addresses ─────────────────────────────────────────────────────────

export function useAddresses() {
  return useQuery<Address[]>({
    queryKey: ['commerce', 'addresses'],
    queryFn: async () => (await api.get('/v1/commerce/addresses')).data.data ?? [],
  })
}

export function useAddAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Address> & { full_name: string; phone: string; address_line_1: string; city: string; state: string; postal_code: string }) =>
      (await api.post('/v1/commerce/addresses', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'addresses'] }),
  })
}

export function useUpdateAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<Address> & { full_name: string; phone: string; address_line_1: string; city: string; state: string; postal_code: string } }) =>
      (await api.patch(`/v1/commerce/addresses/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'addresses'] }),
  })
}

export function useDeleteAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/v1/commerce/addresses/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'addresses'] }),
  })
}

export function useSetDefaultAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/v1/commerce/addresses/${id}/default`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'addresses'] }),
  })
}

// ── Checkout + Orders ─────────────────────────────────────────────────

export type CheckoutInput = {
  address_id: string
  payment_method: 'prepaid' | 'cod' | 'credit'
  coupon_code?: string
  gift_message?: string
  idempotency_key?: string
  // Phase 5 — optional B2B context. When organization_id is set the
  // backend applies the org's approval threshold + credit terms.
  organization_id?: string
  po_number?: string
  cost_center?: string
  invoice_email?: string
}

export function useCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CheckoutInput) =>
      (await api.post('/v1/commerce/orders/checkout', input)).data.data as Order,
    onSuccess: (_, input) => {
      // Prepaid checkout creates a payment-pending order before Razorpay opens.
      // Keep the cart snapshot visible until payment is confirmed so a query
      // refetch cannot replace the checkout with an empty-cart screen mid-flow.
      if (input.payment_method !== 'prepaid') {
        qc.invalidateQueries({ queryKey: ['commerce', 'cart'] })
      }
      qc.invalidateQueries({ queryKey: ['commerce', 'orders'] })
    },
  })
}

// ── Payments ──────────────────────────────────────────────────────────

export type PaymentIntent = {
  id: string
  payer_id: string
  payee_id: string
  reference_type: string
  reference_id: string
  amount: number
  currency: string
  method: string
  status: string
  // provider_ref is the gateway-side order id (e.g. Razorpay's order_xxx).
  // The frontend hands this to the Razorpay checkout dialog.
  provider_ref?: string
}

export type CreatePaymentIntentInput = {
  payee_id: string
  reference_type: 'order'
  reference_id: string
  amount: number
  currency?: string
  method: 'razorpay' | 'upi' | 'card' | 'netbanking'
  idempotency_key?: string
}

// Creates a payment intent at payments-service. Returns the intent including
// `provider_ref`, which is the Razorpay order_id used by checkout.js to open
// the payment dialog.
export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: async (input: CreatePaymentIntentInput) =>
      (await api.post('/v1/payments/intents', input)).data.data as PaymentIntent,
  })
}

// Confirms a successful payment with commerce-service. This is the
// synchronous happy-path: a Razorpay webhook → commerce-service Kafka
// consumer is the resilient backup if the user closes the browser before
// this fires.
// useConfirmPayment posts the signed Razorpay handler response to
// commerce-service. The backend (Phase 0.1) requires the signature triple
// so it can ask payments-service to HMAC-verify before marking the order
// paid — the old `{payment_id, gateway}`-only shape is rejected as 400.
//
// `gateway: 'stub'` is only accepted when the backend was started with
// PAYMENTS_ALLOW_STUB=true; production builds gate the stub path off
// before calling this hook (see app/checkout/page.tsx).
export function useConfirmPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      order_id: string
      payment_intent_id: string
      razorpay_order_id: string
      razorpay_payment_id: string
      razorpay_signature: string
      amount_minor: number
      gateway?: string
    }) =>
      (await api.post(`/v1/commerce/orders/${input.order_id}/payment/confirm`, {
        payment_intent_id: input.payment_intent_id,
        razorpay_order_id: input.razorpay_order_id,
        razorpay_payment_id: input.razorpay_payment_id,
        razorpay_signature: input.razorpay_signature,
        amount_minor: input.amount_minor,
        gateway: input.gateway ?? 'razorpay',
      })).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'cart'] })
      qc.invalidateQueries({ queryKey: ['commerce', 'orders'] })
      qc.invalidateQueries({ queryKey: ['commerce', 'order', vars.order_id] })
    },
  })
}

// OrderCard is the rich order-list shape returned by GET /v1/commerce/orders
// (Phase 2.1). Adds item / seller counts and the first item so the customer
// can tell orders apart without opening every one. Older Order callers stay
// compatible because the extra fields are additive.
export interface OrderCard {
  id: string
  order_number: string
  final_amount: number
  currency: string
  payment_method?: string | null
  payment_status: string
  status: string
  item_count: number
  seller_count: number
  first_product_id?: string | null
  first_product_title?: string
  created_at: string
}

// useOrders returns the first page of order cards. For paginated screens
// use useInfiniteOrders below — keyset cursors avoid the offset COUNT(*)
// table-scan the old offset/limit path forced on every page.
export function useOrders() {
  return useQuery<OrderCard[]>({
    queryKey: ['commerce', 'orders'],
    queryFn: async () =>
      ((await api.get('/v1/commerce/orders?limit=20')).data.data as OrderCard[]) ?? [],
  })
}

// useInfiniteOrders threads next_cursor through getNextPageParam so the
// customer order-list screen can scroll without re-counting the whole
// orders table per page.
export function useInfiniteOrders(pageSize = 20) {
  return useInfiniteQuery<{ items: OrderCard[]; nextCursor: string | null }>({
    queryKey: ['commerce', 'orders', 'infinite', pageSize],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) })
      if (pageParam) params.set('cursor', String(pageParam))
      const res = await api.get(`/v1/commerce/orders?${params.toString()}`)
      return {
        items: (res.data.data as OrderCard[]) ?? [],
        nextCursor: (res.data.meta?.next_cursor as string | undefined) || null,
      }
    },
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function useOrder(orderId: string | undefined) {
  return useQuery<Order>({
    queryKey: ['commerce', 'order', orderId],
    queryFn: async () => (await api.get(`/v1/commerce/orders/${orderId}`)).data.data,
    enabled: !!orderId,
  })
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  variant_id: string
  seller_id: string
  product_title: string
  sku: string
  quantity: number
  unit_price: number
  final_price: number
  status: string
  shipment_id?: string | null
  tracking_number?: string | null
  return_eligible_until?: string | null
  delivered_at?: string | null
}

export function useOrderWithItems(orderId: string | undefined) {
  return useQuery<{ order: Order; items: OrderItem[] }>({
    queryKey: ['commerce', 'order-items', orderId],
    queryFn: async () => (await api.get(`/v1/commerce/orders/${orderId}/items`)).data.data,
    enabled: !!orderId,
  })
}

export function useCancelOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) =>
      (await api.post(`/v1/commerce/orders/${orderId}/cancel`, { reason })).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'orders'] })
      qc.invalidateQueries({ queryKey: ['commerce', 'order', vars.orderId] })
    },
  })
}

// ── Shipments + Invoices ──────────────────────────────────────────────

export function useShipment(orderId: string | undefined) {
  return useQuery<{ shipment: Shipment; events: ShipmentEvent[] }>({
    queryKey: ['commerce', 'shipment', orderId],
    queryFn: async () => (await api.get(`/v1/commerce/orders/${orderId}/shipment`)).data.data,
    enabled: !!orderId,
    retry: false,
  })
}

// ── Seller fulfillment ────────────────────────────────────────────────

export function useSellerOrders() {
  return useQuery<Order[]>({
    queryKey: ['commerce', 'seller', 'orders'],
    queryFn: async () => (await api.get('/v1/commerce/seller/orders')).data.data ?? [],
  })
}

// SellerOrderCard mirrors the Phase 4.2 commerce-service DTO — seller-scoped
// items + their shipment in one payload so the fulfillment dashboard avoids
// fanning out a separate request per order.
export type FulfillmentStage = 'all' | 'unshipped' | 'in_transit' | 'delivered' | 'cancelled'

export type SellerOrderCard = {
  order: Order
  items: OrderItem[]
  shipment?: Shipment | null
  seller_subtotal: number
  delivery_address?: string | null // raw JSON snapshot, base64 or string
}

export function useSellerFulfillment(stage: FulfillmentStage = 'all') {
  return useQuery<{ orders: SellerOrderCard[]; stage: FulfillmentStage }>({
    queryKey: ['commerce', 'seller', 'fulfillment', stage],
    queryFn: async () =>
      (await api.get('/v1/commerce/seller/fulfillment', { params: { stage } })).data.data,
  })
}

export function useSellerOrderDetail(orderId: string | undefined) {
  return useQuery<SellerOrderCard>({
    queryKey: ['commerce', 'seller', 'order', orderId],
    queryFn: async () => (await api.get(`/v1/commerce/seller/orders/${orderId}`)).data.data,
    enabled: !!orderId,
  })
}

// ── Seller returns inbox (Phase 4.3) ──────────────────────────────────

export type ReturnStatus = '' | 'requested' | 'approved' | 'rejected' | 'refunded'

export type SellerReturnCard = {
  return: {
    id: string
    order_id: string
    order_item_id: string
    customer_user_id: string
    seller_id: string
    reason_code: string
    reason_description?: string | null
    status: string
    approved_at?: string | null
    rejected_at?: string | null
    rejection_reason?: string | null
    requested_at: string
    refund_amount?: number | null
  }
  order_item?: OrderItem
  order?: Order
}

export function useSellerReturns(status: ReturnStatus = '') {
  return useQuery<{ returns: SellerReturnCard[]; status: string }>({
    queryKey: ['commerce', 'seller', 'returns', status],
    queryFn: async () =>
      (await api.get('/v1/commerce/seller/returns', { params: status ? { status } : {} })).data.data,
  })
}

export function useReturnRefundPreview(returnId: string | undefined) {
  return useQuery<{ refund_amount: number }>({
    queryKey: ['commerce', 'return', returnId, 'refund-preview'],
    queryFn: async () =>
      (await api.get(`/v1/commerce/returns/${returnId}/refund-preview`)).data.data,
    enabled: !!returnId,
    retry: false,
  })
}

export function useApproveReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (returnId: string) =>
      (await api.post(`/v1/commerce/returns/${returnId}/approve`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'returns'] }),
  })
}

export function useRejectReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ returnId, reason }: { returnId: string; reason: string }) =>
      (await api.post(`/v1/commerce/returns/${returnId}/reject`, { reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'returns'] }),
  })
}

// ── Seller earnings (Phase 4.4) ───────────────────────────────────────

export type SellerEarning = {
  order_item_id: string
  order_id: string
  order_number: string
  product_title: string
  sku: string
  quantity: number
  gross_amount: number
  commission_amount: number
  platform_fee: number
  tds_amount: number
  net_amount: number
  payment_method?: string | null
  status: string
  delivered_at?: string | null
}

export function useSellerEarnings(limit = 50, offset = 0) {
  return useQuery<{ earnings: SellerEarning[] }>({
    queryKey: ['commerce', 'seller', 'earnings', limit, offset],
    queryFn: async () =>
      (await api.get('/v1/commerce/seller/earnings', { params: { limit, offset } })).data.data,
  })
}

export type SellerCODRemittance = {
  id: string
  shipment_id: string
  order_id: string
  seller_id: string
  gross_amount: number
  commission_amount: number
  platform_fee: number
  tds_amount: number
  net_amount: number
  currency_code: string
  status: string
  delivered_at: string
  settled_at?: string | null
}

export function useSellerCODRemittances(status: string = '') {
  return useQuery<{ items: SellerCODRemittance[]; total: number }>({
    queryKey: ['commerce', 'seller', 'cod-remittances', status],
    queryFn: async () =>
      (await api.get('/v1/commerce/seller/cod-remittances', { params: status ? { status } : {} })).data
        .data,
  })
}

// ── Phase 5 — B2B / Organizations ─────────────────────────────────────

export type OrgRole = 'admin' | 'buyer' | 'approver' | 'finance'

export type Organization = {
  id: string
  name: string
  legal_name?: string | null
  gstin?: string | null
  pan?: string | null
  billing_email?: string | null
  billing_phone?: string | null
  billing_address_id?: string | null
  approval_threshold?: number | null
  credit_terms_days: number
  credit_limit?: number | null
  status: string
  created_by_user_id?: string | null
  created_at: string
  updated_at: string
}

export type OrganizationMember = {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  status: 'invited' | 'active' | 'removed'
  invited_email?: string | null
  invited_at: string
  joined_at?: string | null
}

export type OrganizationInvite = {
  id: string
  organization_id: string
  email: string
  role: OrgRole
  token: string
  invited_by: string
  expires_at: string
  accepted_at?: string | null
  created_at: string
}

export function useMyOrganizations() {
  return useQuery<{ organizations: Organization[] }>({
    queryKey: ['commerce', 'organizations', 'me'],
    queryFn: async () => (await api.get('/v1/commerce/organizations/me')).data.data,
  })
}

export function useOrganization(orgId: string | undefined) {
  return useQuery<Organization>({
    queryKey: ['commerce', 'organizations', orgId],
    queryFn: async () => (await api.get(`/v1/commerce/organizations/${orgId}`)).data.data,
    enabled: !!orgId,
  })
}

export function useOrganizationMembers(orgId: string | undefined) {
  return useQuery<{ members: OrganizationMember[] }>({
    queryKey: ['commerce', 'organizations', orgId, 'members'],
    queryFn: async () => (await api.get(`/v1/commerce/organizations/${orgId}/members`)).data.data,
    enabled: !!orgId,
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      legal_name?: string
      gstin?: string
      pan?: string
      billing_email?: string
      billing_phone?: string
      approval_threshold?: number
      credit_terms_days?: number
      credit_limit?: number
    }) => (await api.post('/v1/commerce/organizations', payload)).data.data as Organization,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'organizations'] }),
  })
}

export function useUpdateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orgId,
      patch,
    }: {
      orgId: string
      patch: Partial<Organization>
    }) => (await api.patch(`/v1/commerce/organizations/${orgId}`, patch)).data.data,
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['commerce', 'organizations', vars.orgId] }),
  })
}

export function useInviteOrgMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orgId,
      email,
      role,
    }: {
      orgId: string
      email: string
      role: OrgRole
    }) =>
      (await api.post(`/v1/commerce/organizations/${orgId}/members`, { email, role })).data
        .data as OrganizationInvite,
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['commerce', 'organizations', vars.orgId, 'members'] }),
  })
}

export function useUpdateOrgMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      orgId,
      userId,
      role,
    }: {
      orgId: string
      userId: string
      role: OrgRole
    }) =>
      api.patch(`/v1/commerce/organizations/${orgId}/members/${userId}`, { role }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['commerce', 'organizations', vars.orgId, 'members'] }),
  })
}

export function useRemoveOrgMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orgId, userId }: { orgId: string; userId: string }) =>
      api.delete(`/v1/commerce/organizations/${orgId}/members/${userId}`),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['commerce', 'organizations', vars.orgId, 'members'] }),
  })
}

export function useAcceptOrgInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) =>
      (await api.post(`/v1/commerce/organizations/invites/${token}/accept`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'organizations'] }),
  })
}

export function useOrgPendingApprovals(orgId: string | undefined) {
  return useQuery<{ orders: Order[] }>({
    queryKey: ['commerce', 'organizations', orgId, 'pending-approvals'],
    queryFn: async () =>
      (await api.get(`/v1/commerce/organizations/${orgId}/orders/pending-approval`)).data.data,
    enabled: !!orgId,
  })
}

export function useOrgOrders(orgId: string | undefined, status: string = '') {
  return useQuery<{ orders: Order[] }>({
    queryKey: ['commerce', 'organizations', orgId, 'orders', status],
    queryFn: async () =>
      (
        await api.get(`/v1/commerce/organizations/${orgId}/orders`, {
          params: status ? { status } : {},
        })
      ).data.data,
    enabled: !!orgId,
  })
}

export function useApproveOrgOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes?: string }) =>
      (await api.post(`/v1/commerce/orders/${orderId}/approve`, { notes })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'organizations'] }),
  })
}

export function useRejectOrgOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) =>
      (await api.post(`/v1/commerce/orders/${orderId}/reject`, { reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'organizations'] }),
  })
}

export function useBookShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) =>
      (await api.post(`/v1/commerce/orders/${orderId}/shipment`)).data.data as Shipment,
    onSuccess: (_, orderId) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'shipment', orderId] })
      qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'orders'] })
      qc.invalidateQueries({ queryKey: ['commerce', 'order', orderId] })
    },
  })
}

export function useIssueInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) =>
      (await api.post(`/v1/commerce/orders/${orderId}/invoice`)).data.data as Invoice,
    onSuccess: (_, orderId) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'invoice', orderId] })
    },
  })
}

export function useInvoice(orderId: string | undefined) {
  return useQuery<{ invoice: Invoice; download_url: string }>({
    queryKey: ['commerce', 'invoice', orderId],
    queryFn: async () => (await api.get(`/v1/commerce/orders/${orderId}/invoice`)).data.data,
    enabled: !!orderId,
    retry: false,
  })
}

// ── Phase F2.1 — Variant tier pricing ─────────────────────────────────

export type PriceTier = {
  id: string
  variant_id: string
  min_qty: number
  max_qty?: number | null
  price: number
  created_at: string
  updated_at: string
}

export function usePriceTiers(variantId: string | undefined) {
  return useQuery<{ tiers: PriceTier[] }>({
    queryKey: ['commerce', 'variants', variantId, 'price-tiers'],
    queryFn: async () =>
      (await api.get(`/v1/commerce/variants/${variantId}/price-tiers`)).data.data,
    enabled: !!variantId,
  })
}

export function useSetPriceTiers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      variantId,
      tiers,
    }: {
      variantId: string
      tiers: Array<{ min_qty: number; max_qty?: number | null; price: number }>
    }) =>
      (await api.put(`/v1/commerce/variants/${variantId}/price-tiers`, { tiers })).data.data,
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['commerce', 'variants', vars.variantId, 'price-tiers'] }),
  })
}

// ── Phase F2.2 — RFQ (Request For Quote) ──────────────────────────────

export type RFQ = {
  id: string
  buyer_user_id: string
  organization_id?: string | null
  seller_id: string
  status: 'requested' | 'quoted' | 'accepted' | 'expired' | 'rejected' | 'cancelled'
  message_text?: string | null
  requested_at: string
  expires_at: string
  created_at: string
}

export type RFQItem = {
  id: string
  rfq_id: string
  variant_id: string
  quantity: number
  notes?: string | null
}

export type RFQQuote = {
  id: string
  rfq_id: string
  quoted_total: number
  line_prices: Array<{
    rfq_item_id: string
    variant_id: string
    quantity: number
    unit_price: number
    line_total: number
  }>
  validity_days: number
  quoted_at: string
  expires_at: string
  accepted_at?: string | null
  order_id?: string | null
}

export function useMyRFQs() {
  return useQuery<{ rfqs: RFQ[] }>({
    queryKey: ['commerce', 'rfqs', 'me'],
    queryFn: async () => (await api.get('/v1/commerce/rfqs')).data.data,
  })
}

export function useSellerRFQs(status: string = '') {
  return useQuery<{ rfqs: RFQ[] }>({
    queryKey: ['commerce', 'seller', 'rfqs', status],
    queryFn: async () =>
      (await api.get('/v1/commerce/seller/rfqs', { params: status ? { status } : {} })).data.data,
  })
}

export function useRFQ(rfqId: string | undefined) {
  return useQuery<{ rfq: RFQ; items: RFQItem[]; quotes: RFQQuote[] }>({
    queryKey: ['commerce', 'rfqs', rfqId],
    queryFn: async () => (await api.get(`/v1/commerce/rfqs/${rfqId}`)).data.data,
    enabled: !!rfqId,
  })
}

export function useCreateRFQ() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      seller_id: string
      organization_id?: string
      message?: string
      items: Array<{ variant_id: string; quantity: number; notes?: string }>
    }) =>
      (await api.post('/v1/commerce/rfqs', payload)).data.data as { rfq: RFQ; items: RFQItem[] },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'rfqs'] }),
  })
}

export function useSendRFQQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rfqId,
      validityDays,
      linePrices,
    }: {
      rfqId: string
      validityDays: number
      linePrices: Array<{ rfq_item_id: string; unit_price: number }>
    }) =>
      (await api.post(`/v1/commerce/rfqs/${rfqId}/quote`, {
        validity_days: validityDays,
        line_prices: linePrices,
      })).data.data as RFQQuote,
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['commerce', 'rfqs', vars.rfqId] }),
  })
}

export function useAcceptRFQQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rfqId,
      quoteId,
      addressId,
      paymentMethod = 'prepaid',
      poNumber,
      costCenter,
      invoiceEmail,
    }: {
      rfqId: string
      quoteId: string
      addressId: string
      paymentMethod?: 'prepaid' | 'cod' | 'credit'
      poNumber?: string
      costCenter?: string
      invoiceEmail?: string
    }) =>
      (await api.post(`/v1/commerce/rfqs/${rfqId}/quotes/${quoteId}/accept`, {
        address_id: addressId,
        payment_method: paymentMethod,
        po_number: poNumber,
        cost_center: costCenter,
        invoice_email: invoiceEmail,
      })).data.data as Order,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'rfqs'] }),
  })
}

export function useRejectRFQ() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rfqId, reason }: { rfqId: string; reason: string }) =>
      api.post(`/v1/commerce/rfqs/${rfqId}/reject`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commerce', 'rfqs'] }),
  })
}

// ── Phase F2.3 — Bulk SKU upload ──────────────────────────────────────

export type BulkImportJob = {
  id: string
  seller_id: string
  filename: string
  status:
    | 'uploaded'
    | 'validating'
    | 'validation_failed'
    | 'ready_to_import'
    | 'importing'
    | 'partially_imported'
    | 'completed'
    | 'failed'
  total_rows: number
  valid_rows: number
  imported_rows: number
  error_rows: number
  error_file_id?: string | null
  created_at: string
  completed_at?: string | null
}

export function useBulkImportJobs() {
  return useQuery<{ jobs: BulkImportJob[] }>({
    queryKey: ['commerce', 'seller', 'bulk-import'],
    queryFn: async () => (await api.get('/v1/commerce/seller/bulk-import')).data.data,
  })
}

export function useBulkImportJob(jobId: string | undefined) {
  return useQuery<BulkImportJob>({
    queryKey: ['commerce', 'seller', 'bulk-import', jobId],
    queryFn: async () => (await api.get(`/v1/commerce/seller/bulk-import/${jobId}`)).data.data,
    enabled: !!jobId,
    // Refetch every 2s while job is in flight so the UI sees progress.
    refetchInterval: (q) => {
      const data = q.state.data
      if (!data) return false
      return ['validating', 'importing'].includes(data.status) ? 2000 : false
    },
  })
}

export function useInitiateBulkUpload() {
  return useMutation({
    mutationFn: async (filename: string) =>
      (await api.post('/v1/commerce/seller/bulk-import/presigned-url', { filename })).data.data as {
        job_id: string
        upload_url: string
        job: BulkImportJob
      },
  })
}

export function useMarkBulkUploadComplete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) =>
      api.post(`/v1/commerce/seller/bulk-import/${jobId}/upload-complete`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'bulk-import', jobId] })
      qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'bulk-import'] })
    },
  })
}

export function useExecuteBulkImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (jobId: string) =>
      api.post(`/v1/commerce/seller/bulk-import/${jobId}/execute`),
    onSuccess: (_, jobId) => {
      qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'bulk-import', jobId] })
    },
  })
}

