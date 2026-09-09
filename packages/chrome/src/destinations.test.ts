import { describe, expect, it } from "vitest"
import { BRAND } from "@momentum/brand"
import {
  APP_ONLY_REASON,
  DESTINATIONS,
  HOME_PATH,
  currentDestinationId,
  isActionable,
} from "./destinations"

/**
 * These assert the two things about this list that would ship as bugs.
 *
 * The first is the promise the whole navigation rests on: a destination is
 * either a link somewhere real or a control that says why it is not, and never
 * something in between. `href: null` with no reason renders a dead row with no
 * explanation; a reason ALONGSIDE an href renders an excuse under a working
 * link. Both are silent — nothing throws, nothing logs, the page looks fine —
 * so they are checked here rather than noticed.
 *
 * The second is the near-prefix defect. `"/socialising".startsWith("/social")`
 * is true, and the naive version of `currentDestinationId` marks the Home icon
 * as the current page on a route that has nothing to do with it. The gateway
 * has a test for the same shape of mistake (`/v1/graph` vs `/v1/graphql`,
 * pkg/routepolicy) because it got it wrong there first.
 */

/**
 * The zones apps/shell actually rewrites to, and the only legal hrefs.
 *
 * This list and the `zones` table in apps/shell/next.config.ts move together —
 * which is the whole point of the assertion below. `/reels` joined both when
 * apps/reels was built and `/tube` when apps/tube was; before that each row
 * was `href: null` with APP_ONLY_REASON, and this test is what would have
 * caught either being linked a release too early.
 */
const LIVE_ZONES = ["/shop", "/admin", "/social", "/apps", "/reels", "/tube"]

describe("DESTINATIONS", () => {
  it("carries the mobile client's own top-level vocabulary", () => {
    // TopLevelDestination.kt: HOME, REELS, FRIENDS, ME, MESSAGES, EXPLORE.
    // ME is the profile menu rather than a rail row, so it is not here; the
    // other five are, and Tube and Shop join them.
    const ids = DESTINATIONS.map((d) => d.id)
    expect(ids).toEqual(
      expect.arrayContaining(["home", "reels", "friends", "messages", "explore"]),
    )
  })

  it("gives every entry a unique id and a label", () => {
    const ids = DESTINATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const destination of DESTINATIONS) {
      expect(destination.label.length).toBeGreaterThan(0)
    }
  })

  it("never has an href and an unavailable reason at the same time", () => {
    for (const destination of DESTINATIONS) {
      if (destination.href === null) {
        expect(destination.unavailableReason, `${destination.id} needs a reason`).toBeTruthy()
      } else {
        expect(destination.unavailableReason, `${destination.id} must not excuse itself`).toBeNull()
      }
    }
  })

  it("only ever links to a zone the shell actually serves", () => {
    for (const destination of DESTINATIONS) {
      if (!destination.href) continue
      expect(LIVE_ZONES, `${destination.id} -> ${destination.href}`).toContain(destination.href)
    }
  })

  it("agrees with isActionable in both directions", () => {
    for (const destination of DESTINATIONS) {
      expect(isActionable(destination)).toBe(destination.href !== null)
    }
  })

  it("keeps at least one destination the web genuinely cannot open", () => {
    // If this ever fails because every destination got a zone, delete it. If
    // it fails because the unavailable ones were quietly dropped instead, put
    // them back — that is the failure this guards.
    expect(DESTINATIONS.some((d) => !isActionable(d))).toBe(true)
  })

  it("names the app rather than spelling the brand out", () => {
    expect(APP_ONLY_REASON).toContain(BRAND.mobileApp)
  })

  it("sends the header lockup to the same place the Home row goes", () => {
    // The lockup, "go to your feed" in the reels empty state, and the Home
    // row are one destination. They read one constant so they cannot drift —
    // and this is the assertion that the constant is still the row's href.
    const home = DESTINATIONS.find((d) => d.id === "home")
    expect(home?.href).toBe(HOME_PATH)
    expect(LIVE_ZONES).toContain(HOME_PATH)
  })

  /*
   * A test called "still has no zone for Tube" stood here, asserting
   * `tube.href === null` and `tube.unavailableReason === APP_ONLY_REASON`. It
   * has been DELETED rather than weakened, on the instruction it carried
   * itself: "Delete this test then, do not weaken it."
   *
   * It did its job. It existed so the Tube row could not become a link before
   * something served one, and it went in the same change that added apps/tube,
   * the shell's rewrite to :3012, and the `/tube` entries in `moduleHomes` and
   * `moduleLabels`. Nothing replaced it, because two general assertions above
   * already cover what is left to protect: "never has an href and an
   * unavailable reason at the same time", and "only ever links to a zone the
   * shell actually serves" — and `/tube` is in LIVE_ZONES now, so the second is
   * what fails if the rewrite table is ever reverted without this file.
   */
})

describe("currentDestinationId", () => {
  it("matches the zone root itself", () => {
    expect(currentDestinationId("/social")).toBe("home")
    expect(currentDestinationId("/apps")).toBe("explore")
    expect(currentDestinationId("/shop")).toBe("shop")
  })

  it("matches a route inside the zone", () => {
    expect(currentDestinationId("/social/post/abc")).toBe("home")
    expect(currentDestinationId("/shop/orders")).toBe("shop")
  })

  it("matches a zone root carrying a query", () => {
    expect(currentDestinationId("/social?tab=following")).toBe("home")
  })

  it("does not match a path that merely starts with the same letters", () => {
    expect(currentDestinationId("/socialising")).toBeNull()
    expect(currentDestinationId("/apps-admin")).toBeNull()
    expect(currentDestinationId("/shopping")).toBeNull()
  })

  it("answers null for nothing, rather than guessing", () => {
    expect(currentDestinationId(null)).toBeNull()
    expect(currentDestinationId(undefined)).toBeNull()
    expect(currentDestinationId("")).toBeNull()
    expect(currentDestinationId("/somewhere-else")).toBeNull()
  })

  it("never returns an id that has no href", () => {
    // A destination with no zone can never be "current", because there is no
    // path that could be inside it.
    for (const path of ["/social", "/apps", "/shop", "/reels", "/tube", "/messages"]) {
      const id = currentDestinationId(path)
      if (id === null) continue
      const destination = DESTINATIONS.find((d) => d.id === id)
      expect(destination && isActionable(destination)).toBe(true)
    }
  })
})
