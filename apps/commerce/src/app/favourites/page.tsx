"use client"

import Link from "next/link"
import { ArrowRight, Heart } from "lucide-react"
import { StoreHeader } from "@/components/StoreHeader"
import { StoreFooter } from "@/components/StoreFooter"
import { ProductGrid } from "@/components/commerce/ProductGrid"
import { isSignedOut, useCategories, useFavourites, useSession } from "@/hooks/useCommerce"

/**
 * Everything the shopper has hearted, drawn with the same card the grid
 * uses, so un-hearting here is the same gesture as hearting there and the
 * card leaves the page the moment it is pressed.
 */
export default function FavouritesPage() {
  const session = useSession()
  const { data, isLoading, error } = useFavourites()
  const { data: categories } = useCategories()
  const items = data?.items ?? []

  if ((session.known && !session.signedIn) || isSignedOut(error)) return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader categories={categories} />
      <main className="empty-vbag flex-1">
        <div className="empty-vbag-mark"><Heart size={32} aria-hidden="true" /></div>
        <span className="shop-eyebrow">Favourites</span>
        <h1>Sign in to see<br />what you saved.</h1>
        <p>Your favourites are kept with your account, so they are waiting on the other side.</p>
        <Link href="/login?redirect=/shop/favourites" className="btn btn-gold btn-lg mt-8">
          Sign in <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </main>
      <StoreFooter />
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader categories={categories} />
      <main className="shop-page flex-1">
        <span className="shop-eyebrow">Your account</span>
        <h1 className="shop-display mt-3 text-3xl sm:text-[40px]">Favourites</h1>
        <p className="mt-2 text-sm text-shop-muted">
          {isLoading ? "Loading what you saved…" : `${items.length} ${items.length === 1 ? "product" : "products"} saved`}
        </p>
        {error && !isLoading ? (
          <div className="notice notice-error mt-6">Your favourites could not be loaded. Please try again.</div>
        ) : null}
        <div className="mt-8">
          {!isLoading && items.length === 0 ? (
            <div className="panel panel-pad flex flex-col items-center py-16 text-center">
              <div className="empty-vbag-mark"><Heart size={30} aria-hidden="true" /></div>
              <p className="text-shop-muted">Nothing saved yet. Press the heart on any product to keep it here.</p>
              <Link href="/" className="btn btn-gold mt-7">Explore the shop <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          ) : (
            <ProductGrid products={items} isLoading={isLoading} emptyLabel="Nothing saved yet" />
          )}
        </div>
      </main>
      <StoreFooter />
    </div>
  )
}
