"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, ChevronRight, ShieldCheck, Truck, RotateCcw, BadgePercent } from "lucide-react"
import { StoreHeader } from "@/components/StoreHeader"
import { ProductGrid, type ProductCardData } from "@/components/commerce/ProductGrid"
import { useProducts, useCategories } from "@/hooks/useCommerce"

const marketplaceCategories = [
  { name: "Fashion", hint: "Dresses, shoes & more", image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=700&q=80" },
  { name: "Electronics", hint: "Mobiles, audio & laptops", image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=700&q=80" },
  { name: "Groceries", hint: "Fresh food & essentials", image: "https://images.unsplash.com/photo-1543168256-418811576931?auto=format&fit=crop&w=700&q=80" },
  { name: "Home & Kitchen", hint: "Make your home yours", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=700&q=80" },
  { name: "Books", hint: "Stories, learning & more", image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=700&q=80" },
  { name: "Beauty", hint: "Skincare & personal care", image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80" },
  { name: "Sports", hint: "Fitness & outdoors", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=700&q=80" },
  { name: "Toys & Games", hint: "Play, learn and create", image: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=700&q=80" },
]

function categoryHref(name: string, categories?: { id: string; name: string }[]) {
  const match = categories?.find((item) => item.name.toLowerCase() === name.toLowerCase())
  return match ? `/?category=${encodeURIComponent(match.id)}` : `/?q=${encodeURIComponent(name)}`
}

function chip(active: boolean) {
  return [
    "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
    active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400",
  ].join(" ")
}

function MarketplaceLanding({
  categories,
  products,
  isLoading,
  isError,
}: {
  categories?: { id: string; name: string }[]
  products: ProductCardData[]
  isLoading: boolean
  isError: boolean
}) {
  return (
    <>
      <section className="marketplace-hero" aria-label="Featured offers">
        <Link href={categoryHref("Fashion", categories)} className="hero-fashion">
          <div className="hero-copy">
            <span className="hero-kicker">THE VCHAT EDIT / 01</span>
            <h1>Find your next favourite thing.</h1>
            <p>A living marketplace of expressive style, clever technology and everyday discoveries.</p>
            <span className="hero-action">Enter the edit <ArrowRight size={18} /></span>
          </div>
        </Link>
        <div className="hero-side">
          <Link href={categoryHref("Electronics", categories)} className="hero-tile hero-electronics">
            <span>Upgrade your tech</span>
            <strong>Electronics from top brands</strong>
            <small>Explore deals <ChevronRight size={15} /></small>
          </Link>
          <Link href={categoryHref("Groceries", categories)} className="hero-tile hero-grocery">
            <span>Everyday essentials</span>
            <strong>Fresh food, fast</strong>
            <small>Shop groceries <ChevronRight size={15} /></small>
          </Link>
        </div>
      </section>

      <section className="service-strip" aria-label="Shopping benefits">
        <div><Truck /><span><strong>Fast delivery</strong><small>Across India</small></span></div>
        <div><ShieldCheck /><span><strong>Secure payments</strong><small>Protected checkout</small></span></div>
        <div><RotateCcw /><span><strong>Easy returns</strong><small>Simple and convenient</small></span></div>
        <div><BadgePercent /><span><strong>Great offers</strong><small>Value every day</small></span></div>
      </section>

      <section className="landing-section">
        <div className="section-heading">
          <div><span>DISCOVER MORE</span><h2>Shop by category</h2></div>
          <Link href="/?stock=true">See all products <ArrowRight size={17} /></Link>
        </div>
        <div className="category-grid">
          {marketplaceCategories.map((item) => (
            <Link href={categoryHref(item.name, categories)} className="category-card" key={item.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt="" loading="lazy" />
              <div><strong>{item.name}</strong><span>{item.hint}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="featured-products">
        <div className="section-heading">
          <div><span>POPULAR RIGHT NOW</span><h2>Featured products</h2></div>
          <Link href="/?stock=true">Shop all <ArrowRight size={17} /></Link>
        </div>
        {isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Products could not be loaded. Please refresh and try again.</div> : null}
        <ProductGrid products={products} isLoading={isLoading} emptyLabel="New products are coming soon" />
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

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <StoreHeader categories={cats} />
      <main>
        {isLanding ? <MarketplaceLanding categories={cats} products={(data?.items ?? []) as ProductCardData[]} isLoading={isLoading} isError={isError} /> : (
          <div className="mx-auto max-w-7xl px-4 py-6">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h1 className="text-lg font-semibold">{q ? `Results for “${q}”` : "All products"}</h1>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), stock: inStock ? "false" : "true", ...(minRating && { rating: String(minRating) }) })}`} className={chip(inStock)}>In stock</Link>
                <Link href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(inStock && { stock: "true" }), rating: minRating === 4 ? "" : "4" })}`} className={chip(minRating === 4)}>4★ & up</Link>
              </div>
            </div>
            {isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Products could not be loaded. Please refresh and try again.</div> : null}
            <ProductGrid products={(data?.items ?? []) as ProductCardData[]} isLoading={isLoading} emptyLabel={q ? "No products match your search" : "No products yet — add one from the seller dashboard"} />
            {data && data.total > limit ? (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Product pages">
                {offset > 0 ? <Link className="rounded-lg border bg-white px-4 py-2 text-sm" href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(inStock && { stock: "true" }), ...(minRating && { rating: String(minRating) }), offset: String(Math.max(0, offset - limit)) })}`}>Previous</Link> : null}
                <span className="text-sm text-gray-500">Page {Math.floor(offset / limit) + 1} of {Math.ceil(data.total / limit)}</span>
                {offset + limit < data.total ? <Link className="rounded-lg border bg-white px-4 py-2 text-sm" href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(inStock && { stock: "true" }), ...(minRating && { rating: String(minRating) }), offset: String(offset + limit) })}`}>Next</Link> : null}
              </nav>
            ) : null}
          </div>
        )}
      </main>
    </div>
  )
}

export default function ShopHome() {
  return <Suspense fallback={<div className="p-8 text-gray-500">Loading…</div>}><ShopContent /></Suspense>
}
