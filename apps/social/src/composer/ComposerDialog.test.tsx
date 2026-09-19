import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ComposerDialog } from "./ComposerDialog"

/**
 * The composer, rendered.
 *
 * ── What this can and cannot prove, stated rather than implied ────────────
 * `renderToStaticMarkup`, the way LeftRail.test.tsx does it: this repo has no
 * jsdom and no testing-library. So what is asserted here is the CONTRACT in
 * the markup — the dialog roles, the accessible names, the live regions, and
 * the fact that an empty draft cannot be posted.
 *
 * What is NOT asserted, and is a real gap:
 *   · the focus trap and the focus restore, which need a live document;
 *   · Escape-with-a-confirm, which needs a key event;
 *   · the upload and create round trips, which need a session.
 * The rules behind the last of those are pure and ARE tested — see
 * ./draft.test.ts and ./published.test.ts — which is most of why they were
 * pulled out of this component in the first place.
 */
const noop = () => {}
const viewer = { id: "3f0b0c2e-1111-4222-8333-444455556666", displayName: "Ada" }

function render(open: boolean) {
  return renderToStaticMarkup(<ComposerDialog open={open} onClose={noop} viewer={viewer} />)
}

describe("ComposerDialog", () => {
  it("renders NOTHING while closed", () => {
    // Unmounted rather than hidden: out of the accessibility tree, out of the
    // focus order, out of find-in-page — and the object URLs go with it.
    expect(render(false)).toBe("")
  })

  it("is a modal dialog with a name", () => {
    const html = render(true)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain("aria-labelledby=")
    expect(html).toContain("Create Post")
  })

  it("gives the backdrop an accessible name instead of being a bare div", () => {
    // A div that dismisses things is invisible to everything except a mouse.
    expect(render(true)).toContain('aria-label="Close the composer"')
  })

  it("cannot be posted while it is empty", () => {
    // The server would answer 400 EMPTY_POST. Refusing here means the person
    // is told in the box rather than after a round trip.
    const html = render(true)
    const post = html.slice(html.lastIndexOf("<button", html.indexOf(">Post<")))
    expect(post).toContain("disabled")
  })

  it("offers the four audiences, and the chosen one's sentence", () => {
    const html = render(true)
    for (const label of ["Public", "Unlisted", "Followers", "Private"]) {
      expect(html).toContain(`>${label}</option>`)
    }
    // Public is the default, so its hint is the one printed under the control.
    expect(html).toContain("Anyone can find and see it.")
  })

  it("has a live region for errors that exists BEFORE there is an error", () => {
    // A `role="alert"` that appears at the same moment as its text is a region
    // the announcement can be missed by.
    expect(render(true)).toContain('role="alert"')
  })

  it("names both file controls, since they are glyphs", () => {
    const html = render(true)
    expect(html).toContain('aria-label="Add photos"')
    expect(html).toContain('aria-label="Add a video"')
  })

  it("labels the text box, and does not rely on the placeholder to do it", () => {
    // A placeholder disappears the moment anyone types, and takes the field's
    // only label with it.
    const html = render(true)
    expect(html).toContain("What is happening?")
    expect(html).toContain("<label")
  })
})
