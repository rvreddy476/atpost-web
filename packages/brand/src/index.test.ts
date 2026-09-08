import { describe, expect, it } from "vitest"
import { BRAND, STORAGE_KEYS, zoneTitle } from "./index"

/**
 * Two things are worth testing here, and they pull in opposite directions.
 *
 * The DERIVED half must move together. If the product is renamed and the
 * wordmark tile still says "a" while the wordmark says something else, the
 * rebrand shipped half-done — so the tests below assert the relationships
 * rather than the current values, and they keep passing through a rename.
 *
 * The FROZEN half must not move at all. STORAGE_KEYS holds strings already
 * written into other people's browsers; rebuilding any of them from
 * BRAND.name — the obvious "tidy-up" for someone who sees "postbook" beside a
 * product called something else — signs everyone out, splits live tabs across
 * two broadcast keys, abandons a bearer token in localStorage, or discards a
 * half-written listing. Those assertions ARE literal, deliberately, and they
 * are the reason this file exists.
 */

describe("the brand constant", () => {
  it("derives the wordmark initial from the name", () => {
    expect(BRAND.initial).toBe(BRAND.name.charAt(0).toUpperCase())
    expect(BRAND.initial).toHaveLength(1)
  })

  it("names the shop after the product rather than as a second brand", () => {
    expect(BRAND.shop).toContain(BRAND.name)
    expect(BRAND.shop).not.toBe(BRAND.name)
  })

  it("names an unnamed seller after the product", () => {
    expect(BRAND.sellerFallback).toContain(BRAND.name)
  })

  it("builds support and site strings from one domain", () => {
    expect(BRAND.supportEmail).toBe(`support@${BRAND.domain}`)
    expect(BRAND.url).toBe(`https://${BRAND.domain}`)
    // The domain is a display string, not a deployment origin: no scheme, no
    // path, no port. A zone's real origin is environment config.
    expect(BRAND.domain).not.toMatch(/^https?:|\/|:\d/)
  })

  it("names the native app after the product", () => {
    expect(BRAND.mobileApp).toContain(BRAND.name)
  })
})

describe("zoneTitle", () => {
  it("is the bare product name for the front door", () => {
    expect(zoneTitle()).toBe(BRAND.name)
  })

  it("puts the product first and the zone second", () => {
    const title = zoneTitle("Shop")
    expect(title.startsWith(BRAND.name)).toBe(true)
    expect(title.endsWith("Shop")).toBe(true)
  })

  it("uses one separator for every zone", () => {
    const separators = ["Shop", "Admin", "Miniapps"].map((z) =>
      zoneTitle(z).slice(BRAND.name.length, -z.length),
    )
    expect(new Set(separators).size).toBe(1)
  })
})

describe("the frozen storage keys", () => {
  /**
   * Exact values, spelled out. A failure here is not a broken test — it is a
   * change that will sign live sessions out, and the fix is to revert it and
   * write a migration instead (write both, read either, drop the old one a
   * release later).
   */
  it("keeps every wire value exactly as it was written into browsers", () => {
    expect(STORAGE_KEYS).toEqual({
      sessionChangedEvent: "postbook:session-changed",
      sessionBroadcast: "momentum:session-epoch",
      legacySession: "postbook_session",
      legacyAuthTokens: "postbook_auth_tokens",
      affiliateVia: "atpost.affiliate_via",
      listingScratchPrefix: "atpost.sell.scratch.",
    })
  })

  it("does not rebuild any key from the current product name", () => {
    // The trap this file exists to catch: a rename that "helpfully" updates
    // these. `momentum:session-epoch` happens to contain the current name
    // today, which is exactly why the guard has to be structural — it asserts
    // the key is a constant, not a template — so the test below pins the two
    // session keys to two DIFFERENT historical brands. If a rename rewrote
    // them they would agree, and that agreement is the bug.
    expect(STORAGE_KEYS.sessionChangedEvent.split(":")[0]).not.toBe(
      STORAGE_KEYS.sessionBroadcast.split(":")[0],
    )
  })

  it("keeps the two legacy localStorage slots removable under their old names", () => {
    // purgeLegacySession() can only delete a key by the name it was written
    // with. Renaming these leaves a live bearer token on the origin.
    for (const key of [STORAGE_KEYS.legacySession, STORAGE_KEYS.legacyAuthTokens]) {
      expect(key.startsWith("postbook_")).toBe(true)
    }
  })

  it("keeps the listing scratch prefix a prefix", () => {
    expect(STORAGE_KEYS.listingScratchPrefix.endsWith(".")).toBe(true)
  })
})
