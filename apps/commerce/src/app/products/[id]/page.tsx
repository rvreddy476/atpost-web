"use client"

import { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ShieldCheck, RotateCcw, Truck, BadgeCheck, ShoppingBag, ArrowRight } from "lucide-react"
import { StoreHeader } from "@/components/StoreHeader"
import { StoreFooter } from "@/components/StoreFooter"
import { ProductPhoto } from "@/components/commerce/ProductPhoto"
import { FavouriteButton } from "@/components/commerce/FavouriteButton"
import { inr } from "@/components/commerce/ProductGrid"
import { productImage, mediaUrl } from "@/lib/media"
import { discountLabel } from "@/lib/product"
import {
  useProduct, useAddToCart, useProductReviews, useCategories,
  type ProductAttribute,
} from "@/hooks/useCommerce"

/**
 * Renders one attribute value for display. The catalogue types values, so a
 * multi_enum becomes chips and a boolean becomes a word — the storefront never
 * prints a raw array or `true` at a shopper.
 */
function AttributeValue({ attribute }: { attribute: ProductAttribute }) {
  const { value, unit } = attribute
  if (value === null || value === undefined || value === "") return <span className="text-shop-faint">—</span>
  if (Array.isArray(value)) {
    return <>{value.map((entry) => <span key={String(entry)} className="spec-chip">{String(entry)}</span>)}</>
  }
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>
  return <>{String(value)}{unit ? ` ${unit}` : ""}</>
}

/**
 * Attribute groups, in the server's own grouping. Anything the schema left
 * ungrouped falls into "Specifications" rather than being dropped.
 */
function Specifications({ attributes }: { attributes: ProductAttribute[] }) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, ProductAttribute[]>()
    for (const attribute of attributes) {
      const key = attribute.display_group?.trim() || "Specifications"
      const bucket = byGroup.get(key)
      if (bucket) bucket.push(attribute)
      else byGroup.set(key, [attribute])
    }
    return [...byGroup.entries()]
  }, [attributes])

  if (groups.length === 0) return null

  return (
    <section className="mt-14" aria-labelledby="specs-title">
      <h2 id="specs-title" className="shop-display text-2xl">Product details</h2>
      {groups.map(([group, items]) => (
        <div className="spec-group" key={group}>
          <h3>{group}</h3>
          <dl className="spec-list">
            {items.map((attribute) => (
              <div key={attribute.code} className="contents">
                <dt>{attribute.label || attribute.code}</dt>
                <dd><AttributeValue attribute={attribute} /></dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  )
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useProduct(id)
  const { data: reviewData } = useProductReviews(id)
  const { data: categories } = useCategories()
  const addToCart = useAddToCart()
  const [variantId, setVariantId] = useState("")
  const [added, setAdded] = useState(false)

  const product = data?.product
  const variants = useMemo(() => data?.variants ?? [], [data])
  const attributes = data?.attributes ?? []
  const reviews = reviewData?.reviews ?? []
  const selected = variants.find((v) => v.id === variantId) ?? variants[0]
  const category = product?.category_id ? categories?.find((c) => c.id === product.category_id) : undefined
  const categoryName = category?.name ?? product?.category_name

  // The gallery is the product's own photo plus any variant that carries its
  // own; deduplicated so a catalogue that reuses one image shows one thumb.
  const gallery = useMemo(() => {
    const ids = new Set<string>()
    const out: string[] = []
    const push = (value?: string | null) => {
      if (!value || ids.has(value)) return
      ids.add(value)
      out.push(value)
    }
    push(product?.primary_image_media_id ? mediaUrl(product.primary_image_media_id, { width: 1000 }) : null)
    for (const variant of variants) push(variant.image_media_id ? mediaUrl(variant.image_media_id, { width: 1000 }) : null)
    push(productImage(product, { width: 1000 }))
    return out
  }, [product, variants])

  const selectedImage = selected?.image_media_id
    ? mediaUrl(selected.image_media_id, { width: 1000 })
    : gallery[0] ?? null

  // The deal badge is the SERVER's `discount_pct`, the same number the grid
  // shows for this product. This page used to work it out again from the
  // selected variant and round differently, so the two disagreed. The
  // server derives it from the product's lowest price, which is what the
  // grid advertised and what the shopper clicked on.
  const off = discountLabel(product)

  async function add() {
    if (!selected) return
    await addToCart.mutateAsync({ variant_id: selected.id, quantity: 1 })
    setAdded(true)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader categories={categories} />
      <main className="shop-page flex-1">
        {isLoading ? (
          <div className="cart-state"><span className="cart-loader" />Loading this product…</div>
        ) : !product ? (
          <div className="panel panel-pad py-20 text-center">
            <p className="text-shop-muted">This product is no longer available.</p>
            <Link href="/" className="btn btn-outline mt-6">Back to the shop</Link>
          </div>
        ) : (
          <>
            <nav aria-label="Breadcrumb" className="mb-8 text-xs text-shop-faint">
              <Link href="/" className="hover:text-shop-interactive">Shop</Link>
              <span aria-hidden="true"> / </span>
              {categoryName ? (
                <>
                  <Link
                    href={category ? `/?category=${encodeURIComponent(category.id)}` : `/?q=${encodeURIComponent(categoryName)}`}
                    className="hover:text-shop-interactive"
                  >
                    {categoryName}
                  </Link>
                  <span aria-hidden="true"> / </span>
                </>
              ) : null}
              <span className="text-shop-muted">{product.title}</span>
            </nav>

            <div className="pdp">
              {/* The photograph leads. */}
              <div className="pdp-gallery">
                <ProductPhoto
                  src={selectedImage}
                  alt={product.title}
                  priority
                  badge={off ? <span className="plate-badge">{off}</span> : null}
                />
                {gallery.length > 1 ? (
                  <div className="pdp-thumbs">
                    {gallery.map((src) => (
                      <div key={src} className="pdp-thumb" aria-current={src === selectedImage ? "true" : undefined}>
                        <ProductPhoto src={src} alt="" tight />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                {product.retailer_name ?? product.seller_name
                  ? <span className="shop-eyebrow">{product.retailer_name ?? product.seller_name}</span>
                  : null}
                <div className="pdp-title-row">
                  <h1 className="pdp-title">{product.title}</h1>
                  <FavouriteButton product={product} size={20} />
                </div>

                <div className="pdp-meta">
                  {product.avg_rating ? (
                    <span className="pdp-rating">
                      ★ {product.avg_rating.toFixed(1)} <span>({product.review_count ?? 0} reviews)</span>
                    </span>
                  ) : null}
                  {product.brand_name ? <span>Brand <b>{product.brand_name}</b></span> : null}
                  {selected?.sku ? <span>SKU <b>{selected.sku}</b></span> : null}
                </div>

                {product.short_description ? (
                  <p className="mt-5 max-w-[60ch] leading-relaxed text-shop-muted">{product.short_description}</p>
                ) : null}

                {/* Then the price. */}
                {selected ? (
                  <div className="pdp-price">
                    <b>{selected.currency_code === "INR" || !selected.currency_code
                      ? inr(selected.selling_price)
                      : `${selected.currency_code} ${selected.selling_price}`}</b>
                    {selected.mrp > selected.selling_price ? <s>{inr(selected.mrp)}</s> : null}
                    {off ? <span className="pdp-save">Save {product.discount_pct}%</span> : null}
                    <span className="pdp-tax">Inclusive of all taxes · Delivery calculated at checkout</span>
                  </div>
                ) : null}

                {variants.length > 1 ? (
                  <div className="pdp-options">
                    <span className="pdp-options-label">Options</span>
                    <div className="pdp-option-list">
                      {variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVariantId(v.id)}
                          aria-pressed={selected?.id === v.id}
                          className="pdp-option"
                        >
                          {[v.option_1_value, v.option_2_value, v.option_3_value].filter(Boolean).join(" / ") || v.sku}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Then the buy action — the one gold thing on this screen. */}
                <div className="pdp-actions">
                  <button type="button" onClick={add} disabled={!selected || addToCart.isPending} className="btn btn-gold btn-lg">
                    <ShoppingBag size={18} aria-hidden="true" />
                    {addToCart.isPending ? "Adding…" : added ? "Added to bag" : "Add to bag"}
                  </button>
                  {added ? (
                    <Link href="/bag" className="btn btn-outline btn-lg">
                      Go to bag <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>

                <div className="pdp-assurances">
                  <div><ShieldCheck size={17} aria-hidden="true" /><span>Payments handled through a <b>protected gateway</b> — UPI, cards or net banking.</span></div>
                  <div><BadgeCheck size={17} aria-hidden="true" /><span>Sold by a <b>verified seller</b>, reviewed before this listing went live.</span></div>
                  {product.return_policy_days ? (
                    <div>
                      <RotateCcw size={17} aria-hidden="true" />
                      {/* return_policy_type is often just the duration again
                          ("7_days"); only name it when it says something more,
                          such as "exchange_only". */}
                      <span>
                        <b>{product.return_policy_days}-day</b>
                        {product.return_policy_type && !/^\d+[_-]?days?$/.test(product.return_policy_type)
                          ? ` ${product.return_policy_type.replace(/_/g, " ")}`
                          : " return"} window from delivery.
                      </span>
                    </div>
                  ) : null}
                  <div><Truck size={17} aria-hidden="true" /><span>Tracked delivery across India{product.warranty_info ? ` · ${product.warranty_info}` : ""}.</span></div>
                </div>
              </div>
            </div>

            {/* Then the attributes the catalogue schema returns for this category. */}
            <Specifications attributes={attributes} />

            {product.description ? (
              <section className="mt-14" aria-labelledby="description-title">
                <h2 id="description-title" className="shop-display text-2xl">About this product</h2>
                <div className="panel panel-pad mt-5">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-shop-muted">{product.description}</p>
                </div>
              </section>
            ) : null}

            <section className="mt-14" aria-labelledby="reviews-title">
              <h2 id="reviews-title" className="shop-display text-2xl">
                Reviews {reviews.length ? <span className="text-shop-faint">({reviews.length})</span> : null}
              </h2>
              {reviews.length === 0 ? (
                <p className="notice notice-info mt-5">
                  No reviews yet. Verified buyers can review this product from their order.
                </p>
              ) : (
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {reviews.map((r) => (
                    <li key={r.id} className="review-card">
                      <div className="review-stars" aria-label={`${r.rating} out of 5`}>
                        {"★".repeat(r.rating)}<span className="text-shop-faint">{"★".repeat(5 - r.rating)}</span>
                      </div>
                      {r.title ? <div className="mt-2 font-semibold">{r.title}</div> : null}
                      {r.body ? <p className="mt-2 text-sm leading-relaxed text-shop-muted">{r.body}</p> : null}
                      {r.is_verified_purchase ? (
                        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-shop-good">
                          <BadgeCheck size={13} aria-hidden="true" /> Verified purchase
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <StoreFooter />
    </div>
  )
}
