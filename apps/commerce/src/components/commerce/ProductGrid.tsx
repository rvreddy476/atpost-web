'use client'

import Link from 'next/link'

export type ProductCardData = {
  id: string
  title: string
  slug?: string
  short_description?: string | null
  primary_image_media_id?: string | null
  min_selling_price?: number | null
  min_mrp?: number | null
  avg_rating?: number
  review_count?: number
  total_stock?: number | null
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
            {p.primary_image_media_id ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/v1/media/${p.primary_image_media_id}/serve?w=480&q=80`} alt={p.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <span className="text-xs">No image</span>
            )}
          </div>
          <div className="p-3">
            <div className="text-sm font-medium line-clamp-2 group-hover:text-indigo-600">
              {p.title}
            </div>
            {p.avg_rating ? <div className="mt-1 text-xs text-amber-700">★ {p.avg_rating.toFixed(1)} <span className="text-gray-400">({p.review_count ?? 0})</span></div> : null}
            {p.min_selling_price != null ? (
              <div className="mt-1 flex items-baseline gap-1.5 text-sm text-gray-700">
                <span className="font-semibold">₹{p.min_selling_price.toFixed(2)}</span>
                {p.min_mrp && p.min_mrp > p.min_selling_price ? <span className="text-xs text-gray-400 line-through">₹{p.min_mrp.toFixed(2)}</span> : null}
              </div>
            ) : null}
            {p.total_stock === 0 ? <div className="mt-1 text-xs font-medium text-red-600">Out of stock</div> : null}
          </div>
        </Link>
      ))}
    </div>
  )
}
