import { isRecord, num, readObject } from "./data"
import { PAYMENTS_CONFINABLE, hasPermission, type AdminMe } from "./me"
import { REFUND_SECOND_APPROVER_NOTE, formatPaise } from "./money"
import type { MoneyStatsView, MoneyTile } from "./monetization"
import type { StatsResult } from "./stats"

/**
 * The Payments dashboard's rules: which applications an admin may look at,
 * which actions they hold there, and when a refund resolve needs a second
 * approver (admin-service handler_payments.go).
 *
 * Two kinds of payments admin:
 *   · one holding `payments:<x>` (a platform-wide or payments-app grant) sees
 *     every application and may narrow to one, or look at all of them;
 *   · one holding only `<app>:payments_<x>` (a Feast, MStore or Dating role) is
 *     confined to that application. The console never offers them another,
 *     and when they hold several it asks them to choose before loading
 *     anything (admin-service would refuse with APPLICATION_ID_REQUIRED).
 */

export const PAY = "/v1/admin/payments"

const APPLICATION_LABELS: Record<string, string> = { mstore: "MStore", feast: "Feast", dating: "Dating" }

export const PAYMENTS_APPLICATION_KEYS = PAYMENTS_CONFINABLE.map((c) => c.application)

export function paymentsApplicationLabel(key: string): string {
  return APPLICATION_LABELS[key] ?? key
}

export const APPLICATION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/

export type PaymentsScope = { kind: "all" } | { kind: "confined"; applications: string[] } | { kind: "none" }

/** Holds payments permissions of its own, not confined to a product app. */
function holdsPaymentsDirectly(me: AdminMe): boolean {
  return (me.apps.payments?.length ?? 0) > 0 || me.platform.some((p) => p === "*" || p.startsWith("*:") || p.startsWith("payments:"))
}

/**
 * @param navApplications the `applications` on the Payments navigation entry,
 *   when the server sent one; the confinement is never wider than both it and
 *   the permissions agree on.
 */
export function paymentsScope(me: AdminMe, navApplications?: string[]): PaymentsScope {
  if (holdsPaymentsDirectly(me)) return { kind: "all" }
  let applications: string[] = PAYMENTS_CONFINABLE.filter(({ app }) => (me.apps[app] ?? []).some((p) => p.startsWith(`${app}:payments_`))).map(
    (c) => c.application,
  )
  if (navApplications) applications = applications.filter((a) => navApplications.includes(a))
  return applications.length > 0 ? { kind: "confined", applications } : { kind: "none" }
}

/**
 * The application a page starts on: "" (all applications) for an unconfined
 * admin, the one application for a single confinement, and null when the
 * admin must choose first.
 */
export function initialApplication(scope: PaymentsScope): string | null {
  if (scope.kind === "all") return ""
  if (scope.kind === "confined" && scope.applications.length === 1) return scope.applications[0]
  return null
}

export interface ApplicationChoice {
  value: string
  label: string
}

/** The picker's options, or null when there is no picker (a fixed application, or no access). */
export function applicationChoices(scope: PaymentsScope): ApplicationChoice[] | null {
  if (scope.kind === "all") {
    return [{ value: "", label: "All applications" }, ...PAYMENTS_APPLICATION_KEYS.map((k) => ({ value: k, label: paymentsApplicationLabel(k) }))]
  }
  if (scope.kind === "confined" && scope.applications.length > 1) {
    return scope.applications.map((k) => ({ value: k, label: paymentsApplicationLabel(k) }))
  }
  return null
}

/** A picked application, if this admin may look at it; otherwise null (never widened). */
export function acceptApplication(scope: PaymentsScope, requested: string): string | null {
  if (scope.kind === "all") return requested === "" || APPLICATION_KEY_PATTERN.test(requested) ? requested : null
  if (scope.kind === "confined") return scope.applications.includes(requested) ? requested : null
  return null
}

/**
 * Does the admin hold this payments action for this application?
 * `application` is "" for all applications, null when none is chosen yet.
 */
export function paymentsCan(me: AdminMe, scope: PaymentsScope, application: string | null, action: string): boolean {
  if (scope.kind === "all") return hasPermission(me, "payments", action)
  if (scope.kind !== "confined" || !application || !scope.applications.includes(application)) return false
  const product = PAYMENTS_CONFINABLE.find((c) => c.application === application)
  return !!product && hasPermission(me, product.app, `payments_${action}`)
}

/**
 * The Payments tabs this admin may open for the chosen application. Nothing
 * while a confined admin with several applications has not chosen one.
 */
export function visiblePaymentsSections<S extends { anyOf: readonly string[] }>(
  me: AdminMe,
  scope: PaymentsScope,
  application: string | null,
  sections: readonly S[],
): S[] {
  return sections.filter((s) => s.anyOf.some((action) => paymentsCan(me, scope, application, action)))
}

/** `?application_id=feast&limit=50`: empty values are left out. */
export function paymentsQuery(application: string | null, extra: Record<string, string | number | null | undefined> = {}): string {
  const params = new URLSearchParams()
  if (application) params.set("application_id", application)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined && String(value) !== "") params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

// ---------------------------------------------------------------------------
// Refund resolve
// ---------------------------------------------------------------------------

export type Resolution = "refunded_manually" | "written_off" | "test_data"

export const RESOLUTIONS: readonly { value: Resolution; label: string; explain: string; destructive?: boolean }[] = [
  {
    value: "refunded_manually",
    label: "Refunded manually",
    explain: "The customer was paid back outside the provider (a bank transfer, say). This records the refund as done and stops the retries; it moves no money itself.",
  },
  {
    value: "written_off",
    label: "Written off",
    explain: "The refund will not be paid through the provider and the retries stop. Use it when the money cannot or should not be returned.",
    destructive: true,
  },
  {
    value: "test_data",
    label: "Test data",
    explain: "A test or fixture payment with no real money behind it. Needs a fresh 2FA code, never a second approver.",
  },
]

/**
 * refunded_manually and written_off always wait for a second approver,
 * whatever the amount (there is no threshold). test_data never does.
 */
export function resolveNeedsSecondApprover(resolution: Resolution): boolean {
  return resolution !== "test_data"
}

/** What to tell the admin before a resolve is sent: the amount when known, then the rule. */
export function resolveHint(resolution: Resolution, amountPaise: number | null = null): string {
  if (resolution === "test_data") return "Test data moves no money: it is resolved once you confirm with 2FA."
  return amountPaise === null ? REFUND_SECOND_APPROVER_NOTE : `${formatPaise(amountPaise)}. ${REFUND_SECOND_APPROVER_NOTE}`
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export const PAYMENTS_METRICS: readonly { key: string; label: string; kind?: "paise"; alert?: "bad" | "warn" }[] = [
  { key: "refunds_needing_attention", label: "Refunds needing attention", alert: "bad" },
  { key: "stuck_intents", label: "Stuck intents", alert: "warn" },
  { key: "refund_failed_alerts_open", label: "Refunds retrying after failure", alert: "warn" },
  { key: "failed_payments_24h", label: "Failed payments, 24 h" },
  { key: "captured_today_minor", label: "Captured today", kind: "paise" },
]

function tiles(counts: unknown, limit?: number): MoneyTile[] {
  const body = isRecord(counts) ? counts : null
  return PAYMENTS_METRICS.slice(0, limit).map((m) => {
    const n = body ? num(body[m.key]) : null
    if (n === null) return { key: m.key, label: m.label, display: "unavailable", tone: "unknown" }
    return {
      key: m.key,
      label: m.label,
      display: m.kind === "paise" ? formatPaise(n) : n.toLocaleString("en-IN"),
      tone: n > 0 && m.alert ? m.alert : "normal",
    }
  })
}

export interface PaymentsStatsView extends MoneyStatsView {
  /** Per application, for an "all applications" view. */
  applications: { key: string; label: string; tiles: MoneyTile[] }[]
}

/**
 * @param application "" for every application (the total first, then each),
 *   or one application key (its own counts only).
 */
export function paymentsStatsView(result: StatsResult, application: string, limit?: number): PaymentsStatsView {
  const empty = (display: string): MoneyTile[] => PAYMENTS_METRICS.slice(0, limit).map((m) => ({ key: m.key, label: m.label, display, tone: "unknown" }))
  if (result.status === "loading") return { state: "loading", message: null, generatedAt: null, tiles: empty("…"), applications: [] }
  const body = result.status === "ok" ? readObject(result.raw) : null
  if (!body) {
    const message = result.status === "error" ? result.message : "The stats answer could not be read."
    return { state: "unavailable", message, generatedAt: null, tiles: empty("unavailable"), applications: [] }
  }
  const perApp = isRecord(body.applications) ? body.applications : {}
  const own = application ? perApp[application] : body.total
  return {
    state: "ok",
    message: null,
    generatedAt: null,
    tiles: tiles(own, limit),
    applications: application
      ? []
      : Object.keys(perApp)
          .sort()
          .map((key) => ({ key, label: paymentsApplicationLabel(key), tiles: tiles(perApp[key], limit) })),
  }
}
