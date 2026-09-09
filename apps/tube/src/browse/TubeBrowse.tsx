"use client"

/**
 * `/tube` — the browse page. A grid of long videos inside the ordinary chrome.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS, AND WHY IT IS THE OTHER HALF OF THE REELS CHANGE
 *
 * The founder's note names both surfaces in one sentence:
 *
 *     "see the reel page or video page, it should load normally with all
 *      option and icons and as Feed page when we click only Reel tab or video
 *      tab. We have to give to expand option for reels or video. 1. When user
 *      click on expand button for reels, it plays full page as it now. 2. When
 *      user click on Full video expand, it ill play full video"
 *
 * The reels half shipped first and made `/reels` a page in the app rather than
 * a full-screen takeover. This is the same shape for video: a page that loads
 * "normally with all option and icons" — the header, the left rail, the right
 * rail, the working nav strip, the same 600px centre track everything else in
 * the product uses.
 *
 * Where the two halves diverge is what "expand" means, and that divergence is
 * the founder's own. A reel expands into a full-page swipe-through takeover,
 * `/reels/{id}`, because that is what watching reels IS. A long video expands
 * into "full video" — the picture filling the screen with the page still
 * behind it — and that control lives on the watch page, not here. See
 * ../watch/expand.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PRESENTATION
 *
 * Two cards across in the 600px track, one below the `sm` breakpoint. A card
 * is a 16:9 poster with the title, the channel, the view count and the age
 * under it — the standard long-video card, and the standard for a reason: the
 * thing being chosen between is the TITLE, which a 100-character field can
 * genuinely fill, and a title has nowhere to live on a 9:16 tile.
 *
 * Two across and not three: a 16:9 cell three across in 600px is 184x104, at
 * which a poster is a smear and a two-line title is four lines. Two across is
 * ~292x164, which is the size these thumbnails are actually for.
 *
 * ── It mounts no players ──────────────────────────────────────────────────
 * Zero `<video>` elements on this page, which is the whole economy of the
 * split. ./VideoCard.tsx has the measurement and the argument.
 *
 * ── It has no like / save / share / follow ────────────────────────────────
 * Those exist, complete, one click away, with their optimistic updates, their
 * rollbacks and their engagement events. Reproducing them per card would be a
 * second implementation of each — and a second place for them to disagree with
 * the server. The counts ARE shown, as counts.
 *
 * ── It does not share feed state with the watch page ──────────────────────
 * Opening a video is a route change, and the watch page fetches its own page
 * one — which, in the ordinary case of clicking a card, is the very page the
 * card came from. Hoisting the pages into something both routes read would be
 * a client-side store for the sake of a request that has already been paid for
 * once. ../tube/useTubeFeed.ts has the note on why the watch page reads the
 * feed at all instead of `GET /v1/posts/{id}`.
 */

import { useSession } from "@atpost/api-client/session"
import { InfiniteFeed } from "@momentum/content"
import { useTubeFeed } from "@/tube/useTubeFeed"
import { VideoCard } from "./VideoCard"
import {
  BrowseEmpty,
  BrowseEnd,
  BrowseError,
  BrowseSignedOut,
  BrowseSkeleton,
} from "./states"

export function TubeBrowse() {
  const session = useSession()
  // Not `session.signedIn`: that is false while the status is still "unknown",
  // and a page that waited for certainty before its first fetch would add a
  // round trip to every visit. `signedOut` is the only state known to be
  // pointless to ask from.
  const feed = useTubeFeed(undefined, !session.signedOut)
  const items = feed.items

  const body = () => {
    if (session.signedOut) return <BrowseSignedOut />
    if (feed.loading) return <BrowseSkeleton />
    if (feed.error && items.length === 0) {
      return <BrowseError message={feed.error} onRetry={feed.retry} />
    }
    if (items.length === 0) return <BrowseEmpty />

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
        endIndicator={<BrowseEnd count={items.length} />}
      >
        {/* Asymmetric gaps on purpose: `gap-x-3` keeps two cards in a row
            reading as one row, while `gap-y-5` puts real air between a card's
            title block and the poster of the card below it. An even gutter
            makes the title look like a caption for the wrong picture.
            InfiniteFeed wraps its children in `space-y-4`, which has no effect
            on a single child. */}
        <ul className="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2">
          {items.map((item, at) => (
            <VideoCard key={item.id} item={item} position={at + 1} total={items.length} />
          ))}
        </ul>
      </InfiniteFeed>
    )
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Tube
        </h1>
        <p className="mt-1 text-sm text-mo-body">
          Long video, ranked for you. Open one to watch, then expand it to full video.
        </p>
      </header>

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
