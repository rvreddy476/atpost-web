import { isRecord, num, readObject, str, unwrap } from "./data"
import { REFUND_TWO_PERSON_THRESHOLD_PAISE, formatPaise, refundNeedsSecondApprover, type RefundHint } from "./money"
import { readApiError } from "./mutation"
import type { StatsResult } from "./stats"

/**
 * The Monetization dashboard's rules, as plain functions.
 *
 * While money is switched off (monetization's MONETIZATION_WRITES_ENABLED is
 * off) admin-service answers every READ with 200 `{data: {state:
 * "not_launched"}}` and every WRITE with 503 MONETIZATION_NOT_LAUNCHED. That
 * is a state, not a fault: the console says so calmly and never shows the
 * empty lists or zero counts it would otherwise read into those answers.
 */

export const MON = "/v1/admin/monetization"

export const NOT_LAUNCHED_TITLE = "Money actions are switched off for the beta"
export const NOT_LAUNCHED_BODY =
  "Monetization has not launched yet, so nothing here can move money and its queues are not counted. This is expected, not a fault."

/** A read answered with the not-launched state. */
export function isNotLaunched(raw: unknown): boolean {
  const body = unwrap(raw)
  return isRecord(body) && body.state === "not_launched"
}

/** A write refused because monetization is not launched. */
export function isNotLaunchedError(err: unknown): boolean {
  const { status, code } = readApiError(err)
  return status === 503 && code === "MONETIZATION_NOT_LAUNCHED"
}

// ---------------------------------------------------------------------------
// Step-up and two-person, per route (admin-service handler_monetization.go)
// ---------------------------------------------------------------------------

export type MonetizationWrite =
  | "fraud.decide"
  | "wallet.freeze"
  | "wallet.unfreeze"
  | "wallet.rebuild"
  | "fund.rates"
  | "fund.quality_bands"
  | "fund.budget"
  | "fund.settle_day"
  | "fund.settle_period"
  | "fund.settle_creator_period"
  | "fund.reverse"
  | "creator.suspend"
  | "creator.unsuspend"
  | "dispute.act"
  | "refund.issue"

/** Always wait for a second approver, whatever the amount. */
export const MONETIZATION_ALWAYS_TWO_PERSON: readonly MonetizationWrite[] = [
  "fund.rates",
  "fund.quality_bands",
  "fund.budget",
  "fund.settle_day",
  "fund.settle_period",
  "fund.settle_creator_period",
  "fund.reverse",
]

/** Every monetization write needs a fresh 2FA code. */
export function monetizationStepUp(_write: MonetizationWrite): true {
  return true
}

/**
 * Will this write wait for a second approver? True or false when the console
 * can tell; null for a refund whose amount is not known yet.
 */
export function monetizationTwoPerson(write: MonetizationWrite, amountPaise: number | null = null): boolean | null {
  if (MONETIZATION_ALWAYS_TWO_PERSON.includes(write)) return true
  if (write === "refund.issue") return amountPaise === null ? null : refundNeedsSecondApprover(amountPaise)
  return false
}

export const ALWAYS_TWO_PERSON_NOTE = "This always goes to a second admin for approval, and needs a fresh 2FA code. Nothing changes until they approve."

/** What to tell the admin before a monetization refund is sent (≥ ₹5,000 is two-person). */
export function monetizationRefundHint(amountPaise: number | null): RefundHint {
  const threshold = formatPaise(REFUND_TWO_PERSON_THRESHOLD_PAISE)
  if (amountPaise === null) {
    return { secondApprover: null, message: `Enter the amount. A refund of ${threshold} or more goes to a second approver.` }
  }
  if (refundNeedsSecondApprover(amountPaise)) {
    return {
      secondApprover: true,
      message: `${formatPaise(amountPaise)} is ${threshold} or more, so a second admin must approve this refund before any money moves.`,
    }
  }
  return { secondApprover: false, message: `Below ${threshold}: it is refunded once you confirm with 2FA.` }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** 2026-09 (monthly), 2026-09-H1 / 2026-09-H2 (twice monthly). */
export const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])(-H[12])?$/
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const isPeriodKey = (value: string) => PERIOD_KEY_PATTERN.test(value.trim())

/** A whole, non-negative number typed into a field (basis points, impressions). */
export function parseWhole(input: string): number | null {
  const text = input.trim()
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : null
}

/** A rupee amount that may be zero (a budget cap), as paise. */
export function parseRupeesAllowZero(input: string): number | null {
  const text = input.replace(/[₹,\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ""] = text.split(".")
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return Number.isSafeInteger(paise) ? paise : null
}

/** "₹12.00 → ₹15.00", or "New: ₹15.00" when there was nothing before. */
export function beforeAfter(before: number | null, after: number | null): string {
  if (after === null) return "—"
  return before === null ? `New: ${formatPaise(after)}` : `${formatPaise(before)} → ${formatPaise(after)}`
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface MoneyTile {
  key: string
  label: string
  display: string
  tone: "bad" | "warn" | "normal" | "unknown"
}

export interface MoneyStatsView {
  state: "loading" | "unavailable" | "not_launched" | "ok"
  message: string | null
  tiles: MoneyTile[]
  generatedAt: string | null
}

export const UNAVAILABLE = "unavailable"

type Metric = { key: string; label: string; read: (body: Record<string, unknown>) => Omit<MoneyTile, "key" | "label"> }

const count = (field: string, alert?: "bad" | "warn") => (body: Record<string, unknown>) => {
  const n = num(body[field])
  if (n === null) return { display: UNAVAILABLE, tone: "unknown" as const }
  return { display: n.toLocaleString("en-IN"), tone: n > 0 && alert ? alert : ("normal" as const) }
}

/** Most urgent first; the overview shows the first four. */
export const MONETIZATION_METRICS: readonly Metric[] = [
  { key: "open_fraud_reviews", label: "Open fraud reviews", read: count("open_fraud_reviews", "bad") },
  { key: "open_disputes", label: "Open disputes", read: count("open_disputes", "warn") },
  { key: "frozen_wallets", label: "Frozen wallets", read: count("frozen_wallets", "warn") },
  { key: "pending_payout_requests", label: "Pending payout requests", read: count("pending_payout_requests") },
  {
    key: "pending_payout_paise",
    label: "Pending payout amount",
    read: (body) => {
      const n = num(body.pending_payout_paise)
      return n === null ? { display: UNAVAILABLE, tone: "unknown" } : { display: formatPaise(n), tone: "normal" }
    },
  },
  {
    key: "current_period",
    label: "Current period accrued vs cap",
    read: (body) => {
      const period = isRecord(body.current_period) ? body.current_period : null
      const accrued = period ? num(period.accrued_paise) : null
      if (!period || accrued === null) return { display: UNAVAILABLE, tone: "unknown" }
      const key = str(period.period_key)
      const cap = num(period.cap_paise)
      const text = cap === null ? `${formatPaise(accrued)} (no cap)` : `${formatPaise(accrued)} of ${formatPaise(cap)}`
      return { display: key ? `${key}: ${text}` : text, tone: period.capped === true ? "warn" : "normal" }
    },
  },
  { key: "reversals_last_7_days", label: "Reversals, last 7 days", read: count("reversals_last_7_days") },
  {
    key: "last_settlement_run",
    label: "Last settlement run",
    read: (body) => {
      if (!("last_settlement_run" in body)) return { display: UNAVAILABLE, tone: "unknown" }
      const run = isRecord(body.last_settlement_run) ? body.last_settlement_run : null
      if (!run) return { display: "None run from the console yet", tone: "normal" }
      const status = str(run.status) ?? "unknown"
      const at = str(run.ended_at) ?? str(run.started_at)
      const parts = [status.charAt(0).toUpperCase() + status.slice(1), str(run.period_key), at ? new Date(at).toLocaleString() : null]
      return { display: parts.filter(Boolean).join(" · "), tone: status === "failed" ? "bad" : status === "incomplete" ? "warn" : "normal" }
    },
  },
]

export function monetizationStatsView(result: StatsResult, limit?: number): MoneyStatsView {
  const metrics = MONETIZATION_METRICS.slice(0, limit)
  if (result.status === "loading") {
    return { state: "loading", message: null, generatedAt: null, tiles: metrics.map((m) => ({ key: m.key, label: m.label, display: "…", tone: "unknown" })) }
  }
  if (result.status === "ok" && isNotLaunched(result.raw)) {
    // No tiles at all: a switched-off product has no numbers, not zeros.
    return { state: "not_launched", message: NOT_LAUNCHED_BODY, generatedAt: null, tiles: [] }
  }
  const body = result.status === "ok" ? readObject(result.raw) : null
  if (!body) {
    const message = result.status === "error" ? result.message : "The stats answer could not be read."
    return { state: "unavailable", message, generatedAt: null, tiles: metrics.map((m) => ({ key: m.key, label: m.label, display: UNAVAILABLE, tone: "unknown" })) }
  }
  return {
    state: "ok",
    message: null,
    generatedAt: str(body.generated_at),
    tiles: metrics.map((m) => ({ key: m.key, label: m.label, ...m.read(body) })),
  }
}
