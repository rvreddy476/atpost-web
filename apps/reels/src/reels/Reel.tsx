"use client"

/**
 * One short: the video, its transport, the scrim, the author block
 * bottom-left, the rail bottom-right.
 *
 * ── Everything here sits over VIDEO, which can be white ───────────────────
 * That is the constraint the whole file is designed around, and it is not the
 * usual one: the palette's contrast measurements are all against Momentum's
 * violet-black ground, and none of them apply to a control sitting on a frame
 * of somebody's white kitchen. Two rules follow, and both are load-bearing:
 *
 *   · Every glyph and label on the video is WHITE and sits inside the bottom
 *     scrim, which is what carries the contrast — or, where there is no scrim
 *     (the speaker at the top, the "…" sheet), on an opaque plate.
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
 *
 * ── The player draws no controls, and this file draws them instead ────────
 * `controls={false}`. `@momentum/player`'s own note invites it — "A surface
 * with its own chrome — a full-bleed reels viewer that draws its own scrubber
 * — turns this off and keeps everything else" — and three requirements force
 * it: an always-visible playhead (the player's fades after 3s, which on a
 * seven-second loop means absent for most of it), an always-visible speaker,
 * and a double-press of the picture meaning LIKE, which it cannot while the
 * player is reading the first press as pause and the second as play.
 * ./useReelTransport.ts is the seam and carries the argument for why driving
 * the element directly is safe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Music,
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
import { LikeBurst, MuteButton, PausedMark, PlayPauseButton, ProgressBar } from "./ReelTransport"
import { doubleTapOutcome, isDoubleTap } from "./transport"
import { useReelTransport } from "./useReelTransport"

export interface ReelHandlers {
  onLike: (item: FeedItem) => void
  onSave: (item: FeedItem) => void
  onShare: (item: FeedItem) => void
  onComment: (item: FeedItem) => void
  onMenu: (item: FeedItem) => void
  onFollow: (authorId: string, next: "follow" | "unfollow") => Promise<FollowState>
  /** A one-line, politely announced state change. See ./transport.ts. */
  onAnnounce: (message: string) => void
}

export interface ReelProps {
  item: FeedItem
  /** 1-based rank, for the accessible position announcement only. */
  position: number
  total: number
  /** The coordinator's verdict. The sole input to whether this plays. */
  active: boolean
  /**
   * Is this the short the scroller is on?
   *
   * NOT the same question as `active`, and the difference is the point. The
   * coordinator answers "which one may play", and under reduced motion the
   * answer is "none, ever". This answers "which one is the person looking
   * at", which is true whatever their motion preference — so it is what the
   * two things below are keyed on, and neither of them is about playback:
   *
   *   · Everything else on the surface is `inert`. A shorts scroller has every
   *     mounted short in the document at once, so without this a Tab lands on
   *     the Like button of one a whole viewport away — twenty-six tab stops on
   *     a surface showing one video, measured before this existed. `inert`
   *     takes the subtree out of the tab order AND the accessibility tree,
   *     which is what a carousel's off-screen slides should be.
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
   * with four shorts all at `readyState 4` before anybody had swiped once.
   *
   * A short outside the window still draws its blurhash and its overlay, so
   * scrolling never reveals an empty rectangle.
   */
  mounted: boolean
  viewerId: string | null
  /** Undefined while graph-service has not answered. Never treated as "none". */
  followState: FollowState | undefined
  session: WatchSessionInfo | undefined
  /** The viewer's one sound answer for the whole surface. */
  muted: boolean
  onToggleMuted: () => void
  /** No autoplay coordinator, and no heart animation. */
  reducedMotion: boolean
  /** The track this short was made with, once `/v1/audio/{id}` has answered. */
  audioName: string | null
  onWatchEvent: (event: WatchEvent) => void
  registerRef: (el: HTMLElement | null) => void
  /**
   * Report the `<video>` upwards, so the surface's Space key has something to
   * press.
   *
   * The viewer used to find it with `scroller.querySelector('[data-reel-id=…]
   * video')` — the same DOM hunt `videoRef` exists to retire, one level up.
   * Now that the player hands the element over, the short that HAS it is the
   * thing that should be passing it on.
   */
  onVideoElement: (el: HTMLVideoElement | null) => void
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
 * `none` is the invitation and is the loudest thing on the short: near-white
 * ground, near-black ink, 18:1 either way and identical over a white kitchen
 * or a night sky. `following` and `requested` are settled states, not
 * invitations, and recede the way the package intends: a dark translucent
 * plate with white type, opaque enough to dominate the pixels behind it.
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
  more: MoreHorizontal,
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
  muted,
  onToggleMuted,
  reducedMotion,
  audioName,
  onWatchEvent,
  registerRef,
  onVideoElement,
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

  const hasPlayer = Boolean(source && playable && mounted)
  const transport = useReelTransport()

  /**
   * Pass the element up, and null it on the way out.
   *
   * The cleanup is the half that matters: a short leaving the mount window
   * unmounts its player, and a registry still holding that element would let
   * the Space key press `play()` on a `<video>` that is no longer in the
   * document — no error, no sound, nothing on screen.
   */
  useEffect(() => {
    onVideoElement(transport.video)
    return () => onVideoElement(null)
  }, [onVideoElement, transport.video])

  /* ── The picture's two gestures ───────────────────────────────────────── */

  const lastTap = useRef<number | null>(null)
  const [burst, setBurst] = useState(false)

  useEffect(() => {
    if (!burst) return
    const id = window.setTimeout(() => setBurst(false), 700)
    return () => window.clearTimeout(id)
  }, [burst])

  /**
   * One press pauses, two like.
   *
   * ── Why the pause is DEFERRED and the like is not ─────────────────────
   * A double-tap is two presses, so the first one has already arrived by the
   * time the second is known. Acting on it immediately means every like is
   * preceded by a pause and followed by a play — the video visibly stutters
   * under the gesture that was meant to celebrate it. So the single-press
   * outcome waits out the double-tap window and is cancelled if a second press
   * lands, which costs one-third of a second on a pause and is the trade every
   * product with this pair makes.
   *
   * The like is immediate, because there is nothing it could be the first half
   * of.
   */
  const pendingTap = useRef<number | null>(null)
  const onPicture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // A drag on the progress bar, or a press that began on a control, is not
      // a press on the picture.
      if (event.target !== event.currentTarget) return
      const now = event.timeStamp || Date.now()

      if (isDoubleTap(lastTap.current, now)) {
        lastTap.current = null
        if (pendingTap.current !== null) {
          window.clearTimeout(pendingTap.current)
          pendingTap.current = null
        }
        if (doubleTapOutcome(Boolean(item.has_reacted)) === "like") {
          handlers.onLike(item)
          // No burst under reduced motion: the mark is entirely animation and
          // carries nothing the rail's heart does not. The announcement in the
          // live region is what survives.
          if (!reducedMotion) setBurst(true)
        }
        return
      }

      lastTap.current = now
      pendingTap.current = window.setTimeout(() => {
        pendingTap.current = null
        const next = transport.togglePlay()
        handlers.onAnnounce(next === "paused" ? "Paused" : "Playing")
      }, 300)
    },
    [handlers, item, reducedMotion, transport]
  )

  useEffect(
    () => () => {
      if (pendingTap.current !== null) window.clearTimeout(pendingTap.current)
    },
    []
  )

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
        case "more":
          handlers.onMenu(item)
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
      // `start` rather than `center`: the short fills the scroller exactly, so
      // the two are the same distance — but `start` is what a browser lands on
      // after a programmatic `scrollTo`, and disagreeing with it makes a
      // keyboard move settle one pixel off and then re-snap.
      className="relative flex h-full w-full shrink-0 snap-start snap-always justify-center overflow-hidden bg-mo-bg"
      aria-label={`Short ${position} of ${total}${authorName ? ` by ${authorName}` : ""}`}
    >
      {/* ── The stage, and why it is not the whole window ───────────────────
          A 9:16 short shown on a 1280px desktop occupies a column about 480px
          wide in the middle of the screen; everything else is empty. The
          overlays are positioned against THIS box rather than against the
          article, so the author, the caption, the rail, the mute and the
          scrubber stay on the video the way they do on a phone. Anchored to
          the article they drifted to the window's own edges — the like button
          800px away from the short it likes — which is the single thing that
          made this surface look like a prototype on a laptop.

          `56.25vh` is 9/16 of the viewport height: the exact width the letter-
          boxed video fills, so the controls sit ON the picture and never
          beside it. `min()` keeps it the full width on a phone, where the
          short is already edge to edge. */}
      <div
        className="relative h-full w-full"
        style={{ maxWidth: "min(100%, 56.25vh)" }}
      >
      {/* The blurhash is what is on screen for the second before the first
          frame decodes. A short has no poster behind it otherwise — the page
          is BLACK — and that black page is what the "stuck" complaint on the
          phone was loudest about. */}
      {media?.blurhash && isValidBlurhash(media.blurhash) && (
        <BlurhashCanvas hash={media.blurhash} className="absolute inset-0 h-full w-full" />
      )}

      {hasPlayer && source && playable ? (
        <>
          <MomentumVideo
            source={source}
            active={active}
            // CONTROLLED, not a cold default any more. On the first render it
            // is the default — and it is `true` there because a browser refuses
            // to start an unmuted video unprompted, and the refusal arrives as
            // a rejected promise, so an unmuted autoplay is not louder, it is a
            // short that silently never starts. Every CHANGE after that is the
            // viewer pressing this surface's speaker, and the package treats it
            // as this player's own answer: it outranks the document-wide
            // arming, and a browser refusal still outranks it. See
            // `resolveMuted` in @momentum/player.
            muted={muted}
            // The real element, merged into the player's own ref. This replaced
            // a `querySelector("video")` into the player's subtree; see
            // ./useReelTransport.ts.
            videoRef={transport.attach}
            // The playhead, throttled to 1s and let through immediately on a
            // seek or a loop. Milliseconds, and 0 rather than NaN before a
            // duration is known.
            onTimeUpdate={transport.onTimeUpdate}
            // A short loops. It is the one thing about this surface that is not
            // negotiable and the reason `loop_count` exists in the wire
            // contract at all.
            loop
            // No transport of its own. This zone draws the playhead, the
            // speaker and the paused mark, and claims the keyboard — see the
            // header and ./keys.ts.
            controls={false}
            // Arbitrates hand-started playback between players. A shorts
            // scroller mounts several at once — the neighbours are composed so
            // a swipe shows a first frame instead of a spinner — so this is not
            // the single-player case where it may be skipped.
            playbackId={item.id}
            className="absolute inset-0"
            ariaLabel={playable.alt_text || `Short by ${authorName || "someone"}`}
            session={session}
            onWatchEvent={onWatchEvent}
            // The OS media controls describe the short that is playing. Claimed
            // only while `active`, by the player, so the lock screen names the
            // one the coordinator chose — and `metadataForPost` is the
            // package's own fallback chain rather than a second one written
            // here, so a short and a feed video describe themselves identically.
            //
            // No `onPreviousTrack`/`onNextTrack`. They are wired only where
            // there is a real ordered queue, and this one is ranked and
            // paginated: the short after the current one may not have been
            // fetched yet, so a lock-screen "next" would sometimes do nothing.
            mediaSession={metadataForPost(item, playable)}
            resolveUrl={resolveUrl}
          />
        </>
      ) : source && playable ? (
        // Playable, but outside the mount window — the blurhash above is the
        // whole of it, which is the same thing the person sees for the beat
        // before a mounted player paints its first frame. Nothing is said
        // about it: this is not a state, it is not-yet.
        null
      ) : (
        <UnplayableReel processing={Boolean(item.is_processing)} />
      )}

      {/* The picture's own gesture surface. A transparent sibling rather than a
          handler on the <video>, because the element belongs to the player and
          `controls={false}` deliberately leaves it with no click behaviour at
          all. `event.target !== currentTarget` in the handler is what keeps a
          press that began on a control from counting as a press on the
          picture. */}
      {hasPlayer && (
        <div
          onPointerUp={onPicture}
          className="absolute inset-0 z-[5]"
          // Decoration in the accessibility tree: PlayPauseButton below is the
          // real control and the one a keyboard or a screen reader reaches.
          aria-hidden
        />
      )}

      {hasPlayer && (
        <>
          {/* `started || reducedMotion`, not `paused` alone. An element that
              has not begun yet is also paused, so the bare flag would flash a
              play glyph over the centre of every short on every swipe. The
              reduced-motion case is the exception and needs it most: nothing
              ever autostarts there, so the centre mark is the only thing
              saying the still is a video waiting to be played. */}
          <PausedMark paused={transport.paused && (transport.started || reducedMotion)} />
          <LikeBurst shown={burst} />
          <MuteButton muted={muted} onToggle={onToggleMuted} />
          <PlayPauseButton paused={transport.paused} onToggle={() => {
            const next = transport.togglePlay()
            handlers.onAnnounce(next === "paused" ? "Paused" : "Playing")
          }} />
          <ProgressBar
            currentSeconds={transport.currentSeconds}
            durationSeconds={transport.durationSeconds}
            onSeek={transport.seek}
            label={`the short by ${authorName || "someone"}`}
          />
        </>
      )}

      {/* Transparent at 60% of the height, black at 70% by the bottom edge —
          Android's `BottomScrim`, same numbers. It goes on the PAGE and not on
          the text so it also covers the padding: a caption whose descenders
          fall outside the dark area is exactly as unreadable as one with no
          scrim at all. `pointer-events-none` so it never eats a click meant
          for the picture underneath. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[60%] bg-gradient-to-b from-transparent to-black/70"
      />

      {/* The author block, bottom-left. Android reserves 72dp of clearance on
          its right so a long name never runs under the rail; the padding here
          is the same idea in the web's units. `pl-16` clears the play button
          in the corner. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-4 pb-6 pl-16 pr-3">
        <div className="flex min-w-0 flex-col gap-3 pb-2 pr-4">
          <div className="flex items-center gap-3">
            {/* No progress ring around the avatar, unlike Android. The playhead
                is a real scrubber at the foot of the picture — one that can be
                dragged and reached by keyboard — and two different pictures of
                the same playhead on one frame is worse than either alone. */}
            <Avatar name={authorName} id={item.author_id} size="md" />
            <span className="truncate text-[15px] font-semibold text-white drop-shadow">
              {handle}
            </span>
            {showFollow && (
              <FollowButton
                // Remounts whenever the edge changes, and it has to.
                //
                // `FollowButton` seeds its state from the prop with `useState`
                // and never re-reads it — correct for a card that is the only
                // place an author appears, wrong here. The same author's
                // shorts are usually consecutive, so following from short 3 has
                // to reach the buttons already mounted on 2 and 4; without the
                // key they would go on saying "Follow" for somebody the viewer
                // now follows.
                //
                // The cost is that a REJECTED toggle unmounts the button before
                // it can draw its own "Try again". That failure is reported by
                // the surface instead — see `onFollow` in ReelsViewer.
                key={`${item.author_id}:${followState ?? "unknown"}`}
                state={followState ?? "none"}
                displayName={authorName || undefined}
                onToggle={(next) => handlers.onFollow(item.author_id, next)}
                className={`min-h-11 shrink-0 border-transparent px-4 ${FOLLOW_SKIN[followState ?? "none"]}`}
              />
            )}
          </div>
          {item.text?.trim() && <Caption text={item.text.trim()} />}
          {audioName && <AudioLine name={audioName} />}
        </div>

        <ReelRail controls={controls} item={item} onAction={onRail} />
      </div>
      </div>
    </article>
  )
}

/**
 * The track this short was made with.
 *
 * ── A line, and not a link ────────────────────────────────────────────────
 * Every product in this shape links the track name to "more shorts using this
 * sound", and there is no route on this gateway that answers that question:
 * `GET /v1/audio/{id}` describes a track and `/v1/audio/trending` and
 * `/v1/audio/search` are lists of tracks, not of shorts. A link that went to a
 * page we would have to invent is the "glyph that does nothing" failure with a
 * URL attached, so the name is shown and nothing is promised. When a
 * shorts-by-audio route exists this is one anchor's worth of change.
 *
 * It sits under the caption rather than beside the handle so a long title
 * wraps into the caption's column instead of pushing the Follow pill off the
 * edge.
 */
function AudioLine({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-white/90 drop-shadow">
      <Music aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        <span className="sr-only">Sound: </span>
        {name}
      </span>
    </p>
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
          aria-expanded={expanded}
          className="inline-flex min-h-11 items-center self-start rounded-mo-sm pr-2 text-xs font-semibold text-white/70 hover:text-white"
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
 * reaching across the short to use them.
 *
 * What is NOT here: mute, which is a transport control and belongs with the
 * playhead, and any kind of dislike, which has no endpoint.
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
                : control.kind === "share"
                  ? "Share"
                  : "More"
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
            aria-haspopup={control.kind === "more" ? "menu" : undefined}
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
 * A short with no playable rendition.
 *
 * An asset still transcoding has no `hls_url`, so this is an expected state
 * rather than a failure, and it says which of the two it is. Android draws the
 * same thing with the same words.
 */
function UnplayableReel({ processing }: { processing: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="font-mo-display text-lg font-semibold text-mo-ink">
        {processing ? "Still processing" : "This short can’t be played"}
      </p>
      <p className="text-sm text-mo-body">
        {processing
          ? "This video isn’t ready to play yet."
          : "Its video is missing or was not cleared for playback."}
      </p>
    </div>
  )
}
