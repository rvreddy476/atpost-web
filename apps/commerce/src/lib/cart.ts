import type { CartView, CartViewLine } from '@atpost/types/commerce'

/**
 * What the cart already knows about why checkout will refuse it.
 *
 * commerce-service sends three signals on every cart read that the screens
 * have never shown, and each of them is a refusal the buyer currently meets
 * for the first time at "Place order":
 *
 *   - `sellable: false`  → checkout answers `ErrProductUnavailable`
 *   - a mixed-seller bag → checkout answers `ErrMultipleSellers`
 *   - `quantity` above `available_qty` → checkout cannot reserve the stock
 *
 * Saying so on the cart is not a nicety; it is the difference between a
 * shopper who can fix their bag and one who is told "no" with no reason.
 */

/** Lines that have left the catalogue since they were added. */
export function unavailableLines(cart: CartView): CartViewLine[] {
  return cart.items.filter((line) => !line.sellable)
}

/** Lines asking for more units than the seller can still supply. */
export function overstockedLines(cart: CartView): CartViewLine[] {
  return cart.items.filter((line) => line.sellable && line.quantity > line.available_qty)
}

/**
 * True when the bag holds lines from more than one seller.
 *
 * Read off the ABSENCE of `cart.seller_id`, which the service sets only when
 * every line agrees — never by picking the first line's seller, which would
 * name one of two shops and mislead about why the order is refused.
 */
export function isMixedSellerCart(cart: CartView): boolean {
  return cart.items.length > 0 && !cart.seller_id
}

/** Lines whose catalogue price moved since they were added. */
export function repricedLines(cart: CartView): CartViewLine[] {
  return cart.items.filter((line) => line.price_was_minor != null)
}

/**
 * The one sentence that says why this bag cannot be ordered, or null when
 * nothing about the bag itself is in the way. Address and delivery reasons
 * are `getCheckoutBlockReason`'s job, not this one's.
 */
export function cartBlockReason(cart: CartView | null | undefined): string | null {
  if (!cart || cart.items.length === 0) return null

  const unavailable = unavailableLines(cart)
  if (unavailable.length > 0) {
    return unavailable.length === 1
      ? `${unavailable[0].title} is no longer available. Remove it to continue.`
      : `${unavailable.length} items are no longer available. Remove them to continue.`
  }

  if (isMixedSellerCart(cart)) {
    return 'Your bag has items from more than one shop. An order can only be placed with one shop at a time.'
  }

  const overstocked = overstockedLines(cart)
  if (overstocked.length > 0) {
    const line = overstocked[0]
    return line.available_qty === 0
      ? `${line.title} is out of stock. Remove it to continue.`
      : `Only ${line.available_qty} of ${line.title} ${line.available_qty === 1 ? 'is' : 'are'} left. Reduce the quantity to continue.`
  }

  return null
}

/**
 * The image record for a cart line, in the shape `productImage` reads.
 *
 * `image_url` absent means media-service could not answer, and the service
 * documents that as "render a placeholder" — which is what `productImage`
 * returning null makes `ProductPhoto` do.
 */
export function lineImage(line: CartViewLine): {
  image_media_id?: string | null
  image_url?: string | null
  thumbnail_url?: string | null
} {
  return {
    image_media_id: line.image_media_id ?? null,
    image_url: line.image_url || null,
    thumbnail_url: line.thumbnail_url || null,
  }
}
