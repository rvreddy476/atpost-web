"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowRight, ShieldCheck, Truck, RotateCcw, BadgePercent, Tag, Sparkles, Star, Package,
} from "lucide-react"
import { StoreHeader } from "@/components/StoreHeader"
import { StoreFooter } from "@/components/StoreFooter"
import { ProductGrid, SellerInvite, inr, type ProductCardData } from "@/components/commerce/ProductGrid"
import { ProductPhoto } from "@/components/commerce/ProductPhoto"
import { productImage, mediaUrl } from "@/lib/media"
import { useProducts, useCategories, type Category } from "@/hooks/useCommerce"

function chip(active: boolean) {
  return [
    "inline-flex min-h-[38px] items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors",
    active
      ? "border-shop-gold bg-shop-gold text-shop-bg"
      : "border-line text-shop-muted hover:border-shop-gold hover:text-shop-gold",
  ].join(" ")
}

/**
 * The hero. Deliberately not a stock-photo wall: a navy editorial panel with
 * the shop's real numbers, and one real product on its plate beside it. With
 * eight products in the catalogue that reads as a considered storefront,
 * where a five-slot carousel would read as a half-finished one.
 */
function Hero({ categories, featured, isLoading }: {
  categories: Category[]
  featured?: ProductCardData
  isLoading: boolean
}) {
  const stocked = categories.filter((c) => (c.product_count ?? 0) > 0).length
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <span className="shop-eyebrow">The atPost Marketplace</span>
        <h1 id="hero-title">Things worth <em>owning</em>, from sellers worth trusting.</h1>
        <p>
          A curated marketplace of independent Indian sellers. Every listing is reviewed before it
          goes live, every payment is protected, and every order is yours to return.
        </p>
        <div className="hero-cta">
          <Link href="/?stock=true" className="btn btn-gold btn-lg">
            Shop everything <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/sell" className="btn btn-outline btn-lg">Sell on atPost</Link>
        </div>
        <div className="hero-stats">
          <div><strong>{categories.length || 12}</strong><span>Categories</span></div>
          <div><strong>{stocked || "—"}</strong><span>Stocked now</span></div>
          <div><strong>100%</strong><span>Reviewed listings</span></div>
        </div>
      </div>
      {/* Hold the second column while the catalogue loads: without it the hero
          renders one column and then snaps to two, which is a full-width jump
          on the first thing a visitor sees. */}
      {isLoading && !featured ? (
        <div className="hero-feature" aria-hidden="true">
          <div className="skeleton-block aspect-square" />
          <div className="hero-feature-body">
            <div className="skeleton-block h-3 w-1/3" />
            <div className="skeleton-block mt-4 h-5" />
            <div className="skeleton-block mt-4 h-7 w-1/2" />
          </div>
        </div>
      ) : null}
      {featured ? (
        <Link href={`/products/${featured.id}`} className="hero-feature">
          <ProductPhoto src={productImage(featured, { width: 720 })} alt={featured.title} priority tight
            badge={<span className="plate-badge">Featured</span>} />
          <div className="hero-feature-body">
            <span>{featured.retailer_name ?? "atPost seller"}</span>
            <strong>{featured.title}</strong>
            {featured.min_selling_price != null ? (
              <div className="hero-feature-price">
                <b>{inr(featured.min_selling_price)}</b>
                {featured.min_mrp && featured.min_mrp > featured.min_selling_price
                  ? <s>{inr(featured.min_mrp)}</s> : null}
              </div>
            ) : null}
            <span className="gold-link mt-4">View product <ArrowRight size={15} aria-hidden="true" /></span>
          </div>
        </Link>
      ) : null}
    </section>
  )
}

function CategoryTile({ category }: { category: Category }) {
  const count = category.product_count ?? 0
  // Several seeded categories point at media ids the media service never
  // received, so the artwork 404s. Falling back to the gold glyph on error
  // keeps the row of tiles even instead of leaving broken-image squares.
  const [artFailed, setArtFailed] = useState(false)
  const showArt = !!category.image_media_id && !artFailed
  return (
    <Link href={`/?category=${encodeURIComponent(category.id)}`} className="category-tile">
      <span className="category-tile-mark">
        {showArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={mediaUrl(category.image_media_id!, { width: 120 })} alt="" onError={() => setArtFailed(true)} />
          : <Tag size={20} aria-hidden="true" />}
      </span>
      <span className="category-tile-copy">
        <strong>{category.name}</strong>
        {category.description ? <small>{category.description}</small> : null}
        <span className={`category-tile-count${count ? "" : " is-empty"}`}>
          {count ? `${count} ${count === 1 ? "product" : "products"}` : "Coming soon"}
        </span>
      </span>
    </Link>
  )
}

function MarketplaceLanding({
  categories,
  products,
  isLoading,
  isError,
}: {
  categories: Category[]
  products: ProductCardData[]
  isLoading: boolean
  isError: boolean
}) {
  // Categories that actually have stock lead the browse grid; the rest keep
  // their place below so the full twelve stay reachable and legible.
  const ordered = [...categories].sort(
    (a, b) => (b.product_count ?? 0) - (a.product_count ?? 0) || (a.display_order ?? 0) - (b.display_order ?? 0),
  )
  // The hero leads with a photograph, so it leads with a product that has
  // one — a "no image" plate is honest in a grid but a poor first impression.
  const featured = products.find((p) => !!productImage(p)) ?? products[0]

  return (
    <>
      <Hero categories={categories} featured={featured} isLoading={isLoading} />

      <div className="landing-section landing-section--tight">
        <section className="trust-strip" aria-label="Why shop with atPost">
          <div><Truck size={22} aria-hidden="true" /><span><strong>Delivered across India</strong><small>Tracked on every order</small></span></div>
          <div><ShieldCheck size={22} aria-hidden="true" /><span><strong>Protected payments</strong><small>UPI, cards and net banking</small></span></div>
          <div><RotateCcw size={22} aria-hidden="true" /><span><strong>Easy returns</strong><small>Return window on every item</small></span></div>
          <div><BadgePercent size={22} aria-hidden="true" /><span><strong>Seller-direct prices</strong><small>No middleman markup</small></span></div>
        </section>
      </div>

      <section className="landing-section" aria-labelledby="browse-title">
        <div className="section-heading">
          <div>
            <span className="shop-eyebrow">Browse</span>
            <h2 id="browse-title">Shop by category</h2>
            <p>Every department in the catalogue, with what is actually stocked in each.</p>
          </div>
          <Link href="/?stock=true" className="gold-link">See everything <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        {ordered.length ? (
          <div className="category-grid">
            {ordered.map((category) => <CategoryTile key={category.id} category={category} />)}
          </div>
        ) : (
          <div className="category-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton-block h-[108px]" />)}
          </div>
        )}
      </section>

      <section className="landing-section" aria-labelledby="featured-title">
        <div className="section-heading">
          <div>
            <span className="shop-eyebrow">In stock now</span>
            <h2 id="featured-title">Fresh on the shelf</h2>
            <p>Everything currently listed and ready to ship.</p>
          </div>
          <Link href="/?stock=true" className="gold-link">Shop all <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        {isError ? (
          <div className="notice notice-error mb-4">Products could not be loaded. Please refresh and try again.</div>
        ) : null}
        <ProductGrid
          products={products}
          isLoading={isLoading}
          emptyLabel="New products are coming soon"
          // A short catalogue leaves a ragged tail row; the invite fills it.
          tail={!isLoading && products.length > 0 && products.length % 4 !== 0 ? <SellerInvite /> : null}
        />
      </section>

      <section className="landing-section landing-section--last" aria-labelledby="promise-title">
        <div className="panel flex flex-wrap items-center justify-between gap-6 p-8">
          <div className="min-w-[260px] flex-1">
            <span className="shop-eyebrow">The atPost promise</span>
            <h2 id="promise-title" className="shop-display mt-3 text-2xl">Bought here, backed here.</h2>
            <p className="mt-3 max-w-[54ch] text-sm leading-relaxed text-shop-muted">
              Listings are reviewed before publication, payments settle through a protected gateway,
              and returns are handled in the same place you ordered.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            <div className="flex items-center gap-3 text-sm text-shop-muted"><Sparkles size={19} className="text-shop-gold" aria-hidden="true" /> Reviewed listings</div>
            <div className="flex items-center gap-3 text-sm text-shop-muted"><Star size={19} className="text-shop-gold" aria-hidden="true" /> Verified reviews</div>
            <div className="flex items-center gap-3 text-sm text-shop-muted"><Package size={19} className="text-shop-gold" aria-hidden="true" /> Tracked delivery</div>
          </div>
        </div>
      </section>
    </>
  )
}

function ShopContent() {
  const params = useSearchParams()
  const q = params.get("q") ?? ""
  const category = params.get("category") ?? undefined
  const minRating = Number(params.get("rating") ?? 0) || undefined
  const inStock = params.get("stock") === "true"
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0)
  const limit = 24
  const isLanding = !q && !category && !minRating && !inStock && offset === 0
  const { data, isLoading, isError } = useProducts({ q, category, minRating, inStock, limit, offset })
  const { data: cats } = useCategories()
  const categories = cats ?? []
  const items = (data?.items ?? []) as ProductCardData[]
  const activeCategory = category ? categories.find((c) => c.id === category) : undefined
  // The category list and the product list arrive independently, so name the
  // page from whichever lands first instead of flashing "All products" over a
  // filtered result.
  const listTitle = q
    ? `“${q}”`
    : category
      ? activeCategory?.name ?? items[0]?.category_name ?? "Category"
      : "All products"

  const listUrl = (overrides: Record<string, string>) =>
    `/?${new URLSearchParams({
      ...(q && { q }),
      ...(category && { category }),
      ...(inStock && { stock: "true" }),
      ...(minRating && { rating: String(minRating) }),
      ...overrides,
    })}`

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader categories={categories} />
      <main className="flex-1">
        {isLanding ? (
          <MarketplaceLanding categories={categories} products={items} isLoading={isLoading} isError={isError} />
        ) : (
          <div className="shop-page">
            <nav aria-label="Breadcrumb" className="text-xs text-shop-faint">
              <Link href="/" className="hover:text-shop-gold">Shop</Link>
              <span aria-hidden="true"> / </span>
              <span className="text-shop-muted">{q ? "Search" : listTitle}</span>
            </nav>

            <div className="mb-8 mt-4 flex flex-wrap items-end justify-between gap-5">
              <div>
                <h1 className="shop-display text-3xl leading-tight sm:text-[40px]">{listTitle}</h1>
                <p className="mt-2 text-sm text-shop-muted">
                  {activeCategory?.description
                    ?? (data ? `${data.total} ${data.total === 1 ? "product" : "products"} available` : "Loading the catalogue…")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={listUrl({ stock: inStock ? "false" : "true" })} className={chip(inStock)}>In stock</Link>
                <Link href={listUrl({ rating: minRating === 4 ? "" : "4" })} className={chip(minRating === 4)}>4★ &amp; up</Link>
              </div>
            </div>

            {isError ? (
              <div className="notice notice-error mb-4">Products could not be loaded. Please refresh and try again.</div>
            ) : null}
            <ProductGrid
              products={items}
              isLoading={isLoading}
              emptyLabel={q ? "No products match your search" : "Nothing listed here yet — check back soon"}
            />
            {data && data.total > limit ? (
              <nav className="mt-10 flex items-center justify-center gap-4" aria-label="Product pages">
                {offset > 0 ? (
                  <Link className="btn btn-outline btn-sm" href={listUrl({ offset: String(Math.max(0, offset - limit)) })}>Previous</Link>
                ) : null}
                <span className="text-sm text-shop-faint">
                  Page {Math.floor(offset / limit) + 1} of {Math.ceil(data.total / limit)}
                </span>
                {offset + limit < data.total ? (
                  <Link className="btn btn-outline btn-sm" href={listUrl({ offset: String(offset + limit) })}>Next</Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  )
}

export default function ShopHome() {
  return (
    <Suspense fallback={<div className="p-10 text-shop-muted">Loading the store…</div>}>
      <ShopContent />
    </Suspense>
  )
}
