import { describe, expect, it } from "vitest"
import {
  NOT_SUBSCRIBED,
  bellLabel,
  parseNotifyOn,
  parseSubscription,
  subscribeLabel,
  subscriberCountAfter,
  subscriptionsToChannels,
  toggledNotifyOn,
} from "./subscription"

/**
 * The fixtures are the CONTRACT's shapes, not a wire read: the subscription
 * routes are being built on the server while this is written (see the header
 * of ./channelApi.ts). What is asserted here is the part that would fail
 * silently if the two ends disagreed: the default for the bell, the words
 * on the control, the direction the count moves. None of them throws.
 */

describe("parseSubscription: the founder's default is ON", () => {
  it("reads a subscribed row, with its bell and its date", () => {
    expect(
      parseSubscription({ subscribed: true, notify_on: "none", subscribed_at: "2026-09-12T10:00:00Z" })
    ).toEqual({ subscribed: true, notifyOn: "none", subscribedAt: "2026-09-12T10:00:00Z" })
  })

  it("defaults the bell to on when the row does not say", () => {
    expect(parseSubscription({ subscribed: true }).notifyOn).toBe("all")
  })

  it("reads a word it has never seen as on, never as off", () => {
    // A bell that read an unfamiliar word as "off" would silently un-notify
    // somebody who subscribed to be told.
    expect(parseSubscription({ subscribed: true, notify_on: "mentions" }).notifyOn).toBe("all")
    expect(parseNotifyOn("highlights")).toBe("all")
    expect(parseNotifyOn(undefined)).toBe("all")
    expect(parseNotifyOn("none")).toBe("none")
  })

  it("is NOT SUBSCRIBED for {subscribed:false}, and for anything malformed", () => {
    // The write that makes this a subscription is a button press; a parser
    // that guessed "subscribed" from a bad body would draw Unsubscribe on
    // somebody who never pressed anything.
    expect(parseSubscription({ subscribed: false })).toEqual(NOT_SUBSCRIBED)
    expect(parseSubscription(undefined)).toEqual(NOT_SUBSCRIBED)
    expect(parseSubscription(null)).toEqual(NOT_SUBSCRIBED)
    expect(parseSubscription("subscribed")).toEqual(NOT_SUBSCRIBED)
    expect(parseSubscription({ subscribed: "true" })).toEqual(NOT_SUBSCRIBED)
  })

  it("carries no date for an unsubscribed viewer", () => {
    expect(NOT_SUBSCRIBED.subscribedAt).toBeNull()
    expect(NOT_SUBSCRIBED.notifyOn).toBe("all")
  })
})

describe("toggledNotifyOn", () => {
  it("is the whole two-row table", () => {
    expect(toggledNotifyOn("all")).toBe("none")
    expect(toggledNotifyOn("none")).toBe("all")
  })
})

describe("labels", () => {
  it("names the ACTION on the subscribe button, with the channel's name", () => {
    expect(subscribeLabel({ subscribed: false }, "Ada")).toBe("Subscribe to Ada")
    expect(subscribeLabel({ subscribed: true }, "Ada")).toBe("Unsubscribe from Ada")
  })

  it("names the state and then the action on the bell", () => {
    expect(bellLabel({ notifyOn: "all" }, "Ada")).toBe("Notifications on for Ada, turn off")
    expect(bellLabel({ notifyOn: "none" }, "Ada")).toBe("Notifications off for Ada, turn on")
  })

  it("stands alone without a name rather than printing 'to '", () => {
    expect(subscribeLabel({ subscribed: false }, "")).toBe("Subscribe")
    expect(subscribeLabel({ subscribed: true }, "   ")).toBe("Unsubscribe")
    expect(bellLabel({ notifyOn: "all" }, "")).toBe("Notifications on, turn off")
  })
})

describe("subscriptionsToChannels: the rail's list", () => {
  const rows = [
    {
      channel: { user_id: "b", name: "Call B Studio", handle: "call.userb", avatar_url: null },
      notify_on: "all",
      subscribed_at: "2026-09-12T10:00:00Z",
    },
    {
      channel: { user_id: "a", name: "CQS Proof Channel", handle: "@cqsproof1" },
      notify_on: "none",
    },
    {
      channel: { user_id: "c", name: "  ", handle: "nameless" },
    },
    { channel: null },
    { channel: { user_id: "  ", name: "No id" } },
  ]

  it("keeps the server's order, because the cursor is a promise about it", () => {
    expect(subscriptionsToChannels(rows).map((c) => c.user_id)).toEqual(["b", "a"])
  })

  it("drops a row with an id and no name rather than listing 'Someone'", () => {
    // This list is how a viewer PICKS a channel; a rail of identical
    // placeholder rows is unusable in a way a missing row is not.
    expect(subscriptionsToChannels(rows).some((c) => c.user_id === "c")).toBe(false)
  })

  it("drops a row with no channel, or no id, because there is nothing to link to", () => {
    expect(subscriptionsToChannels(rows)).toHaveLength(2)
  })

  it("normalises the handle it stores, so the rail's links are not doubled", () => {
    expect(subscriptionsToChannels(rows)[1].handle).toBe("cqsproof1")
    expect(subscriptionsToChannels(rows)[0]).toEqual({
      user_id: "b",
      name: "Call B Studio",
      handle: "call.userb",
      avatar_url: null,
    })
  })

  it("survives an empty page", () => {
    expect(subscriptionsToChannels([])).toEqual([])
  })
})

describe("subscriberCountAfter: the number while a write is in flight", () => {
  it("moves by one in the direction of the press", () => {
    expect(subscriberCountAfter(1199, true)).toBe(1200)
    expect(subscriberCountAfter(1200, false)).toBe(1199)
  })

  it("leaves null as null, because a count we could not read is not zero", () => {
    expect(subscriberCountAfter(null, true)).toBeNull()
    expect(subscriberCountAfter(null, false)).toBeNull()
  })

  it("never goes below zero on a stale row", () => {
    expect(subscriberCountAfter(0, false)).toBe(0)
  })
})
