import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ViewerStats, statText } from "./LeftRail"
import type { ViewerProfile } from "./api"

/**
 * The crash these exist for.
 *
 * `Stat` called `.toLocaleString()` straight on a prop typed `number`, from a
 * field ./api also typed `number`, from a response that promises none of them.
 * `/v1/profiles/me` serialises the raw profile-service row, so a row written
 * before a counter existed arrives without it — and `undefined
 * .toLocaleString()` is a TypeError thrown inside a component AppFrame renders
 * on every page of apps/social and apps/reels. There is no error boundary
 * between the rail and the document root, so React unmounted the whole tree:
 * one absent `friend_count` and the app was a blank page.
 *
 * Rendered with react-dom/server, the way packages/ui/src/RoleSwitcher.test.tsx
 * does it: this repo has no jsdom and no testing-library, and `ViewerStats` is
 * a pure function of a payload — no session, no provider, no network. That is
 * why it is its own component. The whole point of the seam is that the payload
 * which used to crash the product can now be handed to it in one line.
 */

/** A payload with every count present, as a healthy account sends it. */
const full: ViewerProfile = {
  user_id: "7c0d6f1e-0b2a-4a51-9a2b-8f2e1c9d3a44",
  display_name: "Raghuvaran",
  bio: "Building Momentum.",
  follower_count: 1204,
  following_count: 310,
  friend_count: 96,
  post_count: 88,
}

describe("statText", () => {
  it("formats a real count", () => {
    expect(statText(1204)).toBe((1204).toLocaleString())
  })

  it("keeps zero, which is a count and the commonest one on a new account", () => {
    // The trap a truthiness check falls into: `0 ? … : "—"` hides the true
    // answer behind the em dash that means "we do not know".
    expect(statText(0)).toBe((0).toLocaleString())
  })

  it("answers null for a field that is not there", () => {
    expect(statText(undefined)).toBeNull()
  })

  it("answers null for a JSON null", () => {
    expect(statText(null)).toBeNull()
  })

  it("answers null for a non-finite number rather than printing NaN", () => {
    // "NaN" under "Followers" is worse than nothing: it looks like a number
    // somebody could act on.
    expect(statText(Number.NaN)).toBeNull()
    expect(statText(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("answers null for a count that arrived as a string", () => {
    // A wire that starts sending "96" is a wire that has changed shape. The
    // rail says so by saying nothing, rather than by printing a number it did
    // not format.
    expect(statText("96")).toBeNull()
  })
})

describe("ViewerStats", () => {
  it("prints every count when the payload has them all", () => {
    const html = renderToStaticMarkup(<ViewerStats profile={full} />)
    expect(html).toContain((1204).toLocaleString())
    expect(html).toContain("96")
    expect(html).toContain("88")
    expect(html).not.toContain("Not available")
  })

  it("renders a payload with friend_count missing instead of throwing", () => {
    // THE regression. Everything else in this file is the shape of the fix;
    // this is the failure itself.
    const { friend_count: _omitted, ...missing } = full
    expect(() => renderToStaticMarkup(<ViewerStats profile={missing} />)).not.toThrow()

    const html = renderToStaticMarkup(<ViewerStats profile={missing} />)
    // The two that ARE there still print. A missing field costs one number,
    // not the card.
    expect(html).toContain((1204).toLocaleString())
    expect(html).toContain("88")
    // And the one that is not says so, in both voices: an em dash for the eye
    // and a word for a screen reader, which cannot read punctuation as meaning.
    expect(html).toContain("—")
    expect(html).toContain("Not available")
    // Still three columns. A count that is absent must not collapse the row
    // and re-flow the other two.
    expect(html.match(/Posts|Followers|Friends/g)).toHaveLength(3)
  })

  it("survives a payload with nothing in it but the id", () => {
    const bare: ViewerProfile = { user_id: full.user_id }
    const html = renderToStaticMarkup(<ViewerStats profile={bare} />)
    expect(html.match(/—/g)).toHaveLength(3)
    expect(html.match(/Not available/g)).toHaveLength(3)
  })

  it("survives counts sent as null, which is what a Go zero pointer marshals to", () => {
    const nulled = {
      ...full,
      friend_count: null,
      follower_count: null,
    } as unknown as ViewerProfile
    const html = renderToStaticMarkup(<ViewerStats profile={nulled} />)
    expect(html.match(/—/g)).toHaveLength(2)
    expect(html).toContain("88")
  })
})
