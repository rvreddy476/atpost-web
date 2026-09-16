/**
 * Every application the console knows how to host, in the order the founder
 * asked for them (live pilots, then money, then content apps, then Mopedu,
 * with the platform-wide areas last).
 *
 * This list does NOT decide who sees what. `GET /v1/admin/me` does, and
 * ./nav.ts only ever shows an app that is both in the server's `nav` and holds
 * at least one permission. The list exists for three narrower reasons:
 *
 *   · an app id becomes a URL segment (`/dating`), so only ids known here are
 *     accepted — a server bug cannot mint a route that shadows `/approvals`;
 *   · a label the server leaves out still has a sensible fallback;
 *   · the order of the rail is stable whatever order the server sends.
 */
export const ADMIN_APPS = [
  { id: "dating", label: "Dating" },
  { id: "food", label: "Feast" },
  { id: "commerce", label: "MStore" },
  { id: "monetization", label: "Monetization" },
  { id: "payments", label: "Payments" },
  { id: "wallet", label: "Wallet" },
  { id: "social", label: "Social" },
  { id: "tube", label: "Tube" },
  { id: "qa", label: "Q&A" },
  { id: "chat", label: "Chat" },
  { id: "rider", label: "Mopedu" },
  { id: "trust_safety", label: "Trust & safety" },
  { id: "platform", label: "Platform" },
] as const

export type AdminAppId = (typeof ADMIN_APPS)[number]["id"]

const BY_ID = new Map<string, (typeof ADMIN_APPS)[number]>(ADMIN_APPS.map((app) => [app.id, app]))

export function isAdminAppId(value: unknown): value is AdminAppId {
  return typeof value === "string" && BY_ID.has(value)
}

export function adminAppLabel(id: AdminAppId): string {
  return BY_ID.get(id)?.label ?? id
}

/** The console URL of an application's dashboard. Trust & safety lives at /trust. */
export function appHref(id: AdminAppId): string {
  return id === "trust_safety" ? "/trust" : `/${id}`
}

export function adminAppOrder(id: AdminAppId): number {
  return ADMIN_APPS.findIndex((app) => app.id === id)
}

/**
 * The commerce screens that predate the console. They keep their URLs — the
 * catalogue editor links between its own pages and the existing specs drive
 * them there — and appear under MStore in the rail.
 */
export const COMMERCE_LEGACY_SECTIONS = [
  { id: "catalogue", label: "Catalogue", href: "/catalogue" },
  { id: "sellers", label: "Sellers", href: "/sellers" },
  { id: "products", label: "Products", href: "/products" },
  { id: "payouts", label: "Payouts", href: "/payouts" },
] as const
