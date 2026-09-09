"use client"

/**
 * `/reels` — the browse page. A grid of reels inside the ordinary chrome.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT CHANGED, AND WHY IT IS A CHANGE OF ENTRY RATHER THAN OF SURFACE
 *
 * `/reels` used to open straight into the immersive full-screen scroller. The
 * founder's note is the correction:
 *
 *     "The reel page … should load normally with all options and icons and as
 *      Feed page, when we click only Reel tab. We have to give an expand
 *      option for reels. When user clicks on expand button for reels, it plays
 *      full page as it is now."
 *
 * "as it is now" is the important half: the immersive viewer is not being
 * replaced or rebuilt. Every guarantee it holds — one video at a time,
 * non-current reels `inert`, only the current reel and its neighbours mounting
 * a player, the 48px inset measured off its own header rather than copied —
 * still holds, on the same route, reached from here. What moved is the door.
 *
 * So this page is the entry and `/reels/{postId}` is the expanded state. That
 * route already existed, because Share had to have something to copy; it is
 * reused rather than joined by a second way in.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PRESENTATION, AND WHAT IT COSTS
 *
 * A grid of posters. Three across in the frame's 600px centre track, two below
 * the `sm` breakpoint. The argument is in ./tile.ts at length; the short form:
 *
 *   · A card-per-reel column would put a 9:16 video in a 600px track — a
 *     1067px-tall card, so four reels is a 4000px page for four videos.
 *   · Anything that plays on this page pays the immersive page's bandwidth
 *     bill for content nobody has chosen. Reel.tsx already records four
 *     players at `readyState 4` on a page of twelve before a single swipe.
 *   · Nothing here autoplays, so this surface needs no `viewportInset` — there
 *     is no coordinator and no watch measurement on it for a wrong inset to
 *     corrupt. That is a deliberate saving, not an omission.
 *
 * At four reels — which is what this account actually has, across two pages of
 * two — the grid is one row and a bit. At a hundred it is the same component:
 * lazy `<img>` per tile, an IntersectionObserver sentinel for the next page,
 * one tab stop per reel. The thing that would NOT survive a hundred is a
 * player per tile, which is the option this rejects.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE DELIBERATELY DOES NOT DO
 *
 * ── It sends no analytics ─────────────────────────────────────────────────
 * No impressions, no watch events. That is a decision and not an oversight.
 * An `impression` in the payout contract carries `visible_ms` and
 * `is_autoplay` and sits beside the watch events a creator is paid from;
 * crediting one for a 194px still that nobody played would inflate the numbers
 * on this account's reels from a page where no video ran. When the founder
 * wants browse-page reach measured it is a real question with a real answer
 * (`normalizeSurface` accepts five values and this would need to pick one of
 * them honestly), and it should be answered on purpose rather than inherited
 * from the viewer's hook.
 *
 * ── It has no like / save / share / follow ────────────────────────────────
 * Those exist, complete, one click away, with their optimistic updates, their
 * rollbacks and their engagement events. Reproducing them per tile would be a
 * second implementation of each — and a second place for them to disagree with
 * the server. The counts ARE shown, as counts.
 *
 * ── It does not share feed state with the viewer ──────────────────────────
 * Expanding a reel is a route change, and the viewer fetches its own page 1 —
 * plus, for a reel from page 2, one more page as its deep-link walk finds it.
 * Two requests of two items each, on this corpus. Hoisting the pages into
 * something both routes read would be a client-side store for the sake of a
 * request that has already been paid for once.
 */

import { useSession } from "@atpost/api-client/session"
import { InfiniteFeed } from "@momentum/content"
import { useReelsFeed } from "@/reels/useReelsFeed"
import { ReelTile } from "./ReelTile"
import {
  BrowseEmpty,
  BrowseEnd,
  BrowseError,
  BrowseSignedOut,
  BrowseSkeleton,
} from "./states"

export function ReelsBrowse() {
  const session = useSession()
  // Not `session.signedIn`: that is false while the status is still "unknown",
  // and a page that waited for certainty before its first fetch would add a
  // round trip to every visit. `signedOut` is the only state known to be
  // pointless to ask from. Same reasoning, same line, as ReelsViewer.
  const feed = useReelsFeed(undefined, !session.signedOut)
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
          <p className="py-6 text-center text-sm text-mo-body">Loading more reels…</p>
        }
        endIndicator={<BrowseEnd count={items.length} />}
      >
        {/* `gap-2` and nothing else between tiles: a grid of stills is read as
            a field, and a wide gutter turns it into a list of separate
            pictures. InfiniteFeed wraps its children in `space-y-4`, which
            has no effect on a single child. */}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, at) => (
            <ReelTile key={item.id} item={item} position={at + 1} total={items.length} />
          ))}
        </ul>
      </InfiniteFeed>
    )
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Reels
        </h1>
        <p className="mt-1 text-sm text-mo-body">
          Short video, ranked for you. Expand one to watch full screen.
        </p>
      </header>

      {/* A page that failed AFTER showing reels keeps the reels and says so
          underneath, rather than replacing a working grid with an apology. */}
      {feed.error && items.length > 0 && (
        <p role="status" className="mb-4 rounded-mo border border-mo bg-mo-surface px-4 py-3 text-sm text-mo-body">
          More reels could not be loaded.{" "}
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
