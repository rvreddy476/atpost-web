'use client'

import Link from 'next/link'

export type ProductCardData = {
  id: string
  title: string
  slug?: string
  short_description?: string | null
  cover_image_url?: string | null
  min_price?: number
  currency_code?: string
}

type Props = {
  products: ProductCardData[]
  isLoading?: boolean
  emptyLabel?: string
}

export function ProductGrid({ products, isLoading, emptyLabel = 'No products' }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square rounded-xl bg-gray-200" />
            <div className="h-4 mt-2 rounded bg-gray-200" />
            <div className="h-3 mt-1 w-1/2 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    )
  }
  if (!products || products.length === 0) {
    return <div className="py-12 text-center text-gray-500">{emptyLabel}</div>
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p) => (
        <Link
          key={p.id}
          href={`/products/${p.id}`}
          className="group rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-indigo-300 transition-colors"
        >
          <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
            {p.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.cover_image_url} alt={p.title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs">No image</span>
            )}
          </div>
          <div className="p-3">
            <div className="text-sm font-medium line-clamp-2 group-hover:text-indigo-600">
              {p.title}
            </div>
            {p.min_price != null ? (
              <div className="text-sm text-gray-700 mt-1 font-semibold">
                {p.currency_code ?? 'INR'} {p.min_price.toFixed(2)}
              </div>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  )
}
