import { describe, it, expect } from "vitest"
import type { Capabilities, CapabilitiesResponse, RoleName } from "@atpost/types/auth"
import {
  destinationsFor,
  hasAdminConsoleAccess,
  shouldShowSwitcher,
  unwrapCapabilities,
} from "./capabilities"

const ALL_ROLES: RoleName[] = [
  "superadmin",
  "admin",
  "moderator",
  "seller",
  "restaurant_owner",
  "delivery_partner",
  "rider_partner",
]

/**
 * The endpoint's contract is that `capabilities` names EVERY role, true or
 * false — so every fixture here does too. Building them any other way would
 * test a response the server does not send.
 */
function response(held: RoleName[], extra: Record<string, boolean> = {}): CapabilitiesResponse {
  const capabilities = Object.fromEntries([
    ...ALL_ROLES.map((role) => [role, held.includes(role)]),
    ...Object.entries(extra),
  ]) as Capabilities
  return {
    user_id: "u-1",
    roles: held,
    is_customer: true,
    capabilities,
    switcher: [
      { role: "customer", label: "Customer" },
      ...held.map((role) => ({ role, label: role })),
    ],
  }
}

const ids = (r: CapabilitiesResponse) => destinationsFor(r).map((d) => d.id)

describe("destinationsFor", () => {
  it("gives a plain customer exactly one destination, so no switcher shows", () => {
    const destinations = destinationsFor(response([]))
    expect(destinations.map((d) => d.id)).toEqual(["customer"])
    expect(shouldShowSwitcher(destinations)).toBe(false)
  })

  it("shows nothing before the answer arrives", () => {
    expect(destinationsFor(null)).toEqual([])
    expect(destinationsFor(undefined)).toEqual([])
    expect(shouldShowSwitcher([])).toBe(false)
  })

  it("offers a seller+admin their console, their shopfront and the storefront", () => {
    const destinations = destinationsFor(response(["seller", "admin"]))
    expect(destinations.map((d) => d.id)).toEqual(["customer", "seller", "admin"])
    expect(destinations.map((d) => d.href)).toEqual(["/shop", "/shop/sell", "/admin"])
    expect(shouldShowSwitcher(destinations)).toBe(true)
  })

  it("collapses the three admin roles into one entry", () => {
    for (const held of [
      ["moderator"],
      ["admin"],
      ["superadmin"],
      ["moderator", "admin"],
      ["moderator", "admin", "superadmin"],
    ] as RoleName[][]) {
      const destinations = destinationsFor(response(held))
      expect(destinations.filter((d) => d.href === "/admin")).toHaveLength(1)
      expect(destinations.map((d) => d.id)).toEqual(["customer", "admin"])
    }
  })

  it("labels the collapsed entry for the highest role held", () => {
    const label = (held: RoleName[]) =>
      destinationsFor(response(held)).find((d) => d.id === "admin")?.label
    expect(label(["moderator"])).toBe("Moderator")
    expect(label(["moderator", "admin"])).toBe("Admin")
    expect(label(["moderator", "admin", "superadmin"])).toBe("Superadmin")
    expect(label(["moderator", "superadmin"])).toBe("Superadmin")
  })

  it("renders a mobile-only hat as present but not actionable", () => {
    for (const role of ["restaurant_owner", "delivery_partner", "rider_partner"] as RoleName[]) {
      const destinations = destinationsFor(response([role]))
      // Present — not silently dropped.
      const entry = destinations.find((d) => d.id === role)
      expect(entry).toBeDefined()
      // Not actionable, and it says why.
      expect(entry?.href).toBeNull()
      expect(entry?.unavailableReason).toMatch(/atPost (mobile )?app/i)
      // And it counts: the switcher opens so the person can SEE the row.
      expect(shouldShowSwitcher(destinations)).toBe(true)
    }
  })

  it("keeps mobile-only hats after every web destination", () => {
    expect(ids(response(["delivery_partner", "seller", "superadmin"]))).toEqual([
      "customer",
      "seller",
      "admin",
      "delivery_partner",
    ])
  })

  it("surfaces a role added after this build rather than dropping it", () => {
    const destinations = destinationsFor(response([], { warehouse_partner: true }))
    const entry = destinations.find((d) => d.id === "warehouse_partner")
    expect(entry?.label).toBe("Warehouse partner")
    expect(entry?.href).toBeNull()
    expect(entry?.unavailableReason).toBeTruthy()
  })

  it("ignores an unknown role that is not held", () => {
    expect(ids(response([], { warehouse_partner: false }))).toEqual(["customer"])
  })

  it("never invents a href it cannot justify", () => {
    for (const destination of destinationsFor(response(ALL_ROLES))) {
      expect(destination.href === null).toBe(destination.unavailableReason !== null)
    }
  })
})

describe("hasAdminConsoleAccess", () => {
  it("admits the three console roles and nobody else", () => {
    expect(hasAdminConsoleAccess(response(["moderator"]).capabilities)).toBe(true)
    expect(hasAdminConsoleAccess(response(["admin"]).capabilities)).toBe(true)
    expect(hasAdminConsoleAccess(response(["superadmin"]).capabilities)).toBe(true)
    expect(hasAdminConsoleAccess(response(["seller"]).capabilities)).toBe(false)
    expect(hasAdminConsoleAccess(response(["delivery_partner"]).capabilities)).toBe(false)
    expect(hasAdminConsoleAccess(response([]).capabilities)).toBe(false)
  })

  it("says no when there is no answer, rather than throwing", () => {
    expect(hasAdminConsoleAccess(null)).toBe(false)
    expect(hasAdminConsoleAccess(undefined)).toBe(false)
  })
})

describe("unwrapCapabilities", () => {
  it("reads the bare body identity-auth actually sends", () => {
    const bare = response(["seller"])
    expect(unwrapCapabilities(bare)).toBe(bare)
  })

  it("reads the house { data: … } envelope too", () => {
    const bare = response(["seller"])
    expect(unwrapCapabilities({ data: bare })).toBe(bare)
  })
})
