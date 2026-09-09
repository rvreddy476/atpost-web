"use client"

/**
 * What is on screen when there are no reels.
 *
 * ── Why these are not @momentum/content's FeedEmpty / FeedError ───────────
 * Those are written for a column of cards on the violet ground and they say
 * feed things — "Nothing here yet", "Refresh". This surface is full-screen and
 * black, its noun is a reel, and its empty case has a genuinely different
 * cause: `/v1/feed/reels` ranks a candidate set, so an empty answer means this
 * account has no reels RANKED for it, not that the platform has none. Saying
 * "no reels have been posted" would be inventing a fact about the platform out
 * of a fact about one account.
 *
 * Nothing here offers content that does not exist, and nothing suggests an
 * action that will not work.
 */

import Link from "next/link"
import { BRAND } from "@momentum/brand"

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">{children}</div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-mo-display text-xl font-semibold text-mo-ink">{children}</h1>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-mo-body">{children}</p>
}

const ACTION =
  "rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised"

/**
 * The first page is in flight.
 *
 * Deliberately a word rather than a skeleton of fake reels. A card skeleton
 * works because a card is mostly text and a grey block reads as "text is
 * coming"; a full-screen grey rectangle reads as a video that has failed to
 * paint, which is the exact thing this surface's real failure looks like.
 */
export function ReelsLoading() {
  return (
    <Frame>
      <Body>Loading reels…</Body>
    </Frame>
  )
}

export function ReelsEmpty() {
  return (
    <Frame>
      <Title>No reels for you yet</Title>
      <Body>
        Reels are ranked for each account, so this fills up as you follow people and watch
        things. Nothing has been picked for you so far.
      </Body>
      <Link href="/social" className={ACTION}>
        Go to your feed
      </Link>
    </Frame>
  )
}

export function ReelsError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Frame>
      <Title>Reels could not be loaded</Title>
      <Body>{message}</Body>
      {onRetry && (
        <button type="button" onClick={onRetry} className={ACTION}>
          Try again
        </button>
      )}
    </Frame>
  )
}

/**
 * `/v1/feed/reels` is 401 for an anonymous browser — it ranks against a
 * viewer, so there is no signed-out version of it to show.
 */
export function ReelsSignedOut() {
  return (
    <Frame>
      <Title>Sign in to watch reels</Title>
      <Body>Reels are ranked for your account, so {BRAND.name} needs to know who you are.</Body>
      <Link href="/login?redirect=/reels" className={ACTION}>
        Sign in
      </Link>
    </Frame>
  )
}
