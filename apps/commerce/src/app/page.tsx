"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, Tag } from "lucide-react"
import { StoreHeader } from "@/components/StoreHeader"
import { StoreFooter } from "@/components/StoreFooter"
import { ProductGrid, SellerInvite, type ProductCardData } from "@/components/commerce/ProductGrid"
import { BannerCarousel } from "@/components/commerce/BannerCarousel"
import { CategoryStrip } from "@/components/commerce/CategoryStrip"
import { mediaUrl } from "@/lib/media"
import { liveBanners, orderHomeSections } from "@/lib/home"
import { useProducts, useCategories, useHome, type Category } from "@/hooks/useCommerce"

/**
 * A filter chip. Cyan, not gold: narrowing a list is navigation, and gold in
 * this zone means money. `text-shop-bg` on the filled state is the page ground
 * on cyan — 8.01, the same pair the token sheet measures for every cyan fill.
 */
function chip(active: boolean) {
  return [
    "inline-flex min-h-[38px] items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors",
    active
      ? "border-shop-interactive bg-shop-interactive text-shop-bg"
      : "border-line text-shop-muted hover:border-shop-interactive hover:text-shop-interactive",
  ].join(" ")
}

function CategoryTile({ category }: { category: Category }) {
  const count = category.product_count ?? 0
  // Several seeded categories point at media ids the media service never
  // received, so the artwork 404s. Falling back to the tag glyph on error
  // keeps the row of tiles even instead of leaving broken-image squares.
  const [artFailed, setArtFailed] = useState(false)
  const src = category.thumbnail_url || category.image_url
    || (category.image_media_id ? mediaUrl(category.image_media_id, { width: 120 }) : null)
  const showArt = !!src && !artFailed
  return (
    <Link href={`/?category=${encodeURIComponent(category.id)}`} className="category-tile">
      <span className="category-tile-mark">
        {showArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt="" onError={() => setArtFailed(true)} />
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

/**
 * The landing, in the founder's order and the phone's: search (in the
 * header), the category strip, the offers carousel, then the merchandised
 * rails (deals, best sellers, new arrivals), then the category grid, then
 * everything else. Every section that has nothing in it is absent rather
 * than empty, so a fresh catalogue shows a shorter page and not a page of
 * headings over blank strips.
 */
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
  const home = useHome()
  const banners = liveBanners(home.data?.banners)
  const sections = orderHomeSections(home.data?.sections)
  // Categories that actually have stock lead the browse grid; the rest keep
  // their place below so the full twelve stay reachable and legible.
  const ordered = [...categories].sort(
    (a, b) => (b.product_count ?? 0) - (a.product_count ?? 0) || (a.display_order ?? 0) - (b.display_order ?? 0),
  )

  return (
    <>
      <div className="landing-section landing-section--tight">
        <CategoryStrip categories={ordered} />
      </div>

      {banners.length > 0 ? (
        <div className="landing-section landing-section--tight">
          <BannerCarousel banners={banners} />
        </div>
      ) : null}

      {home.isLoading && sections.length === 0 ? (
        <section className="landing-section" aria-busy="true" aria-label="Loading offers">
          <div className="section-heading"><div><div className="skeleton-block h-3 w-24" /><div className="skeleton-block mt-3 h-7 w-56" /></div></div>
          <ProductGrid products={[]} isLoading layout="rail" />
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.key} className="landing-section" aria-labelledby={`rail-${section.key}`}>
          <div className="section-heading">
            <div>
              <h2 id={`rail-${section.key}`}>{section.title}</h2>
            </div>
            <Link href="/?stock=true" className="shop-link">See all <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <ProductGrid products={section.products} layout="rail" />
        </section>
      ))}

      {ordered.length > 0 ? (
        <section className="landing-section" aria-labelledby="browse-title">
          <div className="section-heading">
            <div>
              <span className="shop-eyebrow">Browse</span>
              <h2 id="browse-title">Shop by category</h2>
              <p>Every department in the catalogue, with what is actually stocked in each.</p>
            </div>
            <Link href="/?stock=true" className="shop-link">See everything <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="category-grid">
            {ordered.map((category) => <CategoryTile key={category.id} category={category} />)}
          </div>
        </section>
      ) : null}

      <section className="landing-section landing-section--last" aria-labelledby="featured-title">
        <div className="section-heading">
          <div>
            <span className="shop-eyebrow">In stock now</span>
            <h2 id="featured-title">Everything in the shop</h2>
            <p>Everything currently listed and ready to ship.</p>
          </div>
          <Link href="/?stock=true" className="shop-link">Shop all <ArrowRight size={16} aria-hidden="true" /></Link>
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
              <Link href="/" className="hover:text-shop-interactive">Shop</Link>
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
