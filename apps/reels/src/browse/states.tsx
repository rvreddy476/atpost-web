"use client"

/**
 * What the browse page shows when there is no grid.
 *
 * ── Why not @momentum/content's FeedEmpty / FeedError ─────────────────────
 * They are the right SHAPE — a card on the violet ground, inside the same
 * centre track — and the wrong words. Their copy is about a feed ("Your feed
 * is warming up", "We could not load your feed"), and this page's noun is a
 * reel. More than a noun, actually: an empty answer from `/v1/feed/reels`
 * means the RANKER had nothing for this account, not that the platform has no
 * reels, and a message that implied the second would be inventing a fact about
 * the platform out of a fact about one viewer.
 *
 * ── And why not ../reels/states.tsx either ────────────────────────────────
 * Those are the immersive viewer's, and they are written for a full-screen
 * black surface: centred in a `h-dvh` box, no card, a `<h1>` of their own.
 * Dropped into the 600px centre track under a page heading they would be a
 * second h1 floating in the column with no ground under it. Same product,
 * same sentences where they still apply, different surface.
 */

import { AlertTriangle, Film } from "lucide-react"
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
 * A grid of tile-shaped pulses, unlike the immersive viewer's single word.
 * The reasoning there was that a full-screen grey rectangle reads as a video
 * that failed to paint; a 9:16 pulse in a grid of nine reads as a picture on
 * its way, which is what it is. Same rule, opposite answer, because the shape
 * of the thing arriving is different.
 */
export function BrowseSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul aria-hidden="true" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="aspect-[9/16] animate-pulse rounded-mo bg-mo-raised" />
      ))}
    </ul>
  )
}

export function BrowseEmpty() {
  return (
    <Card>
      <Film aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>No reels for you yet</Title>
      <Body>
        Reels are ranked for each account, so this fills up as you follow people and watch
        things. Nothing has been picked for you so far.
      </Body>
      {/* A plain <a> and an absolute path: /social is a different Next app
          behind the shell's rewrite table, and next/link would prefix this
          zone's basePath and ask for /reels/social. */}
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
        <Title>Reels could not be loaded</Title>
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
 * `/v1/feed/reels` ranks against a viewer and is 401 for an anonymous browser,
 * so there is no signed-out version of this page to show.
 *
 * The chrome around it is still drawn, and still says "Sign in" in two places
 * of its own — this is the third, and the only one that explains why.
 */
export function BrowseSignedOut() {
  return (
    <Card>
      <Film aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>Sign in to watch reels</Title>
      <Body>Reels are ranked for your account, so {BRAND.name} needs to know who you are.</Body>
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
      {count === 1 ? "That is the only reel ranked for you right now." : `That is all ${count} reels ranked for you right now.`}
    </p>
  )
}
