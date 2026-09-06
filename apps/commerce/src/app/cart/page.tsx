'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Tag, Trash2 } from 'lucide-react'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'
import { ProductPhoto } from '@/components/commerce/ProductPhoto'
import { inr } from '@/components/commerce/ProductGrid'
import { productImage } from '@/lib/media'
import { useCart, useCouponPreview, useRemoveFromCart, useUpdateCartItem } from '@/hooks/useCommerce'

export default function CartPage() {
  const { data: cart, isLoading, error } = useCart()
  const remove = useRemoveFromCart()
  const update = useUpdateCartItem()
  const [couponDraft, setCouponDraft] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const couponPreview = useCouponPreview(appliedCoupon)
  const isChanging = remove.isPending || update.isPending

  if (isLoading) return <><StoreHeader /><div className="cart-state"><span className="cart-loader" />Preparing your bag…</div></>
  if (error) return <><StoreHeader /><div className="cart-state cart-state-error">Your bag could not be loaded. Please try again.</div></>
  if (!cart || cart.ItemCount === 0) return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader />
      <main className="empty-vbag flex-1">
        <div className="empty-vbag-mark"><ShoppingBag size={32} aria-hidden="true" /></div>
        <span className="shop-eyebrow">Your bag</span>
        <h1>Room for something<br />worth owning.</h1>
        <p>Everything you add is held here until you are ready to check out.</p>
        <Link href="/" className="btn btn-gold btn-lg mt-8">
          Explore the shop <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </main>
      <StoreFooter />
    </div>
  )

  const finalTotal = couponPreview.data?.applied ? couponPreview.data.grand_total : cart.Subtotal

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader />
      <main className="vbag-page flex-1">
        <div className="vbag-heading">
          <div><span className="shop-eyebrow">atPost Shop</span><h1>Your bag</h1></div>
          <p><strong>{cart.ItemCount}</strong> {cart.ItemCount === 1 ? 'item' : 'items'} selected</p>
        </div>

        <div className="vbag-layout">
          <section className="vbag-items" aria-label="Items in your bag">
            {cart.Items.map((ci) => {
              const image = productImage(
                { image_media_id: ci.Variant?.image_media_id, ...ci.Product },
                { width: 400 },
              )
              return (
                <article className="vbag-item" key={ci.Item.id}>
                  <Link href={`/products/${ci.Item.product_id}`} className="vbag-item-image" aria-label={ci.Product?.title ?? 'Product'}>
                    <ProductPhoto src={image} alt={ci.Product?.title ?? 'Product'} tight />
                  </Link>
                  <div className="vbag-item-copy">
                    <span>{ci.Product?.retailer_name ?? 'atPost seller'}</span>
                    <Link href={`/products/${ci.Item.product_id}`}>{ci.Product?.title ?? 'Product'}</Link>
                    <small>SKU / {ci.Variant?.sku ?? 'STANDARD'}</small>
                    <div className="vbag-item-unit">{inr(ci.Item.price_snapshot)} each</div>
                  </div>
                  <div className="vbag-item-controls">
                    <strong>{inr(ci.Item.price_snapshot * ci.Item.quantity)}</strong>
                    <div className="cart-quantity" aria-label={`Quantity for ${ci.Product?.title ?? 'product'}`}>
                      <button type="button" disabled={isChanging} onClick={() => ci.Item.quantity === 1 ? remove.mutate(ci.Item.variant_id) : update.mutate({ variant_id: ci.Item.variant_id, quantity: ci.Item.quantity - 1 })} aria-label="Decrease quantity"><Minus size={15} /></button>
                      <span>{ci.Item.quantity}</span>
                      <button type="button" disabled={isChanging || ci.Item.quantity >= 10} onClick={() => update.mutate({ variant_id: ci.Item.variant_id, quantity: ci.Item.quantity + 1 })} aria-label="Increase quantity"><Plus size={15} /></button>
                    </div>
                    <button className="vbag-remove" type="button" disabled={isChanging} onClick={() => remove.mutate(ci.Item.variant_id)}><Trash2 size={14} aria-hidden="true" /> Remove</button>
                  </div>
                </article>
              )
            })}
            <Link href="/" className="continue-market"><ArrowLeft size={16} aria-hidden="true" /> Continue shopping</Link>
          </section>

          <aside className="vbag-summary">
            <span className="shop-eyebrow">Order summary</span>
            <h2>Almost yours.</h2>
            <div className="coupon-field">
              <Tag size={16} aria-hidden="true" />
              <input value={couponDraft} onChange={(event) => setCouponDraft(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') setAppliedCoupon(couponDraft.trim()) }} placeholder="PROMO CODE" aria-label="Promo code" />
              <button type="button" disabled={!couponDraft.trim() || couponPreview.isFetching} onClick={() => appliedCoupon === couponDraft.trim() ? (setAppliedCoupon(''), setCouponDraft('')) : setAppliedCoupon(couponDraft.trim())}>{appliedCoupon === couponDraft.trim() ? 'CLEAR' : 'APPLY'}</button>
            </div>
            {appliedCoupon && couponPreview.isError ? <p className="coupon-message error">That code is not available for this bag.</p> : null}
            {couponPreview.data?.applied ? <p className="coupon-message">Code {couponPreview.data.coupon_code} saved {inr(couponPreview.data.coupon_discount)}</p> : null}

            <div className="summary-lines">
              <div><span>Items</span><strong>{cart.ItemCount}</strong></div>
              <div><span>Subtotal</span><strong>{inr(cart.Subtotal)}</strong></div>
              {couponPreview.data?.applied ? <div><span>Coupon saving</span><strong className="is-saving">−{inr(couponPreview.data.coupon_discount)}</strong></div> : null}
              <div className="summary-total"><span>Estimated total<small>Taxes and delivery calculated next</small></span><strong>{inr(finalTotal)}</strong></div>
            </div>
            <Link href={`/checkout${appliedCoupon && couponPreview.data?.applied ? `?coupon=${encodeURIComponent(appliedCoupon)}` : ''}`} className="btn btn-gold btn-block btn-lg mt-7">
              Checkout securely <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <div className="summary-trust"><ShieldCheck size={15} aria-hidden="true" /> Protected checkout · Easy returns</div>
          </aside>
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}
