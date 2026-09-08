import { formatMinor } from '@atpost/form'

/**
 * How the shop writes an amount.
 *
 * Two entry points, because the service speaks two dialects and pretending
 * otherwise is how a ₹12.99 line renders as ₹1,299:
 *
 *   - `inr(value)` — rupees, as the checkout quote and the coupon preview
 *     send them (`subtotal`, `grand_total`, … are float64 rupees in
 *     commerce-service's quote response).
 *   - `inrMinor(minor)` — integer paise, as the CART sends them
 *     (`subtotal_minor`, `unit_price_minor`, `line_total_minor`).
 *
 * Both render identically, so a subtotal does not change shape depending on
 * which endpoint answered it.
 */

/** Rupees → "₹1,299" / "₹1,299.50". The paise are dropped when there are none. */
export const inr = (value: number) =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 })}`

/**
 * Integer paise → "₹1,299" / "₹1,299.50".
 *
 * The split into rupees and paise is `@atpost/form`'s `formatMinor`, which is
 * already the one place in this repo that turns minor units into text and does
 * it without a float multiply. Grouping and the ₹ are added here because
 * `formatMinor` deliberately leaves both to the view.
 *
 * Nothing in here divides or multiplies the amount as a float, so a value that
 * arrived as an exact number of paise is still exact when it is printed.
 */
export const inrMinor = (minor: number) => {
  const text = formatMinor(minor)
  // formatMinor answers '' for null/undefined/NaN. A cart total that cannot be
  // read is not "free", so say nothing rather than say ₹0.
  if (!text) return '—'
  const negative = text.startsWith('-')
  const [rupees, paise] = (negative ? text.slice(1) : text).split('.')
  const grouped = Number(rupees).toLocaleString('en-IN')
  const body = paise === '00' ? grouped : `${grouped}.${paise}`
  return `${negative ? '−' : ''}₹${body}`
}
