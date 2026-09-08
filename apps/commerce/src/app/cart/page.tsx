'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Store, Tag, Trash2 } from 'lucide-react'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'
import { ProductPhoto } from '@/components/commerce/ProductPhoto'
import { productImage } from '@/lib/media'
import { inr, inrMinor } from '@/lib/money'
import { cartBlockReason, isMixedSellerCart, lineImage } from '@/lib/cart'
import { isSignedOut, useCart, useCouponPreview, useRemoveFromCart, useSession, useUpdateCartItem } from '@/hooks/useCommerce'

export default function CartPage() {
  const { data: cart, isLoading, error } = useCart()
  const session = useSession()
  const remove = useRemoveFromCart()
  const update = useUpdateCartItem()
  const [couponDraft, setCouponDraft] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const couponPreview = useCouponPreview(appliedCoupon)
  const isChanging = remove.isPending || update.isPending

  if ((session.known && !session.signedIn) || isSignedOut(error)) return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader />
      <main className="empty-vbag flex-1">
        <div className="empty-vbag-mark"><ShoppingBag size={32} aria-hidden="true" /></div>
        <span className="shop-eyebrow">Your bag</span>
        <h1>Sign in to see<br />what you saved.</h1>
        <p>Your bag is kept with your account, so it is waiting on the other side.</p>
        <Link href="/login?redirect=/shop/cart" className="btn btn-gold btn-lg mt-8">
          Sign in <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </main>
      <StoreFooter />
    </div>
  )
  if (isLoading) return <><StoreHeader /><div className="cart-state"><span className="cart-loader" />Preparing your bag…</div></>
  // Signed out is not an error. The bag is still there; it just needs a
  // session to read it, and saying so with a way in beats an apology.
  if (error) return <><StoreHeader /><div className="cart-state cart-state-error">Your bag could not be loaded. Please try again.</div></>
  if (!cart || cart.item_count === 0) return (
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

  const blockReason = cartBlockReason(cart)
  const mixedSellers = isMixedSellerCart(cart)

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader />
      <main className="vbag-page flex-1">
        <div className="vbag-heading">
          <div>
            <span className="shop-eyebrow">atPost Shop</span>
            <h1>Your bag</h1>
          </div>
          <p><strong>{cart.item_count}</strong> {cart.item_count === 1 ? 'item' : 'items'} selected</p>
        </div>

        {/* `seller_name` is set only when every line is one seller's, so this
            names a shop when it can and says "more than one" when it cannot,
            rather than picking whichever seller happened to be first. */}
        {cart.seller_name ? (
          <p className="vbag-seller"><Store size={15} aria-hidden="true" /> Sold by {cart.seller_name}</p>
        ) : mixedSellers ? (
          <p className="notice notice-error">
            <AlertTriangle size={15} aria-hidden="true" /> Your bag has items from more than one shop.
            An order can only be placed with one shop at a time — remove the items from one of them to check out.
          </p>
        ) : null}

        <div className="vbag-layout">
          <section className="vbag-items" aria-label="Items in your bag">
            {cart.items.map((line) => {
              // An absent image_url is the service saying "render a
              // placeholder"; productImage answers null and ProductPhoto
              // draws the empty plate.
              const image = productImage(lineImage(line), { width: 400 })
              // Bound as a const so `!= null` narrows it: zero is a real
              // former price and must not be treated as "no former price".
              const wasMinor = line.price_was_minor
              const overStock = line.sellable && line.quantity > line.available_qty
              return (
                <article className={`vbag-item${line.sellable ? '' : ' is-unavailable'}`} key={line.variant_id}>
                  <Link href={`/products/${line.product_id}`} className="vbag-item-image" aria-label={line.title}>
                    <ProductPhoto src={image} alt={line.title} tight />
                  </Link>
                  <div className="vbag-item-copy">
                    <span>{line.seller_name || 'atPost seller'}</span>
                    <Link href={`/products/${line.product_id}`}>{line.title}</Link>
                    <small>SKU / {line.sku || 'STANDARD'}</small>
                    <div className="vbag-item-unit">
                      {inrMinor(line.unit_price_minor)} each
                      {/* Set only when the catalogue price moved since the line
                          was added — the same disagreement checkout refuses
                          with PRICE_CHANGED. Absent is the ordinary case, and
                          is not zero. */}
                      {wasMinor != null ? <> · <s>was {inrMinor(wasMinor)}</s></> : null}
                    </div>
                    {!line.sellable ? (
                      <p className="vbag-item-flag is-error">
                        <AlertTriangle size={14} aria-hidden="true" /> No longer available — remove it to check out.
                      </p>
                    ) : overStock ? (
                      <p className="vbag-item-flag is-error">
                        <AlertTriangle size={14} aria-hidden="true" />
                        {line.available_qty === 0
                          ? ' Out of stock — remove it to check out.'
                          : ` Only ${line.available_qty} left — reduce the quantity to check out.`}
                      </p>
                    ) : line.available_qty <= 5 ? (
                      <p className="vbag-item-flag">Only {line.available_qty} left</p>
                    ) : null}
                  </div>
                  <div className="vbag-item-controls">
                    <strong>{inrMinor(line.line_total_minor)}</strong>
                    <div className="cart-quantity" aria-label={`Quantity for ${line.title}`}>
                      <button type="button" disabled={isChanging} onClick={() => line.quantity === 1 ? remove.mutate(line.variant_id) : update.mutate({ variant_id: line.variant_id, quantity: line.quantity - 1 })} aria-label="Decrease quantity"><Minus size={15} /></button>
                      <span>{line.quantity}</span>
                      {/* The ceiling is what the seller can still supply, not a
                          hard-coded 10: asking for more is an order checkout
                          cannot reserve stock for. */}
                      <button type="button" disabled={isChanging || !line.sellable || line.quantity >= line.available_qty} onClick={() => update.mutate({ variant_id: line.variant_id, quantity: line.quantity + 1 })} aria-label="Increase quantity"><Plus size={15} /></button>
                    </div>
                    <button className="vbag-remove" type="button" disabled={isChanging} onClick={() => remove.mutate(line.variant_id)}><Trash2 size={14} aria-hidden="true" /> Remove</button>
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

            {/* Two money dialects meet here. The cart's own totals are integer
                paise (`subtotal_minor`), the coupon preview's are rupee floats
                from the quote endpoint — so each is formatted by the function
                that matches it, and neither is converted into the other. */}
            <div className="summary-lines">
              <div><span>Items</span><strong>{cart.item_count}</strong></div>
              <div><span>Subtotal</span><strong>{inrMinor(cart.subtotal_minor)}</strong></div>
              {couponPreview.data?.applied ? <div><span>Coupon saving</span><strong className="is-saving">−{inr(couponPreview.data.coupon_discount)}</strong></div> : null}
              <div className="summary-total">
                <span>Estimated total<small>Taxes and delivery calculated next</small></span>
                <strong>{couponPreview.data?.applied ? inr(couponPreview.data.grand_total) : inrMinor(cart.subtotal_minor)}</strong>
              </div>
            </div>
            {blockReason ? <p className="notice notice-error mt-4">{blockReason}</p> : null}
            <Link
              href={`/checkout${appliedCoupon && couponPreview.data?.applied ? `?coupon=${encodeURIComponent(appliedCoupon)}` : ''}`}
              className="btn btn-gold btn-block btn-lg mt-7"
              aria-disabled={blockReason ? true : undefined}
              // A bag checkout is going to refuse should not send the shopper
              // to checkout to find that out.
              onClick={(event) => { if (blockReason) event.preventDefault() }}
            >
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
