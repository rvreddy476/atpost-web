import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { RailRow } from "./RailRow"
import { EXIT_ITEM, SIGNED_OUT_REASON, settingsItem, youItems } from "./rail"

/**
 * Rendered with react-dom/server rather than a testing-library, the way
 * ../channel/SubscribeControls.test.tsx is, because this repo has neither
 * jsdom nor @testing-library installed.
 *
 * ── Only the two branches that do not touch `next/link` ───────────────────
 * `RailRow` has three shapes: a disabled `<span>`, a plain `<a>` for a
 * cross-zone row, and a `next/link` for an in-zone one. The first two are
 * asserted here. The third is deliberately not: `Link` reads the App Router
 * context, which does not exist outside a Next render, so a test of it would
 * be a test of a fallback path rather than of the thing that ships. WHICH
 * branch a row takes is decided by `isActionable` and `item.external`, and
 * both are pure and covered in ./rail.test.ts.
 */

const DARK = settingsItem({ signedIn: false })

describe("a dark row is aria-disabled, never disabled", () => {
  /**
   * Straight from packages/ui/src/RoleSwitcher.tsx, which made the decision
   * first and wrote down why: `disabled` removes the control from the focus
   * order, so the explanation is announced to nobody and the row has been
   * silently dropped again for exactly the people who most need telling.
   */
  it("stays focusable and carries its reason through aria-describedby", () => {
    const html = renderToStaticMarkup(<RailRow item={DARK} current={false} />)
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain("aria-describedby=")
    expect(html).toContain(SIGNED_OUT_REASON)
    // A `<span role="link">`, never an anchor: the anchor branch is the only
    // code that reads `href`, and it is unreachable without one.
    expect(html).not.toContain("<a ")
    expect(html).not.toContain("disabled=\"\"")
  })

  it("never emits an href for a row that has none", () => {
    for (const row of youItems({ signedIn: false })) {
      const html = renderToStaticMarkup(<RailRow item={row} current={false} />)
      expect(html, row.id).not.toContain("href")
    }
  })

  it("keeps the reason in the accessibility tree and out of the visible row", () => {
    const html = renderToStaticMarkup(<RailRow item={DARK} current={false} />)
    // `sr-only`, so the sentence is announced but does not double the rail's
    // height with a paragraph under every dark row.
    expect(html).toContain("sr-only")
  })
})

describe("a cross-zone row is a plain anchor", () => {
  /**
   * `next/link` would prefix this zone's basePath and ask for `/tube/social`.
   * `item.external` is set in the data rather than guessed from the string,
   * and this is where that flag turns into markup.
   */
  it("goes to the absolute path, with no zone prefix added", () => {
    const html = renderToStaticMarkup(<RailRow item={EXIT_ITEM} current={false} />)
    expect(html).toContain('href="/social"')
    expect(html).not.toContain("/tube/social")
  })

  it("is never marked as the current page, because you are not inside it", () => {
    // `aria-current` on an external row is a lie a screen reader repeats on
    // every visit. `currentRailId` never returns one, and the anchor branch
    // does not set the attribute at all.
    const html = renderToStaticMarkup(<RailRow item={EXIT_ITEM} current />)
    expect(html).not.toContain("aria-current")
  })
})

describe("the 76px icon rail", () => {
  /**
   * The short word is a VISUAL substitution only. `label` stays the announced
   * name at both widths, so a screen-reader user hears "Back to Momentum"
   * whichever shape is on screen and the two can never disagree about where a
   * row goes.
   */
  it("shows the short word and still announces the full one", () => {
    const html = renderToStaticMarkup(<RailRow item={EXIT_ITEM} current={false} collapsed />)
    expect(html).toContain(EXIT_ITEM.shortLabel as string)
    expect(html).toContain(`aria-label="${EXIT_ITEM.label}"`)
    // And a tooltip for a mouse, which has no other way to read the full name.
    expect(html).toContain(`title="${EXIT_ITEM.label}"`)
  })

  it("adds no aria-label when the visible word is already the full one", () => {
    // An `aria-label` repeating the text it sits on is noise, and it is the
    // one attribute that silently overrides content a sighted user can read.
    const upload = youItems({ signedIn: true }).find((row) => row.id === "upload")!
    const html = renderToStaticMarkup(<RailRow item={upload} current={false} collapsed />)
    expect(html).not.toContain("aria-label")
  })
})
