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
import { HOME_PATH, signInHref } from "@momentum/chrome"
import { ZONE } from "@/zone"

const ACTION =
  "mt-5 inline-flex min-h-11 items-center justify-center rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-mo-cyan " +
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

/**
 * Nothing came back, and the copy says which of three things that means.
 *
 * The sentences come from `@/reels/source`'s `emptyCopy` rather than being
 * written here, because the reason an answer is empty is a fact about the
 * ENDPOINT — the ranker had nothing, the people you follow posted nothing, or
 * nothing has been published at all — and it is the same fact on this page as
 * in the viewer. Two components composing their own would be two places to keep
 * one distinction straight.
 */
export function BrowseEmpty({
  title,
  body,
  offerSignIn,
}: {
  title: string
  body: string
  offerSignIn?: boolean
}) {
  return (
    <Card>
      <Film aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>{title}</Title>
      <Body>{body}</Body>
      {/* A plain <a> and an absolute path either way: /social and /login are
          different Next apps behind the shell's rewrite table, and next/link
          would prefix this zone's basePath and ask for /reels/social. */}
      {offerSignIn ? (
        <a href={signInHref(ZONE)} className={ACTION}>
          Sign in
        </a>
      ) : (
        <a href={HOME_PATH} className={ACTION}>
          Go to your feed
        </a>
      )}
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

/*
 * `BrowseSignedOut` used to live here and has been deleted rather than left
 * unused.
 *
 * It was a full-page sign-in wall, on the correct observation that the ranked
 * flicks feed 401s for an anonymous browser. What it missed is that
 * `GET /v1/posts/recent?content_type=flick,reel` does not — there IS a
 * signed-out surface — so the wall was this zone refusing to show content it
 * was entitled to show, to the visitor most likely to be arriving on a shared
 * link. `BrowseEmpty` with `offerSignIn` is what is left of it: the offer,
 * where there genuinely is nothing else to say.
 */

/** The end of the grid. Said once, quietly, rather than spinning forever. */
export function BrowseEnd({ count }: { count: number }) {
  return (
    <p className="py-8 text-center text-sm text-mo-body">
      {count === 1
        ? "That is the only short here right now."
        : `That is all ${count} shorts here right now.`}
    </p>
  )
}
