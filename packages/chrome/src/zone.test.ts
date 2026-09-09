import { describe, expect, it } from "vitest"
import {
  SEARCH_PATH,
  normalizeQuery,
  searchHref,
  signInHref,
  zonePath,
  zoneRelative,
} from "./zone"

/**
 * These assert the arithmetic behind a class of bug that renders perfectly.
 *
 * A chrome mounted in two zones gets every link wrong in a way no type checks
 * and no screenshot shows: `next/link` prefixes the basePath, so an href to
 * another zone becomes a 404 inside this one, and a header that looks exactly
 * right sends people nowhere. `zoneRelative` is the predicate that decides
 * between a client-side transition and a document navigation, and it is the
 * only thing standing between the search box and that failure.
 */

describe("zonePath", () => {
  it("puts the stripped basePath back on", () => {
    // What usePathname() reports inside each zone, and what it has to become.
    expect(zonePath("/social", "/")).toBe("/social")
    expect(zonePath("/social", "/search")).toBe("/social/search")
    expect(zonePath("/reels", "/")).toBe("/reels")
    expect(zonePath("/reels", "/3f860f61-ddb6-4be6-98e6-3b892e9c584f")).toBe(
      "/reels/3f860f61-ddb6-4be6-98e6-3b892e9c584f"
    )
  })

  it("answers the zone root when there is no pathname yet", () => {
    expect(zonePath("/reels", null)).toBe("/reels")
    expect(zonePath("/reels", undefined)).toBe("/reels")
  })
})

describe("zoneRelative", () => {
  it("makes a path inside this zone relative to it", () => {
    expect(zoneRelative("/social", "/social/search")).toBe("/search")
    expect(zoneRelative("/social", "/social/search?q=hello")).toBe("/search?q=hello")
    expect(zoneRelative("/social", "/social")).toBe("/")
    expect(zoneRelative("/social", "/social?tab=following")).toBe("/?tab=following")
  })

  it("refuses a path in another zone", () => {
    expect(zoneRelative("/reels", "/social/search")).toBeNull()
    expect(zoneRelative("/reels", "/shop")).toBeNull()
    expect(zoneRelative("/social", "/apps")).toBeNull()
  })

  it("refuses a path that merely starts with the same letters", () => {
    // The whole reason this is not `startsWith`. Chopping "/social" off
    // "/socialising/x" yields "ising/x", which is a route in this zone that a
    // router would happily push to.
    expect(zoneRelative("/social", "/socialising")).toBeNull()
    expect(zoneRelative("/social", "/socialising/x")).toBeNull()
    expect(zoneRelative("/apps", "/apps-admin")).toBeNull()
  })
})

describe("signInHref", () => {
  it("comes back to the zone that sent the person away", () => {
    expect(signInHref("/social")).toBe("/login?redirect=%2Fsocial")
    expect(signInHref("/reels")).toBe("/login?redirect=%2Freels")
  })
})

describe("the search query", () => {
  it("trims, because the service trims before deciding a query is empty", () => {
    expect(normalizeQuery("  hello ")).toBe("hello")
    expect(normalizeQuery("   ")).toBe("")
    expect(normalizeQuery(null)).toBe("")
    expect(normalizeQuery(undefined)).toBe("")
  })

  it("addresses the one results page absolutely, and escapes the query", () => {
    expect(searchHref("hello world")).toBe("/social/search?q=hello%20world")
    expect(searchHref("a&b=c")).toBe("/social/search?q=a%26b%3Dc")
  })

  it("is a client-side transition in social and a navigation everywhere else", () => {
    // The two branches SearchBox takes, stated as data.
    expect(zoneRelative("/social", searchHref("x"))).toBe("/search?q=x")
    expect(zoneRelative("/reels", searchHref("x"))).toBeNull()
  })

  it("keeps the results page inside a zone the shell serves", () => {
    expect(SEARCH_PATH.startsWith("/social/")).toBe(true)
  })
})
