"use client"

/**
 * `/tube/{postId}` — one long video, watched in a page.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DIFFERENCE FROM REELS, WHICH IS THE FOUNDER'S OWN
 *
 *     "1. When user click on expand button for reels, it plays full page as it
 *      now. 2. When user click on Full video expand, it ill play full video"
 *
 * Reels' expanded state IS a takeover: `/reels/{id}` is a full-screen
 * swipe-through scroller whose only chrome is 48 pixels of translucent bar
 * drawn over the video. This page is not that, and the difference is not a
 * shortcut. A long video is chosen and then watched: it has a title worth
 * reading, a channel worth following, a description that may be paragraphs, and
 * something that should play after it.
 *
 * The expansion is a control ON that page rather than another route. The full
 * argument, including what a route would have cost the creator's analytics, is
 * at the head of ./expand.ts and it is worth reading before moving this.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SHAPE OF THE PAGE, AND WHY IT IS MEASURED
 *
 *     "It should open like in YouTube completely… And recommendations, next
 *      videos. And I think you already implemented linked videos, right?"
 *
 * Two columns where there is room: the player and everything about it on the
 * left, what plays next on the right. One column, with the rail under the
 * description, where there is not.
 *
 * "Where there is room" is measured rather than assumed — see ./columns.ts.
 * @momentum/chrome's AppFrame hands every zone a 600px centre track, so a wide
 * WINDOW is not a wide PAGE here, and a `lg:` breakpoint would put a rail
 * beside a 360px player. Widening that track is the application shell's
 * decision; this page lights the second column up the moment it is given the
 * space, and is correct either way in the meantime.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE VIDEO IS FETCHED FROM THE FEED AND NOT FROM `GET /v1/posts/{id}`
 *
 * Because the post endpoint answers a thinner row than this page can render —
 * no variants, no blurhash, no dimensions and no author at all. The comparison
 * was made against the live gateway and is written out in ../tube/useTubeFeed.ts.
 *
 * `GET /v1/videos/{videoId}` was checked as the other candidate and it is not
 * one: post-service's `GetVideoDetail` answers the row's *video_metadata* —
 * trim points, cover frame, upload state — with no author, no channel, no media
 * variants and no counts. It is creator tooling, and it 404s for a post that
 * has never been through the video pipeline. So the feed walk stays, and it is
 * reached through `useWatchVideo` below so that a better endpoint is a change
 * in ONE function rather than in this component.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ORDER OF THE LEFT COLUMN
 *
 * Player, title, meta, channel row, action row, description, chapters, series.
 * The first six are the Android watch screen's own order (`watchDetails` in
 * feature/tube/ui/watch/WatchDetails.kt), transcribed rather than redesigned, so
 * somebody who uses both clients is not learning two layouts for one screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import { absoluteTime, relativeTime } from "@momentum/content"
import { ActionBar } from "@momentum/interactions"
import {
  MomentumVideo,
  metadataForPost,
  pickProgressive,
  prefersReducedMotion,
  primaryVideo,
  type WatchEvent,
} from "@momentum/player"
import { SubscribeControls } from "@/channel/SubscribeControls"
import { setBookmark, toggleLike } from "@/tube/api"
import { fetchChannelSubscriberCount } from "@/tube/channelApi"
import { resolveUrl } from "@/tube/resolveUrl"
import { useSubscription } from "@/tube/useSubscription"
import { useTubeAnalytics } from "@/tube/useTubeAnalytics"
import { useTubeFeed } from "@/tube/useTubeFeed"
import { creatorName, noPictureReason, videoTitle, viewsLabel } from "@/tube/video"
import { CommentThread } from "@/comments/CommentThread"
import { ReportControl } from "@/comments/ReportControl"
import { focusCommentId } from "@/comments/thread"
import { useComments } from "@/comments/useComments"
import { reportVideo } from "./api"
import { readAutoplayNext, writeAutoplayNext } from "./autoplayPreference"
import { Chapters } from "./Chapters"
import { ChannelRow } from "./ChannelRow"
import { COLUMN_GAP_PX, gridTemplateColumns } from "./columns"
import { Description } from "./Description"
import { EndScreen } from "./EndScreen"
import { frameClass, isExpanded } from "./expand"
import { SignedOutActions } from "./SignedOutActions"
import { useCaptions } from "./useCaptions"
import { usePublicWatch } from "./usePublicWatch"
import { nextEpisode, previousEpisode, watchHref } from "./links"
import { NextEpisodeCountdown } from "./NextEpisodeCountdown"
import { CardPrompt, EndScreenOverlay } from "./Overlays"
import { resumeNotice } from "./progress"
import { Related } from "./Related"
import { SeriesNext } from "./SeriesNext"
import {
  activeCard,
  activeEndScreens,
  chapterClock,
  inEndScreenWindow,
  orderedChapters,
} from "./timeline"
import { useAutoplayNext } from "./useAutoplayNext"
import { useColumns } from "./useColumns"
import { usePlayhead } from "./usePlayhead"
import { useRelated } from "./useRelated"
import { useResume } from "./useResume"
import { useWatchLinks } from "./useWatchLinks"
import { useExpand } from "./useExpand"
import {
  NoPicture,
  BackToTube,
  WatchError,
  WatchMissing,
  WatchNotFound,
  WatchSkeleton,
} from "./states"

/**
 * The comment thread's heading, named once.
 *
 * The action row's comment control scrolls to it and moves focus there, and the
 * thread renders it — so the string is shared rather than typed twice, because
 * the failure of a mismatch is silent: the button simply does nothing.
 */
const COMMENTS_HEADING_ID = "tube-comments"

/**
 * The one place this page decides where a video's row comes from.
 *
 * A thin wrapper over `useTubeFeed`, and it is not ceremony: the feed walk is a
 * documented FALLBACK for an endpoint that does not carry enough (see the
 * header), and it is the kind of thing that gets replaced. Keeping the choice
 * behind one named function means the replacement is here, once, rather than in
 * a component that also owns a player, a rail and three overlays.
 *
 * `enabled` is `signedIn`, and that is a change: it used to be `!signedOut`, so
 * that the first fetch went out while the session was still "unknown" rather
 * than costing a round trip. That was right while a signed-out visitor got
 * nothing from this page — the optimism was free. It is wrong now that they get
 * a DIFFERENT source: starting the ranked walk on "unknown" means every
 * anonymous visit begins with a guaranteed 401 and a failed token refresh
 * behind it, before the public read it actually needed. The skeleton covers the
 * one render this costs, and the layout seeds the session from the request's
 * own cookie, so in practice there is no gap at all.
 */
function useWatchVideo(postId: string, enabled: boolean) {
  return useTubeFeed(postId, enabled)
}

/**
 * Which of the two sources this visitor gets, and the four ways it can fail.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS PAGE USED TO REFUSE A SIGNED-OUT VISITOR OUTRIGHT
 *
 * It answered `WatchSignedOut` — "Videos are ranked for your account" — which
 * was a true sentence about `GET /v1/feed/videos` and the wrong thing to do
 * with it. The home grid works signed out (it falls back to the public shelf),
 * so a stranger is now shown a wall of real videos and clicks one: a sign-in
 * card on that first click is the worst of both, because they have already
 * been shown the thing they are then told they cannot have.
 *
 * `GET /v1/posts/{postId}` is optional-auth and answers for a stranger on a
 * public or unlisted video, so an anonymous viewer WATCHES. What they do not
 * get is only what genuinely needs an account, and each of those is named at
 * its own call site below rather than being switched off in one place here.
 *
 * ── The refusal is still the server's ─────────────────────────────────────
 * Anything not public 404s to a nil viewer, and that arrives as `missing` and
 * draws `WatchNotFound`. The route in app/[postId]/page.tsx already turns the
 * same refusal into a real HTTP 404 for a signed-out request, so this is the
 * client-side half of one gate rather than a second opinion.
 */
export function WatchScreen({ postId }: { postId: string }) {
  const session = useSession()

  /**
   * `signedOut` is a settled NO, not "we have not looked yet".
   *
   * `useSession` reports three states and the middle one matters here: while
   * the answer is unknown, neither source should be started — the ranked feed
   * because it 401s for a stranger, the public read because it would fetch a
   * second, thinner row for somebody who is about to get the hydrated one. The
   * skeleton covers that gap, which is one render in practice because the
   * layout seeds the provider from this request's own cookie.
   */
  const anonymous = Boolean(session.signedOut)
  const known = Boolean(session.signedIn) || anonymous

  const feed = useWatchVideo(postId, Boolean(session.signedIn))
  const publicWatch = usePublicWatch(postId, anonymous)

  if (!known) return <WatchSkeleton />

  if (anonymous) {
    if (publicWatch.loading && !publicWatch.item) return <WatchSkeleton />
    if (publicWatch.error && !publicWatch.item) {
      return <WatchError message={publicWatch.error} onRetry={publicWatch.retry} />
    }
    // The server will not show this to a stranger. Not `WatchMissing`, whose
    // wording is about "the videos ranked for your account" and means nothing
    // to somebody who has no account: `WatchNotFound` says the link may be
    // wrong, private or taken down, and offers sign-in as the one thing that
    // might change the answer.
    if (publicWatch.missing || !publicWatch.item) return <WatchNotFound />
    return (
      <Watch
        key={publicWatch.item.id}
        item={publicWatch.item}
        position={0}
        patch={publicWatch.patch}
      />
    )
  }

  const item = feed.item
  if (feed.loading && !item) return <WatchSkeleton />
  if (feed.error && !item) return <WatchError message={feed.error} onRetry={feed.retry} />
  if (feed.deepLinkMissing) return <WatchMissing />
  // Still walking pages for it. The skeleton, not an apology — see the header
  // of ../tube/useTubeFeed.ts for why the walk is bounded rather than instant.
  if (!item) return <WatchSkeleton />

  // Keyed on the post so that navigating from one video to another — which the
  // recommendations rail and the series list now make easy, and which nothing
  // on this page could do before — gets a fresh player, a fresh watch session,
  // a fresh resume lookup and a fresh subscription lookup, rather than a
  // component quietly reusing the previous video's state.
  return <Watch key={item.id} item={item} position={feed.position} patch={feed.patch} />
}

function Watch({
  item,
  position,
  patch,
}: {
  item: FeedItem
  position: number
  patch: (id: string, change: Partial<FeedItem>) => void
}) {
  const session = useSession()
  const viewerId = session.userId ?? null
  const signedIn = Boolean(session.signedIn)
  const analytics = useTubeAnalytics()
  const expand = useExpand()

  /* ── The channel, and the viewer's subscription to it ─────────────────── */

  /**
   * The owner is the channel's user when the row carries a channel and the
   * author otherwise; a long video's author IS its channel's owner, so these
   * are one id spelt two ways rather than two candidates.
   *
   * The count is read off the channel's own row (`GET /v1/channels/{ref}`),
   * because a feed row's `channel` carries no count. It is a side request
   * that fails alone: null draws no number, never "0". ../watch/ChannelRow.tsx
   * says why that matters under a creator's name.
   */
  const ownerId = item.channel?.user_id ?? item.author_id
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  useEffect(() => {
    setSubscriberCount(null)
    if (!ownerId) return
    let live = true
    fetchChannelSubscriberCount(ownerId)
      .then((count) => {
        if (live) setSubscriberCount(count)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [ownerId])

  /**
   * One of the thirteen events, and it means exactly what happened here:
   * somebody subscribed to a channel because of a video, from the video. The
   * name is the analytics vocabulary's, kept because the subscribe creates
   * the follow edge underneath and the dashboards already count it.
   */
  const onSubscribed = useCallback(() => {
    analytics.recordEngagement("follow_from_content", item, position)
  }, [analytics, item, position])

  const subscription = useSubscription(viewerId, ownerId, subscriberCount, { onSubscribed })

  const media = primaryVideo(item)
  const missing = noPictureReason(item)

  /**
   * The caption tracks, for the player's own CC menu.
   *
   * Keyed on the MEDIA id — captions belong to the asset, which is why the
   * route is `/v1/subtitles/{mediaId}` on media-service rather than another
   * `/v1/posts/{id}/…`. No tracks means the player draws no CC button, which
   * it already handles; ./useCaptions.ts says why the URL has to be
   * same-origin and what it does when it is not.
   */
  const captions = useCaptions(media?.media_id)

  /* ── The two elements this page has to measure ────────────────────────── */

  /**
   * The outer element, whose WIDTH decides one column or two, and the player's
   * box, which is both what gets expanded and where the `<video>` lives.
   *
   * State rather than refs because both feed hooks, and a ref mutation does not
   * re-render. `setBoxEl` also forwards to `expand.ref` — that callback is the
   * hook's own stable identity, so composing them costs nothing and keeps the
   * fullscreen target and the playhead source the same element by construction.
   */
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null)
  const [boxEl, setBoxEl] = useState<HTMLElement | null>(null)

  /**
   * `expand.ref` and not `expand`.
   *
   * The hook returns a fresh object every render, so depending on `expand`
   * would give this callback a new identity every render — and React detaches a
   * changed callback ref by calling the old one with `null` before calling the
   * new one with the element. `setBoxEl(null)` would then re-render, which
   * would make a third callback, and so on for ever. `expand.ref` is itself a
   * `useCallback([])`, so this is stable and the ref attaches exactly once.
   */
  const attachExpandRef = expand.ref
  const attachBox = useCallback(
    (el: HTMLDivElement | null) => {
      attachExpandRef(el)
      setBoxEl(el)
    },
    [attachExpandRef]
  )

  const columns = useColumns(frameEl)
  const playhead = usePlayhead(boxEl)

  /* ── Everything the video links to ────────────────────────────────────── */

  const links = useWatchLinks(item.id, true)
  /**
   * The rail. Ranked for a viewer, the public shelf for a stranger.
   *
   * `/v1/feed/videos/{id}/related` is 401 without a session, so a signed-out
   * page cannot have recommendations — and an empty column beside a playing
   * video is the same dead end that letting a stranger watch was meant to
   * remove. ./useRelated.ts swaps in `GET /v1/posts/recent` and ./Related.tsx
   * renames the heading, because "Next videos" over a list that has never heard
   * of this video is a claim the data does not support.
   */
  const related = useRelated(item.id, true, { anonymous: !signedIn })
  const chapters = useMemo(() => orderedChapters(links.chapters), [links.chapters])

  /**
   * The same chapters, in the player's vocabulary.
   *
   * @momentum/player takes `{ startMs, title }` and deliberately not the wire
   * row — see the header of its chapters.ts. The mapping is here because this
   * is the side that knows what `start_ms` is called; moving the wire type into
   * the package would drag the tube API's names into a package the feed also
   * mounts. Titleless rows are dropped: a tick with no name is a mark nobody
   * can act on and it would still take a slot in the scrubber.
   */
  const playerChapters = useMemo(
    () =>
      chapters
        .filter((chapter) => chapter.title.trim().length > 0)
        .map((chapter) => ({ startMs: chapter.start_ms, title: chapter.title })),
    [chapters]
  )

  /**
   * The episode either side of this one, from the same rows the rail draws.
   *
   * Derived here rather than taken from the server's `next` pointer so the
   * countdown, the lock-screen buttons and the rail's "Next:" link are three
   * views of ONE answer. `?links=preview` fixtures have no server pointer at
   * all, and they still get a countdown this way.
   */
  const seriesNext = useMemo(
    () => nextEpisode(links.seriesEpisodes, item.id),
    [links.seriesEpisodes, item.id]
  )
  const seriesPrev = useMemo(
    () => previousEpisode(links.seriesEpisodes, item.id),
    [links.seriesEpisodes, item.id]
  )

  /**
   * Cards somebody has closed. By id, for the life of this view.
   *
   * A seek backwards over a dismissed card's window does not bring it back —
   * ./timeline.ts says why. The set is recreated when the component is, which
   * is once per video because of the `key` above.
   */
  const [dismissedCards, setDismissedCards] = useState<ReadonlySet<string>>(() => new Set())
  const dismissCard = useCallback((cardId: string) => {
    setDismissedCards((prev) => {
      const next = new Set(prev)
      next.add(cardId)
      return next
    })
  }, [])

  const card = activeCard(links.cards, playhead.positionMs, dismissedCards)

  /**
   * End screens, gated twice.
   *
   * The row's own window says WHEN the author wanted it; `inEndScreenWindow`
   * says whether the video is actually near its end. The second gate is not
   * redundant — a video re-trimmed after its end screens were written keeps
   * rows pointing at timestamps that are now in its middle, and an overlay over
   * the middle of a video covers something somebody is watching.
   */
  const endScreens = inEndScreenWindow(playhead.positionMs, playhead.durationMs)
    ? activeEndScreens(links.endScreens, playhead.positionMs)
    : []

  /* ── Resume ───────────────────────────────────────────────────────────── */

  const resume = useResume({
    postId: item.id,
    signedIn,
    positionMs: playhead.positionMs,
    durationMs: playhead.durationMs,
    ended: playhead.ended,
    seek: playhead.seek,
  })

  /**
   * Autoplay, unless the person asked their operating system for less motion.
   *
   * Read once, on mount, rather than during render: `prefersReducedMotion()`
   * touches `window.matchMedia` and would make this component render
   * differently on the server than in the browser. `false` on the first paint
   * is also the safe direction: it means the video does not start, and a video
   * that has not started yet is a poster with a play button on it.
   *
   * The same reading gates the countdown below. A page that will not start the
   * video somebody navigated to has no business starting one they did not.
   */
  const [active, setActive] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const less = prefersReducedMotion()
    setReducedMotion(less)
    setActive(!less)
  }, [])

  /* ── What plays next, and whether it plays by itself ──────────────────── */

  /**
   * There is still no autoplay coordinator between PLAYERS, and there does not
   * need to be: this page mounts exactly one, and the rail mounts none (see
   * ./Related.tsx). What there is, since 2026-09-12, is a coordinator between
   * VIDEOS: when this one ends and it is an episode of a series, the next
   * episode is offered on a ten-second countdown with a Cancel, and nothing
   * else on the page ever starts on its own. ./autoplayNext.ts has the rules;
   * ./useAutoplayNext.ts has the clock and the navigation.
   *
   * The preference is read after mount for the reason `active` is: it lives
   * in localStorage, which the server does not have. `true` on the first
   * paint is the founder's default, and it is only ever read, never acted on,
   * before the effect has run, because nothing has ended yet.
   */
  const [autoplayNext, setAutoplayNext] = useState(true)
  useEffect(() => {
    setAutoplayNext(readAutoplayNext(viewerId))
  }, [viewerId])
  const onAutoplayNextChange = useCallback(
    (next: boolean) => {
      setAutoplayNext(next)
      writeAutoplayNext(viewerId, next)
    },
    [viewerId]
  )

  const autoplay = useAutoplayNext({
    ended: playhead.ended,
    next: seriesNext,
    enabled: autoplayNext,
    reducedMotion,
  })

  /**
   * The lock-screen skip buttons, wired only when a series gives them
   * somewhere to go. `MomentumVideo` registers the OS handlers only when
   * handed a callback, and a recommendations rail must never hand it one: a
   * rail is a list of suggestions, not a queue, and a "next" button on the
   * lock screen would promise an order the page does not have. A series IS
   * that order.
   */
  const router = useRouter()
  const onNextTrack = useMemo(
    () => (seriesNext ? () => router.push(watchHref(seriesNext.post_id)) : undefined),
    [router, seriesNext]
  )
  const onPreviousTrack = useMemo(
    () => (seriesPrev ? () => router.push(watchHref(seriesPrev.post_id)) : undefined),
    [router, seriesPrev]
  )

  const watch = analytics.sessionFor(item, position)
  const onWatchEvent = useCallback(
    (event: WatchEvent) => {
      if (watch) analytics.recordWatch(item, watch, event)
    },
    [analytics, item, watch]
  )

  /* ── The action row ───────────────────────────────────────────────────── */

  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2_500)
    return () => window.clearTimeout(id)
  }, [notice])

  /**
   * `ActionBar` from @momentum/interactions does the optimistic update and the
   * rollback itself — it is built to be given a promise that resolves to the
   * settled state — so these handlers are thin. What they add is the FEED
   * patch, which is what keeps the counts under the video honest for as long as
   * this page is open, and the engagement event.
   */
  const onLike = useCallback(
    async (next: boolean) => {
      const result = await toggleLike(item.id)
      patch(item.id, {
        has_reacted: result.on,
        // The server's own count, not our ±1: other people have been liking
        // this too, so their number replaces ours rather than reconciling.
        counts: { ...item.counts, likes: result.count },
      })
      // `next` is what was asked for; `result.on` is what happened.
      void next
      return { on: result.on, count: result.count }
    },
    [item, patch]
  )

  const onSave = useCallback(
    async (next: boolean) => {
      const result = await setBookmark(item.id, next)
      patch(item.id, { is_bookmarked: result.on })
      if (result.on) analytics.recordEngagement("save", item, position)
      return { on: result.on, count: 0 }
    },
    [analytics, item, patch, position]
  )

  /**
   * Share is a link to this very page, which is why this route exists as a
   * route at all rather than as a state of the browse grid.
   *
   * `navigator.share` where the browser has it, the clipboard where it does
   * not. Nothing is invented when neither works — the control reports that it
   * could not, rather than pretending.
   */
  const onShare = useCallback(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || ""
    const url = `${window.location.origin}${base}/${item.id}`
    const done = () => analytics.recordEngagement("share", item, position)
    if (navigator.share) {
      navigator
        .share({ url, title: videoTitle(item) })
        // An abort is the person changing their mind, not a failure.
        .then(done)
        .catch(() => undefined)
      return
    }
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setNotice("Link copied.")
        done()
      })
      .catch(() => setNotice("Could not copy the link."))
  }, [analytics, item, position])

  /* ── Comments ─────────────────────────────────────────────────────────── */

  /**
   * The comment a notification linked to, read from the address bar ONCE.
   *
   * `window.location.search` in an effect rather than `useSearchParams()`, and
   * the reason is a build-time one: a client component that calls
   * `useSearchParams` must sit under a Suspense boundary or Next refuses to
   * render the route statically — and wrapping this whole screen in Suspense to
   * read one optional query parameter would put a loading boundary around a
   * player for the benefit of a deep link almost nobody arrives by. Read after
   * mount, it is the same value with no boundary and no bail-out.
   *
   * `focusCommentId` validates it as a UUID before it becomes a path segment.
   */
  const [focusComment, setFocusComment] = useState<string | null>(null)
  useEffect(() => {
    setFocusComment(focusCommentId(window.location.search))
  }, [])

  /**
   * The count the thread starts from, frozen at mount.
   *
   * A ref and not `item.counts.comments`, because the effect below writes the
   * thread's count BACK into the feed row so the action bar above agrees with
   * the heading below. Read live, that write would become the new base, the
   * thread's own delta would be added to it a second time, and one comment
   * would read as two. Frozen, the arithmetic has exactly one input.
   *
   * It is per video for free: `Watch` is keyed on the post.
   */
  const baseComments = useRef(item.counts?.comments ?? 0)

  const comments = useComments({
    postId: item.id,
    viewerId,
    baseCount: baseComments.current,
    disabled: Boolean(item.no_comments),
    focusId: focusComment,
  })

  /**
   * One number, in two places, from one source.
   *
   * The action row draws `item.counts.comments` and the thread draws its own
   * count; a comment posted at the bottom of the page that did not move the
   * number at the top would read as a comment that did not save. The feed patch
   * keeps them equal for as long as this page is open — the same mechanism
   * `onLike` and `onSave` already use for likes and bookmarks.
   */
  const commentCountNow = comments.count
  useEffect(() => {
    if ((item.counts?.comments ?? 0) === commentCountNow) return
    patch(item.id, {
      counts: { likes: item.counts?.likes ?? 0, comments: commentCountNow },
    })
  }, [commentCountNow, item.counts, item.id, patch])

  /**
   * The action bar's comment control now goes TO the thread rather than
   * apologising for its absence.
   *
   * It used to say "Comments open in the {app} for now", which was honest and
   * is no longer true. Scrolling rather than opening a sheet: a sheet over a
   * playing long video has to decide whether to pause, and the answer people
   * actually want — keep watching while you read — is what a page that simply
   * scrolls gives for free.
   */
  const onComment = useCallback(() => {
    const heading = document.getElementById(COMMENTS_HEADING_ID)
    heading?.scrollIntoView({ behavior: "smooth", block: "start" })
    // Focus follows the scroll, or a keyboard user is moved nowhere at all.
    // `preventScroll` because the smooth scroll above is already doing it.
    heading?.focus?.({ preventScroll: true })
  }, [])

  /**
   * Report the video.
   *
   * `ActionBar` has no report slot — it is likes, comments, save, repost and
   * share — and adding one to a package three zones mount is a change to make
   * from the package, not from a page. So the control sits beside the bar,
   * using the same two-step picker every comment row uses, against
   * trust-safety-service's own reason list.
   */
  const [videoReported, setVideoReported] = useState(false)
  const onReportVideo = useCallback(
    async (reason: Parameters<typeof reportVideo>[1], details: string) => {
      const filed = await reportVideo(item.id, reason, details)
      if (filed) setVideoReported(true)
      else setNotice("That report could not be filed. Try again in a moment.")
      return filed
    },
    [item.id]
  )

  const title = videoTitle(item)
  const expanded = isExpanded(expand.mode)

  /**
   * The subscribe control an end-screen `channel_subscribe` tile draws.
   *
   * The page's real one, from the same edge the channel row draws, passed
   * down rather than rebuilt: an end screen must not get a second, dumber
   * button that disagrees with the row above it about whether the viewer is
   * subscribed. Null when the control should not be offered at all (the
   * viewer's own video, signed out, or an edge still unknown), and the tile
   * then says so rather than drawing a button that does nothing. The null
   * is decided here and not by `SubscribeControls` rendering nothing, because
   * the tile's `subscribe ?? fallback` needs a real null to fall back on.
   */
  const subscribeControl = subscription.state ? (
    <SubscribeControls edge={subscription} name={creatorName(item)} />
  ) : null

  return (
    <article
      ref={setFrameEl}
      className="grid items-start"
      style={{
        gridTemplateColumns: gridTemplateColumns(columns),
        columnGap: COLUMN_GAP_PX,
        rowGap: 32,
      }}
    >
      {/* ── The player column ──────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* The hole the player leaves behind when it expands.

            `frameClass` turns the box `fixed` in theatre mode — inset 0, the
            whole viewport — which takes it OUT OF THE FLOW. Without something
            holding its place, the title, the channel row and everything under
            them jump up by the height of a 16:9 player at the moment of
            expansion and drop back at the moment of collapse, so leaving
            fullscreen returns somebody to a page that has moved under them.

            `contents` while collapsed, so this element does not exist as far as
            layout is concerned and the normal case is unchanged to the pixel.
            A 16:9 block while expanded, which is exactly what left. */}
        <div className={expanded ? "aspect-video w-full rounded-mo bg-mo-sunken" : "contents"}>
          {/* The player's box. `attachBox` goes HERE and not on the <video>: the
              transport, the speaker, the expand control and both overlays are all
              absolutely placed inside this element, and fullscreening the bare
              video element would take the picture full screen and leave every
              control behind in the page. */}
          <div ref={attachBox} className={frameClass(expand.mode)}>
            {missing || !media ? (
              <NoPicture reason={missing ?? "missing"} />
            ) : (
              <MomentumVideo
                source={{
                  // `playback_url` first, `hls_url` as the fallback: they are the
                  // same string today, but playback_url is the one that also
                  // carries `playback_kind: "original"` — a progressive MP4
                  // served while the transcode is still running.
                  hlsUrl: media.playback_url || media.hls_url,
                  progressiveUrl: pickProgressive(media),
                  durationMs: media.duration_ms,
                  width: media.width,
                  height: media.height,
                }}
                active={active}
                /**
                 * Sound ON by default, which is the opposite of the feed and of
                 * reels, and is correct here. A feed video is something you
                 * scrolled past; a long video is something you navigated to and
                 * pressed. Read the header of soundPreference.ts before changing
                 * it.
                 */
                muted={false}
                /*
                  The long-video chrome: speed, quality, captions, a volume
                  slider, picture-in-picture, buffered ranges, a scrub tooltip,
                  chapter ticks and the gear that hosts the first three. Off by
                  default in @momentum/player, because the feed and reels want the
                  small transport; this is the page that wants all of it.
                */
                chrome="full"
                /*
                  Fullscreen is the player's BUTTON and this page's BEHAVIOUR.

                  ./expand.ts already owns the expansion: it chose the Fullscreen
                  API over a theatre route (a route unmounts hls.js and splits one
                  view into two for analytics), it carries the fixed-overlay
                  fallback for browsers that refuse the API, and it owns the
                  document scroll lock. Two owners for one expansion is a player
                  that enters fullscreen and immediately leaves it — so the player
                  draws the control, in the transport row where every long-video
                  player puts it, and every press comes straight back here. `f`
                  reaches the same toggle.
                */
                onToggleFullscreen={expand.toggle}
                isFullscreen={expanded}
                /* Speed, quality, caption language and volume are remembered per
                   viewer. Signed out is the shared anonymous key. */
                viewerId={viewerId}
                /* The chapters this page already fetched, mapped to the player's
                   two fields — @momentum/player must not learn the tube API's
                   wire vocabulary. */
                chapters={playerChapters}
                /* The caption tracks, as `<track>` children. Empty until the
                   list lands and empty for ever on a video with none — the CC
                   button is then absent rather than disabled, which is the same
                   absent-not-disabled rule the action row follows. */
                captions={captions.tracks}
                className="absolute inset-0"
                ariaLabel={media.alt_text || title}
                session={watch}
                onWatchEvent={onWatchEvent}
                /* The OS media controls describe what is playing. The skip
                   buttons are `undefined` outside a series; see `onNextTrack`
                   above for why a rail must never supply them. */
                mediaSession={metadataForPost(item, media)}
                onNextTrack={onNextTrack}
                onPreviousTrack={onPreviousTrack}
                resolveUrl={resolveUrl}
              />
            )}

            {/* The countdown to the next episode, centred, while it runs. */}
            {!missing && media && autoplay.state.kind === "counting" && (
              <NextEpisodeCountdown
                target={autoplay.state.target}
                secondsLeft={autoplay.state.secondsLeft}
                autoplayNext={autoplayNext}
                onAutoplayNextChange={onAutoplayNextChange}
                onPlayNow={autoplay.playNow}
                onCancel={autoplay.cancel}
              />
            )}

            {/* The end screen: once the video has ended and nothing is counting
                down. Not while `fired`, which is a navigation in flight, and
                not while counting, because two overlays offering "next" at
                once is one too many. */}
            {!missing &&
              media &&
              playhead.ended &&
              (autoplay.state.kind === "idle" || autoplay.state.kind === "cancelled") && (
                <EndScreen related={related.items} next={seriesNext} onReplay={playhead.replay} />
              )}

            {/* The in-video card, at its timestamp. Top-left — the one corner
                nothing else on this player wants. */}
            {!missing && media && card && <CardPrompt card={card} onDismiss={dismissCard} />}

            {/* The end screen, in its window and near the end. Never over the
                bottom of the frame; ./Overlays.tsx says why. */}
            {!missing && media && endScreens.length > 0 && (
              <EndScreenOverlay
                screens={endScreens}
                channelName={creatorName(item)}
                subscribe={subscribeControl ?? undefined}
              />
            )}

            {/* "Full video" — the founder's control, now drawn by the player.

                It used to be a labelled pill here at bottom-right, on the grounds
                that this was "the one corner of a player nothing else wants".
                That stopped being true: @momentum/player's full chrome puts
                captions, the gear and picture-in-picture along the right end of
                its transport row, and a pill pinned over them is a control
                sitting on three other controls.

                So the BUTTON moved into the transport, beside the others, where
                every long-video player on the web has it — and the BEHAVIOUR did
                not move at all. `onToggleFullscreen={expand.toggle}` above means
                every press still lands in ./useExpand.ts, which keeps the
                Fullscreen API, the fixed-overlay fallback, the Escape handling
                and the document scroll lock exactly where they were. The way back
                out is still three: the control, Escape, and the browser's own. */}
          </div>
        </div>

        {/* Everything below is hidden while the player is expanded. Not for
            tidiness: in the theatre fallback the overlay is `fixed` and this
            content is still in the document behind it, so a Tab from inside the
            expanded player would walk into controls nobody can see. `inert`
            takes it out of the tab order and out of the accessibility tree in
            one attribute, which React 19 passes straight through. */}
        <div inert={expanded}>
          <h1 className="mt-4 font-mo-display text-xl font-semibold leading-snug tracking-mo-display text-mo-ink">
            {title}
          </h1>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-mo-body">
            <span>{viewsLabel(item)}</span>
            <span aria-hidden>·</span>
            <time dateTime={item.created_at} title={absoluteTime(item.created_at)}>
              {relativeTime(item.created_at)}
            </time>
            {/* The server's own sentence about why this is in the feed — "From
                someone you follow". Never composed here: `reason_text` is
                written by feed-service precisely so two clients cannot invent
                two different explanations of one ranking decision. */}
            {item.reason_text && (
              <>
                <span aria-hidden>·</span>
                <span>{item.reason_text}</span>
              </>
            )}
          </p>

          {/* The channel, and — for a stranger — a link where the Subscribe
              button would be. `useSubscription` never fetches without a viewer,
              so the control would otherwise render as nothing at all, which
              reads as a page that forgot a button. */}
          <ChannelRow item={item} subscription={subscription} signedOut={!signedIn} />

          {/* The action row, horizontally, which is what @momentum/interactions'
              ActionBar already IS. apps/reels draws its own vertical rail over
              a 9:16 frame and says why; this page has no such constraint.

              Signed out it is a DIFFERENT component rather than this one with
              its buttons disabled. Every control on `ActionBar` is a write the
              gateway answers 401 to, and `useOptimisticToggle` would fill the
              heart, bump the count, and then put both back with an error — a
              worse answer than no button, because it teaches somebody the site
              is broken rather than that they need an account.
              ./SignedOutActions.tsx keeps the counts, keeps Share (which needs
              no session at all) and offers the one thing that helps. */}
          <div className="mt-4">
            {signedIn ? (
              <ActionBar
                likes={item.counts?.likes ?? 0}
                comments={item.counts?.comments ?? 0}
                hasLiked={Boolean(item.has_reacted)}
                isSaved={Boolean(item.is_bookmarked)}
                noComments={item.no_comments}
                hideShare={item.hide_share}
                // Reposting a long video is a real capability on the server, and
                // there is no repost flow anywhere on the web yet. Passing no
                // handler is what removes the control; a control that opened
                // nothing would be worse than its absence.
                isRepostable={false}
                onLike={onLike}
                onSave={onSave}
                onComment={onComment}
                onShare={onShare}
                label={title}
              />
            ) : (
              <SignedOutActions
                likes={item.counts?.likes ?? 0}
                comments={item.counts?.comments ?? 0}
                noComments={item.no_comments}
                hideShare={item.hide_share}
                onComment={onComment}
                onShare={onShare}
              />
            )}

            {/* Report, beside the bar rather than in it.

                `ActionBar` is likes, comments, save, repost and share — it has
                no report slot, and widening a package three zones mount is a
                change to make from the package. The control is the same
                two-step picker every comment row uses, so a person learns the
                flow once. `hide_share` does not hide it: an author may switch
                sharing off, and nobody may switch off being reported. */}
            {signedIn && (
              <ReportControl
                label={`Report this video, ${title}`}
                reported={videoReported}
                onReport={onReportVideo}
              />
            )}
          </div>

          {/* Somebody who was moved is told so, and told where to. A player
              that silently starts eleven minutes in reads as a broken video
              rather than as a favour. `role="status"` so it is announced
              without stealing focus from the player. */}
          {resume.resumedAtMs !== null && (
            <p role="status" className="mt-3 text-sm text-mo-body">
              {resumeNotice(resume.resumedAtMs, chapterClock)}
            </p>
          )}

          {notice && (
            <p role="status" className="mt-3 text-sm text-mo-body">
              {notice}
            </p>
          )}

          {/* The description. Collapsed to four lines with a control to open
              it — a long video's description is genuinely long, and pushing
              everything under it off the page by default is how the rest of the
              page stops being found.

              It now LINKIFIES: a `1:23` in the text seeks the player, a #tag
              searches, an @handle goes to the channel. ./linkify.ts carries
              the rules, and the one that matters is which numbers are NOT
              timestamps. `playhead.durationMs` rather than the post's, because
              the element's duration is the one a seek will honour. */}
          {item.text?.trim() && (
            <Description
              text={item.text.trim()}
              durationMs={playhead.durationMs}
              onSeek={playhead.seek}
            />
          )}

          <Chapters
            chapters={chapters}
            positionMs={playhead.positionMs}
            durationMs={playhead.durationMs}
            onSeek={playhead.seek}
            unavailable={links.unavailable.chapters}
            isPreview={links.isPreview}
          />

          {/* ── The thread ──────────────────────────────────────────────
              Under the video and above "All videos", which is where a watch
              page puts it and where the action row's comment control scrolls
              to. It is inside the `inert` block, so an expanded player takes
              the whole thread out of the tab order with everything else. */}
          <CommentThread
            state={comments}
            viewerId={viewerId}
            postAuthorId={item.author_id ?? null}
            disabled={Boolean(item.no_comments)}
            durationMs={playhead.durationMs}
            onSeek={playhead.seek}
            headingId={COMMENTS_HEADING_ID}
          />

          <div className="mt-8 border-t border-mo pt-5">
            <BackToTube label="All videos" />
          </div>
        </div>
      </div>

      {/* ── The rails ──────────────────────────────────────────────────────
          Both of them, in one grid item: in two columns they sit beside the
          player, in one they fall below the whole left column — with no
          duplicate markup and no second copy of either list to keep in step.

          The series rail MOVED here from under the description. It belongs
          beside the recommendations because they answer the same question —
          "what do I watch after this" — and a queue that is a screen and a half
          below the thing that plays next is a queue nobody uses. Ordered series
          first: it is an ORDER the creator made, where the rail below it is a
          set of suggestions, and the one with a promise behind it goes first.

          `inert` for the same reason the metadata is: they are behind a fixed
          overlay in theatre mode. */}
      <aside inert={expanded} className="min-w-0">
        <SeriesNext
          episodes={links.seriesEpisodes}
          postId={item.id}
          seriesTitle={links.seriesTitle ?? undefined}
          isPreview={links.isPreview}
          autoplayNext={autoplayNext}
          onAutoplayNextChange={onAutoplayNextChange}
        />

        <Related
          items={related.items}
          loading={related.loading}
          loadingMore={related.loadingMore}
          error={related.error}
          ended={related.ended}
          onLoadMore={related.loadMore}
          onRetry={related.retry}
          headingId="tube-related"
          unranked={!signedIn}
        />
      </aside>
    </article>
  )
}
