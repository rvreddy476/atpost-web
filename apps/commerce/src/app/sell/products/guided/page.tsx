"use client"

import { Suspense, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import type { Category } from "@atpost/types/commerce"
import { StoreHeader } from "@/components/StoreHeader"
import { CategoryPicker } from "@/components/sell/CategoryPicker"
import { ListingForm } from "@/components/sell/ListingForm"
import { useSession } from "@/hooks/useCommerce"
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
    <div className="min-h-screen bg-shop-bg">
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/sell" className="text-sm text-shop-faint hover:text-shop-interactive">
          ← Back to my products
        </Link>
        {/* useSearchParams opts its whole subtree out of prerendering; the
            boundary is what keeps the rest of this zone statically built. */}
        <Suspense fallback={<p className="mt-6 text-sm text-shop-faint">Loading…</p>}>
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

  // Redirect only once the session is KNOWN. It is known on the first paint
  // now that the layout seeds it from the request's cookies; bouncing on a
  // question nobody has answered yet would send a signed-in seller to login.
  const { signedIn, known } = useSession()
  useEffect(() => {
    if (known && !signedIn) window.location.replace("/login?redirect=%2Fshop%2Fsell")
  }, [known, signedIn])

  const tree = useCategoryTree()
  const category = useMemo(
    () => (categoryId ? findCategory(tree.data ?? [], categoryId) : null),
    [tree.data, categoryId],
  )

  // `scope=all` — a seller fills in both halves in one sitting, and asking
  // twice would mean two ETags and two chances to disagree.
  const schema = useAttributeSchema(category ? category.id : null, "all")

  if (!signedIn) {
    return (
      <p className="mt-6 text-sm text-shop-faint">
        {known ? "Redirecting to sign in…" : "Checking your account…"}
      </p>
    )
  }

  if (!categoryId) {
    return (
      <>
        <h1 className="shop-display mt-3 text-2xl">What are you listing?</h1>
        <p className="mb-4 mt-1 text-sm text-shop-muted">
          Pick the category first — the form after it asks only what that category needs.
        </p>
        <div className="panel p-5">
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
    return <p className="mt-6 text-sm text-shop-faint">Loading categories…</p>
  }

  if (!category) {
    return (
      <div className="mt-6 rounded-xl border border-line bg-shop-surface p-6">
        <p className="text-sm text-shop-muted">That category is no longer in the catalogue.</p>
        <Link href="/sell/products/guided" className="mt-2 inline-block text-sm underline">
          Pick another one
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="shop-display text-2xl">List in {category.name}</h1>
        <Link href="/sell/products/guided" className="text-sm text-shop-faint underline hover:text-shop-interactive">
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
