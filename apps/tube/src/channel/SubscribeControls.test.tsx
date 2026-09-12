import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { NOT_SUBSCRIBED, type ChannelSubscription } from "@/tube/subscription"
import type { SubscriptionEdge } from "@/tube/useSubscription"
import { NotifyBell, SubscribeButton, SubscribeControls } from "./SubscribeControls"

/**
 * Rendered with react-dom/server rather than a testing-library, the way
 * packages/ui's RoleSwitcher test is, because this repo has neither jsdom nor
 * @testing-library installed and two buttons are not worth dragging a browser
 * runtime in for. Both controls are pure functions of their props, so every
 * state is one render. What server rendering cannot see is the press itself,
 * which lives in ../tube/useSubscription.ts and is checked by hand.
 */

const noop = () => undefined

const SUBSCRIBED_ON: ChannelSubscription = {
  subscribed: true,
  notifyOn: "all",
  subscribedAt: "2026-09-12T10:00:00Z",
}
const SUBSCRIBED_OFF: ChannelSubscription = { ...SUBSCRIBED_ON, notifyOn: "none" }

function edge(state: ChannelSubscription | undefined): SubscriptionEdge {
  return {
    state,
    subscriberCount: 12,
    subscribe: { pending: false, failed: false, toggle: noop },
    notify: { pending: false, failed: false, toggle: noop },
  }
}

describe("SubscribeButton", () => {
  it("offers to subscribe, unpressed, when not subscribed", () => {
    const html = renderToStaticMarkup(
      <SubscribeButton subscribed={false} name="Ada" onToggle={noop} />
    )
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('aria-label="Subscribe to Ada"')
    expect(html).toContain(">Subscribe<")
  })

  it("offers to unsubscribe, pressed, when subscribed", () => {
    const html = renderToStaticMarkup(<SubscribeButton subscribed name="Ada" onToggle={noop} />)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="Unsubscribe from Ada"')
    expect(html).toContain(">Subscribed<")
  })

  it("says Try again after a failed write, and still names the action", () => {
    const html = renderToStaticMarkup(
      <SubscribeButton subscribed={false} name="Ada" failed onToggle={noop} />
    )
    expect(html).toContain(">Try again<")
    expect(html).toContain('aria-label="Subscribe to Ada"')
  })

  it("is disabled only while a write is in flight", () => {
    expect(
      renderToStaticMarkup(<SubscribeButton subscribed={false} name="Ada" pending onToggle={noop} />)
    ).toMatch(/\sdisabled(=""|\s|>)/)
    expect(
      renderToStaticMarkup(<SubscribeButton subscribed={false} name="Ada" onToggle={noop} />)
    ).not.toMatch(/\sdisabled(=""|\s|>)/)
  })
})

describe("NotifyBell", () => {
  it("is pressed and offers to turn off while notifications are on", () => {
    const html = renderToStaticMarkup(
      <NotifyBell subscription={SUBSCRIBED_ON} name="Ada" onToggle={noop} />
    )
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-label="Notifications on for Ada, turn off"')
  })

  it("is unpressed and offers to turn on while notifications are off", () => {
    const html = renderToStaticMarkup(
      <NotifyBell subscription={SUBSCRIBED_OFF} name="Ada" onToggle={noop} />
    )
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('aria-label="Notifications off for Ada, turn on"')
  })

  it("is absent, not disabled, when not subscribed", () => {
    // A bell beside Subscribe would be a promise about notifications for a
    // channel the person is not subscribed to.
    expect(
      renderToStaticMarkup(<NotifyBell subscription={NOT_SUBSCRIBED} name="Ada" onToggle={noop} />)
    ).toBe("")
  })

  it("reports a failed write as a status line, since it has no text to change", () => {
    const html = renderToStaticMarkup(
      <NotifyBell subscription={SUBSCRIBED_ON} name="Ada" failed onToggle={noop} />
    )
    expect(html).toContain('role="status"')
    expect(html).toContain("Try again")
  })
})

describe("SubscribeControls: both, from one edge", () => {
  it("renders nothing while the edge is unknown", () => {
    // The rule every surface would otherwise have to remember: a button that
    // appears and then flips has told somebody something false.
    expect(renderToStaticMarkup(<SubscribeControls edge={edge(undefined)} name="Ada" />)).toBe("")
  })

  it("draws the button alone when not subscribed", () => {
    const html = renderToStaticMarkup(<SubscribeControls edge={edge(NOT_SUBSCRIBED)} name="Ada" />)
    expect(html).toContain('aria-label="Subscribe to Ada"')
    expect(html).not.toContain("Notifications")
  })

  it("draws the button and the bell when subscribed", () => {
    const html = renderToStaticMarkup(<SubscribeControls edge={edge(SUBSCRIBED_ON)} name="Ada" />)
    expect(html).toContain('aria-label="Unsubscribe from Ada"')
    expect(html).toContain('aria-label="Notifications on for Ada, turn off"')
  })
})
