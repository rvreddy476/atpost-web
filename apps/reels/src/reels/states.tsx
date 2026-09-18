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

import { BRAND } from "@momentum/brand"
import { HOME_PATH, signInHref } from "@momentum/chrome"
import { ZONE } from "@/zone"

/*
 * ── Neither link here is `next/link` any more, and both were ──────────────
 * `next/link` prefixes this zone's basePath onto every href it is given, so
 * `<Link href="/social">` asked for `/reels/social` — a 404 behind the only
 * button on the empty state, which is the screen a brand-new account sees.
 * `<Link href="/login?redirect=/reels">` asked for `/reels/login`, which
 * survived only because `createZoneConfig` happens to register a redirect at
 * exactly that path: right by luck rather than by rule.
 *
 * The rule, which @momentum/chrome's NavItem.tsx wrote down first: anything
 * outside this zone is a plain `<a>` to an absolute path. Both destinations
 * are, and both spellings now come from the chrome so there is one of each.
 */

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
      <Body>Loading shorts…</Body>
    </Frame>
  )
}

/**
 * Nothing came back, and the copy says which of three things that means.
 *
 * The sentences are ./source.ts's `emptyCopy`, not this component's, because
 * the reason an answer is empty is a fact about the ENDPOINT — the ranker had
 * nothing, the people you follow posted nothing, or nothing has been published
 * — and getting it wrong invents a claim about the platform out of a fact about
 * one account. A component that composed its own would be a fourth place to
 * keep the distinction straight.
 *
 * The action differs with it too. A signed-out viewer is offered a sign-in,
 * because "shorts picked for you" is the thing they are actually missing; a
 * signed-in one is offered their feed.
 */
export function ReelsEmpty({
  title,
  body,
  offerSignIn,
}: {
  title: string
  body: string
  offerSignIn?: boolean
}) {
  return (
    <Frame>
      <Title>{title}</Title>
      <Body>{body}</Body>
      {offerSignIn ? (
        <a href={signInHref(ZONE)} className={ACTION}>
          Sign in
        </a>
      ) : (
        <a href={HOME_PATH} className={ACTION}>
          Go to your feed
        </a>
      )}
    </Frame>
  )
}

export function ReelsError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Frame>
      <Title>Shorts could not be loaded</Title>
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
 * The sign-in offer, in the header rather than instead of the shorts.
 *
 * ── This used to be the whole signed-out surface, and was wrong to be ─────
 * The zone showed "Sign in to watch reels" to every anonymous browser, on the
 * correct observation that `/v1/feed/flicks` is 401 for one. What it missed is
 * that `GET /v1/posts/recent?content_type=flick,reel` is not: there IS a
 * signed-out surface, it is unranked and newest-first rather than personal, and
 * a full-screen sign-in wall in front of it was the zone refusing to show
 * content it was entitled to show. A shared `/reels/{id}` opened by somebody
 * without an account is the commonest way anybody arrives here at all.
 *
 * So the wall is gone and this is what is left: one pill in the chrome, next to
 * the way back, for the viewer who wants the personal version. `BRAND.name` is
 * in the accessible name rather than on the pill because the pill is 48px wide
 * and the sentence is for somebody who cannot see where they are.
 */
export function ReelsSignInPill() {
  return (
    <a
      href={signInHref(ZONE)}
      aria-label={`Sign in to ${BRAND.name}`}
      className="ml-auto rounded-mo-pill bg-mo-ink px-3 py-1 text-sm font-semibold text-mo-on-primary transition-colors duration-150 ease-mo hover:bg-white"
    >
      Sign in
    </a>
  )
}
