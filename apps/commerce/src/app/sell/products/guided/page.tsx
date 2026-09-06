"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { getCurrentUserId } from "@atpost/api-client"
import type { Category } from "@atpost/types/commerce"
import { StoreHeader } from "@/components/StoreHeader"
import { CategoryPicker } from "@/components/sell/CategoryPicker"
import { ListingForm } from "@/components/sell/ListingForm"
import { useAttributeSchema, useCategoryTree } from "@/hooks/useListing"
import { apiMessage } from "@/lib/listing"

/**
 * The second way into a listing: pick the category first, then answer the
 * questions that category actually asks.
 *
 * /sell/products/new is untouched and still works — this is an addition, not a
 * replacement, so nothing that lists today stops listing.
 */
export default function GuidedListingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/sell" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to my products
        </Link>
        {/* useSearchParams opts its whole subtree out of prerendering; the
            boundary is what keeps the rest of this zone statically built. */}
        <Suspense fallback={<p className="mt-6 text-sm text-gray-500">Loading…</p>}>
          <GuidedListing />
        </Suspense>
      </main>
    </div>
  )
}

function GuidedListing() {
  const router = useRouter()
  const params = useSearchParams()
  const categoryId = params.get("category")
  const productId = params.get("product")

  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    if (getCurrentUserId()) {
      setAuthed(true)
    } else {
      setAuthed(false)
      window.location.replace("/login?redirect=%2Fshop%2Fsell")
    }
  }, [])

  const tree = useCategoryTree()
  const category = useMemo(
    () => (categoryId ? findCategory(tree.data ?? [], categoryId) : null),
    [tree.data, categoryId],
  )

  // `scope=all` — a seller fills in both halves in one sitting, and asking
  // twice would mean two ETags and two chances to disagree.
  const schema = useAttributeSchema(category ? category.id : null, "all")

  if (authed !== true) {
    return <p className="mt-6 text-sm text-gray-500">Redirecting to sign in…</p>
  }

  if (!categoryId) {
    return (
      <>
        <h1 className="mt-2 text-xl font-semibold">What are you listing?</h1>
        <p className="mb-4 mt-1 text-sm text-gray-600">
          Pick the category first — the form after it asks only what that category needs.
        </p>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <CategoryPicker
            categories={tree.data ?? []}
            isLoading={tree.isLoading}
            error={tree.isError ? apiMessage(tree.error, "Could not load categories.") : null}
            onPick={(picked) => router.replace(`/sell/products/guided?category=${picked.id}`)}
          />
        </div>
      </>
    )
  }

  if (tree.isLoading) {
    return <p className="mt-6 text-sm text-gray-500">Loading categories…</p>
  }

  if (!category) {
    return (
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-700">That category is no longer in the catalogue.</p>
        <Link href="/sell/products/guided" className="mt-2 inline-block text-sm underline">
          Pick another one
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">List in {category.name}</h1>
        <Link href="/sell/products/guided" className="text-sm text-gray-500 underline hover:text-gray-900">
          Change category
        </Link>
      </div>
      <div className="mt-4">
        <ListingForm
          category={category}
          schema={schema.data ?? null}
          schemaLoading={schema.isLoading}
          schemaError={
            schema.isError ? apiMessage(schema.error, "The category form could not be loaded.") : null
          }
          initialProductId={productId}
        />
      </div>
    </>
  )
}

function findCategory(categories: Category[], id: string): Category | null {
  for (const category of categories) {
    if (category.id === id) return category
    const hit = findCategory(category.children ?? [], id)
    if (hit) return hit
  }
  return null
}
