/**
 * The two states this zone had no way of drawing.
 *
 * Server-rendered, for the reason ./SignedOutInvite.test.tsx gives.
 *
 * Both of these describe a screen that is still TRUE and merely incomplete —
 * a list that stopped growing, a page of posts whose author names did not
 * arrive — which is why neither is `role="alert"` and why both keep what is
 * already on screen. The failure they replace is the same in both cases: the
 * error was dropped on the floor, so the reader was shown an outcome with no
 * explanation and no way to try again.
 */

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AuthorsUnresolved, NextPageError, SectionEmpty, SectionError } from "./TabStates"
import { Hash } from "lucide-react"

const noop = () => undefined

describe("NextPageError", () => {
  const html = renderToStaticMarkup(
    <NextPageError detail="The next page did not answer." onRetry={noop} />
  )

  it("says what happened and offers the retry", () => {
    expect(html).toContain("The next page did not answer.")
    expect(html).toContain(">Try again<")
  })

  it("is a status and not an alert", () => {
    // Everything above it is still true. A failed page three does not make
    // pages one and two a lie, and nothing here is worth interrupting for.
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
  })

  it("carries the caller's sentence rather than one of its own", () => {
    const expired = renderToStaticMarkup(
      <NextPageError detail="Your session has expired." onRetry={noop} />
    )
    // 401 is the one failure worth telling apart by hand — the next step is
    // different — so the wording is the caller's.
    expect(expired).toContain("Your session has expired.")
  })
})

describe("AuthorsUnresolved", () => {
  const html = renderToStaticMarkup(<AuthorsUnresolved onRetry={noop} />)

  it("says the posts are real and the names are not", () => {
    expect(html).toContain("The posts are real")
    expect(html).toContain(">Try again<")
  })

  it("is a status and not an alert", () => {
    expect(html).toContain('role="status"')
    expect(html).not.toContain('role="alert"')
  })
})

describe("the section states this borrows from", () => {
  it("keeps the asymmetry: an empty section is not announced, a failed one is", () => {
    const empty = renderToStaticMarkup(
      <SectionEmpty icon={Hash} title="No posts yet" detail="Be the first." />
    )
    const failed = renderToStaticMarkup(
      <SectionError title="We could not load #x" detail="It may be a moment." />
    )
    expect(empty).not.toContain("role=")
    expect(failed).toContain('role="alert"')
  })
})

describe("tokens", () => {
  it("draws no raw colour anywhere in these states", () => {
    const all = [
      renderToStaticMarkup(<NextPageError detail="x" onRetry={noop} />),
      renderToStaticMarkup(<AuthorsUnresolved onRetry={noop} />),
    ].join("")
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(all).not.toContain("rgb(")
  })
})
