"use client"

/**
 * `/tube` — the home page of Momentum Tube.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT CHANGED, AND WHY THE OLD SHAPE WAS WRONG
 *
 * This page shipped an hour ago as "a grid of long videos inside the ordinary
 * chrome" — two cards across a 600px centre track, between the feed's left
 * rail of Messages and Friends and its right rail of people to add. The
 * founder's note is about exactly that:
 *
 *     "it's a completely isolated application from the feed. It's Momentum
 *      Tube. So it should be completely isolated. It did open like in YouTube
 *      completely — channel, subscriptions, settings at the left side, and
 *      videos."
 *
 * The chrome is now Tube's own (../chrome/TubeFrame.tsx) and the centre track
 * is gone with it, so this page had to be re-laid-out rather than merely
 * re-parented. Three things follow from the wider track:
 *
 *   · THE GRID GOES WIDER. Two across was not a preference, it was arithmetic
 *     against 600px: three across in that track is 184x104 per cell, at which
 *     a poster is a smear and a two-line title is four lines. With the whole
 *     window the same reasoning gives a different answer — see `GRID` below,
 *     which has the widths written out.
 *
 *   · THE CHIP RAIL EXISTS. `?category=` was always real on this endpoint and
 *     was deliberately not sent, because "a filter is only honest with a
 *     control attached". The control is ./TubeCategories.tsx and the filter
 *     is honest now.
 *
 *   · THE SIGNED-OUT PAGE IS NOT A WALL. It used to be a single "Sign in to
 *     watch videos" card, which was the correct rendering of a 401 from
 *     `/v1/feed/videos` and the wrong answer for a home page. The public
 *     shelf behind `/v1/posts/recent?content_type=long_video` needs no
 *     session, so an anonymous visitor now gets real videos and one sentence
 *     saying what they are missing. ../tube/api.ts has the wire detail.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT DID NOT CHANGE
 *
 * ── It mounts no players ──────────────────────────────────────────────────
 * Zero `<video>` elements on this page, which is the whole economy of the
 * split, and going wider makes it matter MORE rather than less: four cards a
 * row instead of two is four players a row that are not attached.
 * ./VideoCard.tsx has the measurement and the argument.
 *
 * ── It has no like / save / share / follow ────────────────────────────────
 * Those exist, complete, one click away, with their optimistic updates, their
 * rollbacks and their engagement events. Reproducing them per card would be a
 * second implementation of each — and a second place for them to disagree
 * with the server. The counts ARE shown, as counts.
 *
 * ── It does not share feed state with the watch page ──────────────────────
 * Opening a video is a route change, and the watch page fetches its own page
 * one — which, in the ordinary case of clicking a card, is the very page the
 * card came from. ../tube/useTubeFeed.ts has the note on why the watch page
 * reads the feed at all instead of `GET /v1/posts/{id}`.
 */

import { useState } from "react"
import { useSession } from "@atpost/api-client/session"
import { InfiniteFeed } from "@momentum/content"
import { useTubeFeed } from "@/tube/useTubeFeed"
import { VideoCard } from "./VideoCard"
import { TubeCategories, useCategories } from "./TubeCategories"
import { ALL_CHIP, chipLabel, chipQuery, type TubeChip } from "./chips"
import { BrowseEmpty, BrowseEnd, BrowseError, BrowseSkeleton, PublicNotice } from "./states"
import { VIDEO_GRID } from "./grid"

export function TubeBrowse() {
  const session = useSession()
  const categories = useCategories()
  const [chip, setChip] = useState<TubeChip>(ALL_CHIP)

  // `signedOut` and not `!signedIn`: the latter is true while the status is
  // still "unknown", and a page that chose its endpoint from that would read
  // the public shelf for a signed-in viewer on every cold load.
  const anonymous = session.signedOut

  const feed = useTubeFeed(undefined, session.status !== "unknown", {
    ...chipQuery(chip),
    anonymous,
  })
  const items = feed.items

  const body = () => {
    if (feed.loading) return <BrowseSkeleton />
    if (feed.error && items.length === 0) {
      return <BrowseError message={feed.error} onRetry={feed.retry} />
    }
    if (items.length === 0) {
      return <BrowseEmpty filter={chip.kind === "all" ? null : chipLabel(chip, categories)} />
    }

    return (
      <InfiniteFeed
        // A failure latches inside the hook until somebody retries, so a
        // sentinel left armed would spin against a guard for as long as the
        // tab is open. Tearing it down is also what puts the error card below
        // the grid within reach.
        hasMore={!feed.ended && !feed.error}
        loading={feed.loadingMore}
        onLoadMore={feed.loadMore}
        loadingIndicator={
          <p className="py-6 text-center text-sm text-mo-body">Loading more videos…</p>
        }
        endIndicator={<BrowseEnd count={items.length} ranked={!anonymous} />}
      >
        {/* InfiniteFeed wraps its children in `space-y-4`, which has no effect
            on a single child. The column count and the gaps are ./grid.ts,
            because the skeleton has to agree with them. */}
        <ul className={VIDEO_GRID}>
          {items.map((item, at) => (
            <VideoCard key={item.id} item={item} position={at + 1} total={items.length} />
          ))}
        </ul>
      </InfiniteFeed>
    )
  }

  return (
    <div>
      {/* No <h1> above the grid, and that is deliberate rather than an
          omission. The old page had one that read "Tube", which was necessary
          when this was a surface inside the feed's chrome and had to say
          which surface it was. The application is now called Momentum Tube in
          its own top bar, on every page; a heading repeating it under the bar
          that says it would be the page's largest text stating something the
          reader already knows, and it would push the first row of videos a
          further 60px down. The chip rail is the first thing on the page,
          which is also where YouTube puts it. */}
      <TubeCategories
        categories={categories}
        selected={chip}
        signedIn={session.signedIn}
        onSelect={setChip}
      />

      {anonymous && <PublicNotice />}

      {/* A page that failed AFTER showing videos keeps the videos and says so
          underneath, rather than replacing a working grid with an apology. */}
      {feed.error && items.length > 0 && (
        <p
          role="status"
          className="mb-4 rounded-mo border border-mo bg-mo-surface px-4 py-3 text-sm text-mo-body"
        >
          More videos could not be loaded.{" "}
          <button
            type="button"
            onClick={feed.retry}
            className="font-semibold text-mo-cyan underline underline-offset-2"
          >
            Try again
          </button>
        </p>
      )}

      {body()}
    </div>
  )
}
