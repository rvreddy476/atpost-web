"use client"

/**
 * What the browse page shows when there is no grid.
 *
 * ── Why not @momentum/content's FeedEmpty / FeedError ─────────────────────
 * They are the right SHAPE — a card on the violet ground — and the wrong
 * words. Their copy is about a feed ("Your feed
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
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { VIDEO_GRID } from "./grid"

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
export function BrowseSkeleton({ count = 8 }: { count?: number }) {
  return (
    // The SAME grid class the real cards use, from ./grid.ts, so the first
    // page landing does not re-flow the page. A skeleton whose column count
    // differs from the grid it stands in for is worse than no skeleton.
    <ul aria-hidden="true" className={VIDEO_GRID}>
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

/**
 * Nothing came back.
 *
 * `filter` is the chip that was selected, or null for All, and it changes the
 * sentence rather than decorating it. "No videos yet" under a Comedy chip is
 * a claim about the platform when the true statement is a claim about one
 * category — and the person reading it has a control on screen that would fix
 * it, which they will not use if they have been told the shelf is empty.
 */
export function BrowseEmpty({ filter }: { filter?: string | null }) {
  if (filter) {
    return (
      <Card>
        <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
        <Title>Nothing in {filter}</Title>
        <Body>
          No long video came back for that filter. Pick another chip, or choose All to see
          everything ranked for you.
        </Body>
      </Card>
    )
  }

  return (
    <Card>
      <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>No videos yet</Title>
      <Body>
        Long videos are ranked for each account and topped up with recent public ones, so this
        fills up as people post and as you follow them. Nothing has been picked for you so far.
      </Body>
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
 * What a signed-out visitor is looking at, said once, above the grid.
 *
 * ── This replaced a wall, and the wall was not wrong, it was incomplete ───
 * What stood here was a full-page "Sign in to watch videos" card, and the
 * reason given was accurate: `/v1/feed/videos` ranks against a viewer and is
 * 401 for an anonymous browser. What that reasoning missed is that the ranked
 * feed is not the only long-video list on the gateway.
 * `GET /v1/posts/recent?content_type=long_video` is public — and is the very
 * source the ranked feed tops its own short first page up from — so there IS
 * an anonymous view of this corpus and the page can show it.
 *
 * It is a strip and not a card because it is not the page's content: the
 * videos are. A full-width card between the chips and the grid would push the
 * first row below the fold to say something that fits on one line.
 *
 * What it must not do is overclaim. These rows carry a title, an age, counts
 * and a duration, and they carry no `variants` (so no poster), no `blurhash`
 * and no `channel` (so no name to link) — verified on the wire, and recorded
 * in full in ../tube/api.ts. The sentence says so, because a visitor who
 * signs in and finds a visibly better page should have been told that was
 * coming.
 */
export function PublicNotice() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-mo border border-mo bg-mo-surface px-4 py-3">
      <Tv aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-purple" />
      <p className="min-w-0 flex-1 text-sm text-mo-body">
        Recent public videos on {BRAND.name}. Sign in for videos ranked for you, with posters and
        channels, plus your subscriptions.
      </p>
      {/* A plain <a>: /login is served by the shell, a different Next app
          behind a rewrite, so next/link would ask for /tube/login. */}
      <a
        href={TUBE_SIGN_IN_HREF}
        className="shrink-0 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
      >
        Sign in
      </a>
    </div>
  )
}

/**
 * The end of the grid. Said once, quietly, rather than spinning forever.
 *
 * `ranked` decides which of two true sentences this is. "Ranked for you" is
 * accurate for `/v1/feed/videos` and false for the public shelf a signed-out
 * visitor is reading — nothing has been ranked for somebody the server has
 * not been told about, and saying so would be a small invented claim at the
 * bottom of every anonymous visit.
 */
export function BrowseEnd({ count, ranked = true }: { count: number; ranked?: boolean }) {
  const what = ranked ? "ranked for you right now" : "public right now"
  return (
    <p className="py-8 text-center text-sm text-mo-body">
      {count === 1 ? `That is the only video ${what}.` : `That is all ${count} videos ${what}.`}
    </p>
  )
}
