"use client"

/**
 * What the browse page shows when there is no grid.
 *
 * ── Why not @momentum/content's FeedEmpty / FeedError ─────────────────────
 * They are the right SHAPE — a card on the violet ground, inside the same
 * centre track — and the wrong words. Their copy is about a feed ("Your feed
 * is warming up", "We could not load your feed"), and this page's noun is a
 * video. More than a noun, actually: an empty answer from `/v1/feed/videos` is
 * a strong statement here, because that endpoint is the one long-video surface
 * that tops a short first page up from `/v1/posts/recent` — so an empty page
 * means the platform's recent public long videos came up empty too, not merely
 * that this account follows nobody. `/v1/feed/watch` would NOT support that
 * sentence, which is one of the reasons ../tube/api.ts does not call it.
 */

import { AlertTriangle, Tv } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { HOME_PATH, signInHref } from "@momentum/chrome"
import { ZONE } from "@/zone"

const ACTION =
  "mt-5 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised"

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
      {children}
    </h2>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto mt-2 max-w-sm text-mo-body">{children}</p>
}

/**
 * The first page is in flight.
 *
 * A grid of card-shaped pulses: a 16:9 block for the poster and two short bars
 * for the title and the channel under it, because that is the shape of the
 * thing arriving. A single word or a spinner would reserve none of the space
 * the real cards take and every row below would jump when they landed.
 */
export function BrowseSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="animate-pulse">
          <div className="aspect-video w-full rounded-mo bg-mo-raised" />
          <div className="mt-2 h-3.5 w-4/5 rounded bg-mo-raised" />
          <div className="mt-2 h-3 w-2/5 rounded bg-mo-raised" />
        </li>
      ))}
    </ul>
  )
}

export function BrowseEmpty() {
  return (
    <Card>
      <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>No videos yet</Title>
      <Body>
        Long videos are ranked for each account and topped up with recent public ones, so this
        fills up as people post and as you follow them. Nothing has been picked for you so far.
      </Body>
      {/* A plain <a> and an absolute path: /social is a different Next app
          behind the shell's rewrite table, and next/link would prefix this
          zone's basePath and ask for /tube/social. */}
      <a href={HOME_PATH} className={ACTION}>
        Go to your feed
      </a>
    </Card>
  )
}

export function BrowseError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert">
      <Card>
        <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
        <Title>Videos could not be loaded</Title>
        <Body>{message}</Body>
        {onRetry && (
          <button type="button" onClick={onRetry} className={ACTION}>
            Try again
          </button>
        )}
      </Card>
    </div>
  )
}

/**
 * `/v1/feed/videos` ranks against a viewer and is 401 for an anonymous
 * browser — there is no anonymous long-video feed on this gateway at all — so
 * there is no signed-out version of this page to show.
 *
 * The chrome around it is still drawn, and still says "Sign in" in two places
 * of its own — this is the third, and the only one that explains why.
 */
export function BrowseSignedOut() {
  return (
    <Card>
      <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>Sign in to watch videos</Title>
      <Body>Videos are ranked for your account, so {BRAND.name} needs to know who you are.</Body>
      <a href={signInHref(ZONE)} className={ACTION}>
        Sign in
      </a>
    </Card>
  )
}

/** The end of the grid. Said once, quietly, rather than spinning forever. */
export function BrowseEnd({ count }: { count: number }) {
  return (
    <p className="py-8 text-center text-sm text-mo-body">
      {count === 1
        ? "That is the only video ranked for you right now."
        : `That is all ${count} videos ranked for you right now.`}
    </p>
  )
}
