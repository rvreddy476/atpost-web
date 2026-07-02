'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Sparkles, Tag, Trash2 } from 'lucide-react'
import { StoreHeader } from '@/components/StoreHeader'
import { useCart, useCouponPreview, useRemoveFromCart, useUpdateCartItem } from '@/hooks/useCommerce'

export default function CartPage() {
  const { data: cart, isLoading, error } = useCart()
  const remove = useRemoveFromCart()
  const update = useUpdateCartItem()
  const [couponDraft, setCouponDraft] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const couponPreview = useCouponPreview(appliedCoupon)
  const isChanging = remove.isPending || update.isPending

  if (isLoading) return <><StoreHeader /><div className="cart-state"><span className="cart-loader" />Preparing your V-Bag…</div></>
  if (error) return <><StoreHeader /><div className="cart-state text-red-600">Your V-Bag could not be loaded. Please try again.</div></>
  if (!cart || cart.ItemCount === 0) return (
    <><StoreHeader /><main className="empty-vbag">
      <div className="empty-vbag-mark"><ShoppingBag size={34} /></div>
      <span>YOUR V-BAG / 00</span>
      <h1>Room for something<br />remarkable.</h1>
      <p>Your saved finds will live here, ready whenever you are.</p>
      <Link href="/">Explore the market <ArrowRight size={18} /></Link>
    </main></>
  )

  const finalTotal = couponPreview.data?.applied ? couponPreview.data.grand_total : cart.Subtotal

  return (
    <><StoreHeader /><main className="vbag-page">
      <div className="vbag-heading">
        <div><span>VCHAT MARKET / CHECKOUT</span><h1>Your V-Bag</h1></div>
        <p><strong>{cart.ItemCount}</strong> {cart.ItemCount === 1 ? 'piece' : 'pieces'} selected</p>
      </div>

      <div className="vbag-layout">
        <section className="vbag-items" aria-label="Items in your bag">
          {cart.Items.map((ci, index) => {
            const image = ci.Variant?.image_media_id
              ? `/v1/media/${ci.Variant.image_media_id}/serve?w=500&q=85`
              : ci.Product?.primary_image_media_id
                ? `/v1/media/${ci.Product.primary_image_media_id}/serve?w=500&q=85`
                : ci.Product?.source_image_url
            return (
              <article className="vbag-item" key={ci.Item.id}>
                <span className="vbag-item-index">{String(index + 1).padStart(2, '0')}</span>
                <Link href={`/products/${ci.Item.product_id}`} className="vbag-item-image">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={ci.Product?.title ?? 'Product'} />
                  ) : <ShoppingBag size={30} />}
                </Link>
                <div className="vbag-item-copy">
                  <span>{ci.Product?.retailer_name ? `FROM ${ci.Product.retailer_name}` : 'VCHAT MARKET FIND'}</span>
                  <Link href={`/products/${ci.Item.product_id}`}>{ci.Product?.title ?? 'Product'}</Link>
                  <small>REF / {ci.Variant?.sku ?? 'STANDARD'}</small>
                  <div className="vbag-item-unit">₹{ci.Item.price_snapshot.toFixed(2)} each</div>
                </div>
                <div className="vbag-item-controls">
                  <strong>₹{(ci.Item.price_snapshot * ci.Item.quantity).toFixed(2)}</strong>
                  <div className="cart-quantity" aria-label={`Quantity for ${ci.Product?.title ?? 'product'}`}>
                    <button type="button" disabled={isChanging} onClick={() => ci.Item.quantity === 1 ? remove.mutate(ci.Item.variant_id) : update.mutate({ variant_id: ci.Item.variant_id, quantity: ci.Item.quantity - 1 })} aria-label="Decrease quantity"><Minus size={15} /></button>
                    <span>{ci.Item.quantity}</span>
                    <button type="button" disabled={isChanging || ci.Item.quantity >= 10} onClick={() => update.mutate({ variant_id: ci.Item.variant_id, quantity: ci.Item.quantity + 1 })} aria-label="Increase quantity"><Plus size={15} /></button>
                  </div>
                  <button className="vbag-remove" type="button" disabled={isChanging} onClick={() => remove.mutate(ci.Item.variant_id)}><Trash2 size={14} /> Remove</button>
                </div>
              </article>
            )
          })}
          <Link href="/" className="continue-market"><ArrowLeft size={16} /> Continue discovering</Link>
        </section>

        <aside className="vbag-summary">
          <div className="summary-orbit"><Sparkles size={18} /></div>
          <span>ORDER COMPOSITION</span>
          <h2>Almost yours.</h2>
          <div className="coupon-field">
            <Tag size={16} />
            <input value={couponDraft} onChange={(event) => setCouponDraft(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') setAppliedCoupon(couponDraft.trim()) }} placeholder="PROMO CODE" aria-label="Promo code" />
            <button type="button" disabled={!couponDraft.trim() || couponPreview.isFetching} onClick={() => appliedCoupon === couponDraft.trim() ? (setAppliedCoupon(''), setCouponDraft('')) : setAppliedCoupon(couponDraft.trim())}>{appliedCoupon === couponDraft.trim() ? 'Clear' : 'Apply'}</button>
          </div>
          {appliedCoupon && couponPreview.isError ? <p className="coupon-message error">That code is not available for this bag.</p> : null}
          {couponPreview.data?.applied ? <p className="coupon-message">Code {couponPreview.data.coupon_code} saved ₹{couponPreview.data.coupon_discount.toFixed(2)}</p> : null}

          <div className="summary-lines">
            <div><span>Pieces</span><strong>{cart.ItemCount}</strong></div>
            <div><span>Subtotal</span><strong>₹{cart.Subtotal.toFixed(2)}</strong></div>
            {couponPreview.data?.applied ? <div><span>VChat saving</span><strong>−₹{couponPreview.data.coupon_discount.toFixed(2)}</strong></div> : null}
            <div className="summary-total"><span>Estimated total<small>Taxes and delivery calculated next</small></span><strong>₹{finalTotal.toFixed(2)}</strong></div>
          </div>
          <Link href={`/checkout${appliedCoupon && couponPreview.data?.applied ? `?coupon=${encodeURIComponent(appliedCoupon)}` : ''}`} className="vbag-checkout">Continue securely <ArrowRight size={18} /></Link>
          <div className="summary-trust"><ShieldCheck size={16} /> Protected checkout · Easy returns</div>
        </aside>
      </div>
    </main></>
  )
}
