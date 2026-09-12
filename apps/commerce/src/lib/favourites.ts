// Favourites, as state: what the heart does to the caches BEFORE the server
// answers, and what it puts back when the server says no.
//
// Pure on purpose. The optimistic update touches four different query shapes
// (the favourites list, the home page, every product list page, one product
// detail) and the same product can sit in three of them at once. Getting that
// right inside a mutation callback is how a heart ends up filled on the grid
// and empty on the rail for the same product, so the rules live here and the
// hook only applies them.

import type { ProductCardData } from '@/components/commerce/ProductGrid'

/** `GET /v1/commerce/favourites`: full product summaries, keyset-paged. */
export interface FavouritesPage {
  items: ProductCardData[]
  next_cursor?: string
}

/** A product with its heart state, as the storefront sends one. */
export type Favouritable = Pick<ProductCardData, 'id'> & { is_favourite?: boolean | null }

/**
 * The same product with its heart set. Returns the SAME object when nothing
 * changes, so a cache that receives it back is not marked dirty for a no-op.
 */
export function withFavourite<T extends Favouritable>(product: T, isFavourite: boolean): T {
  if ((product.is_favourite ?? false) === isFavourite) return product
  return { ...product, is_favourite: isFavourite }
}

/** Every copy of `productId` in a list, hearted or un-hearted. */
export function markFavouriteIn<T extends Favouritable>(
  items: readonly T[] | null | undefined,
  productId: string,
  isFavourite: boolean,
): T[] {
  if (!items) return []
  return items.map((item) => (item.id === productId ? withFavourite(item, isFavourite) : item))
}

/**
 * The favourites LIST after a toggle.
 *
 * Adding puts the product at the front, because that is where the server's
 * newest-first order will put it when the list is next fetched, and a heart
 * that appends to the bottom then jumps to the top on refetch looks like two
 * changes. Removing drops every copy. Both are idempotent: hearting a product
 * already on the list does not duplicate it, and un-hearting one that is not
 * there is a no-op rather than an error, which mirrors the server's own
 * "hearting twice is 200" rule.
 */
export function favouritesAfterToggle(
  page: FavouritesPage | null | undefined,
  product: ProductCardData,
  isFavourite: boolean,
): FavouritesPage {
  const items = page?.items ?? []
  const rest = items.filter((item) => item.id !== product.id)
  if (!isFavourite) return { ...page, items: rest }
  return { ...page, items: [withFavourite(product, true), ...rest] }
}

/** How many hearts the header shows. Never the cursor's worth of unknowns. */
export function favouriteCount(page: FavouritesPage | null | undefined): number {
  return page?.items?.length ?? 0
}

/** Whether a product is hearted, reading the server's tri-state honestly:
 *  absent means "nobody asked" (signed out), which draws as not hearted. */
export function isFavourited(product: Favouritable | null | undefined): boolean {
  return product?.is_favourite === true
}
