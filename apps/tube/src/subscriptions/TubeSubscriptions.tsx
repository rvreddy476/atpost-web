"use client"

/**
 * `/tube/subscriptions` — long video from the channels the viewer follows.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT "SUBSCRIPTION" MEANS ON THIS PLATFORM, AS OF 2026-09-09
 *
 * It means FOLLOWING, and that is a finding rather than a shortcut. Verified
 * against the running gateway:
 *
 *   · `GET  /v1/channels/subscriptions`      404 — the router reads
 *     "subscriptions" as a HANDLE and answers "Channel not found".
 *   · `POST /v1/channels/{id}/subscribe`     404 from the router itself.
 *   · `POST /v1/graph/follow {user_id}`      200 {"status":"followed"} — the
 *     route every Follow button in this product already calls.
 *
 * The Android client agrees: its Subscriptions page is
 * `VideoFeedQuery.Following`, which is `/v1/feed/watch?following_only=true`
 * (`SubscriptionsViewModel.kt`). So a channel is subscribed to by following
 * the account that owns it, and this page is the video feed narrowed to those
 * accounts.
 *
 * ── `following_only=true` FAILS CLOSED, and here that is a feature ────────
 * The parameter filters the candidate set to authors the viewer follows and
 * returns an EMPTY array for an account that follows nobody, rather than
 * backfilling with strangers. On the home grid that would be a trap — a new
 * account would see an empty Tube with nothing on screen to explain it, which
 * is why ../tube/api.ts refused to send it while the browse grid was the only
 * surface. On THIS page it is exactly right: the page's whole subject is "the
 * channels you follow", so an empty answer is information, and the empty
 * state below says what it means and offers the way to fix it.
 *
 * ── The endpoint is /v1/feed/videos and not /v1/feed/watch ───────────────
 * The phone uses `watch` for this and `videos` for its home. Both are the
 * same ranked timeline window; the difference is that `videos` tops a short
 * first page up from `/v1/posts/recent` and `watch` does not. With
 * `following_only=true` that fill is filtered out anyway — it is a discovery
 * top-up of strangers, and strangers are precisely what this narrowing
 * removes — so the two answer the same thing here. One endpoint for both
 * surfaces in this zone is one place for a paging bug to live instead of two,
 * and `fetchVideosPage` already knows this one's cursor family.
 *
 * ── The subscribed CHANNELS, as opposed to their videos, are in the rail ──
 * Deliberately not repeated here as a strip of avatars. The rail is on screen
 * on this page too, it already lists them with their faces, and a second copy
 * of the same list one inch away would be two things to keep in agreement for
 * no new information. ../chrome/TubeRail.tsx draws it.
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
  // rather than lazy: "the channels YOU follow" is not a question the server
  // can answer for a browser it has never met. There is no anonymous version
  // of this page to show.
  const feed = useTubeFeed(undefined, session.signedIn, { followingOnly: true })
  const items = feed.items

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Subscriptions
        </h1>
        <p className="mt-1 text-sm text-mo-body">
          Long video from the channels you follow, newest first.
        </p>
      </header>

      {session.signedOut ? (
        <Card>
          <Users aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Sign in to see your subscriptions
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            {BRAND.name} has to know who you are to know which channels you follow.
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
          {/* Two causes, one page, and they are not the same news: an account
              that follows nobody, and an account whose channels have not
              posted a long video. The server cannot tell them apart from here
              — `following_only` returns an empty array for both — so the copy
              names both rather than guessing at one. */}
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            Either you have not subscribed to a channel yet, or the ones you follow have not posted
            a long video. Subscribing is following: open a channel and use Subscribe.
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
