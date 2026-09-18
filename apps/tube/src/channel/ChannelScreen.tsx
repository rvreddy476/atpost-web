"use client"

/**
 * `/tube/@{handle}` — a channel.
 *
 * The banner, the avatar, the name, the handle, the counts, the subscribe
 * control, and Videos / Shorts / Playlists / About.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SEVEN REQUESTS, AND EACH ONE FAILS ALONE
 *
 *   GET /v1/channels/{ref}                    the channel itself, which IS
 *                                             the page, with subscriber_count
 *   GET /v1/posts/by-author/{id}?type=…       the Videos tab (long_video)
 *   GET /v1/posts/by-author/{id}?type=…       the Shorts tab (flick,reel)
 *   GET /v1/posts/by-author/{id}/counts       the numbers on the tabs
 *   GET /v1/creators/{user_id}/playlists      the Playlists tab
 *   GET /v1/profiles/{user_id}                a banner, and a joined date
 *   GET /v1/channels/{ref}/subscription       am I subscribed, and notified
 *
 * Only the FIRST can take the page down, because it is the page: without a
 * channel there is nothing to draw a header for. Every other one is a section
 * that says less when it fails rather than a page that fails. A subscriber
 * count the row did not carry renders as nothing at all rather than as "No
 * subscribers yet", because printing a zero for a number we could not read
 * would state something false about somebody's channel.
 *
 * Four of the seven are deferred until something asks for them: the two grids
 * fetch when their tab is first SHOWN, and playlists when that tab is opened.
 * A channel page opened at Videos costs the channel, the videos, the counts,
 * the profile and the subscription — not the whole page's worth.
 *
 * A confirmed 404 does not reach this component any more: the server route
 * resolves it and calls `notFound()`, so an unknown handle is a real 404
 * status with `app/channel/[handle]/not-found.tsx` under it. The `missing`
 * branch below stays because a CLIENT-side navigation — the rail, a card's
 * channel link — reaches this component without that server check.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TABS ARE LINKS AND TABS AT THE SAME TIME
 *
 * `?tab=` keeps each section shareable and back-button-able; `role="tablist"`
 * with arrow-key movement is what the founder asked for and what the role
 * promises. ./ChannelTabs.tsx holds both and explains how they coexist.
 *
 * Both content tabs are MOUNTED and one is enabled — see ./useChannelFeed.ts.
 * Switching Videos → Shorts → Videos does not re-fetch page one, and a reader
 * who had paged three deep into Videos finds it as they left it.
 *
 * ── Subscribe is one button that does two things ──────────────────────────
 * The founder's decision: pressing Subscribe follows the owner AND turns
 * notifications on; Unsubscribe removes both; every subscriber is notified by
 * default and the bell beside the button is the per-channel exception. The
 * button and the bell are ./SubscribeControls.tsx, drawn from the edge
 * ../tube/useSubscription.ts holds, and that hook is where the optimistic
 * update, the rollback and the visible failure live once for the three
 * surfaces that draw this control.
 *
 * ── The owner sees their own unlisted and private rows, marked ────────────
 * `/v1/posts/by-author` filters by viewer, so those rows only ever appear in
 * the owner's own response — a badge here cannot leak anything. What it
 * prevents is a creator reading their own channel page as "what the world
 * sees" and concluding a private cut is live. ./visibility.ts has the whole
 * argument.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Clapperboard, ListVideo, Tv } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { InfiniteFeed, absoluteTime } from "@momentum/content"
import type { FeedItem } from "@atpost/types/feed"
import { fetchChannel } from "@/tube/channelApi"
import { atHandle, videosLabel, type TubeChannel } from "@/tube/channels"
import { videoMedia, videoPoster } from "@/tube/video"
import { useSubscription } from "@/tube/useSubscription"
import { VideoCard } from "@/browse/VideoCard"
import { VIDEO_GRID } from "@/browse/grid"
// The id rule and the href, imported rather than restated: ../playlists/
// playlists.ts paid for the `??`-vs-first-non-empty bug and owns the route.
import { playlistHref, playlistId } from "@/playlists/playlists"
import {
  fetchAuthorCounts,
  fetchChannelPlaylists,
  fetchChannelProfileExtras,
  playlistCoverPost,
  NO_COUNTS,
  NO_PROFILE_EXTRAS,
  type AuthorCounts,
  type ChannelPlaylist,
  type ChannelProfileExtras,
} from "./api"
import { ChannelHeader } from "./ChannelHeader"
import { ChannelTabPanel, ChannelTabs } from "./ChannelTabs"
import { SHORTS_GRID, ShortCard } from "./ShortCard"
import {
  ChannelGridSkeleton,
  ChannelHeaderSkeleton,
  ChannelLoadError,
  ChannelNotFound,
  TabEmpty,
  TabError,
} from "./states"
import { useChannelFeed, type ChannelFeed } from "./useChannelFeed"
import { visibilityBadge } from "./visibility"
import type { ChannelTab } from "./tabs"

/** Named in the Shorts empty state, because a short leaves Tube when opened. */
const SHORTS_APP = "Momentum Reels"

export function ChannelScreen({ channelRef, tab }: { channelRef: string; tab: ChannelTab }) {
  const { user } = useSession()

  const [channel, setChannel] = useState<TubeChannel | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const [counts, setCounts] = useState<AuthorCounts>(NO_COUNTS)
  const [extras, setExtras] = useState<ChannelProfileExtras>(NO_PROFILE_EXTRAS)
  const [playlists, setPlaylists] = useState<ChannelPlaylist[] | null>(null)
  const [playlistsFailed, setPlaylistsFailed] = useState(false)

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

  const ownerId = channel?.user_id ?? null
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId)

  /* The two decorations: what the tabs are worth, and what the banner is.
     Neither call throws — see ./api.ts — so neither needs a catch here. */
  useEffect(() => {
    if (!ownerId) return
    let live = true
    setCounts(NO_COUNTS)
    setExtras(NO_PROFILE_EXTRAS)
    void fetchAuthorCounts(ownerId).then((rows) => {
      if (live) setCounts(rows)
    })
    void fetchChannelProfileExtras(ownerId).then((row) => {
      if (live) setExtras(row)
    })
    return () => {
      live = false
    }
  }, [ownerId])

  /* Playlists, only once the tab is actually asked for. A channel page opened
     at Videos should not fetch a list nobody has looked at. */
  useEffect(() => {
    if (!ownerId || tab !== "playlists" || playlists !== null) return
    let live = true
    setPlaylistsFailed(false)
    fetchChannelPlaylists(ownerId)
      .then((rows) => {
        if (live) setPlaylists(rows)
      })
      .catch(() => {
        if (!live) return
        // An empty list and a failed list are DIFFERENT sentences, so the
        // failure is recorded rather than collapsed into "no playlists".
        setPlaylists([])
        setPlaylistsFailed(true)
      })
    return () => {
      live = false
    }
  }, [ownerId, tab, playlists])

  /* Am I subscribed? The hook never asks for my own channel or while signed
     out, and it leaves the edge unknown on a failed lookup; the header draws
     no control on an unknown edge. Seeded with the row's count so the number
     under the name can move with the press. */
  const subscription = useSubscription(
    user?.id ?? null,
    ownerId,
    typeof channel?.subscriber_count === "number" ? channel.subscriber_count : null
  )

  const videos = useChannelFeed(ownerId, "videos", tab === "videos")
  const shorts = useChannelFeed(ownerId, "shorts", tab === "shorts")

  /**
   * The number beside each tab.
   *
   * The counts endpoint where it answered, and the channel row's own
   * `video_count` as the fallback for Videos — that field is on every channel
   * row and is the number this page has always printed. Playlists borrows the
   * length of the list once the list is in hand and says nothing before then:
   * a count that appears when you open a tab is better than a zero nobody
   * asked for. About never carries a number.
   */
  const videoCount = counts.videos ?? (typeof channel?.video_count === "number" ? channel.video_count : null)
  const tabCounts = useMemo(
    (): Partial<Record<ChannelTab, number | null>> => ({
      videos: videoCount,
      shorts: counts.shorts,
      playlists: playlists === null ? null : playlists.length,
    }),
    [videoCount, counts.shorts, playlists]
  )

  if (status === "loading") {
    return (
      <div>
        <ChannelHeaderSkeleton />
        <ChannelGridSkeleton kind="videos" />
      </div>
    )
  }

  // Reachable only on a client-side navigation now; the server route resolves
  // a 404 before this mounts. See the header.
  if (status === "missing") return <ChannelNotFound channelRef={channelRef} />
  if (status === "error" || !channel) return <ChannelLoadError />

  const base = `/@${channel.handle || channel.user_id}`
  const name = channel.name?.trim() || atHandle(channel.handle) || "This channel"

  return (
    <div>
      <ChannelHeader
        channel={channel}
        subscription={subscription}
        coverUrl={extras.coverUrl}
        isOwner={isOwner}
        videoCount={videoCount}
      />
      <ChannelTabs base={base} current={tab} counts={tabCounts} />

      <ChannelTabPanel tab={tab}>
        {tab === "videos" && (
          <FeedTab
            feed={videos}
            kind="videos"
            showVisibility={isOwner}
            what="Videos"
            emptyTitle={`${name} hasn't posted a video yet`}
            emptyBody="When this channel publishes a long video, it will appear here."
          />
        )}

        {tab === "shorts" && (
          <FeedTab
            feed={shorts}
            kind="shorts"
            showVisibility={isOwner}
            what="Shorts"
            emptyTitle={`${name} hasn't posted a short yet`}
            emptyBody={`Shorts are the vertical videos that play in ${SHORTS_APP}. When this channel posts one, it will appear here.`}
          />
        )}

        {tab === "playlists" && (
          <PlaylistsTab
            playlists={playlists}
            failed={playlistsFailed}
            channelName={name}
            showVisibility={isOwner}
            onRetry={() => setPlaylists(null)}
          />
        )}

        {tab === "about" && <AboutTab channel={channel} joinedAt={extras.joinedAt} />}
      </ChannelTabPanel>
    </div>
  )
}

/* ── The two content tabs ─────────────────────────────────────────────────── */

/**
 * Videos and Shorts, which differ in three things — the card, the grid class
 * and the sentence when there is nothing — and share everything else.
 *
 * The error branch comes BEFORE the empty branch, and that ordering is the
 * point: a failed request falling through to "this channel hasn't posted a
 * video yet" would be the page inventing a fact about somebody's channel out
 * of its own network trouble.
 */
function FeedTab({
  feed,
  kind,
  showVisibility,
  what,
  emptyTitle,
  emptyBody,
}: {
  feed: ChannelFeed
  kind: "videos" | "shorts"
  showVisibility: boolean
  what: string
  emptyTitle: string
  emptyBody: string
}) {
  if (feed.loading) return <ChannelGridSkeleton kind={kind} />
  if (feed.failed && feed.items.length === 0) return <TabError what={what} onRetry={feed.retry} />
  if (feed.items.length === 0) {
    return (
      <TabEmpty icon={kind === "shorts" ? Clapperboard : Tv} title={emptyTitle} body={emptyBody} />
    )
  }

  return (
    <InfiniteFeed
      hasMore={feed.hasMore}
      loading={feed.loadingMore}
      onLoadMore={feed.loadMore}
      loadingIndicator={<p className="py-6 text-center text-sm text-mo-body">Loading more…</p>}
      endIndicator={
        <p className="py-8 text-center text-sm text-mo-body">
          {feed.failed
            ? "More could not be loaded."
            : `That is every ${kind === "shorts" ? "short" : "video"} on this channel.`}
        </p>
      }
    >
      <ul className={kind === "shorts" ? SHORTS_GRID : VIDEO_GRID}>
        {feed.items.map((item, at) =>
          kind === "shorts" ? (
            <ShortCard key={item.id} item={item} showVisibility={showVisibility} />
          ) : (
            <VideoCard
              key={item.id}
              item={item}
              position={at + 1}
              total={feed.items.length}
              // The whole page is this channel, and these rows are bare
              // `PostDetail` with no `channel` on them — so the card's own
              // name lookup would print "Someone" under every one.
              hideCreator
              footer={showVisibility ? <VisibilityNote item={item} /> : undefined}
            />
          )
        )}
      </ul>
    </InfiniteFeed>
  )
}

/**
 * "Unlisted — only people with the link", under one of your own videos.
 *
 * Drawn in `VideoCard`'s `footer` slot rather than over the poster, which is
 * the only place a channel page may add to that card without editing it — and
 * the slot exists for exactly this: a row's own line, outside both of the
 * card's anchors, so a badge is never a control inside a control.
 *
 * Real text rather than `aria-hidden` decoration, because the card's
 * accessible name is built by `cardLabel` from the item and cannot be extended
 * from out here. A short line announced after the title is the honest way to
 * say it.
 */
function VisibilityNote({ item }: { item: FeedItem }) {
  const badge = visibilityBadge(item.visibility)
  if (!badge) return null
  return (
    <p className="mt-2 inline-flex items-center rounded-mo-sm bg-mo-raised px-2 py-0.5 text-[11px] font-semibold text-mo-ink">
      {badge.description}
    </p>
  )
}

/* ── Playlists ────────────────────────────────────────────────────────────── */

/**
 * The Playlists tab.
 *
 * ── No client-side visibility filter, because the server decides ──────────
 * `GET /v1/creators/{id}/playlists` returns public playlists to everyone and
 * public + unlisted + private to the creator themselves. So on somebody
 * else's channel every row that arrives is one a stranger may see, and on the
 * viewer's OWN channel the narrower rows arrive too — which is exactly the
 * video grid's situation and gets exactly the video grid's answer: show them,
 * and mark them, so a creator reading their own page does not mistake a
 * private playlist for something the world can open. A filter here would be a
 * second, weaker copy of the server's rule that could only ever disagree with
 * it, over rows that had already crossed the wire.
 *
 * ── A row with no title is reported, not drawn as "undefined" ─────────────
 * A tab that prints six lines of "undefined" looks like a broken page; one
 * that says it received rows it could not read is a bug report somebody can
 * act on. Kept from the version of this tab that was written before any
 * playlist row had ever been observed.
 */
function PlaylistsTab({
  playlists,
  failed,
  channelName,
  showVisibility,
  onRetry,
}: {
  playlists: ChannelPlaylist[] | null
  failed: boolean
  channelName: string
  /** The viewer owns this channel, so unlisted and private rows are marked. */
  showVisibility: boolean
  onRetry: () => void
}) {
  if (playlists === null) {
    return (
      <ul aria-hidden="true" className="max-w-2xl space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="h-16 animate-pulse rounded-mo bg-mo-raised" />
        ))}
      </ul>
    )
  }

  if (failed) return <TabError what="Playlists" onRetry={onRetry} />

  const readable = playlists.filter((row) => (row.title ?? row.name ?? "").trim().length > 0)

  if (readable.length === 0) {
    return (
      <TabEmpty
        icon={ListVideo}
        title={
          playlists.length === 0
            ? `${channelName} has no playlists`
            : "These playlists could not be read"
        }
        body={
          playlists.length === 0
            ? "A playlist is a set of videos in an order its owner chose. This channel has not made one."
            : `${playlists.length} playlists came back in a shape this page cannot read yet. That is a bug on our side, not on this channel's.`
        }
      />
    )
  }

  return (
    <ul className="max-w-2xl space-y-3">
      {readable.map((row, at) => (
        <PlaylistRow
          key={row.id ?? row.playlist_id ?? `${(row.title ?? row.name ?? "").trim()}-${at}`}
          playlist={row}
          showVisibility={showVisibility}
        />
      ))}
    </ul>
  )
}

/**
 * One playlist: a cover, a title, a count, and — on your own channel — who can
 * see it.
 *
 * ── The cover comes from the row itself, with no second request ───────────
 * Each item now arrives with its `post` hydrated, so the first watchable one
 * is the cover. That is the whole reason this row has a picture: a batch call
 * per playlist to fetch thumbnails for a list nobody may scroll would be four
 * requests to decorate one tab.
 *
 * A playlist with no hydrated post — empty, or all of its first entries gone —
 * gets the stacked-list glyph rather than an empty well, for the reason
 * ./ShortCard.tsx gives: an empty well reads as an image that failed to load.
 *
 * ── It opens, and the id is picked by a LOOP rather than by `??` ─────────
 * `/tube/playlists/{id}` is a real route in this same app, so the row is a
 * `next/link` — same zone, so Next adds the basePath itself and
 * `playlistHref` is correctly zone-relative ("/playlists/{id}"). Both the id
 * rule and the href are imported from ../playlists/playlists.ts rather than
 * restated, because that file paid for the rule: `row.id ?? row.playlist_id`
 * falls through only on null and undefined, and a Go struct field with no
 * `omitempty` marshals `""` — a present, falsy string — so
 * `{id: "", playlist_id: "b"}` yields "" and loses a playlist that has a
 * perfectly good id sitting beside it. `playlistId` takes the first NON-EMPTY
 * candidate.
 *
 * A row with neither id stays inert rather than linking to
 * `/playlists/undefined`. It is still DRAWN: the title, the count and the
 * cover are real, and hiding somebody's playlist over a missing field would
 * be a worse answer than showing one that cannot be opened.
 *
 * ── One anchor, wrapping the whole row ───────────────────────────────────
 * There is one destination here, so there is one tab stop. The visibility
 * line lives inside it and is real text rather than `aria-hidden`, so the
 * link's own name ends with "Private — only you" and a screen-reader user is
 * told before they open it. That is the opposite case from
 * ../browse/VideoCard.tsx, which is two anchors because it genuinely has two
 * places to go.
 */
function PlaylistRow({
  playlist,
  showVisibility,
}: {
  playlist: ChannelPlaylist
  showVisibility: boolean
}) {
  const title = (playlist.title ?? playlist.name ?? "").trim()
  const count = playlist.video_count ?? playlist.item_count
  const cover = playlistCoverPost(playlist)
  const poster = cover ? videoPoster(videoMedia(cover)) : null
  const badge = showVisibility ? visibilityBadge(playlist.visibility) : null
  const id = playlistId(playlist)

  const row = (
    <>
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-mo-sm bg-mo-sunken">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, pre-sized URL.
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-mo-body">
            <ListVideo className="h-5 w-5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-mo-ink">{title}</p>
        <p className="mt-0.5 text-sm text-mo-body">
          {typeof count === "number" ? videosLabel(count) : "Playlist"}
        </p>
        {/* Real text, not a decorative chip: on your own channel this is the
            one thing on the row that tells you a stranger cannot open it. */}
        {badge && (
          <p className="mt-1 inline-flex items-center rounded-mo-sm bg-mo-raised px-2 py-0.5 text-[11px] font-semibold text-mo-ink">
            {badge.description}
          </p>
        )}
      </div>
    </>
  )

  const SHELL = "flex items-center gap-4 rounded-mo border border-mo bg-mo-surface p-3"

  // No id, no page to open. Inert, and still drawn — see the header.
  if (!id) return <li className={SHELL}>{row}</li>

  return (
    <li>
      <Link
        href={playlistHref(id)}
        className={`${SHELL} transition-colors duration-150 ease-mo hover:bg-mo-raised outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo`}
      >
        {row}
      </Link>
    </li>
  )
}

/* ── About ────────────────────────────────────────────────────────────────── */

/**
 * The About tab.
 *
 * ── Two possible join dates, and the profile's wins ───────────────────────
 * `channel.created_at` is when the CHANNEL row was made, which for most
 * accounts is the day they first published rather than the day they joined.
 * `created_at` on `GET /v1/profiles/{user_id}` is the account itself, and
 * YouTube's "Joined" means the latter. So the profile's date is preferred, the
 * channel's is the fallback, and the LABEL changes with it — "Joined" over a
 * channel-creation date would be a small false statement repeated on every
 * channel page in the product.
 */
function AboutTab({ channel, joinedAt }: { channel: TubeChannel; joinedAt: string | null }) {
  const joined = joinedAt ?? channel.created_at
  return (
    <dl className="max-w-2xl space-y-5">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-mo-body">About</dt>
        <dd className="mt-1 whitespace-pre-wrap text-mo-ink">
          {channel.about?.trim() || "This channel has not written a description."}
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
        <dt className="text-xs font-semibold uppercase tracking-wide text-mo-body">
          {joinedAt ? "Joined" : "Channel created"}
        </dt>
        {/* `absoluteTime` and not `relativeTime`: "3 months ago" is the right
            form for a video's age on a card and the wrong one for the date a
            channel was created, which is a fact rather than a recency. */}
        <dd className="mt-1 text-mo-ink">{joined ? absoluteTime(joined) : "Unknown"}</dd>
      </div>
    </dl>
  )
}
