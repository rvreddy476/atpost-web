'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  useCart,
  useAddresses,
  useAddAddress,
  useCheckout,
  useCreatePaymentIntent,
  useConfirmPayment,
  useMyOrganizations,
  useCheckoutQuote,
} from '@/hooks/useCommerce'
import { Building2, CreditCard, Lock, MapPin, Plus, ShieldCheck, ShoppingBag, Tag } from 'lucide-react'
import { AddressForm } from '@/components/commerce/AddressForm'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'
import { inr } from '@/components/commerce/ProductGrid'
import { getCheckoutBlockReason } from '@/lib/checkout'
import { completeOrderPayment } from '@/lib/orderPayment'

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: cart } = useCart()
  const { data: addresses } = useAddresses()
  const addAddress = useAddAddress()
  const checkout = useCheckout()
  const createIntent = useCreatePaymentIntent()
  const confirmPayment = useConfirmPayment()

  const [selectedAddr, setSelectedAddr] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'prepaid' | 'cod' | 'credit'>('prepaid')
  const [couponCode, setCouponCode] = useState(() => searchParams.get('coupon') ?? '')
  const [showAddForm, setShowAddForm] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const checkoutKey = useRef<string | null>(null)

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

  const addrList = useMemo(() => addresses ?? [], [addresses])
  useEffect(() => {
    if (selectedAddr || addrList.length === 0) return
    setSelectedAddr((addrList.find((address) => address.is_default) ?? addrList[0]).id)
  }, [addrList, selectedAddr])

  useEffect(() => {
    if (!creditAvailable && paymentMethod === 'credit') setPaymentMethod('prepaid')
  }, [creditAvailable, paymentMethod])

  const quoteInput = selectedAddr && paymentMethod !== 'credit' ? {
    address_id: selectedAddr,
    payment_method: paymentMethod,
    coupon_code: couponCode.trim() || undefined,
  } : null
  const quote = useCheckoutQuote(quoteInput)
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedAddress: selectedAddr,
    isProcessing,
    isQuoteFetching: quote.isFetching,
    paymentMethod,
    quote: quote.data,
  })

  const place = async () => {
    if (!selectedAddr) return
    setPaymentError(null)
    setIsProcessing(true)
    try {
      checkoutKey.current ??= crypto.randomUUID()
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
        idempotency_key: checkoutKey.current,
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

      await completeOrderPayment(order, createIntent.mutateAsync, confirmPayment.mutateAsync)

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
    return (
      <div className="flex min-h-screen flex-col">
        <StoreHeader />
        <main className="empty-vbag flex-1">
          <div className="empty-vbag-mark"><ShoppingBag size={32} aria-hidden="true" /></div>
          <span className="shop-eyebrow">Checkout</span>
          <h1>Your bag is empty.</h1>
          <p>Add something you want before checking out.</p>
          <Link href="/" className="btn btn-gold btn-lg mt-8">Continue shopping</Link>
        </main>
        <StoreFooter />
      </div>
    )

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader />
      <main className="shop-page flex-1">
        <nav aria-label="Breadcrumb" className="text-xs text-shop-faint">
          <Link href="/" className="hover:text-shop-gold">Shop</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/cart" className="hover:text-shop-gold">Bag</Link>
          <span aria-hidden="true"> / </span>
          <span className="text-shop-muted">Checkout</span>
        </nav>
        <h1 className="shop-display mt-4 text-3xl sm:text-[40px]">Checkout</h1>

        <div className="mt-9 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <section className="panel panel-pad">
              <h2 className="panel-heading"><MapPin size={19} className="text-shop-gold" aria-hidden="true" /> Delivery address</h2>
              {addrList.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {addrList.map((a) => (
                    <label key={a.id} className={`choice-row items-start ${selectedAddr === a.id ? 'is-selected' : ''}`}>
                      <input
                        type="radio"
                        name="addr"
                        className="mt-0.5"
                        checked={selectedAddr === a.id}
                        onChange={() => setSelectedAddr(a.id)}
                      />
                      <span className="flex-1 text-sm">
                        <span className="block font-semibold text-shop-ink">{a.contact_name} · {a.phone}</span>
                        <span className="mt-1 block text-shop-muted">
                          {a.address_line_1}
                          {a.address_line_2 ? `, ${a.address_line_2}` : ''}, {a.city}, {a.state} {a.postal_code}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}

              {!showAddForm ? (
                <button type="button" onClick={() => setShowAddForm(true)} className="gold-link mt-4">
                  <Plus size={15} aria-hidden="true" /> Add a new address
                </button>
              ) : (
                <div className="mt-5">
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
              <section className="panel panel-pad">
                <h2 className="panel-heading"><Building2 size={19} className="text-shop-gold" aria-hidden="true" /> Buying for</h2>
                <p className="-mt-2 mb-4 text-xs text-shop-faint">
                  Select an organization to bill the company, add PO / cost-center, or use credit terms.
                </p>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="field"
                  aria-label="Organization"
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
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">PO number</span>
                      <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Purchase order ref" className="field" />
                    </label>
                    <label className="block">
                      <span className="field-label">Cost center</span>
                      <input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="Department or project" className="field" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="field-label">Invoice email (override)</span>
                      <input
                        type="email"
                        value={invoiceEmail}
                        onChange={(e) => setInvoiceEmail(e.target.value)}
                        placeholder={selectedOrg.billing_email ?? 'finance@company.com'}
                        className="field"
                      />
                    </label>
                    {selectedOrg.approval_threshold && (
                      <p className="notice notice-info sm:col-span-2">
                        Orders of {inr(selectedOrg.approval_threshold)} or more require an approver sign-off before payment.
                      </p>
                    )}
                    {creditAvailable && (
                      <p className="notice notice-info sm:col-span-2">
                        Credit terms: Net {selectedOrg.credit_terms_days} days available.
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="panel panel-pad">
              <h2 className="panel-heading"><CreditCard size={19} className="text-shop-gold" aria-hidden="true" /> Payment method</h2>
              <div className="flex flex-col gap-2">
                <label className={`choice-row ${paymentMethod === 'prepaid' ? 'is-selected' : ''}`}>
                  <input type="radio" checked={paymentMethod === 'prepaid'} onChange={() => setPaymentMethod('prepaid')} />
                  <span>Pay online <span className="text-shop-faint">— UPI, card or net banking</span></span>
                </label>
                <label className={`choice-row ${paymentMethod === 'cod' ? 'is-selected' : ''}`}>
                  <input type="radio" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />
                  <span>Cash on delivery</span>
                </label>
                {creditAvailable && (
                  <label className={`choice-row ${paymentMethod === 'credit' ? 'is-selected' : ''}`}>
                    <input type="radio" checked={paymentMethod === 'credit'} onChange={() => setPaymentMethod('credit')} />
                    <span>Pay on invoice <span className="text-shop-faint">— Net {selectedOrg!.credit_terms_days} days</span></span>
                  </label>
                )}
              </div>
            </section>
          </div>

          <aside className="vbag-summary lg:sticky lg:top-[150px]">
            <span className="shop-eyebrow">Order summary</span>
            <h2>{cart.ItemCount} {cart.ItemCount === 1 ? 'item' : 'items'}</h2>

            <div className="mt-6 flex flex-col gap-2.5">
              {cart.Items.map((ci) => (
                <div key={ci.Item.id} className="flex justify-between gap-3 text-sm text-shop-muted">
                  <span className="min-w-0 truncate">{ci.Product?.title ?? 'Product'} × {ci.Item.quantity}</span>
                  <span className="whitespace-nowrap font-semibold text-shop-ink">{inr(ci.Item.price_snapshot * ci.Item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="coupon-field">
              <Tag size={16} aria-hidden="true" />
              {/* Value passes through untouched — the quote endpoint sees the
                  same string it did before this restyle. */}
              <input placeholder="Coupon code" aria-label="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
            </div>

            <div className="summary-lines">
              <div><span>Subtotal</span><strong>{inr(quote.data?.subtotal ?? cart.Subtotal)}</strong></div>
              {!!quote.data?.coupon_discount && <div><span>Discount</span><strong className="is-saving">−{inr(quote.data.coupon_discount)}</strong></div>}
              {!!quote.data?.shipping && <div><span>Delivery</span><strong>{inr(quote.data.shipping)}</strong></div>}
              {!!quote.data?.tax && <div><span>Tax</span><strong>{inr(quote.data.tax)}</strong></div>}
              <div className="summary-total">
                <span>Order total<small>Inclusive of all taxes</small></span>
                <strong>{inr(quote.data?.grand_total ?? cart.Subtotal)}</strong>
              </div>
            </div>

            {quote.isFetching && <p className="mt-3 text-xs text-shop-faint">Updating price and delivery eligibility…</p>}
            {quote.isError && <p className="notice notice-error mt-3">We could not validate the latest price and availability. Retry before placing your order.</p>}
            {quote.data && !quote.data.serviceable && <p className="notice notice-error mt-3">Some items cannot be delivered to this address.</p>}
            {quote.data && paymentMethod === 'cod' && !quote.data.cod_eligible && <p className="notice notice-error mt-3">Cash on delivery is not available for this order.</p>}

            <button
              type="button"
              disabled={checkoutBlockReason !== null}
              onClick={place}
              className="btn btn-gold btn-block btn-lg mt-6"
            >
              <Lock size={16} aria-hidden="true" />
              {isProcessing
                ? 'Processing…'
                : paymentMethod === 'cod'
                  ? 'Place COD order'
                  : paymentMethod === 'credit'
                    ? 'Place credit order'
                    : 'Pay & place order'}
            </button>
            {checkoutBlockReason && !isProcessing ? (
              <p className="mt-3 text-xs text-shop-faint">{checkoutBlockReason}</p>
            ) : null}
            {paymentError ? <div className="notice notice-error mt-3">{paymentError}</div> : null}
            {checkout.error && !paymentError ? (
              <div className="notice notice-error mt-3">{(checkout.error as Error).message}</div>
            ) : null}
            <div className="summary-trust"><ShieldCheck size={15} aria-hidden="true" /> Payments are processed on a protected gateway</div>
          </aside>
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="cart-state"><span className="cart-loader" />Preparing secure checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  )
}
