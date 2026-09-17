import { checkReason, type ReasonCheck } from "../blocks/confirm"
import { isRecord, isUuid, num, readList, readObject, str, unwrap, type Row } from "./data"
import { hasPermission, type AdminMe } from "./me"
import { visibleSections, type SectionDef } from "./sections"

/**
 * The Access page's rules: who may see which tab, how the catalogue and the
 * holders list are read (leniently: render what is present), and what a
 * grant must carry before it is sent.
 *
 * admin-service `/v1/admin/access/*` is the source of truth. Granting or
 * revoking `superadmin` may answer 202: it then waits for a second approver,
 * and the console must say so rather than report it done.
 */

export const ACCESS = "/v1/admin/access"

export const ACCESS_PERMISSIONS = {
  read: "roles.read",
  manage: "roles.manage",
  revokeSessions: "sessions.revoke",
  search: "users.search",
} as const

export type AccessPermission = keyof typeof ACCESS_PERMISSIONS

/** Every Access permission is platform-scoped: `platform:roles.read`. */
export function accessCan(me: AdminMe, key: AccessPermission): boolean {
  return hasPermission(me, "platform", ACCESS_PERMISSIONS[key])
}

export const ACCESS_TABS = [
  { id: "holders", label: "Holders", anyOf: ["roles.read"] },
  { id: "grant", label: "Grant", anyOf: ["roles.manage"] },
  { id: "audit", label: "Audit", anyOf: ["roles.read"] },
] as const satisfies readonly SectionDef[]

export function accessTabs(me: AdminMe) {
  return visibleSections(me, "platform", ACCESS_TABS)
}

export const SUPERADMIN = "superadmin"
export const ACCESS_PAGE = 50

// ---------------------------------------------------------------------------
// Never an unmasked email
// ---------------------------------------------------------------------------

/**
 * `email_masked` as the server sends it, masked once more here if it still
 * reads like a full address: the console never shows one, whatever arrives.
 */
export function maskEmail(value: unknown): string | null {
  const s = str(value)
  if (!s) return null
  const at = s.indexOf("@")
  if (at === -1) return s
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  if (/[*•]/.test(local) || local.length <= 1) return s
  return `${local[0]}***@${domain}`
}

// ---------------------------------------------------------------------------
// Holders
// ---------------------------------------------------------------------------

export interface Holder {
  userId: string
  role: string
  /** null = platform-wide. */
  app: string | null
  expiresAt: string | null
  reason: string | null
  grantedBy: string | null
  grantedAt: string | null
  /** null when the server did not say. */
  mfaEnrolled: boolean | null
  /** Granted by the deployment's configuration; cannot be revoked here. */
  env: boolean
  raw: Row
}

export type HolderState = "active" | "expired" | "inactive"

function readHolder(row: Row, env: boolean): Holder | null {
  const userId = str(row.user_id)
  const role = str(row.role)
  if (!userId || !role) return null
  return {
    userId,
    role,
    app: str(row.app),
    expiresAt: str(row.expires_at),
    reason: str(row.reason),
    grantedBy: str(row.granted_by),
    grantedAt: str(row.granted_at),
    mfaEnrolled: typeof row.mfa_enrolled === "boolean" ? row.mfa_enrolled : null,
    env,
    raw: row,
  }
}

/** `{holders, env_holders, limit, offset}`; a malformed row is dropped, never shown half-read. */
export function readHolders(raw: unknown): { holders: Holder[]; envHolders: Holder[]; limit: number; offset: number } {
  const body = readObject(raw)
  const holders = readList(raw, ["holders", "items"]).flatMap((row) => readHolder(row, false) ?? [])
  const envHolders = (body && Array.isArray(body.env_holders) ? body.env_holders.filter(isRecord) : []).flatMap((row) => readHolder(row, true) ?? [])
  return { holders, envHolders, limit: num(body?.limit) ?? ACCESS_PAGE, offset: num(body?.offset) ?? 0 }
}

/** Expired when `expires_at` has passed; inactive when the server says `active: false`; else active. */
export function holderState(holder: Holder, now = Date.now()): HolderState {
  const expires = holder.expiresAt ? Date.parse(holder.expiresAt) : NaN
  if (!Number.isNaN(expires) && expires <= now) return "expired"
  if (holder.raw.active === false) return "inactive"
  return "active"
}

/** `?role=&app=&limit=&offset=`. "platform" as the app filter means platform-wide grants. */
export function holdersQuery(filter: { role: string; app: string }, offset = 0, limit = ACCESS_PAGE): string {
  const q = new URLSearchParams()
  if (/^[a-z][a-z0-9_]{0,39}$/.test(filter.role)) q.set("role", filter.role)
  if (/^[a-z][a-z0-9_]{0,39}$/.test(filter.app)) q.set("app", filter.app)
  q.set("limit", String(limit))
  q.set("offset", String(offset))
  return q.toString()
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface RoleDef {
  name: string
  label: string
  description: string | null
  /** Cannot be scoped to one application. */
  platformOnly: boolean
}

export interface Catalogue {
  roles: RoleDef[]
  apps: { id: string; label: string }[]
  /** `permissions[role][app | "platform"]`. */
  permissions: Record<string, Record<string, string[]>>
}

export const EMPTY_CATALOGUE: Catalogue = { roles: [], apps: [], permissions: {} }

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [])

const label = (name: string) => name.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())

/**
 * Reads the catalogue whatever its exact shape: roles and apps as strings or
 * as objects with a name (`name`, `id` or `role`/`app`), permissions as
 * `{role: {app: [...]}}` or, flat, `{role: [...]}` (then platform-wide). A
 * role is platform-only when it says so (`platform_only`, `scopable: false`,
 * `scope: "platform"`) or when its permissions name no application.
 */
export function readCatalogue(raw: unknown): Catalogue {
  const body = readObject(raw)
  if (!body) return EMPTY_CATALOGUE

  const permissions: Record<string, Record<string, string[]>> = {}
  if (isRecord(body.permissions)) {
    for (const [role, scopes] of Object.entries(body.permissions)) {
      if (Array.isArray(scopes)) permissions[role] = { platform: strings(scopes) }
      else if (isRecord(scopes)) {
        permissions[role] = {}
        for (const [scope, perms] of Object.entries(scopes)) permissions[role][scope] = strings(perms)
      }
    }
  }

  const roles: RoleDef[] = []
  const rawRoles = Array.isArray(body.roles) ? body.roles : isRecord(body.roles) ? Object.keys(body.roles) : []
  for (const item of rawRoles) {
    const rec = isRecord(item) ? item : null
    const name = typeof item === "string" ? item : rec ? (str(rec.name) ?? str(rec.id) ?? str(rec.role)) : null
    if (!name || roles.some((r) => r.name === name)) continue
    const explicit = rec ? (rec.platform_only === true || rec.scopable === false || rec.scope === "platform" ? true : rec.platform_only === false || rec.scopable === true ? false : null) : null
    const scopes = Object.keys(permissions[name] ?? {})
    const derived = scopes.length > 0 && scopes.every((s) => s === "platform" || s === "*")
    roles.push({ name, label: (rec && str(rec.label)) ?? label(name), description: rec ? str(rec.description) : null, platformOnly: explicit ?? derived })
  }

  const apps: { id: string; label: string }[] = []
  const rawApps = Array.isArray(body.apps) ? body.apps : isRecord(body.apps) ? Object.keys(body.apps) : []
  for (const item of rawApps) {
    const rec = isRecord(item) ? item : null
    const id = typeof item === "string" ? item : rec ? (str(rec.id) ?? str(rec.name) ?? str(rec.app)) : null
    if (!id || id === "platform" || apps.some((a) => a.id === id)) continue
    apps.push({ id, label: (rec && str(rec.label)) ?? label(id) })
  }

  return { roles, apps, permissions }
}

export function findRole(catalogue: Catalogue, name: string): RoleDef | null {
  return catalogue.roles.find((r) => r.name === name) ?? null
}

/**
 * The permissions a role gets in one application (or platform-wide), for
 * the preview before confirming. `known` is false when the catalogue says
 * nothing about that role at all.
 */
export function permissionPreview(catalogue: Catalogue, role: string, app: string | null): { permissions: string[]; known: boolean } {
  const scopes = catalogue.permissions[role]
  if (!scopes) return { permissions: [], known: false }
  const scope = app ?? "platform"
  const perms = scopes[scope] ?? scopes["*"] ?? []
  return { permissions: [...perms].sort(), known: true }
}

// ---------------------------------------------------------------------------
// The grant form
// ---------------------------------------------------------------------------

export interface GrantForm {
  userId: string
  role: string
  /** "" = platform-wide. */
  app: string
  /** A `datetime-local` value, or "". */
  expiresAt: string
  reason: string
}

export const EMPTY_GRANT: GrantForm = { userId: "", role: "", app: "", expiresAt: "", reason: "" }

export type GrantField = keyof GrantForm

export interface GrantBody {
  role: string
  app: string | null
  expires_at: string | null
  reason: string
}

/** Blank is refused, and so is a reason under ten characters: the audit row must say why. */
export function checkGrantReason(reason: string): ReasonCheck {
  return checkReason(reason, { destructive: false, required: true })
}

/**
 * Checks the form before anything is sent. The user must be an id, the
 * role one the catalogue lists (when it lists any), the application
 * required unless the role is platform-only (and refused when it is), the
 * expiry — if given — in the future, the reason present.
 */
export function checkGrant(form: GrantForm, catalogue: Catalogue, now = Date.now()): { ok: true; body: GrantBody } | { ok: false; problems: Partial<Record<GrantField, string>> } {
  const problems: Partial<Record<GrantField, string>> = {}
  if (!isUuid(form.userId)) problems.userId = "Pick a user first."
  const role = findRole(catalogue, form.role)
  if (!form.role.trim()) problems.role = "Choose a role."
  else if (catalogue.roles.length > 0 && !role) problems.role = "That role is not in the catalogue."
  const platformOnly = role?.platformOnly ?? false
  if (platformOnly && form.app) problems.app = "This role is platform-wide only."
  else if (!platformOnly && form.role.trim() && !form.app) problems.app = "Choose the application this role is for."
  else if (form.app && catalogue.apps.length > 0 && !catalogue.apps.some((a) => a.id === form.app)) problems.app = "That application is not one roles can be scoped to."
  let expiresAt: string | null = null
  if (form.expiresAt.trim()) {
    const ms = Date.parse(form.expiresAt)
    if (Number.isNaN(ms)) problems.expiresAt = "The expiry is not a date and time."
    else if (ms <= now) problems.expiresAt = "The expiry must be in the future."
    else expiresAt = new Date(ms).toISOString()
  }
  const reason = checkGrantReason(form.reason)
  if (!reason.ok) problems.reason = reason.message ?? "A reason is required."
  if (Object.keys(problems).length > 0) return { ok: false, problems }
  return { ok: true, body: { role: form.role.trim(), app: form.app || null, expires_at: expiresAt, reason: form.reason.trim() } }
}

/** The line shown before a super-admin grant or revocation is confirmed. */
export function secondApproverNote(role: string): string | null {
  return role === SUPERADMIN ? "Super-admin changes need a second approver: this will be sent for approval, not applied at once." : null
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AccessAuditFilter {
  actor: string
  target: string
  action: string
  from: string
  to: string
}

export const EMPTY_ACCESS_AUDIT: AccessAuditFilter = { actor: "", target: "", action: "", from: "", to: "" }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const IST = "+05:30"

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function accessAuditProblem(filter: AccessAuditFilter): string | null {
  if (filter.actor.trim() && !isUuid(filter.actor)) return "Actor must be a full user id."
  if (filter.target.trim() && !isUuid(filter.target)) return "Target must be a full user id."
  if (filter.from && filter.to && filter.from > filter.to) return "The start date is after the end date."
  return null
}

/** `?actor=&target=&action=&from=&to=&limit=&offset=`; whole days in India time, as the console audit page does. */
export function accessAuditQuery(filter: AccessAuditFilter, offset = 0, limit = ACCESS_PAGE): string {
  const q = new URLSearchParams()
  if (isUuid(filter.actor)) q.set("actor", filter.actor.trim().toLowerCase())
  if (isUuid(filter.target)) q.set("target", filter.target.trim().toLowerCase())
  const action = filter.action.trim()
  if (action && action.length <= 120) q.set("action", action)
  if (DAY.test(filter.from)) q.set("from", `${filter.from}T00:00:00${IST}`)
  if (DAY.test(filter.to)) q.set("to", `${nextDay(filter.to)}T00:00:00${IST}`)
  q.set("limit", String(limit))
  q.set("offset", String(offset))
  return q.toString()
}

// ---------------------------------------------------------------------------
// User search
// ---------------------------------------------------------------------------

export interface UserMatch {
  userId: string
  handle: string | null
  emailMasked: string | null
}

/** `{results: [{user_id, email_masked, handle}]}`, every email masked once more. */
export function readUserMatches(raw: unknown): UserMatch[] {
  const body = unwrap(raw)
  const list = isRecord(body) && Array.isArray(body.results) ? body.results : Array.isArray(body) ? body : []
  return list.filter(isRecord).flatMap((row) => {
    const userId = str(row.user_id)
    return userId ? [{ userId, handle: str(row.handle), emailMasked: maskEmail(row.email_masked) }] : []
  })
}
