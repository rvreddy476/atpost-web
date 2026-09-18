"use client"

/**
 * What a channel page shows when it is not showing a channel.
 *
 * Gathered out of ./ChannelScreen.tsx so that the two PAGE-level states can
 * also be rendered by `app/channel/[handle]/not-found.tsx`, which is a server
 * route and cannot reach into a component's private helpers. Everything here
 * is a pure function of its props: no hooks, no network, no state — which is
 * what lets ./states.test.tsx render every one of them with
 * `renderToStaticMarkup` and no browser.
 *
 * ── Two failures that must never be confused ──────────────────────────────
 * "No such channel" and "this channel could not be loaded" are different
 * sentences about different facts, and the one thing this page must not do is
 * tell a creator their channel is gone because a request timed out.
 * `fetchChannel` turns a 404 into null and rethrows everything else precisely
 * so these two can stay apart, and `fetchChannelOnServer` answers a three-way
 * result for the same reason.
 */

import { AlertTriangle, Tv } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { VIDEO_GRID } from "@/browse/grid"
import { atHandle } from "@/tube/channels"
import { SHORTS_GRID } from "./ShortCard"

/* ── Page-level plates ────────────────────────────────────────────────────── */

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}

function PlateTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
      {children}
    </h1>
  )
}

/**
 * A handle that belongs to nobody.
 *
 * `ref` is echoed back because "Nothing answers to @adaa" is a debuggable
 * sentence and "Channel not found" is not: a typo is the commonest cause and
 * seeing it spelled out is how somebody notices theirs.
 */
export function ChannelNotFound({ channelRef }: { channelRef?: string }) {
  const shown = channelRef ? (atHandle(channelRef) ?? channelRef) : null
  return (
    <Plate>
      <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <PlateTitle>No such channel</PlateTitle>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        {shown
          ? `Nothing on ${BRAND.name} answers to ${shown}. The handle may have changed, or the channel may have been removed.`
          : `That address does not match a channel on ${BRAND.name}. The handle may have changed, or the channel may have been removed.`}
      </p>
    </Plate>
  )
}

/** The request did not come back. NOT the same as the channel not existing. */
export function ChannelLoadError() {
  return (
    <div role="alert">
      <Plate>
        <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
        <PlateTitle>This channel could not be loaded</PlateTitle>
        <p className="mx-auto mt-2 max-w-sm text-mo-body">
          The request did not come back. Reloading usually works.
        </p>
      </Plate>
    </div>
  )
}

/* ── Skeletons ────────────────────────────────────────────────────────────── */

/**
 * The header, while the channel itself is in flight.
 *
 * The shapes and the sizes are the real header's — a banner band, a round
 * avatar overlapping it, a name bar and a meta bar — because a skeleton whose
 * proportions differ from what replaces it re-flows the whole page on arrival,
 * which is the one thing a skeleton exists to prevent.
 */
export function ChannelHeaderSkeleton() {
  return (
    <div aria-hidden="true" className="mb-6 animate-pulse">
      <div className="h-28 w-full rounded-mo bg-mo-raised sm:h-44" />
      <div className="-mt-8 flex items-start gap-4 px-1 sm:-mt-10 sm:px-4">
        <div className="shrink-0 rounded-mo-pill bg-mo-bg p-1">
          <div className="h-20 w-20 rounded-mo-pill bg-mo-raised" />
        </div>
        <div className="min-w-0 flex-1 pt-8 sm:pt-10">
          <div className="h-6 w-48 rounded bg-mo-raised" />
          <div className="mt-2 h-3 w-64 rounded bg-mo-raised" />
          <div className="mt-3 h-3 w-80 max-w-full rounded bg-mo-raised" />
        </div>
      </div>
    </div>
  )
}

/**
 * A grid of card-shaped pulses in the shape of the tab that is loading.
 *
 * The same grid class the real cards use, from ../browse/grid.ts and from
 * ./ShortCard.tsx, so the column count cannot drift from what lands.
 */
export function ChannelGridSkeleton({
  kind,
  count,
}: {
  kind: "videos" | "shorts"
  count?: number
}) {
  const shorts = kind === "shorts"
  const cells = count ?? (shorts ? 12 : 8)
  return (
    <ul aria-hidden="true" className={shorts ? SHORTS_GRID : VIDEO_GRID}>
      {Array.from({ length: cells }, (_, i) => (
        <li key={i} className="animate-pulse">
          <div
            className={[
              "w-full rounded-mo bg-mo-raised",
              shorts ? "aspect-[9/16]" : "aspect-video",
            ].join(" ")}
          />
          <div className="mt-2 h-3.5 w-4/5 rounded bg-mo-raised" />
          <div className="mt-2 h-3 w-2/5 rounded bg-mo-raised" />
        </li>
      ))}
    </ul>
  )
}

/* ── Per-tab states ───────────────────────────────────────────────────────── */

/**
 * A tab with nothing in it.
 *
 * The sentence names the CHANNEL and the kind, because "Nothing here" on a
 * page with four tabs does not say which of the four is empty — and a person
 * who has just arrived from a search result needs to know whether this creator
 * makes shorts at all or whether they have simply opened the wrong tab.
 */
export function TabEmpty({
  icon: Icon = Tv,
  title,
  body,
}: {
  icon?: typeof Tv
  title: string
  body: string
}) {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <Icon aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <h2 className="mt-4 font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">{body}</p>
    </div>
  )
}

/**
 * A tab whose request failed, with the one thing to do about it.
 *
 * A section, not a page: the header above it still works, the other tabs
 * still work, and the subscribe control still works. Only this list is
 * missing, and only this list says so.
 *
 * `role="alert"` so the failure is announced when it happens — a person who
 * pressed nothing and got nothing needs telling, and a silent empty grid
 * reads as "this channel has no videos", which is a false statement.
 */
export function TabError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
      <h2 className="mt-4 font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink">
        {what} could not be loaded
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        The request did not come back. The rest of this page is unaffected.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        Try again
      </button>
    </div>
  )
}
