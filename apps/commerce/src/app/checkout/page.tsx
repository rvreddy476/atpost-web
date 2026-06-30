'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useCart,
  useAddresses,
  useAddAddress,
  useCheckout,
  useCreatePaymentIntent,
  useConfirmPayment,
  useMyOrganizations,
} from '@/hooks/useCommerce'
import { AddressForm } from '@/components/commerce/AddressForm'
import { openRazorpayCheckout } from '@/lib/razorpay'

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ''

// Phase 0.3 stub guard: the synthetic-payment fallback exists for local dev
// against payments-service's StubGateway. It must NOT be reachable in a
// production build — even one with a missing key — because the previous
// behaviour was to silently confirm orders without any signature check.
// Set NEXT_PUBLIC_ENABLE_STUB_PAYMENTS=true alongside NODE_ENV=development
// to opt in; production-built bundles refuse outright.
const STUB_PAYMENTS_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_ENABLE_STUB_PAYMENTS === 'true'

export default function CheckoutPage() {
  const router = useRouter()
  const { data: cart } = useCart()
  const { data: addresses } = useAddresses()
  const addAddress = useAddAddress()
  const checkout = useCheckout()
  const createIntent = useCreatePaymentIntent()
  const confirmPayment = useConfirmPayment()

  const [selectedAddr, setSelectedAddr] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'prepaid' | 'cod' | 'credit'>('prepaid')
  const [couponCode, setCouponCode] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // Phase 5 — optional B2B context. If the user belongs to any organization
  // we expose a selector; selecting one unlocks PO / cost center / invoice
  // email fields and, when configured, credit-terms payment.
  const { data: orgsData } = useMyOrganizations()
  const myOrgs = orgsData?.organizations ?? []
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [poNumber, setPoNumber] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const selectedOrg = myOrgs.find((o) => o.id === selectedOrgId)
  const creditAvailable = !!selectedOrg && selectedOrg.credit_terms_days > 0

  const addrList = addresses ?? []
  if (!selectedAddr && addrList.length > 0) {
    const def = addrList.find((a) => a.is_default) ?? addrList[0]
    if (def) setSelectedAddr(def.id)
  }

  const place = async () => {
    if (!selectedAddr) return
    setPaymentError(null)
    setIsProcessing(true)
    try {
      // 1. Create the order. Backend reserves stock for prepaid (status =
      //    payment_pending) or deducts immediately for COD (status = confirmed).
      const order = await checkout.mutateAsync({
        address_id: selectedAddr,
        payment_method: paymentMethod,
        coupon_code: couponCode || undefined,
        organization_id: selectedOrgId || undefined,
        po_number: poNumber || undefined,
        cost_center: costCenter || undefined,
        invoice_email: invoiceEmail || undefined,
      })

      // B2B order parked for approval — no payment yet, take buyer to the
      // order page so they can see the awaiting_approval state.
      if (order.status === 'awaiting_approval') {
        router.push(`/orders/${order.id}`)
        return
      }

      // COD: payment is settled at delivery — go straight to the order page.
      if (paymentMethod === 'cod') {
        router.push(`/orders/${order.id}`)
        return
      }

      // Credit terms: backend confirms the order with a due date, no
      // gateway call now. Invoice will be paid net N days.
      if (paymentMethod === 'credit') {
        router.push(`/orders/${order.id}`)
        return
      }

      // Prepaid: enforce that a real Razorpay key is configured. The
      // synthetic-payment fallback is dev-only and refuses to run in a
      // production build (Phase 0.3).
      if (!RAZORPAY_KEY_ID && !STUB_PAYMENTS_ENABLED) {
        throw new Error(
          'Razorpay is not configured. Set NEXT_PUBLIC_RAZORPAY_KEY_ID, or set NEXT_PUBLIC_ENABLE_STUB_PAYMENTS=true for local dev.',
        )
      }

      // 2. Create a payment intent at payments-service. Returns provider_ref
      //    (Razorpay order_id) which checkout.js needs, plus the intent id
      //    we hand to commerce-service so it can ask payments-service to
      //    verify the signature against this exact intent.
      const intent = await createIntent.mutateAsync({
        payee_id: order.id, // Internal accounting reference; not user-visible.
        reference_type: 'order',
        reference_id: order.id,
        amount: order.final_amount,
        currency: order.currency_code || 'INR',
        method: 'razorpay',
      })

      const amountMinor = Math.round(order.final_amount * 100)

      // Stub path — only reachable when NEXT_PUBLIC_ENABLE_STUB_PAYMENTS is
      // explicitly true AND NODE_ENV !== 'production'. commerce-service
      // additionally requires PAYMENTS_ALLOW_STUB=true server-side to
      // accept gateway=stub; mis-configured prod builds fail closed.
      if (STUB_PAYMENTS_ENABLED && !RAZORPAY_KEY_ID) {
        await confirmPayment.mutateAsync({
          order_id: order.id,
          payment_intent_id: intent.id,
          razorpay_order_id: intent.provider_ref ?? `stub_order_${Date.now()}`,
          razorpay_payment_id: `stub_pay_${Date.now()}`,
          razorpay_signature: 'stub_signature',
          amount_minor: amountMinor,
          gateway: 'stub',
        })
        router.push(`/orders/${order.id}`)
        return
      }

      if (!intent.provider_ref) {
        throw new Error('Payment provider did not return an order id')
      }

      // 3. Open Razorpay checkout. Amount is paise — multiply rupees by 100.
      const resp = await openRazorpayCheckout({
        key: RAZORPAY_KEY_ID,
        order_id: intent.provider_ref,
        amount: amountMinor,
        currency: order.currency_code || 'INR',
        name: 'VChat',
        description: `Order ${order.order_number}`,
      })

      // 4. Confirm with commerce-service. The backend forwards the
      //    razorpay signature triple to payments-service for HMAC
      //    verification + amount check before marking the order paid.
      //    The webhook → consumer path is the resilient backup if the
      //    user closes the tab before this fires.
      await confirmPayment.mutateAsync({
        order_id: order.id,
        payment_intent_id: intent.id,
        razorpay_order_id: resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature,
        amount_minor: amountMinor,
        gateway: 'razorpay',
      })

      router.push(`/orders/${order.id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment failed'
      // payment_cancelled is a normal user action, not an error to scream about.
      setPaymentError(
        msg === 'payment_cancelled'
          ? 'Payment was cancelled. Your cart is unchanged — you can try again.'
          : msg,
      )
    } finally {
      setIsProcessing(false)
    }
  }

  if (!cart || cart.ItemCount === 0)
    return <div className="p-8 text-center">Your cart is empty.</div>

  return (
    <div className="mx-auto max-w-4xl p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>
          {addrList.length > 0 ? (
            <div className="space-y-2">
              {addrList.map((a) => (
                <label
                  key={a.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    selectedAddr === a.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="addr"
                    checked={selectedAddr === a.id}
                    onChange={() => setSelectedAddr(a.id)}
                  />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">
                      {a.contact_name} · {a.phone}
                    </div>
                    <div className="text-gray-600">
                      {a.address_line_1}
                      {a.address_line_2 ? `, ${a.address_line_2}` : ''}, {a.city}, {a.state} {a.postal_code}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : null}

          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-3 text-indigo-600 text-sm hover:underline"
            >
              + Add new address
            </button>
          ) : (
            <div className="mt-4">
              <AddressForm
                onSubmit={async (v) => {
                  const created = await addAddress.mutateAsync(v)
                  if (created?.id) setSelectedAddr(created.id)
                  setShowAddForm(false)
                }}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          )}
        </section>

        {myOrgs.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold mb-1">Buying for</h2>
            <p className="text-xs text-gray-500 mb-3">
              Select an organization to bill the company, add PO / cost-center, or use credit terms.
            </p>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Personal (no organization)</option>
              {myOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.gstin ? ` · GSTIN ${o.gstin}` : ''}
                </option>
              ))}
            </select>

            {selectedOrg && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">PO Number</span>
                  <input
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="Purchase order ref"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-600 mb-1">Cost Center</span>
                  <input
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    placeholder="Department or project"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-medium text-gray-600 mb-1">
                    Invoice Email (override)
                  </span>
                  <input
                    type="email"
                    value={invoiceEmail}
                    onChange={(e) => setInvoiceEmail(e.target.value)}
                    placeholder={selectedOrg.billing_email ?? 'finance@company.com'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                {selectedOrg.approval_threshold && (
                  <p className="text-xs text-amber-700 sm:col-span-2">
                    ⚠ Orders ≥ ₹{selectedOrg.approval_threshold.toFixed(2)} require an approver
                    sign-off before payment.
                  </p>
                )}
                {creditAvailable && (
                  <p className="text-xs text-blue-700 sm:col-span-2">
                    Credit terms: Net {selectedOrg.credit_terms_days} days available.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer">
            <input type="radio" checked={paymentMethod === 'prepaid'}
              onChange={() => setPaymentMethod('prepaid')} />
            <span>Pay online (UPI / Card / Net Banking)</span>
          </label>
          <label className="mt-2 flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer">
            <input type="radio" checked={paymentMethod === 'cod'}
              onChange={() => setPaymentMethod('cod')} />
            <span>Cash on Delivery</span>
          </label>
          {creditAvailable && (
            <label className="mt-2 flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50 cursor-pointer">
              <input type="radio" checked={paymentMethod === 'credit'}
                onChange={() => setPaymentMethod('credit')} />
              <span>
                Pay on invoice (Net {selectedOrg!.credit_terms_days} days)
              </span>
            </label>
          )}
        </section>
      </div>

      <aside className="rounded-xl border border-gray-200 bg-white p-6 h-fit sticky top-6">
        <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
        <div className="space-y-1 text-sm">
          {cart.Items.map((ci) => (
            <div key={ci.Item.id} className="flex justify-between">
              <span>{ci.Product?.title ?? 'Product'} × {ci.Item.quantity}</span>
              <span>₹{(ci.Item.price_snapshot * ci.Item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <input placeholder="Coupon code" value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div className="mt-4 pt-3 border-t flex justify-between font-semibold">
          <span>Subtotal</span>
          <span>₹{cart.Subtotal.toFixed(2)}</span>
        </div>
        <button
          disabled={!selectedAddr || isProcessing}
          onClick={place}
          className="mt-4 w-full rounded-lg bg-indigo-600 text-white py-3 font-medium disabled:bg-gray-300 hover:bg-indigo-700"
        >
          {isProcessing
            ? 'Processing…'
            : paymentMethod === 'cod'
              ? 'Place COD Order'
              : paymentMethod === 'credit'
                ? 'Place Credit Order'
                : 'Pay & Place Order'}
        </button>
        {paymentError ? (
          <div className="mt-2 text-sm text-red-600">{paymentError}</div>
        ) : null}
        {checkout.error && !paymentError ? (
          <div className="mt-2 text-sm text-red-600">
            {(checkout.error as Error).message}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
