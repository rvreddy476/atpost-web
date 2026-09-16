import { describe, expect, it } from "vitest"
import { ADMIN_APPS } from "./apps"
import { buildAdminNav, findNavGroup, hasAppAccess, hasPermission, mfaBlocks, parseAdminMe, readMfaEnrolled } from "./me"

const allNavigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me({
  platform = [] as string[],
  apps = {} as Record<string, unknown>,
  navigation = allNavigation as unknown[],
  mfa = { required: true, verified: true, auth_time: 1_760_000_000 } as unknown,
  stepUp = null as unknown,
} = {}) {
  const parsed = parseAdminMe({
    data: {
      user_id: "u-1",
      permissions: { platform, apps },
      mfa,
      step_up_valid_until: stepUp,
      step_up_window_seconds: 300,
      navigation,
    },
  })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

describe("parseAdminMe", () => {
  it("reads the enveloped response", () => {
    const m = me({ platform: ["*:audit.read"], apps: { commerce: ["commerce:seller.approve"] } })
    expect(m.userId).toBe("u-1")
    expect(m.platform).toEqual(["*:audit.read"])
    expect(m.apps.commerce).toEqual(["commerce:seller.approve"])
    expect(m.mfa).toEqual({ required: true, verified: true, authTime: 1_760_000_000_000 })
    expect(m.stepUpWindowSeconds).toBe(300)
  })

  it("treats anything unreadable as no access", () => {
    expect(parseAdminMe(null)).toBeNull()
    expect(parseAdminMe({ data: { mfa: { verified: true } } })).toBeNull()
    const parsed = parseAdminMe({ data: { user_id: "u-1", permissions: { apps: { dating: "all", commerce: [1, "commerce:seller.approve"] } } } })
    expect(parsed?.apps.dating).toEqual([])
    expect(parsed?.apps.commerce).toEqual(["commerce:seller.approve"])
    // No mfa block: required and unverified, so the console stays closed.
    expect(parsed && mfaBlocks(parsed)).toBe(true)
    expect(parsed?.navigation).toEqual([])
  })

  it("blocks only when MFA is required and not verified", () => {
    expect(mfaBlocks(me({ mfa: { required: true, verified: false } }))).toBe(true)
    expect(mfaBlocks(me({ mfa: { required: true, verified: true } }))).toBe(false)
    expect(mfaBlocks(me({ mfa: { required: false, verified: false } }))).toBe(false)
  })

  it("reads MFA enrolment from identity's capabilities", () => {
    expect(readMfaEnrolled({ data: { admin: { mfa_enrolled: false } } })).toBe(false)
    expect(readMfaEnrolled({ admin: { mfa_enrolled: true } })).toBe(true)
    expect(readMfaEnrolled({ data: { capabilities: {} } })).toBeNull()
  })

  it("drops unknown apps and duplicate navigation entries", () => {
    const parsed = me({
      apps: { dating: ["dating:reports.act"], approvals: ["x"] },
      navigation: [
        { app: "approvals", label: "Shadow" },
        { app: "dating", label: "Dating" },
        { app: "dating", label: "Again" },
        { app: "food" },
      ],
    })
    expect(parsed.navigation).toEqual([
      { app: "dating", label: "Dating" },
      { app: "food", label: "Feast" },
    ])
    expect(Object.keys(parsed.apps)).toEqual(["dating"])
  })

  it("reads the step-up window as ISO, epoch seconds, or null", () => {
    expect(me({ stepUp: "2026-09-16T10:05:00Z" }).stepUpValidUntil).toBe(Date.parse("2026-09-16T10:05:00Z"))
    expect(me({ stepUp: 1_789_000_000 }).stepUpValidUntil).toBe(1_789_000_000_000)
    expect(me().stepUpValidUntil).toBeNull()
  })
})

describe("buildAdminNav", () => {
  it("never includes an app without permissions, even when navigation lists it", () => {
    const nav = buildAdminNav(me({ apps: { dating: ["dating:reports.act"], food: [], commerce: ["commerce:seller.approve"] } }))
    expect(nav.apps.map((g) => g.app)).toEqual(["dating", "commerce"])
  })

  it("never includes an app navigation does not list, even with permissions", () => {
    const nav = buildAdminNav(
      me({ apps: { dating: ["dating:reports.act"], food: ["food:orders.read"] }, navigation: [{ app: "food", label: "Feast" }] }),
    )
    expect(nav.apps.map((g) => g.app)).toEqual(["food"])
  })

  it("shows nothing at all for an admin with no permissions", () => {
    expect(buildAdminNav(me())).toEqual({ apps: [], console: [] })
  })

  it("lets a cross-app platform permission reach listed apps, but not a platform-only one", () => {
    expect(buildAdminNav(me({ platform: ["*:audit.read"] })).apps).toHaveLength(ADMIN_APPS.length)
    const plain = buildAdminNav(me({ platform: ["platform:roles.grant"] }))
    expect(plain.apps.map((g) => g.app)).toEqual(["platform"])
  })

  it("orders apps by the console's order, not the server's", () => {
    const nav = buildAdminNav(
      me({
        apps: { rider: ["rider:x"], dating: ["dating:x"] },
        navigation: [
          { app: "rider", label: "Mopedu" },
          { app: "dating", label: "Dating" },
        ],
      }),
    )
    expect(nav.apps.map((g) => g.label)).toEqual(["Dating", "Mopedu"])
  })

  it("keeps the existing commerce screens under MStore, each behind its permission", () => {
    const full = buildAdminNav(
      me({
        apps: {
          commerce: ["commerce:catalogue.edit", "commerce:seller.approve", "commerce:products.moderate", "commerce:payouts.read"],
        },
      }),
    )
    const mstore = findNavGroup(full, "commerce")
    expect(mstore?.label).toBe("MStore")
    expect(mstore?.links.map((l) => l.href)).toEqual(["/catalogue", "/sellers", "/products", "/payouts"])

    const moderator = buildAdminNav(me({ apps: { commerce: ["commerce:products.moderate"] } }))
    expect(findNavGroup(moderator, "commerce")?.links.map((l) => l.id)).toEqual(["products"])
    expect(findNavGroup(moderator, "dating")).toBeNull()
  })

  it("shows Access only to platform admins and Audit to anyone who may read audit", () => {
    expect(buildAdminNav(me({ apps: { dating: ["dating:reports.act"] } })).console.map((l) => l.id)).toEqual(["approvals"])
    expect(buildAdminNav(me({ apps: { dating: ["dating:audit.read"] } })).console.map((l) => l.id)).toEqual(["approvals", "audit"])
    expect(buildAdminNav(me({ platform: ["*:audit.read"] })).console.map((l) => l.id)).toEqual(["approvals", "audit"])
    expect(buildAdminNav(me({ platform: ["platform:roles.grant", "*:audit.read"] })).console.map((l) => l.id)).toEqual([
      "approvals",
      "access",
      "audit",
    ])
  })
})

describe("permission checks", () => {
  it("scopes qualified permissions to their app", () => {
    const m = me({ apps: { dating: ["dating:reports.act"] } })
    expect(hasAppAccess(m, "dating")).toBe(true)
    expect(hasAppAccess(m, "food")).toBe(false)
    expect(hasPermission(m, "dating", "reports.act")).toBe(true)
    expect(hasPermission(m, "dating", "reports.delete")).toBe(false)
    expect(hasPermission(m, "food", "reports.act")).toBe(false)
    expect(hasPermission(me({ platform: ["*:audit.read"] }), "food", "audit.read")).toBe(true)
    expect(hasPermission(me({ platform: ["*:audit.read"] }), "food", "orders.cancel")).toBe(false)
    // A permission filed under the wrong app does not leak across.
    expect(hasPermission(me({ apps: { dating: ["food:orders.cancel"] } }), "dating", "orders.cancel")).toBe(false)
  })
})
