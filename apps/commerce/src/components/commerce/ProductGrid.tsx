'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Minus, Plus, Store } from 'lucide-react'
import { BRAND } from '@momentum/brand'
import { useAddToCart, useCart, useRemoveFromCart, useUpdateCartItem } from '@/hooks/useCommerce'
import { ProductPhoto } from './ProductPhoto'
import { FavouriteButton } from './FavouriteButton'
import { productImage } from '@/lib/media'
import { inr } from '@/lib/money'
import { discountLabel, displayPrice } from '@/lib/product'

export type ProductCardData = {
  id: string
  title: string
  slug?: string
  short_description?: string | null
  primary_image_media_id?: string | null
  // The catalogue read model returns presigned absolute URLs alongside the
  // media id; kept as fallbacks so a product still shows a photograph if the
  // media service has not minted a rendition for it yet.
  image_url?: string | null
  thumbnail_url?: string | null
  source_image_url?: string | null
  retailer_name?: string | null
  seller_name?: string | null
  category_name?: string | null
  // Money in PAISE, the storefront's own shape. The rupee floats after them
  // are the deprecated pair, read only when the paise are absent.
  min_price_minor?: number | null
  mrp_minor?: number | null
  min_selling_price?: number | null
  min_mrp?: number | null
  // Derived by the server. The card never does this sum itself.
  discount_pct?: number | null
  avg_rating?: number
  review_count?: number
  total_stock?: number | null
  in_stock?: boolean | null
  default_variant_id?: string | null
  // The heart, for the calling user. Absent when nobody is signed in.
  is_favourite?: boolean | null
}

type Props = {
  products: ProductCardData[]
  isLoading?: boolean
  emptyLabel?: string
  /** Rendered after the last card — the seller invite on a sparse landing. */
  tail?: React.ReactNode
  /**
   * `grid` wraps; `rail` is one horizontal, snap-scrolling row, which is what
   * the landing's merchandised sections are. Same card either way, so a deal
   * looks the same on the rail as it does in the grid it links to.
   */
  layout?: 'grid' | 'rail'
}

// Re-exported so the four screens that already say `import { inr } from
// '@/components/commerce/ProductGrid'` keep working. It is defined in
// `@/lib/money` alongside `inrMinor`, because a shop that formats rupees in
// one place and paise in another eventually formats one of them wrong.
export { inr }

export function ProductGrid({ products, isLoading, emptyLabel = 'No products', tail, layout = 'grid' }: Props) {
  const addToCart = useAddToCart()
  const updateCart = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const { data: cart } = useCart()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)
  const wrapper = layout === 'rail' ? 'product-rail' : 'product-grid'

  async function add(product: ProductCardData) {
    if (!product.default_variant_id) return
    setAddingId(product.id)
    try {
      await addToCart.mutateAsync({ variant_id: product.default_variant_id, quantity: 1 })
      setAddedId(product.id)
      window.setTimeout(() => setAddedId((current) => current === product.id ? null : current), 1800)
    } finally {
      setAddingId(null)
    }
  }

  async function changeQuantity(product: ProductCardData, quantity: number) {
    if (!product.default_variant_id) return
    setAddingId(product.id)
    try {
      if (quantity <= 0) await removeFromCart.mutateAsync(product.default_variant_id)
      else await updateCart.mutateAsync({ variant_id: product.default_variant_id, quantity })
      if (quantity <= 0) setAddedId(null)
    } finally {
      setAddingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className={wrapper}>
        {Array.from({ length: layout === 'rail' ? 5 : 8 }).map((_, i) => (
          <div key={i} className="product-skeleton" aria-hidden="true">
            <div className="skeleton-block aspect-square" />
            <div className="skeleton-block mt-4 h-3 w-1/3" />
            <div className="skeleton-block mt-3 h-4" />
            <div className="skeleton-block mt-2 h-4 w-2/3" />
            <div className="skeleton-block mt-5 h-6 w-1/2" />
          </div>
        ))}
      </div>
    )
  }
  if (!products || products.length === 0) {
    return (
      <div className="panel panel-pad py-16 text-center">
        <p className="text-shop-muted">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className={wrapper}>
      {products.map((p) => {
        // The line, read off the flat shape the service actually sends. The
        // `?.` covers only the cart being absent while it loads or while the
        // shopper is signed out; `items` itself is always an array.
        const line = cart?.items.find((item) => item.variant_id === p.default_variant_id)
        const quantity = line?.quantity ?? (addedId === p.id ? 1 : 0)
        // The stepper's ceiling is the stock the service says is left for this
        // line, not a hard-coded 10 — asking for more than available_qty is a
        // request checkout will refuse.
        // Until the line comes back from the service, the catalogue's own
        // stock figure is the best ceiling there is — the previous behaviour.
        const maxQuantity = line ? line.available_qty : (p.total_stock ?? 99)
        const isPending = addingId === p.id
        const outOfStock = p.in_stock === false || p.total_stock === 0
        const lowStock = !outOfStock && p.total_stock != null && p.total_stock <= 5
        const off = discountLabel(p)
        const price = displayPrice(p)
        const seller = p.retailer_name ?? p.seller_name
        return (
          <article key={p.id} className="product-card">
            <Link href={`/products/${p.id}`} className="flex min-w-0 flex-1 flex-col">
              <ProductPhoto
                src={productImage(p, { width: 520 })}
                alt={p.title}
                badge={
                  outOfStock
                    ? <span className="plate-badge plate-badge--out">SOLD OUT</span>
                    : off ? <span className="plate-badge">{off}</span> : null
                }
              />
              <div className="product-card-body">
                {seller ? <div className="product-card-seller">{seller}</div> : null}
                <h3 className="product-card-title">{p.title}</h3>
                {p.avg_rating ? (
                  <div className="product-card-rating">
                    ★ {p.avg_rating.toFixed(1)} <span>({p.review_count ?? 0})</span>
                  </div>
                ) : null}
                {price ? (
                  <div className="product-card-price">
                    <b>{price.price}</b>
                    {price.was ? <s>{price.was}</s> : null}
                  </div>
                ) : null}
              </div>
            </Link>
            <FavouriteButton product={p} className="product-card-fav" />
            <div className="product-card-foot">
              <span className={`product-card-stock${lowStock ? ' is-low' : ''}`}>
                {outOfStock ? 'Unavailable' : lowStock ? `Only ${p.total_stock} left` : 'In stock'}
              </span>
              {quantity > 0 ? (
                <div className="bag-stepper" aria-label={`${p.title} quantity in bag`}>
                  <button type="button" onClick={() => changeQuantity(p, quantity - 1)} disabled={isPending} aria-label={`Decrease ${p.title} quantity`}><Minus size={15} /></button>
                  <span>{isPending ? '·' : quantity}</span>
                  <button type="button" onClick={() => changeQuantity(p, quantity + 1)} disabled={isPending || quantity >= maxQuantity} aria-label={`Increase ${p.title} quantity`}><Plus size={15} /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => add(p)}
                  disabled={!p.default_variant_id || outOfStock || isPending}
                  className="bag-add"
                  aria-label={`Add ${p.title} to bag`}
                  title={outOfStock ? 'Out of stock' : 'Add to bag'}
                >
                  {isPending
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-shop-on-gold border-t-transparent" />
                    : <Plus size={15} aria-hidden="true" />}
                  Add
                </button>
              )}
            </div>
          </article>
        )
      })}
      {tail}
    </div>
  )
}

/**
 * Fills the tail of a short grid. Eight products across four columns leaves a
 * ragged second row; an invitation there turns the gap into the one thing the
 * shop most wants from a visitor with nothing left to browse.
 *
 * Its edge and its glyph are EMBER, not gold. Becoming a seller is a
 * platform-level act rather than a purchase, and ember is the brand's colour —
 * this and the header wordmark are the only two places it appears in the shop.
 * The glyph is a 26px icon, a non-text mark, so the ember red's 4.03 against
 * the ground clears the 3.0 bar that applies to it; the words beside it stay
 * ink and body, because ember at 13px would not.
 */
export function SellerInvite() {
  return (
    <Link href="/sell" className="seller-invite">
      <Store size={26} className="text-mo-primary" aria-hidden="true" />
      <strong>Sell on {BRAND.store}</strong>
      <p>List your first product in minutes. Your catalogue, your prices, our buyers.</p>
      <span className="shop-link mt-5">Open your shop →</span>
    </Link>
  )
}
