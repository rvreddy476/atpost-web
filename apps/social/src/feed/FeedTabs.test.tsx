import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { FeedTabs, SAVED_REASON } from "./FeedTabs"

/**
 * The strip, rendered.
 *
 * `renderToStaticMarkup` the way LeftRail.test.tsx and TabStates.test.tsx do
 * it: this repo has no jsdom and no testing-library, and the two things worth
 * asserting about this strip are both in the markup — how many tabs there are,
 * and that the bookmark control is `aria-disabled` rather than silently dead.
 *
 * The keyboard behaviour is NOT asserted here and that is a real gap, stated
 * rather than hidden: a roving tabindex needs focus, and focus needs a DOM.
 * What a static render CAN prove is that exactly one tab is reachable, which
 * is the invariant the roving pattern rests on.
 */
const noop = () => {}

function render(selected: "for-you" | "following" | "hashtag" = "for-you") {
  return renderToStaticMarkup(
    <FeedTabs
      selected={selected}
      onSelect={noop}
      onBrowseTags={noop}
      onSay={noop}
      top={0}
      onHeightChange={noop}
    />
  )
}

describe("the strip", () => {
  it("draws EXACTLY two tabs", () => {
    // The founder's third change, asserted where somebody adding a third tab
    // would actually see it fail.
    const html = render("for-you")
    expect(html.match(/role="tab"/g)?.length).toBe(2)
    expect(html).toContain("For You")
    expect(html).toContain("Following")
    expect(html).not.toContain("HashTag")
  })

  it("marks the selected tab and only the selected tab", () => {
    const html = render("following")
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1)
    expect(html.match(/aria-selected="false"/g)?.length).toBe(1)
  })

  it("keeps exactly one tab in the tab order — the roving invariant", () => {
    const html = render("following")
    expect(html.match(/tabindex="0"/g)?.length).toBe(1)
    expect(html.match(/tabindex="-1"/g)?.length).toBe(1)
  })

  it("ALWAYS marks exactly one tab, even for an id that is not in the strip", () => {
    // The founder's report: at `?tab=hashtag` both tabs were plain text and
    // neither was marked, so the page looked like a tab control that had lost
    // its state. The caller no longer renders this strip for the tag browser
    // at all — HomeFeed replaces it with a heading and a way back — and this
    // is the belt to that braces: an id the strip does not contain still marks
    // the first tab rather than marking nothing.
    const html = render("hashtag")
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1)
    expect(html.match(/tabindex="0"/g)?.length).toBe(1)
  })

  it("puts the two icon controls OUTSIDE the tablist", () => {
    // Inside it, a screen reader would count four tabs and an arrow key could
    // land on one. The tablist closes before they open.
    const html = render("for-you")
    const listEnd = html.indexOf("</div>", html.indexOf('role="tablist"'))
    expect(html.indexOf("Browse trending tags")).toBeGreaterThan(listEnd)
    expect(html.indexOf("Saved posts")).toBeGreaterThan(listEnd)
  })

  it("offers a way into the tag browser without pretending to be a toggle", () => {
    // It carried `aria-pressed` while the browser rendered UNDER this strip.
    // It does not any more: the strip is not drawn in that view, so there is
    // no "on" state for this control to be in, and the way back is the tag
    // heading's own control.
    const html = render("for-you")
    expect(html).toContain("Browse trending tags")
    expect(html).not.toContain("aria-pressed")
  })

  it("renders the bookmark control as aria-disabled, never as `disabled`", () => {
    // `disabled` removes it from the focus order, and then the explanation for
    // why it cannot be used is announced to nobody. The rule ./destinations
    // and @atpost/ui's RoleSwitcher both keep.
    const html = render("for-you")
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain("<button disabled")
    // And it says WHY on hover as well as on press.
    expect(html).toContain(SAVED_REASON.slice(0, 30))
  })
})
