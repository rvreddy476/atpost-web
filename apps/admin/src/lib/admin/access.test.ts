import { describe, expect, it } from "vitest"
import {
  ACCESS_TABS,
  EMPTY_GRANT,
  accessAuditQuery,
  accessCan,
  accessTabs,
  checkGrant,
  holderState,
  holdersQuery,
  maskEmail,
  permissionPreview,
  readCatalogue,
  readHolders,
  readUserMatches,
  secondApproverNote,
  type Catalogue,
} from "./access"
import { ADMIN_APPS } from "./apps"
import { buildAdminNav, parseAdminMe } from "./me"
import { adminErrorMessage } from "./mutation"

const navigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me(platform: string[], apps: Record<string, string[]> = {}) {
  const parsed = parseAdminMe({ data: { user_id: "u-1", permissions: { platform, apps }, mfa: { required: true, verified: true }, navigation } })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const USER = "22222222-2222-4222-8222-222222222222"

const CATALOGUE: Catalogue = readCatalogue({
  data: {
    roles: [
      { name: "superadmin", label: "Super-admin", platform_only: true },
      { name: "admin", scopable: true },
      "moderator",
      { name: "auditor", description: "Read-only audit trails" },
    ],
    apps: ["dating", { id: "food", label: "Feast" }, "commerce"],
    permissions: {
      superadmin: { platform: ["*"] },
      admin: { dating: ["dating:*"], food: ["food:*"] },
      moderator: { dating: ["dating:reports.act", "dating:photos.review"], "*": ["reports.read"] },
      auditor: ["*:audit.read"],
    },
  },
})

describe("Access tabs per platform permission", () => {
  it("the shell shows Access for any platform permission; the tabs need roles.read and roles.manage", () => {
    const reader = me(["platform:roles.read"])
    expect(buildAdminNav(reader).console.some((l) => l.id === "access")).toBe(true)
    expect(accessTabs(reader).map((t) => t.id)).toEqual(["holders", "audit"])
    expect(accessCan(reader, "manage")).toBe(false)
    const manager = me(["platform:roles.manage", "platform:users.search"])
    expect(accessTabs(manager).map((t) => t.id)).toEqual(["grant"])
    expect(accessCan(manager, "search")).toBe(true)
    expect(accessCan(manager, "revokeSessions")).toBe(false)
    const other = me(["platform:sessions.revoke"])
    expect(buildAdminNav(other).console.some((l) => l.id === "access")).toBe(true)
    expect(accessTabs(other)).toEqual([])
    expect(accessTabs(me([], { dating: ["dating:reports.act"] }))).toEqual([])
    expect(accessTabs(me(["*"])).map((t) => t.id)).toEqual(ACCESS_TABS.map((t) => t.id))
  })
})

describe("the catalogue, read leniently", () => {
  it("reads roles as strings or objects, apps likewise, and flat or nested permissions", () => {
    expect(CATALOGUE.roles.map((r) => r.name)).toEqual(["superadmin", "admin", "moderator", "auditor"])
    expect(CATALOGUE.roles.find((r) => r.name === "superadmin")).toMatchObject({ label: "Super-admin", platformOnly: true })
    expect(CATALOGUE.roles.find((r) => r.name === "admin")?.platformOnly).toBe(false)
    expect(CATALOGUE.roles.find((r) => r.name === "moderator")?.platformOnly).toBe(false)
    // Derived: its permissions name no application.
    expect(CATALOGUE.roles.find((r) => r.name === "auditor")).toMatchObject({ platformOnly: true, description: "Read-only audit trails" })
    expect(CATALOGUE.apps).toEqual([
      { id: "dating", label: "Dating" },
      { id: "food", label: "Feast" },
      { id: "commerce", label: "Commerce" },
    ])
    expect(readCatalogue({ data: [] }).roles).toEqual([])
  })

  it("previews the permissions a role gets in an app, platform-wide, or through a wildcard app", () => {
    expect(permissionPreview(CATALOGUE, "moderator", "dating")).toEqual({ permissions: ["dating:photos.review", "dating:reports.act"], known: true })
    expect(permissionPreview(CATALOGUE, "moderator", "commerce")).toEqual({ permissions: ["reports.read"], known: true })
    expect(permissionPreview(CATALOGUE, "superadmin", null)).toEqual({ permissions: ["*"], known: true })
    expect(permissionPreview(CATALOGUE, "auditor", null)).toEqual({ permissions: ["*:audit.read"], known: true })
    expect(permissionPreview(CATALOGUE, "admin", null)).toEqual({ permissions: [], known: true })
    expect(permissionPreview(CATALOGUE, "support", "dating")).toEqual({ permissions: [], known: false })
  })
})

describe("the grant form", () => {
  const now = Date.parse("2026-09-17T10:00:00Z")
  const good = { ...EMPTY_GRANT, userId: USER, role: "moderator", app: "dating", reason: "Covering the dating queue this month" }

  it("sends a valid grant with the app, a null expiry and the trimmed reason", () => {
    expect(checkGrant(good, CATALOGUE, now)).toEqual({ ok: true, body: { role: "moderator", app: "dating", expires_at: null, reason: "Covering the dating queue this month" } })
  })

  it("requires a reason, and one long enough for the audit trail", () => {
    const blank = checkGrant({ ...good, reason: "  " }, CATALOGUE, now)
    expect(blank.ok).toBe(false)
    if (!blank.ok) expect(blank.problems.reason).toMatch(/required/)
    const short = checkGrant({ ...good, reason: "because" }, CATALOGUE, now)
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.problems.reason).toMatch(/at least 10/)
  })

  it("refuses an expiry in the past client-side and sends a future one as ISO", () => {
    const past = checkGrant({ ...good, expiresAt: "2026-09-17T09:00" }, CATALOGUE, now)
    expect(past.ok).toBe(false)
    if (!past.ok) expect(past.problems.expiresAt).toBe("The expiry must be in the future.")
    const future = checkGrant({ ...good, expiresAt: "2027-01-01T00:00:00Z" }, CATALOGUE, now)
    expect(future.ok).toBe(true)
    if (future.ok) expect(future.body.expires_at).toBe("2027-01-01T00:00:00.000Z")
    const garbage = checkGrant({ ...good, expiresAt: "soon" }, CATALOGUE, now)
    expect(garbage.ok).toBe(false)
  })

  it("requires an application unless the role is platform-only, and refuses one when it is", () => {
    const noApp = checkGrant({ ...good, app: "" }, CATALOGUE, now)
    expect(noApp.ok).toBe(false)
    if (!noApp.ok) expect(noApp.problems.app).toBe("Choose the application this role is for.")
    const superAdmin = checkGrant({ ...good, role: "superadmin", app: "" }, CATALOGUE, now)
    expect(superAdmin.ok).toBe(true)
    if (superAdmin.ok) expect(superAdmin.body).toMatchObject({ role: "superadmin", app: null })
    const scoped = checkGrant({ ...good, role: "superadmin", app: "dating" }, CATALOGUE, now)
    expect(scoped.ok).toBe(false)
    if (!scoped.ok) expect(scoped.problems.app).toBe("This role is platform-wide only.")
    const unknownApp = checkGrant({ ...good, app: "tube" }, CATALOGUE, now)
    expect(unknownApp.ok).toBe(false)
  })

  it("needs a picked user and a catalogued role", () => {
    const check = checkGrant({ ...good, userId: "asha", role: "support" }, CATALOGUE, now)
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.problems.userId).toBe("Pick a user first.")
      expect(check.problems.role).toBe("That role is not in the catalogue.")
    }
    // An empty catalogue (not loaded) does not block a role typed by hand.
    expect(checkGrant({ ...good, role: "support" }, { roles: [], apps: [], permissions: {} }, now).ok).toBe(true)
  })

  it("warns that superadmin needs a second approver", () => {
    expect(secondApproverNote("superadmin")).toMatch(/second approver/)
    expect(secondApproverNote("moderator")).toBeNull()
  })
})

describe("error codes explained", () => {
  it("maps every Access code to a sentence an admin can act on", () => {
    const at = (code: string, status = 409) => adminErrorMessage({ response: { status, data: { error: { code, message: code } } } })
    expect(at("SUPERADMIN_REQUIRED", 403)).toMatch(/super-admin/)
    expect(at("LAST_SUPERADMIN")).toMatch(/last super-admin/)
    expect(at("ENV_BOOTSTRAP_ROLE")).toMatch(/granted by the deployment's configuration/)
    expect(at("ENV_BOOTSTRAP_ROLE")).toMatch(/cannot be revoked here/)
    expect(at("SELF_GRANT_REFUSED")).toMatch(/your own roles/)
    expect(at("REASON_REQUIRED", 400)).toBe("A reason is required.")
    expect(at("INVALID_APP", 400)).toMatch(/application/)
    expect(at("ROLE_NOT_SCOPABLE", 400)).toMatch(/platform-wide only/)
    expect(at("INVALID_EXPIRY", 400)).toMatch(/future/)
    // An unknown code still shows the server's message.
    expect(at("SOMETHING_ELSE")).toBe("SOMETHING_ELSE")
  })
})

describe("holders", () => {
  const raw = {
    data: {
      holders: [
        { user_id: USER, role: "moderator", app: "dating", expires_at: "2026-12-31T00:00:00Z", reason: "Queue cover", granted_by: "u-0", granted_at: "2026-09-01T00:00:00Z", mfa_enrolled: true, active: true },
        { user_id: USER, role: "admin", app: null, expires_at: "2026-09-01T00:00:00Z", mfa_enrolled: false, active: true },
        { user_id: "u-3", role: "auditor", app: null, active: false },
        { role: "broken" },
      ],
      env_holders: [{ user_id: "u-9", role: "superadmin", app: null }],
      limit: 50,
      offset: 0,
    },
  }
  const now = Date.parse("2026-09-17T10:00:00Z")

  it("reads holders and env holders apart, drops malformed rows, and states active / expired / inactive", () => {
    const { holders, envHolders, limit } = readHolders(raw)
    expect(holders).toHaveLength(3)
    expect(holderState(holders[0], now)).toBe("active")
    expect(holders[0]).toMatchObject({ app: "dating", mfaEnrolled: true, env: false, reason: "Queue cover" })
    expect(holderState(holders[1], now)).toBe("expired")
    expect(holders[1]).toMatchObject({ app: null, mfaEnrolled: false })
    expect(holderState(holders[2], now)).toBe("inactive")
    expect(holders[2].mfaEnrolled).toBeNull()
    expect(envHolders).toHaveLength(1)
    expect(envHolders[0]).toMatchObject({ role: "superadmin", env: true })
    expect(limit).toBe(50)
    expect(readHolders({ data: null }).holders).toEqual([])
  })

  it("builds the holders and audit queries, leaving malformed filters out", () => {
    expect(holdersQuery({ role: "moderator", app: "dating" }, 50)).toBe("role=moderator&app=dating&limit=50&offset=50")
    expect(holdersQuery({ role: "Bad Role", app: "" })).toBe("limit=50&offset=0")
    expect(accessAuditQuery({ actor: USER, target: "nope", action: "role.grant", from: "2026-09-01", to: "2026-09-01" })).toBe(
      `actor=${USER}&action=role.grant&from=${encodeURIComponent("2026-09-01T00:00:00+05:30")}&to=${encodeURIComponent("2026-09-02T00:00:00+05:30")}&limit=50&offset=0`,
    )
  })
})

describe("never an unmasked email", () => {
  it("masks an address that arrives unmasked and leaves a masked one alone", () => {
    expect(maskEmail("asha@example.com")).toBe("a***@example.com")
    expect(maskEmail("a***@example.com")).toBe("a***@example.com")
    expect(maskEmail("a•••@example.com")).toBe("a•••@example.com")
    expect(maskEmail("")).toBeNull()
    const matches = readUserMatches({ data: { results: [{ user_id: USER, email_masked: "asha.k@example.com", handle: "asha" }, { handle: "nobody" }] } })
    expect(matches).toEqual([{ userId: USER, handle: "asha", emailMasked: "a***@example.com" }])
  })
})
