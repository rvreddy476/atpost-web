"use client"

/**
 * `/tube/subscriptions`: long video from the channels the viewer subscribes
 * to, newest first.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT "SUBSCRIPTION" MEANS ON THIS PLATFORM, AS OF 2026-09-12
 *
 * A channel subscription is its own edge. The founder's decision: Subscribe
 * is one button that follows the owner AND turns notifications on,
 * Unsubscribe removes both, and this tab is a real feed of the subscribed
 * channels' videos rather than the follow graph's. On the wire that is
 * `GET /v1/feed/videos?subscribed_only=true` (the same rows `/v1/feed/watch`
 * answers), and ../tube/api.ts sends it as `subscribedOnly`.
 *
 * Until 2026-09-12 this page was `following_only=true`, because subscribing
 * WAS following and there was no other edge to narrow by. The two are not
 * the same list any more: subscribing creates the follow edge underneath, so
 * every subscribed channel is followed, but a followed account need not have
 * a channel and need not have been subscribed to. The home rail's
 * "Following" chip keeps the follow graph, which is what its word says; this
 * page says "subscribe", and so it asks about subscriptions.
 *
 * ── `subscribed_only=true` FAILS CLOSED, and here that is a feature ───────
 * The parameter filters the candidate set to subscribed channels and returns
 * an EMPTY array for an account that subscribes to nobody, rather than
 * backfilling with strangers. On the home grid that would be a trap — a new
 * account would see an empty Tube with nothing on screen to explain it. On
 * THIS page it is exactly right: the page's whole subject is "the channels
 * you subscribe to", so an empty answer is information, and the empty state
 * below says what it means and offers the way to fix it.
 *
 * ── Two causes for an empty page, and the copy names both ─────────────────
 * An account that subscribes to nobody, and an account whose channels have
 * not uploaded a long video. The server cannot tell them apart from here,
 * since the feed is empty in both cases, so the sentence says both rather
 * than guessing at one, and the way out is the same for both: open a channel
 * and press Subscribe.
 *
 * ── The subscribed CHANNELS, as opposed to their videos, are in the rail ──
 * Deliberately not repeated here as a strip of avatars. The rail is on screen
 * on this page too, it already lists them with their faces (from
 * `GET /v1/channels/subscriptions`), and a second copy of the same list one
 * inch away would be two things to keep in agreement for no new information.
 * ../chrome/TubeRail.tsx draws it.
 */

import { useSession } from "@atpost/api-client/session"
import { InfiniteFeed } from "@momentum/content"
import { Users } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useTubeFeed } from "@/tube/useTubeFeed"
import { VideoCard } from "@/browse/VideoCard"
import { VIDEO_GRID } from "@/browse/grid"
import { BrowseError, BrowseSkeleton } from "@/browse/states"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"

const ACTION =
  "mt-5 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold " +
  "text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}

export function TubeSubscriptions() {
  const session = useSession()

  // Unlike the home page there is no public fallback, and that is honest
  // rather than lazy: "the channels YOU subscribe to" is not a question the
  // server can answer for a browser it has never met. There is no anonymous
  // version of this page to show.
  const feed = useTubeFeed(undefined, session.signedIn, { subscribedOnly: true })
  const items = feed.items

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Subscriptions
        </h1>
        <p className="mt-1 text-sm text-mo-body">
          Long video from the channels you subscribe to, newest first.
        </p>
      </header>

      {session.signedOut ? (
        <Card>
          <Users aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Sign in to see your subscriptions
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            {BRAND.name} has to know who you are to know which channels you subscribe to.
          </p>
          <a href={TUBE_SIGN_IN_HREF} className={ACTION}>
            Sign in
          </a>
        </Card>
      ) : feed.loading ? (
        <BrowseSkeleton />
      ) : feed.error && items.length === 0 ? (
        <BrowseError message={feed.error} onRetry={feed.retry} />
      ) : items.length === 0 ? (
        <Card>
          <Users aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Nothing from your channels yet
          </h2>
          {/* Two causes, one page, and they are not the same news. See the
              header: the server cannot tell them apart from here, so the copy
              names both rather than guessing at one. */}
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            You have not subscribed to a channel yet, or your channels have not uploaded. Open a
            channel and press Subscribe.
          </p>
          {/* `next/link` would be correct here too — /tube is this app — but
              this is the zone root and a plain anchor keeps the two "go to
              Home" controls (this and the rail) behaving identically. */}
          <a href="/tube" className={ACTION}>
            Browse videos
          </a>
        </Card>
      ) : (
        <>
          {feed.error && (
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
          <InfiniteFeed
            hasMore={!feed.ended && !feed.error}
            loading={feed.loadingMore}
            onLoadMore={feed.loadMore}
            loadingIndicator={
              <p className="py-6 text-center text-sm text-mo-body">Loading more videos…</p>
            }
            endIndicator={
              <p className="py-8 text-center text-sm text-mo-body">
                {items.length === 1
                  ? "That is the only video from your channels right now."
                  : `That is all ${items.length} videos from your channels right now.`}
              </p>
            }
          >
            <ul className={VIDEO_GRID}>
              {items.map((item, at) => (
                <VideoCard key={item.id} item={item} position={at + 1} total={items.length} />
              ))}
            </ul>
          </InfiniteFeed>
        </>
      )}
    </div>
  )
}
