"use client"

/**
 * One reel: the video, the scrim, the author block bottom-left, the rail
 * bottom-right.
 *
 * The layout is `ReelsScreen.kt`'s, and the deviations from it are recorded at
 * the point each one is made rather than in a list somewhere else.
 *
 * ── Everything here sits over VIDEO, which can be white ───────────────────
 * That is the constraint the whole file is designed around, and it is not the
 * usual one: the palette's contrast measurements are all against Momentum's
 * violet-black ground, and none of them apply to a control sitting on a frame
 * of somebody's white kitchen. Two rules follow, and both are load-bearing:
 *
 *   · Every glyph and label on the video is WHITE and sits inside the bottom
 *     scrim, which is what carries the contrast. Android does exactly this and
 *     for exactly this reason: "Plain white glyphs on the bottom scrim — no
 *     discs; the scrim carries the contrast for the whole strip."
 *   · The one control that does NOT get to rely on the scrim is Follow,
 *     because it is a filled target rather than a glyph. It is painted as an
 *     opaque near-white pill with the near-black ink on it — a pair the token
 *     sheet already carries as `--mo-ink` and `--mo-on-primary` — which is
 *     legible over any frame because the frame is not part of it.
 *
 * Nothing here uses the ember gradient, deliberately. Android's Follow pill is
 * ember; on the web `--mo-ember-label-size` is 19px/700 and the token sheet is
 * explicit that a smaller label on that gradient does not pass. A 14px ember
 * Follow pill would be a contrast failure with a comment above it saying so.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bookmark,
  Heart,
  MessageCircle,
  Share2,
  type LucideIcon,
} from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { Avatar, BlurhashCanvas, isValidBlurhash } from "@momentum/content"
import { FollowButton, type FollowState } from "@momentum/interactions"
import {
  MomentumVideo,
  isPlayable,
  pickPoster,
  pickProgressive,
  metadataForPost,
  primaryVideo,
  type WatchEvent,
  type WatchSessionInfo,
} from "@momentum/player"
import { showsFollow, railControls, reelAuthorLabel, type RailKind } from "./rail"
import { resolveUrl } from "./resolveUrl"

export interface ReelHandlers {
  onLike: (item: FeedItem) => void
  onSave: (item: FeedItem) => void
  onShare: (item: FeedItem) => void
  onComment: (item: FeedItem) => void
  onFollow: (authorId: string, next: "follow" | "unfollow") => Promise<FollowState>
}

export interface ReelProps {
  item: FeedItem
  /** 1-based rank, for the accessible position announcement only. */
  position: number
  total: number
  /** The coordinator's verdict. The sole input to whether this plays. */
  active: boolean
  /**
   * Is this the reel the scroller is on?
   *
   * NOT the same question as `active`, and the difference is the point. The
   * coordinator answers "which one may play", and under reduced motion the
   * answer is "none, ever". This answers "which one is the person looking
   * at", which is true whatever their motion preference — so it is what the
   * two things below are keyed on, and neither of them is about playback:
   *
   *   · Everything else on the surface is `inert`. A reels scroller has every
   *     mounted reel in the document at once, so without this a Tab lands on
   *     the Like button of a reel a whole viewport away — twenty-six tab
   *     stops on a surface showing one reel, measured before this existed.
   *     `inert` takes the subtree out of the tab order AND the accessibility
   *     tree, which is what a carousel's off-screen slides should be.
   *   · Only a small window around it mounts a player at all. See `mounted`.
   */
  current: boolean
  /**
   * Mount the player.
   *
   * `beyondViewportPageCount = 1` is the phone's rule and the reasoning
   * transfers exactly: the immediate neighbours are prepared so a swipe shows
   * a first frame instead of a spinner, and nothing further is, because
   * "raising it composes pages the user has not reached and spends their
   * data". On the web that is not a figure of speech — every mounted player
   * attaches hls.js and starts buffering, and a page of twelve was observed
   * with four reels all at `readyState 4` before anybody had swiped once.
   *
   * A reel outside the window still draws its blurhash and its overlay, so
   * scrolling never reveals an empty rectangle.
   */
  mounted: boolean
  viewerId: string | null
  /** Undefined while graph-service has not answered. Never treated as "none". */
  followState: FollowState | undefined
  session: WatchSessionInfo | undefined
  onWatchEvent: (event: WatchEvent) => void
  registerRef: (el: HTMLElement | null) => void
  handlers: ReelHandlers
}

/**
 * The follow pill's three skins.
 *
 * `FollowButton` already varies itself by state — an invitation in cyan, a
 * settled state that recedes — but both of its defaults are TRANSPARENT with
 * a border, which is a card treatment. Over video a hairline and a tinted
 * label disappear into a bright frame, and the one control that grows the
 * viewer's feed must never do that. So each state gets a filled skin instead,
 * and the fill is what carries the contrast rather than the frame behind it.
 *
 * `none` is the invitation and is the loudest thing on the reel: near-white
 * ground, near-black ink, 18:1 either way and identical over a white kitchen
 * or a night sky. Android paints this one ember; on the web the token sheet
 * sets `--mo-ember-label-size` to 19px/700 as the floor for a label on that
 * gradient, and a 14px pill is below it — so ember here would be a documented
 * contrast failure rather than a match.
 *
 * `following` and `requested` are settled states, not invitations, and recede
 * the way the package intends: a dark translucent plate with white type. It
 * is legible over a white frame because the plate is opaque enough to
 * dominate the pixels behind it — the same reasoning, and nearly the same
 * alpha, as Android's `STRIP_PLATE_ALPHA`, which was raised from 0.32 for
 * exactly this reason ("over a yellow frame the disc tinted olive and looked
 * like a rendering artefact rather than a control").
 */
const FOLLOW_SKIN: Record<FollowState, string> = {
  none: "bg-mo-ink text-mo-on-primary hover:bg-white",
  following: "bg-black/55 text-white hover:bg-black/70",
  requested: "bg-black/55 text-white hover:bg-black/70",
}

const RAIL_ICON: Record<RailKind, LucideIcon> = {
  like: Heart,
  comment: MessageCircle,
  share: Share2,
  save: Bookmark,
}

export function Reel({
  item,
  position,
  total,
  active,
  current,
  mounted,
  viewerId,
  followState,
  session,
  onWatchEvent,
  registerRef,
  handlers,
}: ReelProps) {
  const media = useMemo(() => primaryVideo(item), [item])

  /**
   * The video, or null.
   *
   * One value rather than a `media` and a separate `playable` boolean, because
   * two of them is two things the type checker has to be told agree — and it
   * will not believe you, which is how a `media!` ends up in a render path
   * whose whole job is to handle the case where there is no media.
   *
   * `isPlayable` is the package's rule and covers more than "is there a url":
   * a post still processing, a transcode not finished, and a moderation
   * verdict that has not passed are each a reason not to play something.
   */
  const playable = useMemo(
    () => (media && isPlayable(item, media) ? media : null),
    [item, media]
  )

  const source = useMemo(() => {
    if (!playable) return null
    return {
      hlsUrl: playable.playback_url || playable.hls_url,
      progressiveUrl: pickProgressive(playable),
      posterUrl: pickPoster(playable),
      durationMs: playable.duration_ms,
      width: playable.width,
      height: playable.height,
    }
  }, [playable])

  const authorName = item.author?.display_name ?? ""
  const handle = reelAuthorLabel(item.author?.username, authorName)
  const showFollow = showsFollow(viewerId, item.author_id, followState)

  const controls = railControls({
    likes: item.counts?.likes ?? 0,
    comments: item.counts?.comments ?? 0,
    liked: Boolean(item.has_reacted),
    saved: Boolean(item.is_bookmarked),
    noComments: item.no_comments,
    hideShare: item.hide_share,
  })

  const onRail = useCallback(
    (kind: RailKind) => {
      switch (kind) {
        case "like":
          handlers.onLike(item)
          break
        case "comment":
          handlers.onComment(item)
          break
        case "share":
          handlers.onShare(item)
          break
        case "save":
          handlers.onSave(item)
          break
      }
    },
    [handlers, item]
  )

  return (
    <article
      ref={registerRef}
      data-reel-id={item.id}
      // React 19 passes `inert` straight through as the boolean attribute.
      inert={!current}
      // `start` rather than `center`: the reel fills the scroller exactly, so
      // the two are the same distance — but `start` is what a browser lands on
      // after a programmatic `scrollTo`, and disagreeing with it makes a
      // keyboard move settle one pixel off and then re-snap.
      className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-mo-bg"
      aria-label={`Reel ${position} of ${total}${authorName ? ` by ${authorName}` : ""}`}
    >
      {/* The blurhash is what is on screen for the second before the first
          frame decodes. A reel has no poster behind it otherwise — the page is
          BLACK — and that black page is what the "stuck" complaint on the
          phone was loudest about. */}
      {media?.blurhash && isValidBlurhash(media.blurhash) && (
        <BlurhashCanvas hash={media.blurhash} className="absolute inset-0 h-full w-full" />
      )}

      {source && playable && mounted ? (
        <MomentumVideo
          source={source}
          active={active}
          // The DEFAULT for a cold document, and it has to be true: a browser
          // refuses to start an unmuted video unprompted and the refusal
          // arrives as a rejected promise, so an unmuted autoplay is not
          // louder — it is a reel that silently never starts. Once the
          // document has had a gesture the player starts the NEXT reel with
          // sound on its own. See the sound note in ReelsViewer.
          muted
          // A reel loops. It is the one thing about this surface that is not
          // negotiable and the reason `loop_count` exists in the wire
          // contract at all.
          loop
          // Arbitrates hand-started playback between players. A reels
          // scroller mounts several at once — the neighbours are composed so
          // a swipe shows a first frame instead of a spinner — so this is not
          // the single-player case where it may be skipped.
          playbackId={item.id}
          className="absolute inset-0"
          ariaLabel={playable.alt_text || `Reel by ${authorName || "someone"}`}
          session={session}
          onWatchEvent={onWatchEvent}
          // The OS media controls describe the reel that is playing. Claimed
          // only while `active`, by the player, so the lock screen names the
          // one reel the coordinator chose — and `metadataForPost` is the
          // package's own fallback chain rather than a second one written
          // here, so a reel and a feed video describe themselves identically.
          //
          // No `onPreviousTrack`/`onNextTrack`. They are wired only where
          // there is a real ordered queue, and this one is ranked and
          // paginated: the reel after the current one may not have been
          // fetched yet, so a lock-screen "next" would sometimes do nothing.
          mediaSession={metadataForPost(item, playable)}
          resolveUrl={resolveUrl}
        />
      ) : source && playable ? (
        // Playable, but outside the mount window — the blurhash above is the
        // whole of it, which is the same thing the person sees for the beat
        // before a mounted player paints its first frame. Nothing is said
        // about it: this is not a state, it is not-yet.
        null
      ) : (
        <UnplayableReel processing={Boolean(item.is_processing)} />
      )}

      {/* Transparent at 60% of the height, black at 70% by the bottom edge —
          Android's `BottomScrim`, same numbers. It goes on the PAGE and not on
          the text so it also covers the padding: a caption whose descenders
          fall outside the dark area is exactly as unreadable as one with no
          scrim at all. `pointer-events-none` so it never eats a click meant
          for the picture underneath. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-b from-transparent to-black/70"
      />

      {/* The author block, bottom-left. Android reserves 72dp of clearance on
          its right so a long name never runs under the rail; `pr-20` is the
          same idea in the web's units. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pr-3">
        <div className="flex min-w-0 flex-col gap-3 pb-2 pr-4">
          <div className="flex items-center gap-3">
            {/* No progress ring around the avatar, unlike Android.
                The web player draws a real scrubber in its own transport —
                one that can be dragged and reached by keyboard — and two
                different pictures of the same playhead on one frame is worse
                than either alone. The ring is the phone's answer to having no
                transport at all. */}
            <Avatar name={authorName} id={item.author_id} size="md" />
            <span className="truncate text-[15px] font-semibold text-white drop-shadow">
              {handle}
            </span>
            {showFollow && (
              <FollowButton
                // Remounts whenever the edge changes, and it has to.
                //
                // `FollowButton` seeds its state from the prop with
                // `useState` and never re-reads it — correct for a card that
                // is the only place an author appears, wrong here. The same
                // author's reels are usually consecutive, so following from
                // reel 3 has to reach the buttons already mounted on reels 2
                // and 4; without the key they would go on saying "Follow"
                // for somebody the viewer now follows.
                //
                // The cost is that a REJECTED toggle unmounts the button
                // before it can draw its own "Try again". That failure is
                // reported by the surface instead — see `onFollow` in
                // ReelsViewer — which is a better place for it on a
                // full-screen video anyway.
                key={`${item.author_id}:${followState ?? "unknown"}`}
                state={followState ?? "none"}
                displayName={authorName || undefined}
                onToggle={(next) => handlers.onFollow(item.author_id, next)}
                className={`shrink-0 border-transparent px-4 ${FOLLOW_SKIN[followState ?? "none"]}`}
              />
            )}
          </div>
          {item.text?.trim() && <Caption text={item.text.trim()} />}
        </div>

        <ReelRail controls={controls} item={item} onAction={onRail} />
      </div>
    </article>
  )
}

/**
 * The caption, clamped to two lines with a "more" that expands it.
 *
 * Android clamps to `CAPTION_LINES` and shows "more" only when the text
 * actually overflowed. `line-clamp` gives us the clamp for free but not the
 * "did it overflow" question, so that is measured: the toggle is rendered only
 * when the clamped element is shorter than its own content.
 */
function Caption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowed, setOverflowed] = useState(false)
  const ref = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    setOverflowed(el.scrollHeight > el.clientHeight + 1)
  }, [text, expanded])

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        ref={ref}
        className={`max-w-prose whitespace-pre-wrap text-sm text-white drop-shadow ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {text}
      </p>
      {(overflowed || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-mo-sm text-xs font-semibold text-white/70 hover:text-white"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  )
}

/**
 * The vertical control strip on the right edge.
 *
 * ── Why this is drawn here and not with @momentum/interactions' ActionBar ──
 * The state machine is reused — `useOptimisticToggle` is what backs the like
 * and save handlers this receives — but the ActionBar's LAYOUT is a horizontal
 * row of `text-mo-body` pills built to sit under a card on the violet ground.
 * Over video it is the wrong geometry and the wrong contrast: mobile's rail is
 * vertical, on the right edge, white glyphs with the count underneath, because
 * that is where a thumb rests. Putting controls under the caption means
 * reaching across the reel to use them.
 *
 * What is NOT here: mute, which the player's own transport owns on the web
 * (see ReelsViewer), and More, which has nothing to open yet.
 */
function ReelRail({
  controls,
  item,
  onAction,
}: {
  controls: ReturnType<typeof railControls>
  item: FeedItem
  onAction: (kind: RailKind) => void
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-5 pb-2">
      {controls.map((control) => {
        const Icon = RAIL_ICON[control.kind]
        const on =
          (control.kind === "like" && item.has_reacted) ||
          (control.kind === "save" && item.is_bookmarked)
        const verb =
          control.kind === "like"
            ? item.has_reacted
              ? "Liked"
              : "Like"
            : control.kind === "save"
              ? item.is_bookmarked
                ? "Saved"
                : "Save"
              : control.kind === "comment"
                ? "Comments"
                : "Share"
        return (
          <button
            key={control.kind}
            type="button"
            onClick={() => onAction(control.kind)}
            // The label under the glyph is what the control says about itself;
            // the accessible name folds the two into one phrase, exactly as
            // Android's `RailButton` does.
            aria-label={control.label === verb ? verb : `${verb}, ${control.label}`}
            aria-pressed={control.kind === "like" || control.kind === "save" ? on : undefined}
            className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-mo text-white transition-transform duration-150 ease-mo active:scale-90"
          >
            <Icon
              aria-hidden
              className={`h-7 w-7 drop-shadow ${on ? "fill-current" : ""} ${
                control.kind === "like" && on ? "text-mo-bad" : ""
              }`}
            />
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {control.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * A reel with no playable rendition.
 *
 * An asset still transcoding has no `hls_url`, so this is an expected state
 * rather than a failure, and it says which of the two it is. Android draws the
 * same thing with the same words.
 */
function UnplayableReel({ processing }: { processing: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="font-mo-display text-lg font-semibold text-mo-ink">
        {processing ? "Still processing" : "This reel can’t be played"}
      </p>
      <p className="text-sm text-mo-body">
        {processing
          ? "This video isn’t ready to play yet."
          : "Its video is missing or was not cleared for playback."}
      </p>
    </div>
  )
}
