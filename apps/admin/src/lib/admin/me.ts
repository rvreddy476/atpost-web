import { COMMERCE_LEGACY_SECTIONS, adminAppLabel, adminAppOrder, appHref, isAdminAppId, type AdminAppId } from "./apps"

/**
 * `GET /v1/admin/me`, as admin-service answers it (inside `{data: ...}`):
 *
 *   { user_id,
 *     permissions: { platform: ["platform:…", "*:audit.read"],
 *                    apps: { commerce: ["commerce:seller.approve"] } },
 *     mfa: { required, verified, auth_time },
 *     step_up_valid_until: null | time, step_up_window_seconds: 300,
 *     navigation: [{ app, label }] }
 *
 * The parser is unforgiving in one direction only: anything it cannot read
 * becomes "no access", never "access". A missing `mfa` block counts as
 * required-and-unverified, a malformed permission list as empty, an unknown
 * app id as absent. `/me` is the one admin route that answers without MFA, so
 * the console must do that check itself before showing anything.
 */
export interface AdminMe {
  userId: string
  mfa: { required: boolean; verified: boolean; authTime: number | null }
  /** Epoch milliseconds, or null when no step-up window is open. */
  stepUpValidUntil: number | null
  stepUpWindowSeconds: number
  platform: string[]
  apps: Partial<Record<AdminAppId, string[]>>
  navigation: AdminNavEntry[]
}

export interface AdminNavEntry {
  app: AdminAppId
  label: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : []

export function readTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Seconds or milliseconds; nothing in this decade is below 10^11 ms.
    return value < 1e11 ? value * 1000 : value
  }
  if (typeof value === "string" && value) {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

/** Accepts the `{data: ...}` envelope or the bare object. */
export function parseAdminMe(raw: unknown): AdminMe | null {
  const body = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  if (!isRecord(body)) return null
  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!userId) return null

  const permissions = isRecord(body.permissions) ? body.permissions : {}
  const apps: Partial<Record<AdminAppId, string[]>> = {}
  if (isRecord(permissions.apps)) {
    for (const [app, perms] of Object.entries(permissions.apps)) {
      if (isAdminAppId(app)) apps[app] = strings(perms)
    }
  }

  const navigation: AdminNavEntry[] = []
  if (Array.isArray(body.navigation)) {
    for (const item of body.navigation) {
      if (!isRecord(item) || !isAdminAppId(item.app)) continue
      if (navigation.some((entry) => entry.app === item.app)) continue
      const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : adminAppLabel(item.app)
      navigation.push({ app: item.app, label })
    }
  }

  const mfa = isRecord(body.mfa) ? body.mfa : {}
  const window = typeof body.step_up_window_seconds === "number" && body.step_up_window_seconds > 0 ? body.step_up_window_seconds : 300

  return {
    userId,
    mfa: {
      // Absent means required: an admin console never assumes 2FA is optional.
      required: mfa.required !== false,
      verified: mfa.verified === true,
      authTime: readTime(mfa.auth_time),
    },
    stepUpValidUntil: readTime(body.step_up_valid_until),
    stepUpWindowSeconds: window,
    platform: strings(permissions.platform),
    apps,
    navigation,
  }
}

/**
 * `admin.mfa_enrolled` from identity's `GET /v1/auth/me/capabilities`: true,
 * false, or null when the answer does not say (then both next steps are shown).
 */
export function readMfaEnrolled(raw: unknown): boolean | null {
  const body = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  if (!isRecord(body) || !isRecord(body.admin)) return null
  return typeof body.admin.mfa_enrolled === "boolean" ? body.admin.mfa_enrolled : null
}

/** The console stays closed while this is true. */
export function mfaBlocks(me: AdminMe): boolean {
  return me.mfa.required && !me.mfa.verified
}

/** Permissions arrive qualified (`commerce:seller.approve`); `*:x` spans apps. */
function covers(perm: string, app: AdminAppId, action?: string): boolean {
  const colon = perm.indexOf(":")
  const scope = colon === -1 ? "" : perm.slice(0, colon)
  const act = colon === -1 ? perm : perm.slice(colon + 1)
  if (perm === "*") return true
  if (scope !== "*" && scope !== app) return false
  return action === undefined || act === action || act === "*"
}

/** Does this admin hold at least one permission for the app? */
export function hasAppAccess(me: AdminMe, app: AdminAppId): boolean {
  if (app === "platform") return me.platform.length > 0
  if ((me.apps[app]?.length ?? 0) > 0) return true
  return me.platform.some((perm) => perm === "*" || perm.startsWith("*:"))
}

/** `hasPermission(me, "commerce", "seller.approve")`. */
export function hasPermission(me: AdminMe, app: AdminAppId, action: string): boolean {
  const scoped = (me.apps[app] ?? []).some((perm) => covers(perm, app, action) || perm === action)
  return scoped || me.platform.some((perm) => covers(perm, app, action))
}

export interface NavLink {
  id: string
  label: string
  href: string
}

export interface NavGroup {
  app: AdminAppId
  label: string
  href: string
  links: NavLink[]
}

export interface AdminNavModel {
  apps: NavGroup[]
  /** Console-wide pages beneath the apps. */
  console: NavLink[]
}

/**
 * Sections are derived here until admin-service sends them. Only MStore has
 * screens today; every other app is its dashboard placeholder for Wave 2.
 */
function sectionsFor(me: AdminMe, app: AdminAppId): NavLink[] {
  if (app !== "commerce") return []
  const need: Record<string, string[]> = {
    catalogue: ["catalogue.edit"],
    sellers: ["sellers.read", "seller.approve"],
    products: ["products.moderate"],
    payouts: ["payouts.read"],
  }
  return COMMERCE_LEGACY_SECTIONS.filter((s) => need[s.id].some((action) => hasPermission(me, "commerce", action))).map((s) => ({
    id: s.id,
    label: s.label,
    href: s.href,
  }))
}

/**
 * The left rail, built ONLY from the server's `navigation`, then filtered
 * again against the permissions in the same answer. Both must agree: a
 * navigation entry for an app with no permission is a server bug that must
 * not become a link.
 */
export function buildAdminNav(me: AdminMe): AdminNavModel {
  const apps = me.navigation
    .filter((entry) => hasAppAccess(me, entry.app))
    .sort((a, b) => adminAppOrder(a.app) - adminAppOrder(b.app))
    .map<NavGroup>((entry) => ({
      app: entry.app,
      label: entry.label,
      href: appHref(entry.app),
      links: sectionsFor(me, entry.app),
    }))

  const all = [...me.platform, ...Object.values(me.apps).flatMap((perms) => perms ?? [])]
  const console: NavLink[] = []
  if (all.length > 0) console.push({ id: "approvals", label: "Approvals", href: "/approvals" })
  if (me.platform.some((perm) => perm === "*" || perm.startsWith("platform:"))) {
    console.push({ id: "access", label: "Access", href: "/access" })
  }
  if (all.some((perm) => perm === "*" || perm.endsWith(":audit.read"))) {
    console.push({ id: "audit", label: "Audit", href: "/audit" })
  }
  return { apps, console }
}

/** The nav group an app route belongs to, or null when the admin may not see it. */
export function findNavGroup(model: AdminNavModel, app: string): NavGroup | null {
  return model.apps.find((group) => group.app === app) ?? null
}
