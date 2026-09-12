// How a product summary's money and its deal are read off the wire.
//
// Two rules, both the server's:
//
//   - `discount_pct` is DERIVED BY THE SERVER and the client must not compute
//     it. The grid used to round `(1 - price / mrp) * 100` itself and the
//     detail page did the same sum from the variant, and the two badges
//     disagreed for the same product whenever the rounding fell differently.
//     One number, from one place, or no badge at all.
//   - Prices come in PAISE (`min_price_minor`, `mrp_minor`). The rupee floats
//     (`min_selling_price`, `min_mrp`) are the deprecated shape, kept for the
//     older caller; they are read only when the paise pair is absent.

import { inr, inrMinor } from './money'

export interface PricedSummary {
  min_price_minor?: number | null
  mrp_minor?: number | null
  min_selling_price?: number | null
  min_mrp?: number | null
  discount_pct?: number | null
}

/** "25% OFF", or null when the server sent no discount. Never computed here. */
export function discountLabel(product: Pick<PricedSummary, 'discount_pct'> | null | undefined): string | null {
  const pct = product?.discount_pct
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0) return null
  return `${Math.round(pct)}% OFF`
}

export interface DisplayPrice {
  /** What the shopper pays, formatted. */
  price: string
  /** The struck-through MRP, formatted, when it is higher than the price. */
  was: string | null
}

/**
 * The card's price line. Paise first; the rupee floats only as a fallback,
 * and null when the summary carries neither, so the card draws nothing rather
 * than "₹0".
 */
export function displayPrice(product: PricedSummary | null | undefined): DisplayPrice | null {
  if (!product) return null
  const priceMinor = product.min_price_minor
  const mrpMinor = product.mrp_minor
  if (typeof priceMinor === 'number') {
    const was = typeof mrpMinor === 'number' && mrpMinor > priceMinor ? inrMinor(mrpMinor) : null
    return { price: inrMinor(priceMinor), was }
  }
  const price = product.min_selling_price
  if (typeof price === 'number') {
    const mrp = product.min_mrp
    const was = typeof mrp === 'number' && mrp > price ? inr(mrp) : null
    return { price: inr(price), was }
  }
  return null
}
