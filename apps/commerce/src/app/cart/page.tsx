'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart, useCouponPreview, useRemoveFromCart } from '@/hooks/useCommerce'

export default function CartPage() {
  const { data: cart, isLoading, error } = useCart()
  const remove = useRemoveFromCart()
  const [couponDraft, setCouponDraft] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const couponPreview = useCouponPreview(appliedCoupon)

  if (isLoading) return <div className="p-8">Loading cart…</div>
  if (error) return <div className="p-8 text-red-600">Failed to load cart</div>
  if (!cart || cart.ItemCount === 0)
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="text-2xl font-semibold mb-4">Your cart is empty</h1>
        <Link href="/commerce" className="text-indigo-600 hover:underline">
          Browse products
        </Link>
      </div>
    )

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold mb-6">Your Cart</h1>
      <div className="space-y-3">
        {cart.Items.map((ci) => (
          <div
            key={ci.Item.id}
            className="flex items-center gap-4 rounded-xl border border-gray-200 p-4 bg-white"
          >
            <div className="flex-1">
              <div className="font-medium">{ci.Product?.title ?? 'Product'}</div>
              <div className="text-sm text-gray-500">SKU: {ci.Variant?.sku}</div>
              <div className="text-sm text-gray-500">
                ₹{ci.Item.price_snapshot} × {ci.Item.quantity}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">
                ₹{(ci.Item.price_snapshot * ci.Item.quantity).toFixed(2)}
              </div>
              <button
                onClick={() => remove.mutate(ci.Item.variant_id)}
                className="text-sm text-red-600 hover:underline mt-1"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        {/* Coupon preview (commerce TODO M#1). Pure preview — the
            actual application happens at checkout, so the user can
            try several codes risk-free. */}
        <div className="mb-4 pb-4 border-b border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Have a coupon?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponDraft}
              onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
              placeholder="ENTER CODE"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedCoupon(couponDraft.trim())
              }}
            />
            {appliedCoupon && appliedCoupon === couponDraft.trim() ? (
              <button
                onClick={() => {
                  setAppliedCoupon('')
                  setCouponDraft('')
                }}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
              >
                Clear
              </button>
            ) : (
              <button
                onClick={() => setAppliedCoupon(couponDraft.trim())}
                disabled={!couponDraft.trim() || couponPreview.isFetching}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {couponPreview.isFetching ? 'Checking…' : 'Apply'}
              </button>
            )}
          </div>

          {appliedCoupon && couponPreview.isError && (
            <p className="mt-2 text-sm text-red-600">
              {(() => {
                const err = couponPreview.error as { response?: { data?: { error?: { message?: string } } } } | null
                return err?.response?.data?.error?.message || 'Coupon could not be applied.'
              })()}
            </p>
          )}
          {appliedCoupon && couponPreview.data?.applied && (
            <p className="mt-2 text-sm text-emerald-700 font-medium">
              Coupon {couponPreview.data.coupon_code} applied — you save ₹
              {couponPreview.data.coupon_discount.toFixed(2)}.
            </p>
          )}
          {appliedCoupon && couponPreview.data && !couponPreview.data.applied && (
            <p className="mt-2 text-sm text-amber-700">
              This coupon doesn&apos;t apply to your current cart.
            </p>
          )}
        </div>

        <div className="flex justify-between text-sm text-gray-700">
          <span>Subtotal</span>
          <span>₹{cart.Subtotal.toFixed(2)}</span>
        </div>
        {couponPreview.data?.applied && couponPreview.data.coupon_discount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700 mt-1">
            <span>Coupon ({couponPreview.data.coupon_code})</span>
            <span>−₹{couponPreview.data.coupon_discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg mt-3 pt-3 border-t border-gray-100">
          <span>Estimated total</span>
          <span className="font-semibold">
            ₹
            {couponPreview.data?.applied
              ? couponPreview.data.grand_total.toFixed(2)
              : cart.Subtotal.toFixed(2)}
          </span>
        </div>
        <div className="text-sm text-gray-500 mt-2">
          Shipping and taxes calculated at checkout.
        </div>
        <Link
          href={`/checkout${appliedCoupon && couponPreview.data?.applied ? `?coupon=${encodeURIComponent(appliedCoupon)}` : ''}`}
          className="mt-4 block w-full rounded-lg bg-indigo-600 text-white text-center py-3 font-medium hover:bg-indigo-700"
        >
          Proceed to Checkout
        </Link>
      </div>
    </div>
  )
}
