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
  const { data, isLoading } = useProducts({ q, category, limit: 24 })
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
            <Link key={c.id} href={`/?category=${c.slug}`} className={chip(category === c.slug)}>
              {c.name}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-4 text-lg font-semibold">
          {q ? `Results for “${q}”` : "All products"}
        </h1>
        <ProductGrid
          products={(data?.items ?? []) as ProductCardData[]}
          isLoading={isLoading}
          emptyLabel={q ? "No products match your search" : "No products yet — add one from the seller dashboard"}
        />
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
