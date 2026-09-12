import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { BRAND } from "@momentum/brand"

/**
 * Rendered with react-dom/server, for the reason RoleSwitcher's test gives:
 * this repo has no browser runtime and the header's shape is assertable
 * without one, because its menu is kept mounted and merely `hidden`.
 *
 * The hooks are replaced with a mutable fixture rather than a fixed factory,
 * so each case can say what the session, the bag and the hearts look like
 * without a second mock. `vi.hoisted` is what lets the factories see it.
 */
const state = vi.hoisted(() => ({
  signedIn: true,
  email: "ravi@example.com",
  itemCount: 3,
  favourites: 2,
  destinations: [] as Array<{ id: string; label: string; description: string; href: string | null; unavailableReason: string | null }>,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/hooks/useCommerce", () => ({
  useCart: () => ({ data: { item_count: state.itemCount, items: [] } }),
  useFavourites: () => ({
    data: { items: Array.from({ length: state.favourites }, (_, i) => ({ id: `p${i}`, title: `P${i}` })) },
  }),
  useSession: () => ({
    signedIn: state.signedIn,
    known: true,
    user: state.signedIn ? { id: "u1", email: state.email } : null,
  }),
}))

vi.mock("@atpost/api-client/capabilities", () => ({
  useCapabilities: () => ({ destinations: state.destinations, capabilities: null, isLoading: false }),
}))

import { StoreHeader } from "./StoreHeader"

const render = () => renderToStaticMarkup(<StoreHeader />)

afterEach(() => {
  state.signedIn = true
  state.itemCount = 3
  state.favourites = 2
  state.destinations = []
})

describe("StoreHeader", () => {
  it("carries the MStore wordmark, split into the ember mark and the word", () => {
    const html = render()
    expect(html).toContain(BRAND.store)
    expect(BRAND.store).toBe("MStore")
    // The mark and the rest of the word are two separate, hidden-from-AT
    // spans; the full name is read once from the visually hidden one.
    expect(html).toContain(`<b aria-hidden="true">M</b>`)
    expect(html).toContain(`<span aria-hidden="true">Store</span>`)
    expect(html).toContain(`aria-label="${BRAND.store} home"`)
  })

  it("shows the bag with its count and never says cart", () => {
    const html = render()
    expect(html).toContain("<strong>Bag</strong>")
    expect(html).toContain("<b>3</b>")
    expect(html).toContain(`href="/bag"`)
    expect(html).toContain(`aria-label="Bag with 3 items"`)
    expect(html.toLowerCase()).not.toContain("cart")
  })

  it("draws no count on an empty bag", () => {
    state.itemCount = 0
    const html = render()
    expect(html).toContain(`aria-label="Bag with 0 items"`)
    expect(html).not.toContain("<b>0</b>")
  })

  it("shows the favourites heart with how many are saved", () => {
    const html = render()
    expect(html).toContain(`href="/favourites"`)
    expect(html).toContain(`aria-label="Favourites, 2 saved"`)
    expect(html).toContain("<b>2</b>")
    state.favourites = 0
    expect(render()).toContain(`aria-label="Favourites"`)
  })

  it("holds every profile entry the phone has, in the decided order", () => {
    const html = render()
    // Inside the panel only: the heart in the bar also says "Favourites",
    // earlier, and that is right.
    const menu = html.slice(html.indexOf(`role="menu"`))
    const order = ["My orders", "Favourites", "Addresses", "Payments", "Purchase history", "Settings", `Sell on ${BRAND.store}`]
    const positions = order.map((label) => menu.indexOf(label))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(html).toContain(`href="/orders"`)
    expect(html).toContain(`href="/addresses"`)
    expect(html).toContain(`href="/orders?history=true"`)
    expect(html).toContain(`href="/sell"`)
    // The avatar carries the account's initial.
    expect(html).toContain(`<span class="account-avatar" aria-hidden="true">R</span>`)
    // The menu is mounted but closed.
    expect(html).toContain(`role="menu" hidden=""`)
  })

  it("says Start selling without a seller hat and Seller dashboard with one", () => {
    expect(render()).toContain("Start selling")
    state.destinations = [
      { id: "customer", label: "Customer", description: "", href: "/shop", unavailableReason: null },
      { id: "seller", label: "Seller", description: "", href: "/shop/sell", unavailableReason: null },
    ]
    const html = render()
    expect(html).toContain("Seller dashboard")
    expect(html).not.toContain("Start selling")
  })

  it("offers Sign in instead of a profile menu when signed out", () => {
    state.signedIn = false
    const html = render()
    expect(html).toContain("Sign in")
    expect(html).not.toContain("account-menu")
    expect(html).not.toContain("My orders")
    // The bag and the heart are still there: the pages they open explain.
    expect(html).toContain(`href="/bag"`)
    expect(html).toContain(`href="/favourites"`)
  })
})
