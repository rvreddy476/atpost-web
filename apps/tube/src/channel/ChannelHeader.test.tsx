import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { TubeChannel } from "@/tube/channels"
import type { SubscriptionEdge } from "@/tube/useSubscription"
import { NOT_SUBSCRIBED, type ChannelSubscription } from "@/tube/subscription"

/**
 * The channel header.
 *
 * The cases that matter are the ones a browser on a working dev stack would
 * never show you: a channel with a cover against one without, the owner's
 * view against a stranger's, and an edge that has not answered yet. Rendered
 * with react-dom/server for the reason ./SubscribeControls.test.tsx gives —
 * no jsdom in this repo, and the header is a pure function of its props.
 */

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { ChannelHeader } = await import("./ChannelHeader")

function channel(overrides: Partial<TubeChannel> = {}): TubeChannel {
  return {
    user_id: "u-1",
    name: "Ada",
    handle: "ada",
    about: "Weekly builds.",
    avatar_media_id: null,
    avatar_url: null,
    video_count: 3,
    subscriber_count: 12,
    created_at: "2026-01-02T03:04:05Z",
    updated_at: "2026-01-02T03:04:05Z",
    ...overrides,
  }
}

function edge(state: ChannelSubscription | undefined, count: number | null = 12): SubscriptionEdge {
  const noop = () => undefined
  return {
    state,
    subscriberCount: count,
    subscribe: { pending: false, failed: false, toggle: noop },
    notify: { pending: false, failed: false, toggle: noop },
  }
}

const render = (props: Partial<Parameters<typeof ChannelHeader>[0]> = {}) =>
  renderToStaticMarkup(
    <ChannelHeader
      channel={channel()}
      subscription={edge(NOT_SUBSCRIBED)}
      coverUrl={null}
      isOwner={false}
      videoCount={3}
      {...props}
    />
  )

describe("the banner", () => {
  it("uses the profile's cover when there is one", () => {
    const html = render({ coverUrl: "https://cdn/cover.jpg?sig=1" })
    expect(html).toContain("https://cdn/cover.jpg?sig=1")
  })

  it("draws the channel's own gradient when there is not — never a grey slab", () => {
    // This is TODAY's case for every channel: the profile row carries a
    // `cover_media_id` at best, which is not a URL a browser can load.
    const html = render({ coverUrl: null })
    expect(html).not.toContain("<img")
    expect(html).toContain("linear-gradient")
  })

  it("gives two different channels two different bands", () => {
    // FNV-1a over the handle. A band that was the same for everybody would be
    // page furniture rather than this channel's.
    const ada = render({ channel: channel({ handle: "ada" }) })
    const bob = render({ channel: channel({ handle: "bob" }) })
    const hue = (html: string) => html.match(/hsl\((\d+)/)?.[1]
    expect(hue(ada)).not.toBe(hue(bob))
  })

  it("is the same band for the same channel every time", () => {
    expect(render()).toBe(render())
  })
})

describe("who the header is for", () => {
  it("offers a stranger Subscribe, and no Edit", () => {
    const html = render({ isOwner: false, subscription: edge(NOT_SUBSCRIBED) })
    expect(html).toContain('aria-label="Subscribe to Ada"')
    expect(html).not.toContain("Edit channel")
  })

  it("offers the OWNER Edit, and never a subscription to themselves", () => {
    const html = render({ isOwner: true, subscription: edge(undefined) })
    expect(html).toContain("Edit channel")
    expect(html).toContain('href="/settings"')
    expect(html).not.toContain("Subscribe")
  })

  it("draws NO control at all while the edge is unknown", () => {
    // Undefined is "not yet known", which is not "not subscribed". A button
    // that appears and then flips has told somebody something false about
    // their own subscriptions.
    const html = render({ isOwner: false, subscription: edge(undefined) })
    expect(html).not.toContain("Subscribe")
    expect(html).not.toContain("Edit channel")
  })

  it("offers Share to everybody", () => {
    expect(render({ isOwner: true, subscription: edge(undefined) })).toContain(">Share<")
    expect(render({ isOwner: false })).toContain(">Share<")
  })
})

describe("the counts under the name", () => {
  it("prints the EDGE's subscriber count, which is the one that moves on a press", () => {
    expect(render({ subscription: edge(NOT_SUBSCRIBED, 1200) })).toContain("1.2K subscribers")
  })

  it("prints NO subscriber line at all for a count it could not read", () => {
    // Null is "we could not read it". "No subscribers yet" would be a false
    // statement about somebody's channel produced by a failed side request.
    const html = render({ subscription: edge(NOT_SUBSCRIBED, null) })
    expect(html).not.toContain("subscriber")
  })

  it("prints the video count the page can best state", () => {
    expect(render({ videoCount: 7 })).toContain("7 videos")
    expect(render({ videoCount: 0 })).toContain("No videos yet")
  })
})

describe("the about line", () => {
  it("clamps a short about and offers no more", () => {
    const html = render({ channel: channel({ about: "Weekly builds." }) })
    expect(html).toContain("Weekly builds.")
    expect(html).toContain("line-clamp-2")
    expect(html).not.toContain(">more<")
  })

  it("offers more for an about long enough to be hidden by the clamp", () => {
    const html = render({ channel: channel({ about: "x".repeat(300) }) })
    expect(html).toContain(">more<")
    expect(html).toContain('aria-expanded="false"')
  })

  it("draws nothing at all for a channel that wrote none", () => {
    const html = render({ channel: channel({ about: "" }) })
    expect(html).not.toContain("line-clamp-2")
  })
})
