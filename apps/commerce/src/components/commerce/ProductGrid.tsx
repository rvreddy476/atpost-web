'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, ShoppingBag } from 'lucide-react'
import { useAddToCart } from '@/hooks/useCommerce'

export type ProductCardData = {
  id: string
  title: string
  slug?: string
  short_description?: string | null
  primary_image_media_id?: string | null
  source_image_url?: string | null
  retailer_name?: string | null
  min_selling_price?: number | null
  min_mrp?: number | null
  avg_rating?: number
  review_count?: number
  total_stock?: number | null
  default_variant_id?: string | null
}

type Props = {
  products: ProductCardData[]
  isLoading?: boolean
  emptyLabel?: string
}

export function ProductGrid({ products, isLoading, emptyLabel = 'No products' }: Props) {
  const addToCart = useAddToCart()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

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
        <article key={p.id} className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-colors hover:border-gray-900">
          <Link href={`/products/${p.id}`} className="flex min-w-0 flex-1 flex-col">
            <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-400">
              {p.primary_image_media_id || p.source_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.primary_image_media_id ? `/v1/media/${p.primary_image_media_id}/serve?w=480&q=80` : p.source_image_url!} alt={p.title} loading="lazy" className="w-full h-full object-contain p-5 transition-transform duration-300 group-hover:scale-105" />
              ) : <span className="text-xs">No image</span>}
            </div>
            <div className="min-h-[8.5rem] p-3 pr-14">
              <div className="text-sm font-medium line-clamp-2 group-hover:text-black">{p.title}</div>
            {p.retailer_name ? <div className="mt-1 text-xs text-gray-500">Sold by {p.retailer_name}</div> : null}
            {p.avg_rating ? <div className="mt-1 text-xs text-gray-700">★ {p.avg_rating.toFixed(1)} <span className="text-gray-400">({p.review_count ?? 0})</span></div> : null}
            {p.min_selling_price != null ? (
              <div className="mt-1 flex items-baseline gap-1.5 text-sm text-gray-700">
                <span className="font-semibold">₹{p.min_selling_price.toFixed(2)}</span>
                {p.min_mrp && p.min_mrp > p.min_selling_price ? <span className="text-xs text-gray-400 line-through">₹{p.min_mrp.toFixed(2)}</span> : null}
              </div>
            ) : null}
            </div>
          </Link>
          <div className="absolute bottom-3 right-3">
            <button
              type="button"
              onClick={() => add(p)}
              disabled={!p.default_variant_id || p.total_stock === 0 || addingId === p.id}
              className="grid h-10 w-10 place-items-center rounded-full bg-gray-900 text-white transition hover:scale-105 hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
              aria-label={addedId === p.id ? `${p.title} added to bag` : `Add ${p.title} to bag`}
              title={p.total_stock === 0 ? 'Out of stock' : 'Add to bag'}
            >
              {addingId === p.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : addedId === p.id ? <Check size={18} /> : <ShoppingBag size={18} />}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
