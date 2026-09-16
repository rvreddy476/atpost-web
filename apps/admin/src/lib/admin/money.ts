/**
 * Money in the console is integer paise. Some Feast answers still carry
 * rupees as floats; those are converted once, at the edge, with rounding.
 */

/**
 * ₹5,000. A Feast refund AT OR ABOVE this goes to a second approver
 * (admin-service `ADMIN_REFUND_TWO_PERSON_THRESHOLD_PAISE`). The server
 * decides; the console only warns before sending.
 */
export const REFUND_TWO_PERSON_THRESHOLD_PAISE = 500_000

export function refundNeedsSecondApprover(paise: number, thresholdPaise = REFUND_TWO_PERSON_THRESHOLD_PAISE): boolean {
  return paise >= thresholdPaise
}

export interface RefundHint {
  /** True when this refund will wait for a second approver; null when the console cannot tell. */
  secondApprover: boolean | null
  message: string
}

/**
 * What to tell the admin before a refund is sent.
 *
 * @param amountPaise  the amount typed, or null for a full refund
 * @param totalPaise   the order total, when known (bounds a full refund)
 */
export function refundHint(amountPaise: number | null, totalPaise: number | null = null): RefundHint {
  const threshold = formatPaise(REFUND_TWO_PERSON_THRESHOLD_PAISE)
  const basis = amountPaise ?? totalPaise
  if (basis === null) {
    return {
      secondApprover: null,
      message: `A full refund whose amount cannot be confirmed goes to a second approver, like any refund of ${threshold} or more.`,
    }
  }
  if (refundNeedsSecondApprover(basis)) {
    return {
      secondApprover: true,
      message: `${formatPaise(basis)} is ${threshold} or more, so a second admin must approve this refund before any money moves.`,
    }
  }
  return {
    secondApprover: false,
    message:
      amountPaise === null
        ? `Below ${threshold}: it is refunded once you confirm with 2FA, unless the server cannot confirm the order total — then it goes to a second approver.`
        : `Below ${threshold}: it is refunded once you confirm with 2FA.`,
  }
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
