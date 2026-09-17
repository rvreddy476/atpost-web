/**
 * Money in the console is integer paise. Some Feast answers still carry
 * rupees as floats; those are converted once, at the edge, with rounding.
 */

/**
 * Every refund is two-person (2026-09-17): a Feast refund issue or request
 * approval, a monetization refund, and a payments resolve as refunded
 * manually or written off all go to a second approver, whatever the amount.
 * There is no threshold. The server decides: when the caller is the sole
 * holder of the permission it executes at once and is recorded as such,
 * which the console cannot know in advance, so it states the rule plainly.
 */
export const REFUND_SECOND_APPROVER_NOTE = "Refunds are sent to a second approver."

/** What to tell the admin before a refund is sent: the amount when known, then the rule. */
export function refundHint(amountPaise: number | null = null): string {
  return amountPaise === null ? REFUND_SECOND_APPROVER_NOTE : `${formatPaise(amountPaise)}. ${REFUND_SECOND_APPROVER_NOTE}`
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 })

/** 500000 → "₹5,000.00". Null or non-finite → "—". */
export function formatPaise(paise: number | null | undefined): string {
  if (typeof paise !== "number" || !Number.isFinite(paise)) return "—"
  return INR.format(Math.round(paise) / 100)
}

/** A rupee float from an older answer, as paise. */
export function rupeesToPaise(rupees: unknown): number | null {
  return typeof rupees === "number" && Number.isFinite(rupees) ? Math.round(rupees * 100) : null
}

/**
 * What an admin typed into a rupee field, as paise: "5000", "5,000", "4999.5".
 * Null when it is not a positive amount with at most two decimals.
 */
export function parseRupeeInput(input: string): number | null {
  const text = input.replace(/[₹,\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null
}
