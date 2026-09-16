import type { AdminAppId } from "./apps"
import { hasPermission, type AdminMe } from "./me"

/**
 * Which parts of each application's dashboard an admin may see.
 *
 * A section is shown when the admin holds ANY of its permissions (a read, or
 * the action that implies reading the queue). The names are admin-service's
 * route table, which is the source of truth; a section the server would refuse
 * is never rendered. Actions inside a section check their own permission with
 * `can()`, so a reader sees the queue without the buttons.
 */
export interface SectionDef {
  id: string
  label: string
  /** Actions (without the app prefix); holding any one shows the section. */
  anyOf: readonly string[]
}

export const STATS_PERMISSION = "stats.read"

export const DATING_SECTIONS = [
  { id: "reports", label: "Reports", anyOf: ["reports.read"] },
  { id: "photos", label: "Photos pending", anyOf: ["photos.review"] },
  { id: "selfies", label: "Selfie review", anyOf: ["selfie.review"] },
  { id: "panic", label: "Panic", anyOf: ["panic.read"] },
  { id: "risk", label: "Risk", anyOf: ["risk.read"] },
  { id: "audit", label: "Audit", anyOf: ["audit.read"] },
] as const satisfies readonly SectionDef[]

export const FOOD_SECTIONS = [
  { id: "approvals", label: "Approvals", anyOf: ["restaurant.approve", "delivery_partner.approve", "documents.review"] },
  { id: "orders", label: "Orders", anyOf: ["orders.read"] },
  { id: "refunds", label: "Refunds", anyOf: ["refunds.read", "refund.issue"] },
  { id: "settlements", label: "Settlements", anyOf: ["settlement.read", "settlement.generate", "settlement.mark_paid"] },
  { id: "moderation", label: "Moderation", anyOf: ["menu.moderate", "reviews.moderate"] },
  { id: "tickets", label: "Tickets", anyOf: ["tickets.act"] },
  { id: "coupons", label: "Coupons", anyOf: ["coupons.manage"] },
  { id: "service-areas", label: "Service areas", anyOf: ["service_areas.manage"] },
  { id: "reports", label: "Reports", anyOf: ["reports.read", "fraud.read"] },
  { id: "audit", label: "Audit", anyOf: ["audit.read"] },
] as const satisfies readonly SectionDef[]

export const TRUST_SECTIONS = [
  { id: "reports", label: "Reports", anyOf: ["reports.read", "reports.act"] },
  { id: "appeals", label: "Appeals", anyOf: ["appeals.read", "appeals.act"] },
  { id: "grievances", label: "Grievances", anyOf: ["grievances.read", "grievances.act"] },
  { id: "strikes", label: "Strikes", anyOf: ["strikes.read", "strikes.manage"] },
  { id: "verification", label: "Verification requests", anyOf: ["verification.review"] },
  { id: "media-labels", label: "Media labels", anyOf: ["media_labels.read"] },
  { id: "keyword-filters", label: "Keyword filters", anyOf: ["keyword_filters.read"] },
] as const satisfies readonly SectionDef[]

/** MStore sections on its own dashboard page; the older screens keep their URLs (apps.ts). */
export const COMMERCE_SECTIONS = [
  { id: "banners", label: "Banners", anyOf: ["banners.edit"] },
  { id: "jobs", label: "Dead-letter jobs", anyOf: ["jobs.read"] },
  { id: "compliance", label: "Compliance gaps", anyOf: ["compliance.read", "compliance.sweep"] },
  { id: "cod", label: "COD settlement", anyOf: ["cod.settle"] },
] as const satisfies readonly SectionDef[]

export const MONETIZATION_SECTIONS = [
  { id: "fraud", label: "Fraud reviews", anyOf: ["fraud.review"] },
  { id: "wallets", label: "Wallets", anyOf: ["wallet.freeze", "wallet.unfreeze", "wallet.rebuild"] },
  { id: "fund", label: "Creator fund", anyOf: ["fund.read", "fund.rates", "fund.budget", "fund.settle", "fund.reverse"] },
  { id: "creators", label: "Creators", anyOf: ["creators.suspend"] },
  { id: "disputes", label: "Disputes", anyOf: ["disputes.read", "disputes.act"] },
  { id: "refunds", label: "Refunds", anyOf: ["refund.issue"] },
  { id: "payouts", label: "Payout requests", anyOf: ["payouts.read"] },
  { id: "audit", label: "Audit", anyOf: ["audit.read"] },
] as const satisfies readonly SectionDef[]

/**
 * Payments sections. The actions are checked through payments.ts
 * `paymentsCan`, which also admits a confined `<app>:payments_<action>`.
 */
export const PAYMENTS_SECTIONS = [
  { id: "refunds", label: "Refunds needing attention", anyOf: ["refunds.read", "refund.issue"] },
  { id: "intents", label: "Intents", anyOf: ["intents.read"] },
  { id: "reconciliation", label: "Reconciliation", anyOf: ["reconciliation.read"] },
  { id: "applications", label: "Applications", anyOf: ["applications.read", "applications.manage"] },
  { id: "audit", label: "Audit", anyOf: ["audit.read"] },
] as const satisfies readonly SectionDef[]

export function can(me: AdminMe, app: AdminAppId, action: string): boolean {
  return hasPermission(me, app, action)
}

export function canAny(me: AdminMe, app: AdminAppId, actions: readonly string[]): boolean {
  return actions.some((action) => hasPermission(me, app, action))
}

export function visibleSections<S extends SectionDef>(me: AdminMe, app: AdminAppId, sections: readonly S[]): S[] {
  return sections.filter((section) => canAny(me, app, section.anyOf))
}

/** The overview and each dashboard header read `/<app>/stats` only with this permission. */
export function canReadStats(me: AdminMe, app: AdminAppId): boolean {
  return hasPermission(me, app, STATS_PERMISSION)
}

/** admin-service's prefix for an application's routes. */
export function adminPrefix(app: "dating" | "food" | "commerce" | "trust_safety"): string {
  return app === "trust_safety" ? "/v1/admin/trust" : `/v1/admin/${app}`
}
