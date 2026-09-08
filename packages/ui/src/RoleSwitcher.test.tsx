import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { RoleDestination } from "@atpost/types/auth"
import { BRAND } from "@momentum/brand"
import { RoleSwitcher } from "./RoleSwitcher"

/**
 * Rendered with react-dom/server rather than a testing-library, because this
 * repo has neither jsdom nor @testing-library installed and a switcher is not
 * worth dragging a browser runtime in for. It works because the menu is kept
 * mounted and merely `hidden` when closed, so every entry is in the markup —
 * which is also why it is built that way. What server rendering cannot see is
 * the keyboard behaviour, which lives in effects; that is checked by hand.
 */

const customer: RoleDestination = {
  id: "customer",
  label: "Customer",
  description: `Browse and buy on ${BRAND.shop}`,
  href: "/shop",
  unavailableReason: null,
}

const seller: RoleDestination = {
  id: "seller",
  label: "Seller",
  description: "Your listings, orders and payouts",
  href: "/shop/sell",
  unavailableReason: null,
}

const admin: RoleDestination = {
  id: "admin",
  label: "Superadmin",
  description: "The admin console",
  href: "/admin",
  unavailableReason: null,
}

const deliveryPartner: RoleDestination = {
  id: "delivery_partner",
  label: "Delivery partner",
  description: "Manage deliveries from your phone",
  href: null,
  unavailableReason: `Only in the ${BRAND.mobileApp} — there is no web console for this yet.`,
}

const render = (destinations: RoleDestination[]) =>
  renderToStaticMarkup(<RoleSwitcher destinations={destinations} />)

describe("RoleSwitcher", () => {
  it("renders nothing for a person with one destination", () => {
    expect(render([customer])).toBe("")
  })

  it("renders nothing at all before capabilities have loaded", () => {
    expect(render([])).toBe("")
  })

  it("renders every destination once the person has more than one", () => {
    const html = render([customer, seller, admin])
    expect(html).toContain('href="/shop"')
    expect(html).toContain('href="/shop/sell"')
    expect(html).toContain('href="/admin"')
    expect(html).toContain("Customer")
    expect(html).toContain("Seller")
    expect(html).toContain("Superadmin")
    // One admin row, not three — the collapse happened upstream and nothing
    // here re-expands it.
    expect(html.match(/href="\/admin"/g)).toHaveLength(1)
  })

  it("navigates with real anchors, never a client router or a form", () => {
    const html = render([customer, admin])
    expect(html).toContain('<a role="menuitem"')
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<select")
  })

  it("shows a mobile-only hat as present, named, and not actionable", () => {
    const html = render([customer, deliveryPartner])
    expect(html).toContain("Delivery partner")
    expect(html).toContain(`Only in the ${BRAND.mobileApp}`)
    // Announced and arrow-key reachable, but not a link.
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain('href="null"')
    // Not rendered with the `disabled` attribute, which would hide it from
    // keyboard users and so repeat the silent drop it exists to avoid.
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/)
  })

  it("closes with `hidden` and points the trigger at the menu", () => {
    const html = render([customer, admin])
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('role="menu"')
    expect(html).toContain("hidden=")
  })
})

describe("RoleSwitcher persistence", () => {
  let writes: Array<[string, string]>
  let reads: string[]
  let removals: string[]
  const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")

  beforeEach(() => {
    writes = []
    reads = []
    removals = []
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => {
          reads.push(key)
          return null
        },
        setItem: (key: string, value: string) => {
          writes.push([key, value])
        },
        removeItem: (key: string) => {
          removals.push(key)
        },
        clear: () => {},
        key: () => null,
        length: 0,
      },
    })
  })

  afterEach(() => {
    if (realStorage) Object.defineProperty(globalThis, "localStorage", realStorage)
    else Reflect.deleteProperty(globalThis as Record<string, unknown>, "localStorage")
  })

  /**
   * The load-bearing one. Switching navigates and remembers nothing: there is
   * no current role, no preference, no last-used hat. Login must keep landing
   * on /shop so an administrator arrives as a customer and walks to the console
   * on purpose, and any persistence here would quietly undo that.
   */
  it("writes nothing to storage", () => {
    render([customer, seller, admin, deliveryPartner])
    expect(writes).toEqual([])
    expect(removals).toEqual([])
    expect(reads).toEqual([])
  })

  it("has no storage or cookie access anywhere in its source", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./RoleSwitcher.tsx", import.meta.url), "utf8"),
    )
    // Comments are allowed to say the word; code is not.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/)
  })
})
