"use client"

/**
 * The viewer's subscription to the ONE channel on this page.
 *
 * The successor to ./useFollowState.ts on the watch page and to the
 * `relationships/batch` effect the channel page used to carry, and it keeps
 * both of their rules:
 *
 * ── "Not yet known" is a state, and it is not "not subscribed" ────────────
 * `state` is `undefined` until `GET …/subscription` answers, and the caller
 * must not draw a Subscribe button on `undefined`. A button that appears on a
 * channel somebody already subscribes to and then flips to Subscribed a beat
 * later is worse than one that arrives late: the person in between has been
 * told something false about their own subscriptions.
 *
 * ── A failed lookup is not recorded ───────────────────────────────────────
 * If the GET fails the edge stays unknown and the control stays absent,
 * rather than being written down as "not subscribed" and offering Subscribe
 * to somebody who already is. `fetchSubscription` throws for exactly this
 * reason instead of answering a default.
 *
 * ── Never asked about the viewer's own channel, never while signed out ────
 * The server would answer "not subscribed" for both and the caller would then
 * draw a button offering to subscribe to yourself, or a button a signed-out
 * browser cannot press.
 *
 * ── Optimistic, with the failure VISIBLE ──────────────────────────────────
 * The subscribe toggle and the bell both write first and ask second, and both
 * roll back AND report when the write fails, in the discipline
 * @momentum/interactions' `useOptimisticToggle` sets out: a rollback nobody
 * is told about is a state that was shown and never true. That hook is not
 * used directly, and the reason is structural rather than taste. It seeds its
 * state from `initial` on first render and never re-reads it, and here the
 * initial value arrives from the network AFTER mount, when the control is
 * first allowed to exist. The watch page used to work around exactly this by
 * remounting `FollowButton` with a `key` whenever the edge changed; this hook
 * exists so that three surfaces do not each need that trick. What it keeps
 * from `useOptimisticToggle`: presses are DROPPED while one is in flight
 * (never queued), the rollback restores what was captured before the write,
 * and the server's count replaces the optimistic one rather than being
 * reconciled with it.
 *
 * ── The count is the channel's, adjusted, then replaced ───────────────────
 * `initialCount` is the row's `subscriber_count`, and it may itself arrive
 * late (the watch page reads it off a channel fetch that races this one).
 * So the count is DERIVED every render: the server's number from the last
 * write if there was one, else the row's, moved by one while a write is in
 * flight, and null stays null throughout (`subscriberCountAfter` says why).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSubscription, setNotifyOn, subscribe, unsubscribe } from "./channelApi"
import {
  NOT_SUBSCRIBED,
  subscriberCountAfter,
  toggledNotifyOn,
  type ChannelSubscription,
} from "./subscription"

/** One optimistic control: whether it is writing and whether the last write failed. */
export interface SubscriptionControl {
  pending: boolean
  failed: boolean
  toggle: () => void
}

export interface SubscriptionEdge {
  /** Undefined means "not yet known", never "not subscribed". */
  state: ChannelSubscription | undefined
  /** The channel's subscriber count as this page should print it, or null. */
  subscriberCount: number | null
  /** Subscribe or unsubscribe, whichever `state` is not. */
  subscribe: SubscriptionControl
  /** The bell. A no-op unless subscribed; the bell is not drawn otherwise. */
  notify: SubscriptionControl
}

export interface UseSubscriptionOptions {
  /**
   * Called once a SUBSCRIBE has settled on the server, with the follow edge
   * it created. The watch page records `follow_from_content` from it; the
   * channel page passes nothing. Held in a ref, so a fresh closure every
   * render does not make the toggle a fresh function every render.
   */
  onSubscribed?: (follow: "followed" | "requested") => void
}

export function useSubscription(
  viewerId: string | null,
  channelId: string | null | undefined,
  initialCount: number | null,
  options: UseSubscriptionOptions = {}
): SubscriptionEdge {
  const [known, setKnown] = useState<ChannelSubscription | undefined>(undefined)

  /** The subscribed value being written, while the write is in flight. */
  const [writing, setWriting] = useState<boolean | null>(null)
  const [subscribeFailed, setSubscribeFailed] = useState(false)
  /** The server's count from the last settled write; the row's until then. */
  const [settledCount, setSettledCount] = useState<number | null>(null)

  const [bellPending, setBellPending] = useState(false)
  const [bellFailed, setBellFailed] = useState(false)

  const subscribeInFlight = useRef(false)
  const bellInFlight = useRef(false)
  const onSubscribed = useRef(options.onSubscribed)
  onSubscribed.current = options.onSubscribed

  useEffect(() => {
    setKnown(undefined)
    setWriting(null)
    setSubscribeFailed(false)
    setSettledCount(null)
    setBellFailed(false)
    if (!viewerId || !channelId || channelId === viewerId) return
    let cancelled = false
    fetchSubscription(channelId)
      .then((found) => {
        if (!cancelled) setKnown(found)
      })
      // Deliberately silent and deliberately not recorded. See the header.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [viewerId, channelId])

  const toggleSubscribe = useCallback(() => {
    if (!channelId || !known || subscribeInFlight.current) return
    subscribeInFlight.current = true
    const next = !known.subscribed
    setWriting(next)
    setSubscribeFailed(false)

    // `setWriting(null)` sits inside each branch rather than in a `finally`
    // so the settled edge and the end of the write land in ONE callback and
    // one render: a `finally` is a later microtask, and a frame in which the
    // server's answer is known but the optimistic value still overrides it
    // is a frame that could show the wrong button.
    const write = next
      ? subscribe(channelId).then((outcome) => {
          // The server's notify_on, not an assumption: it applied the
          // default, and the bell must show what it chose.
          setKnown({ subscribed: true, notifyOn: outcome.notifyOn, subscribedAt: null })
          if (outcome.subscriberCount !== null) setSettledCount(outcome.subscriberCount)
          setWriting(null)
          onSubscribed.current?.(outcome.follow)
        })
      : unsubscribe(channelId).then((outcome) => {
          setKnown(NOT_SUBSCRIBED)
          if (outcome.subscriberCount !== null) setSettledCount(outcome.subscriberCount)
          setWriting(null)
        })

    write
      .catch(() => {
        // `known` was never changed for the optimistic write, so the rollback
        // is simply the end of the write. The failure is what gets recorded.
        setSubscribeFailed(true)
        setWriting(null)
      })
      .finally(() => {
        subscribeInFlight.current = false
      })
  }, [channelId, known])

  const toggleNotify = useCallback(() => {
    if (!channelId || !known?.subscribed || bellInFlight.current) return
    bellInFlight.current = true
    const before = known.notifyOn
    const next = toggledNotifyOn(before)
    setBellPending(true)
    setBellFailed(false)
    setKnown({ ...known, notifyOn: next })

    setNotifyOn(channelId, next)
      .then((settled) => {
        setKnown((current) => (current ? { ...current, notifyOn: settled } : current))
      })
      .catch(() => {
        setKnown((current) => (current ? { ...current, notifyOn: before } : current))
        setBellFailed(true)
      })
      .finally(() => {
        bellInFlight.current = false
        setBellPending(false)
      })
  }, [channelId, known])

  const state: ChannelSubscription | undefined =
    known && writing !== null ? { ...known, subscribed: writing } : known

  const base = settledCount ?? initialCount
  const subscriberCount = writing === null ? base : subscriberCountAfter(base, writing)

  return {
    state,
    subscriberCount,
    subscribe: { pending: writing !== null, failed: subscribeFailed, toggle: toggleSubscribe },
    notify: { pending: bellPending, failed: bellFailed, toggle: toggleNotify },
  }
}
