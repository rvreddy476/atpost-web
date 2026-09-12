"use client"

/**
 * `/tube/@{handle}` — a channel.
 *
 * The banner, the avatar, the name, the handle, the subscriber count, the
 * subscribe control, and Videos / Playlists / About.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOUR REQUESTS, AND EACH ONE FAILS ALONE
 *
 *   GET /v1/channels/{ref}                 the channel itself, which is the
 *                                          page, and its subscriber_count
 *   GET /v1/posts/by-author/{id}?type=…    the videos
 *   GET /v1/creators/{user_id}/playlists   the playlists tab
 *   GET /v1/channels/{ref}/subscription    is the viewer subscribed, and
 *                                          are they being notified
 *
 * Only the FIRST can take the page down, because it is the page: without a
 * channel there is nothing to draw a header for, and a 404 from it is a
 * genuine "no such channel". The other three are each a section that says
 * less when it fails rather than a page that fails. A subscriber count the
 * row did not carry renders as nothing at all rather than as "No subscribers
 * yet", because printing a zero for a number we could not read would state
 * something false about somebody's channel.
 *
 * The count used to be a fifth request, the owner's `follower_count` off a
 * profile, because subscribing was a follow with different words on it and
 * there was no other number. Since 2026-09-12 a channel subscription is its
 * own edge and the channel row carries its own count.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE THING THE BRIEF ASKED FOR THAT THIS API DOES NOT HAVE
 *
 * Recorded here as well as in ../tube/channels.ts, because this is the file
 * where somebody will look for it.
 *
 *   · NO BANNER IMAGE. There is no cover, header or banner field on a channel
 *     and none on the profile either. The band across the top is a gradient
 *     derived from the handle — stable per channel, different between
 *     channels, and openly decorative. `bannerImage` is the one function that
 *     changes the day the API grows a real one.
 *
 * ── Subscribe is one button that does two things ──────────────────────────
 * The founder's decision: pressing Subscribe follows the owner AND turns
 * notifications on; Unsubscribe removes both; every subscriber is notified
 * by default and the bell beside the button is the per-channel exception.
 * The button and the bell are ./SubscribeControls.tsx, drawn from the edge
 * ../tube/useSubscription.ts holds, and that hook is where the optimistic
 * update, the rollback and the visible failure live once for the three
 * surfaces that draw this control.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Tv } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { BRAND } from "@momentum/brand"
import { Avatar, InfiniteFeed, absoluteTime } from "@momentum/content"
import type { FeedItem } from "@atpost/types/feed"
import {
  fetchAuthorVideos,
  fetchChannel,
  fetchCreatorPlaylists,
  type TubePlaylist,
} from "@/tube/channelApi"
import {
  atHandle,
  bannerImage,
  subscribersLabel,
  videosLabel,
  type TubeChannel,
} from "@/tube/channels"
import { useSubscription, type SubscriptionEdge } from "@/tube/useSubscription"
import { VideoCard } from "@/browse/VideoCard"
import { VIDEO_GRID } from "@/browse/grid"
import { BrowseSkeleton } from "@/browse/states"
import { SubscribeControls } from "./SubscribeControls"
import {
  CHANNEL_TABS,
  CHANNEL_TAB_LABEL,
  channelTabHref,
  type ChannelTab,
} from "./tabs"

/* ── Page-level states ────────────────────────────────────────────────────── */

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}

function PlateTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
      {children}
    </h1>
  )
}

/* ── The header ───────────────────────────────────────────────────────────── */

function ChannelHeader({
  channel,
  subscription,
}: {
  channel: TubeChannel
  subscription: SubscriptionEdge
}) {
  const handle = atHandle(channel.handle)
  // The edge's count and not the row's: they are the same number until the
  // viewer presses Subscribe, and from then on the edge's is the one that
  // moved with the press and was replaced by the server's answer.
  const subscribers = subscription.subscriberCount

  return (
    <header className="mb-6">
      {/* Decorative and labelled as such: it is a derived gradient, not a
          picture this creator chose, so it carries no alt text and no role. */}
      <div
        aria-hidden="true"
        className="h-28 w-full rounded-mo sm:h-40"
        style={{ backgroundImage: bannerImage(channel.handle || channel.user_id) }}
      />

      <div className="mt-4 flex flex-wrap items-start gap-4 sm:mt-5">
        {/* `avatar_url` is a real signed URL when the channel has one — unlike
            an `avatar_media_id`, which is not a URL and whose derivable one is
            unsigned and 403s. Every channel on the dev stack has null here, so
            what is drawn today is the initial. */}
        <Avatar name={channel.name} id={channel.user_id} src={channel.avatar_url} />

        <div className="min-w-0 flex-1">
          <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
            {channel.name || handle || "Channel"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-mo-body">
            {handle && <span>{handle}</span>}
            {handle && <span aria-hidden>·</span>}
            {/* Null means "we could not read it", which is not zero. See the
                header — a failed side request must not state a number. */}
            {subscribers !== null && <span>{subscribersLabel(subscribers)}</span>}
            {subscribers !== null && <span aria-hidden>·</span>}
            <span>{videosLabel(channel.video_count)}</span>
          </p>
          {channel.about && (
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-mo-body">{channel.about}</p>
          )}
        </div>

        {/* Absent, not disabled, while the edge is UNKNOWN: the edge is
            undefined until `…/subscription` answers, and it is undefined
            forever for the viewer's own channel and for a signed-out browser.
            A Subscribe button that appears and then flips to Subscribed is
            worse than one that arrives late: the person in between has been
            told something false about their own subscriptions.
            `SubscribeControls` renders nothing on an unknown edge, so the
            rule is in one place and not in three. */}
        <SubscribeControls edge={subscription} name={channel.name} className="shrink-0" />
      </div>
    </header>
  )
}

/* ── The tabs ─────────────────────────────────────────────────────────────── */

/**
 * The tabs are LINKS, not buttons, and the tab is in the URL.
 *
 * Which means a channel's Playlists tab can be linked to, bookmarked, opened
 * in a new tab and reached with the back button — and it is what lets the
 * rail's own "Playlists" row point at `/@you?tab=playlists` with no extra
 * machinery. `next/link` because this is a route of this same app, so the
 * transition is client-side and the header above does not re-fetch.
 *
 * `role="tab"` is deliberately NOT used. The ARIA tab pattern promises arrow
 * keys move between tabs and that the panel is controlled by them; these are
 * navigation, they change the URL, and announcing them as tabs would promise
 * a keyboard behaviour they do not have. `aria-current="page"` says the true
 * thing instead.
 */
function ChannelTabs({ base, current }: { base: string; current: ChannelTab }) {
  return (
    <nav aria-label="Channel sections" className="mb-6 border-b border-mo">
      <ul className="-mb-px flex gap-1">
        {CHANNEL_TABS.map((tab) => {
          const active = tab === current
          return (
            <li key={tab}>
              <Link
                href={channelTabHref(base, tab)}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-block border-b-2 px-4 py-3 text-sm font-semibold transition-colors duration-150 ease-mo",
                  "outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
                  active ? "text-mo-ink" : "border-transparent text-mo-body hover:text-mo-ink",
                ].join(" ")}
                // The underline is cyan — the palette's interactive colour —
                // and there is no `border-mo-cyan` utility: @momentum/tokens
                // names cyan under `colors`, not under `borderColor`, whose
                // four entries are line / line-strong / focus / gold. An
                // inline style is the honest way to reach the variable rather
                // than adding a fifth border token for one underline.
                style={active ? { borderBottomColor: "rgb(var(--mo-cyan))" } : undefined}
              >
                {CHANNEL_TAB_LABEL[tab]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ── The screen ───────────────────────────────────────────────────────────── */

export function ChannelScreen({ channelRef, tab }: { channelRef: string; tab: ChannelTab }) {
  const { user } = useSession()

  const [channel, setChannel] = useState<TubeChannel | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading")

  const [videos, setVideos] = useState<FeedItem[]>([])
  const [videosCursor, setVideosCursor] = useState<string | null>(null)
  const [videosLoading, setVideosLoading] = useState(true)
  const [videosMore, setVideosMore] = useState(false)
  const [videosFailed, setVideosFailed] = useState(false)

  const [playlists, setPlaylists] = useState<TubePlaylist[] | null>(null)

  /* The channel. Everything else hangs off its user_id, so it goes first. */
  useEffect(() => {
    let live = true
    setStatus("loading")
    fetchChannel(channelRef)
      .then((found) => {
        if (!live) return
        setChannel(found)
        setStatus(found ? "ready" : "missing")
      })
      .catch(() => {
        // NOT "missing". `fetchChannel` turns a 404 into null and rethrows
        // everything else, so arriving here means the server broke — and
        // telling somebody their channel does not exist because a request
        // timed out is the worst available answer.
        if (live) setStatus("error")
      })
    return () => {
      live = false
    }
  }, [channelRef])

  /* The videos and the playlists, once the owner is known. */
  const ownerId = channel?.user_id ?? null
  useEffect(() => {
    if (!ownerId) return
    let live = true

    setVideos([])
    setVideosCursor(null)
    setVideosFailed(false)
    setVideosLoading(true)
    fetchAuthorVideos(ownerId)
      .then((page) => {
        if (!live) return
        setVideos(page.items)
        setVideosCursor(page.nextCursor)
      })
      .catch(() => {
        if (live) setVideosFailed(true)
      })
      .finally(() => {
        if (live) setVideosLoading(false)
      })

    setPlaylists(null)
    fetchCreatorPlaylists(ownerId)
      .then((rows) => {
        if (live) setPlaylists(rows)
      })
      .catch(() => {
        if (live) setPlaylists([])
      })

    return () => {
      live = false
    }
  }, [ownerId])

  /* Am I subscribed? The hook never asks for my own channel or while signed
     out, and it leaves the edge unknown on a failed lookup; the header draws
     no control on an unknown edge. Seeded with the row's count so the number
     under the name can move with the press. */
  const subscription = useSubscription(
    user?.id ?? null,
    ownerId,
    typeof channel?.subscriber_count === "number" ? channel.subscriber_count : null
  )

  const loadMoreVideos = useCallback(() => {
    if (!ownerId || !videosCursor || videosMore) return
    setVideosMore(true)
    fetchAuthorVideos(ownerId, videosCursor)
      .then((page) => {
        setVideos((prev) => {
          // The author feed is newest-first over a stable list, so duplicates
          // are not expected the way they are on a ranked feed — but a page
          // boundary that repeats one row would give React two children with
          // one key, which is a crash rather than a cosmetic problem.
          const seen = new Set(prev.map((item) => item.id))
          return [...prev, ...page.items.filter((item) => !seen.has(item.id))]
        })
        setVideosCursor(page.nextCursor)
      })
      .catch(() => setVideosFailed(true))
      .finally(() => setVideosMore(false))
  }, [ownerId, videosCursor, videosMore])

  if (status === "loading") {
    return (
      <div>
        <div aria-hidden className="mb-6 animate-pulse">
          <div className="h-28 w-full rounded-mo bg-mo-raised sm:h-40" />
          <div className="mt-4 flex items-center gap-4">
            <div className="h-10 w-10 shrink-0 rounded-mo-pill bg-mo-raised" />
            <div className="min-w-0 flex-1">
              <div className="h-5 w-48 rounded bg-mo-raised" />
              <div className="mt-2 h-3 w-64 rounded bg-mo-raised" />
            </div>
          </div>
        </div>
        <BrowseSkeleton />
      </div>
    )
  }

  if (status === "missing") {
    return (
      <Plate>
        <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
        <PlateTitle>No such channel</PlateTitle>
        <p className="mx-auto mt-2 max-w-sm text-mo-body">
          Nothing on {BRAND.name} answers to {atHandle(channelRef) ?? channelRef}. The handle may
          have changed, or the channel may have been removed.
        </p>
      </Plate>
    )
  }

  if (status === "error" || !channel) {
    return (
      <div role="alert">
        <Plate>
          <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
          <PlateTitle>This channel could not be loaded</PlateTitle>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            The request did not come back. Reloading usually works.
          </p>
        </Plate>
      </div>
    )
  }

  const base = `/@${channel.handle || channel.user_id}`

  return (
    <div>
      <ChannelHeader channel={channel} subscription={subscription} />
      <ChannelTabs base={base} current={tab} />

      {tab === "videos" && (
        <>
          {videosLoading ? (
            <BrowseSkeleton />
          ) : videos.length === 0 ? (
            <p className="py-10 text-center text-mo-body">
              {videosFailed
                ? "This channel's videos could not be loaded."
                : `${channel.name} has not published a long video yet.`}
            </p>
          ) : (
            <InfiniteFeed
              hasMore={Boolean(videosCursor) && !videosFailed}
              loading={videosMore}
              onLoadMore={loadMoreVideos}
              loadingIndicator={
                <p className="py-6 text-center text-sm text-mo-body">Loading more videos…</p>
              }
              endIndicator={
                <p className="py-8 text-center text-sm text-mo-body">
                  That is every video on this channel.
                </p>
              }
            >
              <ul className={VIDEO_GRID}>
                {videos.map((item, at) => (
                  <VideoCard
                    key={item.id}
                    item={item}
                    position={at + 1}
                    total={videos.length}
                    // The whole page is this channel, and these rows are bare
                    // `PostDetail` with no `channel` on them — so the card's
                    // own name lookup would print "Someone" under every one.
                    hideCreator
                  />
                ))}
              </ul>
            </InfiniteFeed>
          )}
        </>
      )}

      {tab === "playlists" && <PlaylistsTab playlists={playlists} channelName={channel.name} />}

      {tab === "about" && (
        <dl className="max-w-2xl space-y-5">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-mo-body">About</dt>
            <dd className="mt-1 whitespace-pre-wrap text-mo-ink">
              {channel.about || "This channel has not written a description."}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-mo-body">Handle</dt>
            <dd className="mt-1 text-mo-ink">{atHandle(channel.handle) ?? "No handle"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-mo-body">Videos</dt>
            <dd className="mt-1 text-mo-ink">{videosLabel(channel.video_count)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-mo-body">Joined</dt>
            {/* `absoluteTime` and not `relativeTime`: "3 months ago" is the
                right form for a video's age on a card and the wrong one for
                the date a channel was created, which is a fact rather than a
                recency. */}
            <dd className="mt-1 text-mo-ink">
              {channel.created_at ? absoluteTime(channel.created_at) : "Unknown"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

/**
 * The Playlists tab.
 *
 * ── The one place in this zone where the wire shape is unverified ─────────
 * `GET /v1/creators/{user_id}/playlists` is real and answers 200, but every
 * creator on this dev stack has zero playlists — checked for a live creator
 * id and for a nonexistent one, both `{"data":[]}` — so a playlist ROW has
 * never been seen. ../tube/channelApi.ts types it accordingly.
 *
 * What that means for rendering: a row with no title is not drawn as
 * "undefined", it is counted and reported. A tab that prints six lines of
 * "undefined" looks like a broken page; a tab that says it received rows it
 * could not read is a bug report somebody can act on.
 */
function PlaylistsTab({
  playlists,
  channelName,
}: {
  playlists: TubePlaylist[] | null
  channelName: string
}) {
  if (playlists === null) {
    return <p className="py-10 text-center text-mo-body">Loading playlists…</p>
  }

  const readable = playlists.filter((row) => (row.title ?? row.name ?? "").trim().length > 0)

  if (readable.length === 0) {
    return (
      <p className="py-10 text-center text-mo-body">
        {playlists.length === 0
          ? `${channelName} has no playlists.`
          : `${playlists.length} playlists came back in a shape this page cannot read yet.`}
      </p>
    )
  }

  return (
    <ul className="max-w-2xl space-y-2">
      {readable.map((row, at) => {
        const title = (row.title ?? row.name ?? "").trim()
        const count = row.video_count ?? row.item_count
        return (
          <li
            key={row.id ?? row.playlist_id ?? `${title}-${at}`}
            className="rounded-mo border border-mo bg-mo-surface px-4 py-3"
          >
            <p className="font-semibold text-mo-ink">{title}</p>
            <p className="mt-0.5 text-sm text-mo-body">
              {typeof count === "number" ? videosLabel(count) : "Playlist"}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
