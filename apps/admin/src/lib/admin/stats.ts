import { num, readObject } from "./data"
import { formatPaise } from "./money"

/**
 * The numbers each application's `/stats` route returns, ordered most urgent
 * first, and how the overview and dashboard headers show them.
 *
 * The rule that matters: a number the console could not read is
 * "unavailable", never 0. A failed stats call, a missing field or a non-number
 * all look the same — an admin must not read "0 overdue grievances" when the
 * truth is "we don't know".
 */
export type StatsApp = "trust_safety" | "dating" | "food" | "commerce" | "rider"

export const STATS_APPS: readonly StatsApp[] = ["trust_safety", "dating", "food", "commerce", "rider"]

export interface StatMetric {
  key: string
  label: string
  kind?: "count" | "paise"
  /** "bad" or "warn" when the value is above zero. */
  alert?: "bad" | "warn"
}

export const STATS_METRICS: Record<StatsApp, readonly StatMetric[]> = {
  trust_safety: [
    { key: "grievances_overdue", label: "Grievances overdue", alert: "bad" },
    { key: "grievances_due_within_48h", label: "Grievances due within 48 h", alert: "warn" },
    { key: "open_grievances", label: "Open grievances" },
    { key: "open_reports", label: "Open reports" },
    { key: "open_appeals", label: "Open appeals" },
    { key: "strikes_last_7_days", label: "Strikes, last 7 days" },
  ],
  dating: [
    { key: "panic_open", label: "Open panics", alert: "bad" },
    { key: "reports_pending", label: "Reports pending", alert: "warn" },
    { key: "photos_pending_review", label: "Photos pending" },
    { key: "selfies_in_review", label: "Selfies in review" },
    { key: "profiles_active", label: "Active profiles" },
    { key: "profiles_suspended", label: "Suspended profiles" },
    { key: "profiles_new_today", label: "New profiles today" },
    { key: "matches_today", label: "Matches today" },
  ],
  food: [
    { key: "restaurants_pending_review", label: "Restaurants to approve", alert: "warn" },
    { key: "delivery_partners_pending_review", label: "Riders to approve", alert: "warn" },
    { key: "refund_requests_pending", label: "Refund requests", alert: "warn" },
    { key: "restaurant_settlements_unpaid", label: "Restaurant settlements unpaid" },
    { key: "restaurant_settlements_unpaid_paise", label: "Owed to restaurants", kind: "paise" },
    { key: "delivery_settlements_unpaid", label: "Rider settlements unpaid" },
    { key: "delivery_settlements_unpaid_paise", label: "Owed to riders", kind: "paise" },
    { key: "tickets_open", label: "Open tickets" },
    { key: "orders_today", label: "Orders today" },
    { key: "gmv_today_paise", label: "GMV today", kind: "paise" },
  ],
  commerce: [
    { key: "sellers_pending", label: "Sellers to approve", alert: "warn" },
    { key: "products_pending", label: "Products to review", alert: "warn" },
    { key: "cod_remittances_pending", label: "COD remittances to settle", alert: "warn" },
    { key: "pending_payout_sellers", label: "Sellers awaiting payout" },
    { key: "pending_payout_amount_paise", label: "Pending payouts", kind: "paise" },
    { key: "kyc_awaiting_verification", label: "KYC awaiting verification" },
    { key: "dead_letter_jobs", label: "Dead-letter jobs", alert: "bad" },
    { key: "compliance_gaps_open", label: "Compliance gaps" },
    { key: "orders_today", label: "Orders today" },
    { key: "gmv_today_paise", label: "GMV today", kind: "paise" },
  ],
  // rider-service store/admin_stats.go. Revenue is partner subscriptions (customers ride free).
  rider: [
    { key: "partners_pending_review", label: "Partners to approve", alert: "warn" },
    { key: "open_safety_incidents", label: "Open safety incidents", alert: "bad" },
    { key: "open_complaints", label: "Open complaints", alert: "warn" },
    { key: "documents_pending", label: "Documents pending" },
    { key: "vehicles_pending", label: "Vehicles pending" },
    { key: "payments_awaiting_verification", label: "Payments to verify" },
    { key: "live_rides_now", label: "Live rides now" },
    { key: "rides_today", label: "Rides today" },
    { key: "cancellations_today", label: "Cancellations today" },
    { key: "rides_last_7_days", label: "Rides, 7 days" },
    { key: "revenue_today_paise", label: "Subscription revenue today", kind: "paise" },
  ],
}

export type StatsResult = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; raw: unknown }

export interface StatTile {
  key: string
  label: string
  /** The value as read, or null when it is not known. */
  value: number | null
  display: string
  tone: "bad" | "warn" | "normal" | "unknown"
}

export interface StatsView {
  state: "loading" | "unavailable" | "ok"
  message: string | null
  tiles: StatTile[]
  generatedAt: string | null
}

export const UNAVAILABLE = "unavailable"

export function statsView(app: StatsApp, result: StatsResult, limit?: number): StatsView {
  const metrics = STATS_METRICS[app].slice(0, limit)
  if (result.status === "loading") {
    return { state: "loading", message: null, generatedAt: null, tiles: metrics.map((m) => tile(m, null, "…")) }
  }
  const body = result.status === "ok" ? readObject(result.raw) : null
  if (!body) {
    const message = result.status === "error" ? result.message : "The stats answer could not be read."
    return { state: "unavailable", message, generatedAt: null, tiles: metrics.map((m) => tile(m, null, UNAVAILABLE)) }
  }
  return {
    state: "ok",
    message: null,
    generatedAt: typeof body.generated_at === "string" ? body.generated_at : null,
    tiles: metrics.map((m) => {
      const value = num(body[m.key])
      return tile(m, value, value === null ? UNAVAILABLE : m.kind === "paise" ? formatPaise(value) : value.toLocaleString("en-IN"))
    }),
  }
}

function tile(metric: StatMetric, value: number | null, display: string): StatTile {
  const tone = value === null ? "unknown" : value > 0 && metric.alert ? metric.alert : "normal"
  return { key: metric.key, label: metric.label, value, display, tone }
}
