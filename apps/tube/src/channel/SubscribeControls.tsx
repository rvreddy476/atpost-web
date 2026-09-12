"use client"

/**
 * The subscribe button and the bell.
 *
 * ── Two controls, drawn by three surfaces, from one edge ──────────────────
 * The channel page's header, the watch page's channel row and the end-screen
 * `channel_subscribe` tile all draw these, and they draw them from the same
 * `SubscriptionEdge` that ../tube/useSubscription.ts produces. Nothing here
 * fetches, decides or remembers: the state comes in as props and the presses
 * go out as callbacks, which is what lets ./SubscribeControls.test.tsx render
 * every state with `renderToStaticMarkup` and no browser.
 *
 * ── Why these are not `FollowButton` with a `labels` prop any more ────────
 * They were, while subscribing was a follow with different words on it. It
 * is its own edge now, with a second control (the bell) that a follow never
 * had, and a button whose accessible name should say "Subscribe to Ada"
 * rather than "Subscribe Ada". The pill, the receding settled state and the
 * "Try again" on failure are kept from FollowButton on purpose, so the two
 * controls read as one family across the product.
 *
 * ── The bell exists only while subscribed ─────────────────────────────────
 * Not disabled, not greyed: absent. A bell beside Subscribe would be a
 * promise about notifications for a channel the person is not subscribed
 * to, and the founder's model is that Subscribe itself turns them on.
 *
 * ── Pressed-state buttons, not switches ───────────────────────────────────
 * `aria-pressed` on both. A toggle button whose label names the action and
 * whose pressed state names the condition is the pattern screen readers
 * announce cleanly ("Subscribe to Ada, toggle button, pressed"); `role=
 * "switch"` would want on/off semantics the subscribe button does not have.
 */

import { Bell, BellOff } from "lucide-react"
import { bellLabel, subscribeLabel, type ChannelSubscription } from "@/tube/subscription"
import type { SubscriptionEdge } from "@/tube/useSubscription"

const PILL =
  "rounded-mo-pill border text-sm font-semibold transition-colors duration-150 ease-mo " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo " +
  "disabled:cursor-progress"

export interface SubscribeButtonProps {
  subscribed: boolean
  /** The channel's name, for the accessible label. Empty is allowed. */
  name: string
  pending?: boolean
  failed?: boolean
  onToggle: () => void
  className?: string
}

export function SubscribeButton({
  subscribed,
  name,
  pending = false,
  failed = false,
  onToggle,
  className,
}: SubscribeButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={subscribed}
      aria-label={subscribeLabel({ subscribed }, name)}
      className={[
        PILL,
        "px-4 py-2",
        subscribed
          ? // Subscribed is a settled state, not an invitation. It recedes.
            "border-mo text-mo-body hover:bg-mo-raised"
          : // Cyan is the interactive colour, the one accent that survives
            // small text on a card.
            "border-mo-strong text-mo-cyan hover:bg-mo-raised",
        failed ? "border-mo-bad" : "",
        className ?? "",
      ].join(" ")}
    >
      {failed ? "Try again" : subscribed ? "Subscribed" : "Subscribe"}
    </button>
  )
}

export interface NotifyBellProps {
  subscription: ChannelSubscription
  name: string
  pending?: boolean
  failed?: boolean
  onToggle: () => void
}

export function NotifyBell({
  subscription,
  name,
  pending = false,
  failed = false,
  onToggle,
}: NotifyBellProps) {
  if (!subscription.subscribed) return null
  const on = subscription.notifyOn === "all"

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={on}
        aria-label={bellLabel(subscription, name)}
        className={[
          PILL,
          // 40x40: the same height as the subscribe button beside it, and the
          // smallest square a thumb reliably hits.
          "inline-flex h-10 w-10 items-center justify-center",
          on ? "border-mo-strong text-mo-ink hover:bg-mo-raised" : "border-mo text-mo-body hover:bg-mo-raised",
          failed ? "border-mo-bad" : "",
        ].join(" ")}
      >
        {on ? (
          <Bell aria-hidden="true" className="h-5 w-5" />
        ) : (
          <BellOff aria-hidden="true" className="h-5 w-5" />
        )}
      </button>
      {/* The bell has no text to turn into "Try again", so the failure is a
          sentence beside it, announced without stealing focus. */}
      {failed && (
        <span role="status" className="text-xs text-mo-bad">
          Notifications did not change. Try again.
        </span>
      )}
    </span>
  )
}

/**
 * Both controls, from one edge, in the order they are read: the decision,
 * then the preference about it. Renders nothing while the edge is unknown,
 * which is the rule every caller would otherwise have to remember.
 */
export function SubscribeControls({
  edge,
  name,
  className,
}: {
  edge: SubscriptionEdge
  name: string
  className?: string
}) {
  if (!edge.state) return null
  return (
    <span className={["inline-flex items-center gap-2", className ?? ""].join(" ")}>
      <SubscribeButton
        subscribed={edge.state.subscribed}
        name={name}
        pending={edge.subscribe.pending}
        failed={edge.subscribe.failed}
        onToggle={edge.subscribe.toggle}
      />
      <NotifyBell
        subscription={edge.state}
        name={name}
        pending={edge.notify.pending}
        failed={edge.notify.failed}
        onToggle={edge.notify.toggle}
      />
    </span>
  )
}
