/**
 * A channel subscription, reduced to the values a control can be drawn from.
 *
 * Pure: no React, no network, no DOM, in the same discipline as ./channels.ts
 * and ./video.ts. Three surfaces draw the subscribe control (the channel page,
 * the watch page's channel row and the end-screen tile), and the words on it,
 * the direction the count moves and the default for the bell are the parts
 * that fail SILENTLY when two of them disagree. They live here once, and they
 * are asserted in ./subscription.test.ts without a server or an axios
 * instance.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A SUBSCRIPTION IS, AS OF 2026-09-12
 *
 * The founder's decision: Subscribe is ONE button that both follows the owner
 * and turns notifications on; Unsubscribe removes both. Every subscriber is
 * notified by default, and a per-channel bell turns that off and back on
 * without touching the subscription itself. On the wire:
 *
 *     GET    /v1/channels/{ref}/subscription
 *            {subscribed:false} | {subscribed:true, notify_on, subscribed_at}
 *     POST   /v1/channels/{ref}/subscribe    {notify_on?}
 *            {status:"subscribed", notify_on, follow, subscriber_count}
 *     DELETE /v1/channels/{ref}/subscribe
 *            {status:"unsubscribed", subscriber_count}
 *     PATCH  /v1/channels/{ref}/subscription {notify_on}
 *            {subscribed:true, notify_on}
 *
 * `notify_on` is "all" or "none". The server is being built against this
 * contract while this file is written, which is why every parser below is
 * defensive about the shape and none of them is defensive about the meaning:
 * an unknown `notify_on` is read as "all", because the founder's default is
 * on, and a bell that read an unfamiliar word as "off" would silently
 * un-notify somebody who subscribed to be told.
 *
 * ── Subscribing is still following underneath ─────────────────────────────
 * The subscribe route creates the follow edge itself and answers `follow:
 * "followed" | "requested"` for the same reason @momentum/interactions'
 * FollowButton has three states: a private account turns a follow into a
 * request. The subscription is real either way (it is the notification
 * preference plus the edge), so the control says "Subscribed" in both cases
 * and the `follow` word is carried for analytics rather than drawn.
 */

import type { ChannelRef } from "./channels"
import { bareHandle } from "./channels"

/** Which of a channel's uploads the subscriber is told about. */
export type NotifyOn = "all" | "none"

export interface ChannelSubscription {
  subscribed: boolean
  /** Meaningful only while `subscribed`; carried as "all" otherwise. */
  notifyOn: NotifyOn
  /** RFC3339 from the server, or null when not subscribed or not sent. */
  subscribedAt: string | null
}

/** The one value an unsubscribed viewer ever holds. Default-on, see above. */
export const NOT_SUBSCRIBED: ChannelSubscription = Object.freeze({
  subscribed: false,
  notifyOn: "all",
  subscribedAt: null,
})

/* ── Parsing ──────────────────────────────────────────────────────────────── */

/**
 * "none" means off. Everything else, including a word this client has never
 * seen and a missing field, means on. The asymmetry is the founder's default
 * written as code: a subscriber is notified unless they said otherwise, and
 * the only word that says otherwise is "none".
 */
export function parseNotifyOn(raw: unknown): NotifyOn {
  return raw === "none" ? "none" : "all"
}

/**
 * The GET body, or a PATCH body, as a `ChannelSubscription`.
 *
 * Anything that is not an object with `subscribed: true` is NOT SUBSCRIBED.
 * That includes an empty body and a null one, which is deliberate in the same
 * direction as `parseNotifyOn`'s is: the write that turns this into a
 * subscription is the person's own button press, and a parser that guessed
 * "subscribed" from a malformed answer would draw Unsubscribe on somebody who
 * never pressed anything.
 */
export function parseSubscription(body: unknown): ChannelSubscription {
  if (!body || typeof body !== "object") return NOT_SUBSCRIBED
  const row = body as { subscribed?: unknown; notify_on?: unknown; subscribed_at?: unknown }
  if (row.subscribed !== true) return NOT_SUBSCRIBED
  return {
    subscribed: true,
    notifyOn: parseNotifyOn(row.notify_on),
    subscribedAt: typeof row.subscribed_at === "string" ? row.subscribed_at : null,
  }
}

/** The bell's other state. Two values, so this is the whole table. */
export function toggledNotifyOn(current: NotifyOn): NotifyOn {
  return current === "all" ? "none" : "all"
}

/* ── Labels ───────────────────────────────────────────────────────────────── */

/**
 * The accessible name of the subscribe button.
 *
 * "Subscribe to Ada" and "Unsubscribe from Ada": the verb says what pressing
 * it DOES, which is what `aria-label` is for, while the visible text says
 * what state it is IN ("Subscribed"). Those are different sentences and a
 * screen reader that hears "Subscribed, pressed" has been told the state
 * twice and the action never. Without a name the verb stands alone.
 */
export function subscribeLabel(sub: { subscribed: boolean }, name: string): string {
  const who = name.trim()
  if (sub.subscribed) return who ? `Unsubscribe from ${who}` : "Unsubscribe"
  return who ? `Subscribe to ${who}` : "Subscribe"
}

/**
 * The accessible name of the bell. State first, then the action, because the
 * bell has no visible text at all and both halves have to be said.
 */
export function bellLabel(sub: { notifyOn: NotifyOn }, name: string): string {
  const who = name.trim()
  const on = sub.notifyOn === "all"
  const state = who ? `Notifications ${on ? "on" : "off"} for ${who}` : `Notifications ${on ? "on" : "off"}`
  return `${state}, turn ${on ? "off" : "on"}`
}

/* ── The subscriptions list ───────────────────────────────────────────────── */

/** One row of `GET /v1/channels/subscriptions`, as post-service sends it. */
export interface SubscriptionRow {
  channel?: {
    user_id?: string | null
    name?: string | null
    handle?: string | null
    avatar_url?: string | null
    subscriber_count?: number | null
  } | null
  notify_on?: unknown
  subscribed_at?: string | null
}

/**
 * The rail's channel list, from the subscriptions endpoint.
 *
 * The server's order is kept as sent. The endpoint pages on a cursor, and a
 * client that re-sorted one page would put a channel from page two above one
 * from page one on the next scroll; the ordering is the server's decision and
 * the cursor is a promise about it.
 *
 * A row with an id and no name is dropped rather than drawn as "Someone", for
 * the reason the old feed-derived list gave: this list is how a viewer PICKS a
 * channel, and a rail of identical placeholder rows is unusable in a way a
 * missing row is not. A row with no channel at all is dropped for the plainer
 * reason that there is nothing to link to.
 *
 * The handle is normalised through `bareHandle` so a row that arrives as
 * "@ada" and one that arrives as "ada" build the same `/@ada`.
 */
export function subscriptionsToChannels(rows: readonly SubscriptionRow[]): ChannelRef[] {
  const out: ChannelRef[] = []
  for (const row of rows) {
    const channel = row?.channel
    const id = channel?.user_id?.trim()
    if (!id) continue
    const name = channel?.name?.trim()
    if (!name) continue
    out.push({
      user_id: id,
      name,
      handle: bareHandle(channel?.handle) ?? "",
      avatar_url: channel?.avatar_url ?? null,
    })
  }
  return out
}

/* ── The count ────────────────────────────────────────────────────────────── */

/**
 * The subscriber count while a subscribe (`on`) or unsubscribe is in flight.
 *
 * Null stays null. A count this client could not read is not a count of
 * zero, and an optimistic "0 + 1 = 1 subscriber" under a channel that has
 * ten thousand would be a claim about somebody's audience made from nothing.
 * The floor at zero covers the other direction: a stale row that says 0
 * while the viewer is in fact subscribed must not print "-1 subscribers".
 *
 * The server's own number replaces this the moment the write answers, for
 * the reason `useOptimisticToggle` gives about likes: other people have been
 * subscribing too.
 */
export function subscriberCountAfter(count: number | null, on: boolean): number | null {
  if (count === null) return null
  return Math.max(0, count + (on ? 1 : -1))
}
