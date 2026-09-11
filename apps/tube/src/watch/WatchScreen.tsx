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

import { useCallback, useEffect, useMemo, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import { BRAND } from "@momentum/brand"
import { absoluteTime, relativeTime } from "@momentum/content"
import { ActionBar, FollowButton } from "@momentum/interactions"
import {
  MomentumVideo,
  metadataForPost,
  pickProgressive,
  prefersReducedMotion,
  primaryVideo,
  type WatchEvent,
} from "@momentum/player"
import { setBookmark, toggleLike } from "@/tube/api"
import { resolveUrl } from "@/tube/resolveUrl"
import { useFollowState } from "@/tube/useFollowState"
import { useTubeAnalytics } from "@/tube/useTubeAnalytics"
import { useTubeFeed } from "@/tube/useTubeFeed"
import {
  creatorName,
  noPictureReason,
  showsFollow,
  videoTitle,
  viewsLabel,
} from "@/tube/video"
import { Chapters } from "./Chapters"
import { ChannelRow, SUBSCRIBE_LABELS } from "./ChannelRow"
import { COLUMN_GAP_PX, gridTemplateColumns } from "./columns"
import { expandAriaLabel, expandLabel, frameClass, isExpanded } from "./expand"
import { PREVIEW_SERIES_TITLE } from "./fixtures"
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
  WatchSignedOut,
  WatchSkeleton,
} from "./states"

/**
 * The one place this page decides where a video's row comes from.
 *
 * A thin wrapper over `useTubeFeed`, and it is not ceremony: the feed walk is a
 * documented FALLBACK for an endpoint that does not carry enough (see the
 * header), and it is the kind of thing that gets replaced. Keeping the choice
 * behind one named function means the replacement is here, once, rather than in
 * a component that also owns a player, a rail and three overlays.
 *
 * `enabled` is `!signedOut` rather than `signedIn`: `signedIn` is false while
 * the status is still "unknown", and a page that waited for certainty before
 * its first fetch would add a round trip to every visit.
 */
function useWatchVideo(postId: string, enabled: boolean) {
  return useTubeFeed(postId, enabled)
}

export function WatchScreen({ postId }: { postId: string }) {
  const session = useSession()
  const feed = useWatchVideo(postId, !session.signedOut)
  const item = feed.item

  if (session.signedOut) return <WatchSignedOut />
  if (feed.loading && !item) return <WatchSkeleton />
  if (feed.error && !item) return <WatchError message={feed.error} onRetry={feed.retry} />
  if (feed.deepLinkMissing) return <WatchMissing />
  // Still walking pages for it. The skeleton, not an apology — see the header
  // of ../tube/useTubeFeed.ts for why the walk is bounded rather than instant.
  if (!item) return <WatchSkeleton />

  // Keyed on the post so that navigating from one video to another — which the
  // recommendations rail and the series list now make easy, and which nothing
  // on this page could do before — gets a fresh player, a fresh watch session,
  // a fresh resume lookup and a fresh follow lookup, rather than a component
  // quietly reusing the previous video's state.
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
  const follow = useFollowState(viewerId, item.author_id)

  const media = primaryVideo(item)
  const missing = noPictureReason(item)

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

  const links = useWatchLinks(item.id, item.author_id, true)
  const related = useRelated(item.id, true)
  const chapters = useMemo(() => orderedChapters(links.chapters), [links.chapters])

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
   * is also the safe direction — it means the video does not start, and a video
   * that has not started yet is a poster with a play button on it.
   *
   * There is no autoplay COORDINATOR here, and there does not need to be: this
   * page mounts exactly one player. The rail mounts none — see ./Related.tsx.
   */
  const [active, setActive] = useState(false)
  useEffect(() => {
    setActive(!prefersReducedMotion())
  }, [])

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

  /**
   * Comments are not built on this surface yet, and the control says so.
   *
   * `@momentum/content` ships a `CommentSheet` and apps/social has it wired
   * against the real endpoints, so this is a composition away rather than a
   * missing capability. It is not built here because a comment sheet over a
   * playing long video has its own decisions about pausing and focus, and half
   * of one is worse than an honest note.
   */
  const onComment = useCallback(() => {
    setNotice(`Comments open in the ${BRAND.mobileApp} for now.`)
  }, [])

  const onFollow = useCallback(
    async (next: "follow" | "unfollow") => {
      const settled = await follow.toggle(next)
      if (next === "follow") {
        // One of the thirteen events, and it means exactly what happened here:
        // somebody followed a channel because of a video, from the video.
        analytics.recordEngagement("follow_from_content", item, position)
      }
      return settled
    },
    [analytics, follow, item, position]
  )

  const title = videoTitle(item)
  const expanded = isExpanded(expand.mode)

  /**
   * The subscribe control an end-screen `channel_subscribe` tile draws.
   *
   * The page's real one, passed down rather than rebuilt — an end screen must
   * not get a second, dumber follow button that does not know about the
   * "requested" state a private account produces. Null when the control should
   * not be offered at all (the viewer's own video, or an edge still unknown),
   * and the tile then says so rather than drawing a button that does nothing.
   */
  const subscribeControl = showsFollow(viewerId, item.author_id, follow.state) ? (
    <FollowButton
      key={`end-${item.author_id}:${follow.state ?? "unknown"}`}
      state={follow.state ?? "none"}
      displayName={creatorName(item)}
      onToggle={onFollow}
      labels={SUBSCRIBE_LABELS}
    />
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
              className="absolute inset-0"
              ariaLabel={media.alt_text || title}
              session={watch}
              onWatchEvent={onWatchEvent}
              /* The OS media controls describe what is playing. No
                 onPreviousTrack/onNextTrack: those are wired only where there
                 is a real ordered QUEUE the player owns. A recommendations rail
                 is a list of suggestions, not a queue — nothing here decides
                 what plays next on its own — so a lock-screen "next" button
                 would promise an order this page does not have. */
              mediaSession={metadataForPost(item, media)}
              resolveUrl={resolveUrl}
            />
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

          {/* "Full video" — the founder's control.

              Bottom-RIGHT, which is the one corner of a player nothing else
              wants: @momentum/player puts the speaker top-right and the
              play/pause and seek bar bottom-left, and it is also where every
              long-video player on the web puts this.

              Always visible, and NOT revealed on hover like the player's own
              transport. A hover-revealed control is invisible on every touch
              device. When the player is expanded it is also the only way back
              that this page draws, so hiding it would be a trap. */}
          {!missing && media && (
            <button
              type="button"
              onClick={expand.toggle}
              aria-label={expandAriaLabel(expand.mode)}
              className={[
                "absolute bottom-3 right-3 z-30 inline-flex items-center gap-1.5",
                "rounded-mo-pill bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white",
                "transition-colors duration-150 ease-mo hover:bg-black/80",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
              ].join(" ")}
            >
              {expanded ? (
                <Minimize2 aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 aria-hidden className="h-3.5 w-3.5" />
              )}
              {expandLabel(expand.mode)}
            </button>
          )}
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

          <ChannelRow
            item={item}
            viewerId={viewerId}
            followState={follow.state}
            onFollow={onFollow}
          />

          {/* The action row, horizontally, which is what @momentum/interactions'
              ActionBar already IS. apps/reels draws its own vertical rail over
              a 9:16 frame and says why; this page has no such constraint. */}
          <div className="mt-4">
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
              page stops being found. */}
          {item.text?.trim() && <Description text={item.text.trim()} />}

          <Chapters
            chapters={chapters}
            positionMs={playhead.positionMs}
            durationMs={playhead.durationMs}
            onSeek={playhead.seek}
            unavailable={links.unavailable.chapters}
            isPreview={links.isPreview}
          />

          <SeriesNext
            episodes={links.seriesEpisodes}
            postId={item.id}
            seriesTitle={
              links.isPreview ? PREVIEW_SERIES_TITLE : (links.seriesTitle ?? undefined)
            }
            isPreview={links.isPreview}
          />

          <div className="mt-8 border-t border-mo pt-5">
            <BackToTube label="All videos" />
          </div>
        </div>
      </div>

      {/* ── The recommendations rail ───────────────────────────────────────
          A grid item, so in one column it falls under the description and in
          two it sits beside the player — with no duplicate markup and no second
          copy of the list to keep in step. `inert` for the same reason the
          metadata is: it is behind a fixed overlay in theatre mode. */}
      <aside inert={expanded} className="min-w-0">
        <Related
          items={related.items}
          loading={related.loading}
          loadingMore={related.loadingMore}
          error={related.error}
          ended={related.ended}
          onLoadMore={related.loadMore}
          onRetry={related.retry}
          headingId="tube-related"
        />
      </aside>
    </article>
  )
}

/**
 * The description, clamped, with a real button to expand it.
 *
 * `whitespace-pre-wrap` because an author's paragraph breaks are content: a
 * description written as a list of chapters collapses into one run-on
 * paragraph without it.
 *
 * The control is a `<button>` and not a click handler on the paragraph.
 * Clicking text that does not look like a control is undiscoverable, and it is
 * unreachable by keyboard — which on the one part of this page that can be
 * several paragraphs long is not a small thing.
 */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-5 rounded-mo bg-mo-surface p-4">
      <p
        className={`whitespace-pre-wrap text-sm leading-relaxed text-mo-body ${
          open ? "" : "line-clamp-4"
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 text-sm font-semibold text-mo-cyan underline underline-offset-2"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  )
}
