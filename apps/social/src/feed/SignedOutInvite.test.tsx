/**
 * The signed-out front door.
 *
 * Server-rendered with react-dom/server, the way apps/tube's control tests
 * are, because this repo has no jsdom and this component is a pure function
 * of one prop.
 *
 * Three of these tests are the bug, stated:
 *
 *   · it is NOT `role="alert"` — nobody being signed in is not a failure, and
 *     announcing it as one interrupts a screen reader to tell them the
 *     product is broken when it is working exactly as designed;
 *   · it does NOT say "we could not load your feed", which is what
 *     `FeedError`'s hardcoded heading said here;
 *   · it HAS a sign-in control, at every width. The page's only other one is
 *     in a rail that is `hidden lg:block`, so below 1024px a signed-out
 *     visitor to the front door of the platform had no way in from it.
 */

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { BRAND } from "@momentum/brand"
import { SignedOutInvite } from "./SignedOutInvite"

const html = renderToStaticMarkup(<SignedOutInvite basePath="/social" />)

describe("SignedOutInvite", () => {
  it("does not announce itself as an error", () => {
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain("could not load")
  })

  it("offers a sign-in link that comes back to this zone", () => {
    expect(html).toContain('href="/login?redirect=%2Fsocial"')
    expect(html).toContain(">Sign in<")
  })

  it("puts that link at every width", () => {
    // The whole second half of the bug. A responsive class on the only way in
    // is the failure, not the styling choice.
    // `aria-hidden` on the decorative glyph is fine; a `hidden` UTILITY class
    // on the link is the bug.
    expect(html).not.toMatch(/class="[^"]*\bhidden\b/)
    expect(html).not.toContain("lg:block")
    expect(html).not.toContain("sm:")
    expect(html).not.toContain("md:")
    expect(html).not.toContain("lg:")
  })

  it("is an anchor and not a router link", () => {
    // /login is served by the SHELL. `next/link` prefixes this zone's
    // basePath onto every href, so a Link here would ask for /social/login.
    expect(html).toContain("<a ")
  })

  it("says what the page is before it asks for anything", () => {
    expect(html).toContain("Sign in to see your feed")
    expect(html).toContain(BRAND.name)
  })

  it("names no product this file spells for itself", () => {
    expect(html).not.toContain("atPost")
    expect(html).not.toContain("atpost")
  })

  it("draws no raw colour, only tokens", () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toContain("rgb(")
  })

  it("survives a zone mounted at the root", () => {
    const atRoot = renderToStaticMarkup(<SignedOutInvite basePath="/" />)
    expect(atRoot).toContain('href="/login?redirect=%2F"')
  })
})
