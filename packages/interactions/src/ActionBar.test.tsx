/**
 * The bar, rendered.
 *
 * Server-rendered with react-dom/server rather than a testing-library — this
 * repo has neither jsdom nor @testing-library, and the bar's controls are
 * pure functions of their props, so every state is one render. What a server
 * render cannot see is a press; the optimistic behaviour behind one lives in
 * ./useOptimisticToggle.ts.
 *
 * The test this file exists for is the share one. `ActionBar` drew a Share
 * control whenever `hide_share` was false — handler or no handler — and
 * apps/social passed no handler, so the front page of the product shipped a
 * focusable, pressable, correctly-announced button that did nothing at all on
 * any press. The bar had always applied "absent, not disabled" to Repost; it
 * applies it to Share now, which is what makes an unwired control impossible
 * rather than merely unlikely.
 */

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ActionBar } from "./ActionBar"

const noop = async () => ({ on: true, count: 1 })

function bar(props: Partial<React.ComponentProps<typeof ActionBar>> = {}) {
  return renderToStaticMarkup(
    <ActionBar
      likes={3}
      comments={2}
      hasLiked={false}
      isSaved={false}
      onLike={noop}
      onSave={noop}
      label="Ada's post"
      {...props}
    />
  )
}

describe("ActionBar share", () => {
  it("draws no share control when nothing is wired to share", () => {
    const html = bar()
    expect(html).not.toContain('aria-label="Share on Ada&#x27;s post"')
  })

  it("draws it once a handler exists", () => {
    const html = bar({ onShare: () => undefined })
    expect(html).toContain('aria-label="Share on Ada&#x27;s post"')
  })

  it("still respects the author's own switch", () => {
    // `hide_share` is enforced server-side, so a control offered over it
    // would be promising something the server refuses.
    const html = bar({ onShare: () => undefined, hideShare: true })
    expect(html).not.toContain('aria-label="Share on Ada&#x27;s post"')
  })
})

describe("ActionBar counts", () => {
  it("seeds each control from its prop", () => {
    const html = bar({ hasLiked: true })
    expect(html).toContain(">3<")
    expect(html).toContain(">2<")
    expect(html).toContain('aria-label="Unlike on Ada&#x27;s post"')
  })

  it("omits a zero rather than drawing it", () => {
    // "0" is noise; the icon already says what it counts.
    const html = bar({ likes: 0, comments: 0 })
    expect(html).not.toContain(">0<")
  })

  it("drops the repost control when no handler is wired", () => {
    expect(bar()).not.toContain("Repost")
    expect(bar({ onRepost: noop, reposts: 5 })).toContain('aria-label="Repost on Ada&#x27;s post"')
  })

  it("drops the comment control when the author switched comments off", () => {
    expect(bar({ noComments: true })).not.toContain('aria-label="Comments on Ada&#x27;s post"')
  })

  it("draws no raw colour, only tokens", () => {
    const html = bar({ onShare: () => undefined, onRepost: noop, hasLiked: true, isSaved: true })
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toContain("rgb(")
  })
})
