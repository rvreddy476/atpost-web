"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { StoreHeader } from "@/components/StoreHeader"
import { ProductGrid, type ProductCardData } from "@/components/commerce/ProductGrid"
import { useProducts, useCategories } from "@/hooks/useCommerce"

function chip(active: boolean) {
  return [
    "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
    active
      ? "border-gray-900 bg-gray-900 text-white"
      : "border-gray-300 bg-white text-gray-700 hover:border-gray-400",
  ].join(" ")
}

function ShopContent() {
  const params = useSearchParams()
  const q = params.get("q") ?? ""
  const category = params.get("category") ?? undefined
  const minRating = Number(params.get("rating") ?? 0) || undefined
  const inStock = params.get("stock") === "true"
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0)
  const limit = 24
  const { data, isLoading, isError } = useProducts({ q, category, minRating, inStock, limit, offset })
  const { data: cats } = useCategories()

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />

      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2">
          <Link href="/" className={chip(!category)}>
            All
          </Link>
          {cats?.map((c) => (
            <Link key={c.id} href={`/?category=${c.id}`} className={chip(category === c.id)}>
              {c.name}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1 className="text-lg font-semibold">
          {q ? `Results for “${q}”` : "All products"}
        </h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), stock: inStock ? 'false' : 'true', ...(minRating && { rating: String(minRating) }) })}`} className={chip(inStock)}>
            In stock
          </Link>
          <Link href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(inStock && { stock: 'true' }), rating: minRating === 4 ? '' : '4' })}`} className={chip(minRating === 4)}>
            4★ & up
          </Link>
        </div>
        </div>
        {isError ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Products could not be loaded. Please refresh and try again.</div> : null}
        <ProductGrid
          products={(data?.items ?? []) as ProductCardData[]}
          isLoading={isLoading}
          emptyLabel={q ? "No products match your search" : "No products yet — add one from the seller dashboard"}
        />
        {data && data.total > limit ? (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Product pages">
            {offset > 0 ? <Link className="rounded-lg border bg-white px-4 py-2 text-sm" href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(inStock && { stock: 'true' }), ...(minRating && { rating: String(minRating) }), offset: String(Math.max(0, offset - limit)) })}`}>Previous</Link> : null}
            <span className="text-sm text-gray-500">Page {Math.floor(offset / limit) + 1} of {Math.ceil(data.total / limit)}</span>
            {offset + limit < data.total ? <Link className="rounded-lg border bg-white px-4 py-2 text-sm" href={`/?${new URLSearchParams({ ...(q && { q }), ...(category && { category }), ...(inStock && { stock: 'true' }), ...(minRating && { rating: String(minRating) }), offset: String(offset + limit) })}`}>Next</Link> : null}
          </nav>
        ) : null}
      </main>
    </div>
  )
}

export default function ShopHome() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading…</div>}>
      <ShopContent />
    </Suspense>
  )
}
