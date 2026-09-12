import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ClearHistoryButtons } from "./ClearHistoryControl"

/**
 * Rendered with react-dom/server, the way ../channel/SubscribeControls.test.tsx
 * is, because this repo has neither jsdom nor a testing-library and two
 * shapes of one control are not worth dragging a browser runtime in for.
 * The drawing is a pure function of `armed`, so the first click is asserted
 * as "the shape with armed=true", and the click itself lives in the thin
 * wrapper and is checked by hand.
 */

const noop = () => undefined

function draw(over: Partial<Parameters<typeof ClearHistoryButtons>[0]> = {}) {
  return renderToStaticMarkup(
    <ClearHistoryButtons
      armed={false}
      pending={false}
      failed={false}
      onArm={noop}
      onCancel={noop}
      onConfirm={noop}
      {...over}
    />
  )
}

describe("ClearHistoryButtons", () => {
  it("offers to clear, unexpanded, with no Confirm on screen", () => {
    const html = draw()
    expect(html).toContain("Clear watch history")
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain("aria-controls=")
    expect(html).not.toContain(">Confirm<")
    expect(html).not.toContain('role="group"')
  })

  it("shows Confirm and Cancel only after the first click arms it", () => {
    // The second click is on the page, in the app's own words, and never
    // window.confirm. `role="group"` with a name is what a screen reader
    // announces before the two buttons.
    const html = draw({ armed: true })
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="Confirm clearing your watch history"')
    expect(html).toContain(">Confirm<")
    expect(html).toContain(">Cancel<")
    expect(html).not.toContain("Clear watch history")
  })

  it("is disabled, with a reason, when there is nothing to clear", () => {
    const html = draw({ empty: true })
    expect(html).toMatch(/\sdisabled(=""|\s|>)/)
    expect(html).toContain("Nothing to clear.")
  })

  it("says so, as a status, when the last attempt failed", () => {
    const html = draw({ failed: true })
    expect(html).toContain('role="status"')
    expect(html).toContain("could not be cleared")
  })

  it("holds both confirm buttons while the delete is in flight", () => {
    const html = draw({ armed: true, pending: true })
    const disabled = html.match(/\sdisabled(=""|\s|>)/g) ?? []
    expect(disabled.length).toBe(2)
  })
})
