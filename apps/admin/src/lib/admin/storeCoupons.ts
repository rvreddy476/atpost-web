import { isRecord, num, str, unwrap, type Row } from "./data"
import { bpsToPercent, byLabel, changedFields, checkWindow, istDay, percentLabel, percentToBps, readCount, readRupees, rupeesText } from "./discounts"
import { hasPermission, type AdminMe } from "./me"
import { formatPaise } from "./money"
import { adminPrefix } from "./sections"

/**
 * MStore → Coupons: platform coupons (MStore funds the discount) and a
 * read-only view of the coupons sellers run, through admin-service's BFF
 * (`/v1/admin/commerce/coupons`, forwarded to commerce's
 * `/internal/admin/coupons`).
 *
 * Platform coupons can be prepared while COMMERCE_PLATFORM_COUPONS_ENABLED is
 * off; buyers cannot apply them until the tax adviser confirms the GST
 * treatment of a platform-funded discount and the switch is turned on. The
 * list answer carries the switch as `meta.platform_coupons_enabled`.
 *
 * Every write needs a fresh 2FA code; deactivating is an edit with
 * is_active=false, and nothing is deleted.
 */

export const COUPONS = `${adminPrefix("commerce")}/coupons`
export const COUPONS_PERMISSION = "coupons.manage"
export const COUPON_PAGE = 100

export function canManageCoupons(me: AdminMe): boolean {
  return hasPermission(me, "commerce", COUPONS_PERMISSION)
}

export const couponListUrl = (fundedBy: "platform" | "seller") => `${COUPONS}?funded_by=${fundedBy}&limit=${COUPON_PAGE}`

/** 4–20 capital letters and digits, as commerce stores them. */
export const STORE_COUPON_CODE = /^[A-Z0-9]{4,20}$/

/** What an admin typed as the code: spaces dropped, upper-cased. */
export const normaliseCode = (input: string) => input.replace(/\s+/g, "").toUpperCase()

export const COUPON_DISCOUNT_TYPES = byLabel([
  { value: "flat", label: "Flat amount" },
  { value: "percentage", label: "Percentage" },
] as const)

export const COUPON_SCOPES = byLabel([
  { value: "all", label: "All products" },
  { value: "category", label: "Categories" },
  { value: "product", label: "Products" },
  { value: "seller", label: "Sellers" },
] as const)

export type CouponDiscountType = "flat" | "percentage"
export type CouponScope = "all" | "category" | "product" | "seller"

export interface StoreCouponInput {
  code: string
  description: string
  discount_type: CouponDiscountType
  /** Rupees for flat, per cent for percentage. */
  discount_value: string
  /** Rupees; blank = no cap (percentage only). */
  max_discount: string
  /** Rupees; blank = any order. */
  min_order: string
  /** Blank = unlimited. */
  max_uses: string
  max_uses_per_user: string
  applicable_to: CouponScope
  /** Ids, one per line or comma-separated, when applicable_to is not "all". */
  applicable_ids: string
  starts_at: string
  expires_at: string
  is_public: boolean
  is_active: boolean
}

export const EMPTY_STORE_COUPON: StoreCouponInput = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "",
  max_discount: "",
  min_order: "",
  max_uses: "",
  max_uses_per_user: "1",
  applicable_to: "all",
  applicable_ids: "",
  starts_at: "",
  expires_at: "",
  is_public: true,
  is_active: true,
}

// ---------------------------------------------------------------------------
// Reading a stored coupon (contract names first, then commerce's column names)
// ---------------------------------------------------------------------------

export function couponType(row: Row): string {
  return str(row.discount_type) ?? "flat"
}

/** Basis points for a percentage coupon, paise for a flat one. */
export function couponDiscountValue(row: Row): number | null {
  return couponType(row) === "percentage"
    ? (num(row.discount_basis_points) ?? num(row.discount_value))
    : (num(row.discount_value_minor) ?? num(row.discount_value))
}

export const couponMaxDiscount = (row: Row) => num(row.max_discount_minor) ?? num(row.max_discount_amount_minor)
export const couponMinOrder = (row: Row) => num(row.min_order_minor) ?? num(row.min_order_amount_minor)
export const couponUses = (row: Row) => num(row.uses_count) ?? num(row.used_count) ?? 0

/** Platform when commerce says so, or when no seller owns it. */
export function isPlatformCoupon(row: Row): boolean {
  const funded = str(row.funded_by)
  if (funded) return funded === "platform"
  return str(row.seller_id) === null
}

/** A stored coupon as the edit form's starting values; code, type, value and scope stay as they are. */
export function storeCouponInput(row: Row): StoreCouponInput {
  const type: CouponDiscountType = couponType(row) === "percentage" ? "percentage" : "flat"
  const value = couponDiscountValue(row)
  const scope = str(row.applicable_to)
  const ids = Array.isArray(row.applicable_ids) ? row.applicable_ids.filter((v): v is string => typeof v === "string") : []
  const maxUses = num(row.max_uses)
  return {
    code: str(row.code) ?? "",
    description: str(row.description) ?? "",
    discount_type: type,
    discount_value: type === "percentage" ? bpsToPercent(value) : rupeesText(value),
    max_discount: rupeesText(couponMaxDiscount(row)),
    min_order: (couponMinOrder(row) ?? 0) > 0 ? rupeesText(couponMinOrder(row)) : "",
    max_uses: maxUses && maxUses > 0 ? String(maxUses) : "",
    max_uses_per_user: String(num(row.max_uses_per_user) ?? 1),
    applicable_to: scope === "category" || scope === "product" || scope === "seller" ? scope : "all",
    applicable_ids: ids.join("\n"),
    starts_at: istDay(row.starts_at),
    expires_at: istDay(row.expires_at),
    is_public: row.is_public !== false,
    is_active: row.is_active !== false,
  }
}

export type CheckResult = { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readIds(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * A platform coupon as commerce takes it: the code upper-cased, a percentage
 * in basis points, every amount in integer paise, limits as whole numbers, the
 * validity as the start and end of an Indian day.
 *
 * An edit (`stored` given) may change only what commerce lets a coupon change
 * after it exists: description, limits, dates, public and active. The body is
 * what changed.
 */
export function checkStoreCoupon(input: StoreCouponInput, { stored, today }: { stored?: Row; today?: string } = {}): CheckResult {
  const problems: string[] = []
  const body: Record<string, unknown> = {}

  if (!stored) {
    const code = normaliseCode(input.code)
    if (!STORE_COUPON_CODE.test(code)) problems.push("Code must be 4–20 letters and digits, with no spaces or symbols.")
    else body.code = code
    body.discount_type = input.discount_type
    if (input.discount_type === "percentage") {
      const bps = percentToBps(input.discount_value)
      if (bps === null) problems.push("A percentage coupon needs a percentage above 0 and at most 100, with no more than two decimals.")
      else body.discount_value = bps
    } else {
      const paise = readRupees(input.discount_value)
      if (paise === null || paise === undefined || paise <= 0) problems.push("A flat coupon needs a rupee amount above zero.")
      else body.discount_value = paise
    }
    body.applicable_to = input.applicable_to
    if (input.applicable_to !== "all") {
      const ids = readIds(input.applicable_ids)
      if (ids.length === 0) problems.push("List at least one id, or choose All products.")
      else if (!ids.every((id) => UUID.test(id))) problems.push("Each id must be a full id (36 characters).")
      else body.applicable_ids = [...new Set(ids)]
    }
  }

  const description = input.description.trim()
  if (description.length > 200) problems.push("Description must be 200 characters or fewer.")
  else body.description = description

  const percentage = (stored ? couponType(stored) : input.discount_type) === "percentage"
  if (percentage) {
    const cap = readRupees(input.max_discount)
    if (cap === undefined || cap === 0) problems.push("Maximum discount must be a rupee amount above zero, or blank for no cap.")
    else body.max_discount_minor = cap
  }

  const minOrder = readRupees(input.min_order)
  if (minOrder === undefined) problems.push("Minimum order must be a rupee amount of zero or more, or blank for any order.")
  else body.min_order_minor = minOrder ?? 0

  const maxUses = readCount(input.max_uses)
  if (maxUses === undefined) problems.push("Total uses must be a whole number of 1 or more, or blank for no limit.")
  else body.max_uses = maxUses
  const perUser = readCount(input.max_uses_per_user)
  if (perUser === undefined || perUser === null) problems.push("Uses per buyer must be a whole number of 1 or more.")
  else body.max_uses_per_user = perUser
  if (typeof maxUses === "number" && typeof perUser === "number" && perUser > maxUses) problems.push("Uses per buyer cannot be more than total uses.")

  const window = checkWindow(input.starts_at, input.expires_at, { labels: { starts: "Starts", ends: "Expires" }, today: stored ? undefined : today })
  problems.push(...window.problems)
  body.starts_at = window.starts_at
  body.expires_at = window.ends_at
  body.is_public = input.is_public
  body.is_active = input.is_active

  if (problems.length > 0) return { ok: false, problems }
  if (!stored) {
    for (const key of ["max_discount_minor", "max_uses", "starts_at", "expires_at"]) if (body[key] === null) delete body[key]
    if (body.description === "") delete body.description
    return { ok: true, body }
  }
  if (istDay(stored.starts_at) === input.starts_at.trim()) body.starts_at = stored.starts_at ?? null
  if (istDay(stored.expires_at) === input.expires_at.trim()) body.expires_at = stored.expires_at ?? null
  const storedMaxUses = num(stored.max_uses)
  const storedView: Row = {
    description: str(stored.description) ?? "",
    max_discount_minor: couponMaxDiscount(stored),
    min_order_minor: couponMinOrder(stored) ?? 0,
    max_uses: storedMaxUses && storedMaxUses > 0 ? storedMaxUses : null,
    max_uses_per_user: num(stored.max_uses_per_user) ?? 1,
    starts_at: stored.starts_at ?? null,
    expires_at: stored.expires_at ?? null,
    is_public: stored.is_public !== false,
    is_active: stored.is_active !== false,
  }
  const changes = changedFields(body, storedView)
  if (Object.keys(changes).length === 0) return { ok: false, problems: ["Nothing has changed."] }
  return { ok: true, body: changes }
}

/** The deactivate request: an edit, never a delete. */
export const deactivateCouponBody = () => ({ is_active: false })

// ---------------------------------------------------------------------------
// Showing a coupon
// ---------------------------------------------------------------------------

/** "10% off, up to ₹200.00", "₹100.00 off", or the legacy type humanised. */
export function storeCouponValue(row: Row): string {
  const type = couponType(row)
  const value = couponDiscountValue(row)
  if (type === "percentage") {
    const cap = couponMaxDiscount(row)
    return `${percentLabel(value)} off${cap ? `, up to ${formatPaise(cap)}` : ""}`
  }
  if (type === "flat") return `${formatPaise(value)} off`
  if (type === "free_shipping") return "Free shipping"
  if (type === "buy_x_get_y") return "Buy X get Y"
  return type
}

/** "12 / 100" with a total limit, "12" without. */
export function storeCouponUsage(row: Row): string {
  const used = couponUses(row)
  const total = num(row.max_uses) ?? 0
  return total > 0 ? `${used.toLocaleString("en-IN")} / ${total.toLocaleString("en-IN")}` : used.toLocaleString("en-IN")
}

export type CouponTone = "bad" | "warn" | "good"

export function storeCouponTone(row: Row, now: Date = new Date()): CouponTone {
  const status = storeCouponStatus(row, now)
  return status === "inactive" ? "bad" : status === "active" ? "good" : "warn"
}

export function storeCouponStatus(row: Row, now: Date = new Date()): string {
  if (row.is_active === false) return "inactive"
  const ends = str(row.expires_at)
  if (ends && Date.parse(ends) < now.getTime()) return "expired"
  const total = num(row.max_uses) ?? 0
  if (total > 0 && couponUses(row) >= total) return "used_up"
  const starts = str(row.starts_at)
  if (starts && Date.parse(starts) > now.getTime()) return "scheduled"
  return "active"
}

/** The list as a person reads it: by code, A to Z. */
export function sortCoupons(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (str(a.code) ?? "").localeCompare(str(b.code) ?? "", "en", { sensitivity: "base" }))
}

export const COUPON_LIST_KEYS = ["coupons", "items", "rows"] as const

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

/**
 * `meta.platform_coupons_enabled` from the list answer (top-level `meta`, or
 * `meta` inside `data`). True only when it says exactly true: an answer that
 * leaves it out is treated as off, which is the default everywhere and the
 * safe reading for a money switch.
 */
export function platformCouponsEnabled(raw: unknown): boolean {
  const top = isRecord(raw) && isRecord(raw.meta) ? raw.meta : null
  const inner = unwrap(raw)
  const nested = isRecord(inner) && isRecord(inner.meta) ? inner.meta : null
  const meta = top ?? nested
  return meta !== null && meta.platform_coupons_enabled === true
}

export const PLATFORM_COUPONS_OFF_BANNER =
  "Platform coupons are switched off until the tax adviser confirms the GST treatment. You can prepare them; buyers can't use them yet."

/** The banner's text while the switch is off; null once it is on. */
export function platformCouponsBanner(raw: unknown): string | null {
  return platformCouponsEnabled(raw) ? null : PLATFORM_COUPONS_OFF_BANNER
}

export type CouponWrite = { kind: "create"; body: Record<string, unknown> } | { kind: "edit" | "deactivate"; id: string; body: Record<string, unknown> }

/** Create is POST /coupons; edit and deactivate are PATCH /coupons/:id. Nothing is ever DELETEd. */
export function couponRequest(write: CouponWrite): { method: "post" | "patch"; url: string; body: Record<string, unknown> } {
  return write.kind === "create" ? { method: "post", url: COUPONS, body: write.body } : { method: "patch", url: `${COUPONS}/${encodeURIComponent(write.id)}`, body: write.body }
}
