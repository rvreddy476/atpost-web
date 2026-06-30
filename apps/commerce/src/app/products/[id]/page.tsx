"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { StoreHeader } from "@/components/StoreHeader"
import { useProduct, useAddToCart, useProductReviews } from "@/hooks/useCommerce"
import { Button } from "@atpost/ui"

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useProduct(id)
  const { data: reviews } = useProductReviews(id)
  const addToCart = useAddToCart()
  const [variantId, setVariantId] = useState("")
  const [added, setAdded] = useState(false)

  const product = data?.product
  const variants = data?.variants ?? []
  const selected = variants.find((v) => v.id === variantId) ?? variants[0]

  async function add() {
    if (!selected) return
    await addToCart.mutateAsync({ variant_id: selected.id, quantity: 1 })
    setAdded(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {isLoading ? (
          <div className="py-16 text-center text-gray-500">Loading…</div>
        ) : !product ? (
          <div className="py-16 text-center text-gray-500">Product not found.</div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            {/* Gallery */}
            <div className="aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="grid h-full place-items-center text-gray-400">No image</div>
            </div>

            {/* Details */}
            <div>
              <h1 className="text-2xl font-semibold">{product.title}</h1>
              {product.short_description && (
                <p className="mt-1 text-gray-600">{product.short_description}</p>
              )}

              {selected && (
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    {selected.currency_code || "INR"} {selected.selling_price}
                  </span>
                  {selected.mrp > selected.selling_price && (
                    <span className="text-gray-400 line-through">{selected.mrp}</span>
                  )}
                </div>
              )}

              {variants.length > 1 && (
                <div className="mt-4">
                  <div className="mb-1 text-sm font-medium text-gray-700">Options</div>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVariantId(v.id)}
                        className={[
                          "rounded-lg border px-3 py-1.5 text-sm",
                          (selected?.id === v.id)
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 hover:border-gray-400",
                        ].join(" ")}
                      >
                        {[v.option_1_value, v.option_2_value, v.option_3_value].filter(Boolean).join(" / ") || v.sku}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Button onClick={add} disabled={!selected || addToCart.isPending}>
                  {addToCart.isPending ? "Adding…" : "Add to cart"}
                </Button>
                {added && (
                  <Link href="/cart" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:border-gray-400">
                    Go to cart →
                  </Link>
                )}
              </div>

              {product.description && (
                <div className="mt-8">
                  <h2 className="mb-2 font-semibold">Description</h2>
                  <p className="whitespace-pre-line text-sm text-gray-700">{product.description}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reviews */}
        {product && (
          <section className="mt-10">
            <h2 className="mb-3 font-semibold">Reviews</h2>
            {!reviews || reviews.length === 0 ? (
              <p className="text-sm text-gray-500">No reviews yet.</p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="text-sm font-medium">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                    {r.title && <div className="text-sm font-medium">{r.title}</div>}
                    {r.body && <div className="text-sm text-gray-700">{r.body}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
