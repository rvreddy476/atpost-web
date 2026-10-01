import { num, str, type Row } from "./data"
import { bpsToPercent, byLabel, changedFields, checkWindow, istDay, percentLabel, percentToBps, readRupees, rupeesText } from "./discounts"
import { hasPermission, type AdminMe } from "./me"
import { formatPaise } from "./money"
import { PAY } from "./payments"

/**
 * Money → Bank offers: payments-service's registry of Razorpay Offers
 * (`payments.payment_offers`), through admin-service's BFF.
 *
 * A Razorpay offer is made in the Razorpay dashboard first; it has an id like
 * `offer_JTUADI4ZWBGWur`. Entering it here does two things: checkout asks
 * Razorpay to show that offer in its payment sheet (the buyer picks it there,
 * with the card or UPI app it is for), and payments-service accepts a capture
 * that is short of the order by no more than this offer's discount as a full
 * payment. The fields below are what that check compares against, so they
 * must match the offer as it was set up in Razorpay.
 *
 * Every write needs a fresh 2FA code (admin-service; the console asks before
 * sending). Deactivating is an edit with active=false; nothing is deleted.
 */

export const OFFERS = `${PAY}/offers`
export const OFFERS_PERMISSION = "offers.manage"

/** Only MStore's checkout offers bank offers today. */
export const OFFER_APPLICATION = "mstore"
export const OFFER_PROVIDER = "razorpay"

export function canManageOffers(me: AdminMe): boolean {
  return hasPermission(me, "payments", OFFERS_PERMISSION)
}

/** Razorpay's ids: `offer_` and the rest of the id, letters and digits. */
export const RAZORPAY_OFFER_ID = /^offer_[A-Za-z0-9]{6,40}$/

export const OFFER_PAYMENT_METHODS = byLabel([
  { value: "any", label: "Any method" },
  { value: "card", label: "Cards" },
  { value: "upi", label: "UPI" },
] as const)

export const OFFER_FUNDERS = byLabel([
  { value: "bank", label: "Bank" },
  { value: "merchant", label: "Merchant (we fund it)" },
] as const)

export const DISCOUNT_TYPES = byLabel([
  { value: "flat", label: "Flat amount" },
  { value: "percentage", label: "Percentage" },
] as const)

export type OfferPaymentMethod = "any" | "card" | "upi"
export type OfferFunder = "bank" | "merchant"
export type DiscountType = "flat" | "percentage"

export interface OfferInput {
  provider_offer_id: string
  title: string
  description: string
  payment_method: OfferPaymentMethod
  discount_type: DiscountType
  /** Rupees for a flat offer, per cent for a percentage one. */
  discount_value: string
  /** Rupees; blank = no cap. */
  max_discount: string
  /** Rupees; blank = any amount. */
  min_amount: string
  funded_by: OfferFunder
  /** YYYY-MM-DD or "". */
  starts_at: string
  ends_at: string
  active: boolean
}

export const EMPTY_OFFER: OfferInput = {
  provider_offer_id: "",
  title: "",
  description: "",
  payment_method: "card",
  discount_type: "percentage",
  discount_value: "",
  max_discount: "",
  min_amount: "",
  funded_by: "bank",
  starts_at: "",
  ends_at: "",
  active: true,
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

/** A stored offer as the edit form's starting values. */
export function offerInput(row: Row): OfferInput {
  const type = oneOf<DiscountType>(row.discount_type, ["flat", "percentage"], "percentage")
  const value = num(row.discount_value)
  return {
    provider_offer_id: str(row.provider_offer_id) ?? "",
    title: str(row.title) ?? "",
    description: str(row.description) ?? "",
    payment_method: oneOf<OfferPaymentMethod>(row.payment_method, ["any", "card", "upi"], "any"),
    discount_type: type,
    discount_value: type === "percentage" ? bpsToPercent(value) : rupeesText(value),
    max_discount: rupeesText(row.max_discount_minor),
    min_amount: (num(row.min_amount_minor) ?? 0) > 0 ? rupeesText(row.min_amount_minor) : "",
    funded_by: oneOf<OfferFunder>(row.funded_by, ["bank", "merchant"], "bank"),
    starts_at: istDay(row.starts_at),
    ends_at: istDay(row.ends_at),
    active: row.active !== false,
  }
}

export type CheckResult = { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] }

/**
 * The offer as payments-service takes it: the percentage in basis points,
 * every amount in integer paise, the validity as the start and end of an
 * Indian day. For an edit (`stored` given) the body is only what changed, and
 * the Razorpay id, application and provider cannot change.
 */
export function checkOffer(input: OfferInput, { stored, today }: { stored?: Row; today?: string } = {}): CheckResult {
  const problems: string[] = []
  const body: Record<string, unknown> = {}

  if (!stored) {
    const id = input.provider_offer_id.trim()
    if (!RAZORPAY_OFFER_ID.test(id)) problems.push("Razorpay offer id must look like offer_ followed by the id's letters and digits, as the Razorpay dashboard shows it.")
    else body.provider_offer_id = id
    body.application = OFFER_APPLICATION
    body.provider = OFFER_PROVIDER
  }

  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) problems.push("Title must be 3–120 characters, e.g. “10% off with HDFC credit cards”.")
  else body.title = title
  const description = input.description.trim()
  if (description.length > 500) problems.push("Description must be 500 characters or fewer.")
  else body.description = description

  body.payment_method = input.payment_method
  body.discount_type = input.discount_type
  body.funded_by = input.funded_by

  if (input.discount_type === "percentage") {
    const bps = percentToBps(input.discount_value)
    if (bps === null) problems.push("A percentage offer needs a percentage above 0 and at most 100, with no more than two decimals.")
    else body.discount_value = bps
  } else {
    const paise = readRupees(input.discount_value)
    if (paise === null || paise === undefined || paise <= 0) problems.push("A flat offer needs a rupee amount above zero.")
    else body.discount_value = paise
  }

  // A cap means something only on a percentage; a flat offer's hidden field is ignored.
  if (input.discount_type === "flat") body.max_discount_minor = null
  else {
    const maxDiscount = readRupees(input.max_discount)
    if (maxDiscount === undefined || maxDiscount === 0) problems.push("Maximum discount must be a rupee amount above zero, or blank for no cap.")
    else body.max_discount_minor = maxDiscount
  }

  const minAmount = readRupees(input.min_amount)
  if (minAmount === undefined) problems.push("Minimum payment must be a rupee amount of zero or more, or blank for any amount.")
  else body.min_amount_minor = minAmount ?? 0

  const window = checkWindow(input.starts_at, input.ends_at, { labels: { starts: "Starts", ends: "Ends" }, today: stored ? undefined : today })
  problems.push(...window.problems)
  body.starts_at = window.starts_at
  body.ends_at = window.ends_at
  body.active = input.active

  if (problems.length > 0) return { ok: false, problems }
  if (!stored) {
    // A create leaves out what is not set rather than sending nulls.
    for (const key of ["max_discount_minor", "starts_at", "ends_at"]) if (body[key] === null) delete body[key]
    if (body.description === "") delete body.description
    return { ok: true, body }
  }
  // An unchanged day keeps the stored instant, so it is not sent as a change.
  if (istDay(stored.starts_at) === input.starts_at.trim()) body.starts_at = stored.starts_at ?? null
  if (istDay(stored.ends_at) === input.ends_at.trim()) body.ends_at = stored.ends_at ?? null
  const storedView: Row = { ...stored, description: str(stored.description) ?? "", min_amount_minor: num(stored.min_amount_minor) ?? 0, active: stored.active !== false }
  const changes = changedFields(body, storedView)
  if (Object.keys(changes).length === 0) return { ok: false, problems: ["Nothing has changed."] }
  return { ok: true, body: changes }
}

/** The deactivate request: an edit, never a delete. */
export const deactivateOfferBody = () => ({ active: false })

/** "10% off, up to ₹1,500.00" or "₹100.00 off". */
export function offerValue(row: Row): string {
  const value = num(row.discount_value)
  if (str(row.discount_type) === "percentage") {
    const cap = num(row.max_discount_minor)
    return `${percentLabel(value)} off${cap ? `, up to ${formatPaise(cap)}` : ""}`
  }
  return `${formatPaise(value)} off`
}

export type OfferTone = "bad" | "warn" | "good"

/** Inactive: bad; past its end or not yet started: warn; otherwise live. */
export function offerTone(row: Row, now: Date = new Date()): OfferTone {
  if (row.active === false) return "bad"
  const ends = str(row.ends_at)
  if (ends && Date.parse(ends) < now.getTime()) return "warn"
  const starts = str(row.starts_at)
  if (starts && Date.parse(starts) > now.getTime()) return "warn"
  return "good"
}

export function offerStatus(row: Row, now: Date = new Date()): string {
  if (row.active === false) return "inactive"
  const ends = str(row.ends_at)
  if (ends && Date.parse(ends) < now.getTime()) return "ended"
  const starts = str(row.starts_at)
  if (starts && Date.parse(starts) > now.getTime()) return "scheduled"
  return "live"
}

/** The list as a person reads it: by title, A to Z. */
export function sortOffers(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (str(a.title) ?? "").localeCompare(str(b.title) ?? "", "en", { sensitivity: "base" }))
}

export const OFFER_LIST_KEYS = ["offers", "items", "rows"] as const

export type OfferWrite = { kind: "create"; body: Record<string, unknown> } | { kind: "edit" | "deactivate"; id: string; body: Record<string, unknown> }

/** Create is POST /offers; edit and deactivate are PATCH /offers/:id. Nothing is ever DELETEd. */
export function offerRequest(write: OfferWrite): { method: "post" | "patch"; url: string; body: Record<string, unknown> } {
  return write.kind === "create" ? { method: "post", url: OFFERS, body: write.body } : { method: "patch", url: `${OFFERS}/${encodeURIComponent(write.id)}`, body: write.body }
}
