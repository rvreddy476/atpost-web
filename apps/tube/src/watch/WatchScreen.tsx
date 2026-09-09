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
 * reading, a channel worth following, a description that may be paragraphs,
 * and a comment count that means something. All of that needs a page — so this
 * one wears the ordinary frame, in the ordinary 600px centre track, like every
 * other surface in the product.
 *
 * The expansion is a control ON that page rather than another route. The full
 * argument, including what a route would have cost the creator's analytics, is
 * at the head of ./expand.ts and it is worth reading before moving this.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE VIDEO IS FETCHED FROM THE FEED AND NOT FROM `GET /v1/posts/{id}`
 *
 * Because the post endpoint answers a thinner row than this page can render —
 * no variants, no blurhash, no dimensions and no author at all. The comparison
 * was made against the live gateway and is written out in
 * ../tube/useTubeFeed.ts. Do not "optimise" this into a single post fetch
 * without reading it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ORDER OF THE PAGE
 *
 * Player, title, meta, channel row, action row, description. That is the
 * Android watch screen's own order (`watchDetails` in
 * feature/tube/ui/watch/WatchDetails.kt) and it is transcribed rather than
 * redesigned, so somebody who uses both clients is not learning two layouts
 * for one screen.
 */

import { useCallback, useEffect, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import { BRAND } from "@momentum/brand"
import { Avatar, absoluteTime, relativeTime } from "@momentum/content"
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
  creatorHandle,
  creatorName,
  noPictureReason,
  showsFollow,
  videoTitle,
  viewsLabel,
} from "@/tube/video"
import { expandAriaLabel, expandLabel, frameClass, isExpanded } from "./expand"
import { useExpand } from "./useExpand"
import {
  NoPicture,
  BackToTube,
  WatchError,
  WatchMissing,
  WatchSignedOut,
  WatchSkeleton,
} from "./states"

export function WatchScreen({ postId }: { postId: string }) {
  const session = useSession()
  // Not `session.signedIn`: that is false while the status is still "unknown",
  // and a page that waited for certainty before its first fetch would add a
  // round trip to every visit.
  const feed = useTubeFeed(postId, !session.signedOut)
  const item = feed.item

  if (session.signedOut) return <WatchSignedOut />
  if (feed.loading && !item) return <WatchSkeleton />
  if (feed.error && !item) return <WatchError message={feed.error} onRetry={feed.retry} />
  if (feed.deepLinkMissing) return <WatchMissing />
  // Still walking pages for it. The skeleton, not an apology — see the header
  // of ../tube/useTubeFeed.ts for why the walk is bounded rather than instant.
  if (!item) return <WatchSkeleton />

  // Keyed on the post so that navigating from one video to another gets a
  // fresh player, a fresh watch session and a fresh follow lookup rather than
  // a component quietly reusing the previous video's state.
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
  const analytics = useTubeAnalytics()
  const expand = useExpand()
  const follow = useFollowState(viewerId, item.author_id)

  const media = primaryVideo(item)
  const missing = noPictureReason(item)

  /**
   * Autoplay, unless the person asked their operating system for less motion.
   *
   * Read once, on mount, rather than during render: `prefersReducedMotion()`
   * touches `window.matchMedia` and would make this component render
   * differently on the server than in the browser. `false` on the first paint
   * is also the safe direction — it means the video does not start, and a
   * video that has not started yet is a poster with a play button on it.
   *
   * There is no autoplay COORDINATOR here, and there does not need to be: this
   * page mounts exactly one player, so the one-video-at-a-time rule has
   * nothing to arbitrate. That is also why `playbackId` is omitted — see the
   * note on it in @momentum/player's MomentumVideoProps.
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
   * patch, which is what keeps the counts under the video honest for as long
   * as this page is open, and the engagement event.
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
      if (result.on) analytics.recordEngagement("like", item, position)
      // `next` is what was asked for; `result.on` is what happened. The bar is
      // told the second.
      void next
      return { on: result.on, count: result.count }
    },
    [analytics, item, patch, position]
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
   * of one is worse than an honest note. The control is not hidden: a video's
   * comment count is real and worth seeing, and the author's `no_comments`
   * switch already removes it where it should not be offered.
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
  const handle = creatorHandle(item)
  const expanded = isExpanded(expand.mode)

  return (
    <article>
      {/* The player's box. `expand.ref` goes HERE and not on the <video>: the
          transport, the speaker and the expand control are all absolutely
          placed inside this element, and fullscreening the bare video element
          would take the picture full screen and leave every control behind in
          the page. */}
      <div ref={expand.ref} className={frameClass(expand.mode)}>
        {missing || !media ? (
          <NoPicture reason={missing ?? "missing"} />
        ) : (
          <MomentumVideo
            source={{
              // `playback_url` first, `hls_url` as the fallback: they are the
              // same string today, but playback_url is the one that also
              // carries `playback_kind: "original"` — a progressive MP4 served
              // while the transcode is still running.
              hlsUrl: media.playback_url || media.hls_url,
              progressiveUrl: pickProgressive(media),
              durationMs: media.duration_ms,
              width: media.width,
              height: media.height,
            }}
            active={active}
            /**
             * Sound ON by default, which is the opposite of the feed and of
             * reels, and is correct here.
             *
             * A feed video is something you scrolled past; a long video is
             * something you navigated to and pressed. `muted={false}` does not
             * mean "force sound" — the browser still refuses an unmuted
             * unprompted start, and MomentumVideo handles that refusal by
             * falling back to muted and PLAYING ANYWAY rather than leaving a
             * dead frame. So on a cold document the first video is silent with
             * an honest speaker glyph, and from the second onward it has
             * sound. Read the header of soundPreference.ts before changing it.
             */
            muted={false}
            className="absolute inset-0"
            ariaLabel={media.alt_text || title}
            session={watch}
            onWatchEvent={onWatchEvent}
            /* The OS media controls describe what is playing. No
               onPreviousTrack/onNextTrack: those are wired only where there is
               a real ordered queue, and this page has one video. */
            mediaSession={metadataForPost(item, media)}
            resolveUrl={resolveUrl}
          />
        )}

        {/* "Full video" — the founder's control.

            Bottom-RIGHT, which is the one corner of a player nothing else
            wants: @momentum/player puts the speaker top-right and the
            play/pause and seek bar bottom-left, and it is also where every
            long-video player on the web puts this. Somebody reaching for it
            does not have to learn where it is.

            Always visible, and NOT revealed on hover like the player's own
            transport. A hover-revealed control is invisible on every touch
            device, and this is the page's second action — the same reasoning
            that keeps the Expand pill permanent on a reels tile. When the
            player is expanded it is also the only way back that this page
            draws, so hiding it would be a trap. */}
        {!missing && media && (
          <button
            type="button"
            onClick={expand.toggle}
            aria-label={expandAriaLabel(expand.mode)}
            className={[
              "absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5",
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
          {/* The server's own sentence about why this is in the feed —
              "From someone you follow". Never composed here: `reason_text` is
              written by feed-service precisely so two clients cannot invent
              two different explanations of one ranking decision. */}
          {item.reason_text && (
            <>
              <span aria-hidden>·</span>
              <span>{item.reason_text}</span>
            </>
          )}
        </p>

        {/* The channel row. `channel.name` and not `author.display_name` —
            a long video is published BY A CHANNEL (post-service answers 403
            CHANNEL_REQUIRED without one), so the channel is who made this.
            ../tube/video.ts has the fallback chain and its tests.

            The avatar is initials. `channel.avatar_url` is null on every row
            the dev stack returns, and `author.avatar_media_id` is an id rather
            than a URL with no signed way to resolve it — @momentum/content's
            Avatar carries that whole argument, and takes a `src` the day the
            API can produce one. */}
        <div className="mt-5 flex items-center gap-3 border-t border-mo pt-5">
          <Avatar
            name={creatorName(item)}
            id={item.channel?.user_id ?? item.author_id}
            src={item.channel?.avatar_url ?? undefined}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-mo-ink">{creatorName(item)}</p>
            {handle && <p className="truncate text-sm text-mo-body">{handle}</p>}
          </div>
          {showsFollow(viewerId, item.author_id, follow.state) && (
            <FollowButton
              // Remounted when the edge changes, because FollowButton seeds
              // its state from the prop with `useState` and never re-reads it.
              // Without the key it would keep saying "Follow" after the real
              // edge arrived from the batch lookup.
              key={`${item.author_id}:${follow.state ?? "unknown"}`}
              state={follow.state ?? "none"}
              displayName={creatorName(item)}
              onToggle={onFollow}
              className="shrink-0"
            />
          )}
        </div>

        {/* The action row, horizontally, which is what @momentum/interactions'
            ActionBar already IS. apps/reels draws its own vertical rail over a
            9:16 frame and says why; this page has no such constraint, so it
            uses the shared component rather than a fourth like button. */}
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

        {notice && (
          <p role="status" className="mt-3 text-sm text-mo-body">
            {notice}
          </p>
        )}

        {/* The description. Collapsed to four lines with a control to open it —
            a long video's description is genuinely long, and pushing the
            comment count and everything under it off the page by default is
            how the rest of the page stops being found. */}
        {item.text?.trim() && <Description text={item.text.trim()} />}

        <div className="mt-8 border-t border-mo pt-5">
          <BackToTube label="All videos" />
        </div>
      </div>
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
