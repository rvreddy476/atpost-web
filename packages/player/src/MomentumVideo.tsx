"use client"

/**
 * The video element, and everything about getting bytes into it.
 *
 * ── The rule this package exists to enforce ───────────────────────────────
 * There is no API client in here and no URL is constructed. A caller passes a
 * source it has already resolved, and gets events back. That is what lets tube
 * mount the same player against different analytics, and it is the only reason
 * any of this can be tested — a player that fetched its own feed would need a
 * gateway to render a rectangle.
 *
 * ── HLS ───────────────────────────────────────────────────────────────────
 * hls.js where Media Source Extensions exist, the browser's own HLS where they
 * do not (iOS Safari), and a progressive MP4 if neither works. That order is
 * deliberate and is the opposite of the intuitive one — see the long note at
 * the attach site for the Chrome behaviour that makes "prefer native" wrong.
 *
 * hls.js is imported DYNAMICALLY: it is ~500KB, the feed's first paint is
 * mostly text posts, and a browser that never scrolls to a video should never
 * pay for it. The import happens on the first attach, not on module load.
 *
 * ── Credentials, and why not on everything ────────────────────────────────
 * The playlists are same-origin gateway paths and need the session cookie —
 * the manifest 404s without it. The SEGMENTS inside the child playlist are
 * absolute, pre-signed URLs on the media host, and sending credentials to
 * those would fail CORS outright: a cross-origin credentialed request cannot
 * be answered with `Access-Control-Allow-Origin: *`, which is what an object
 * store returns. So `withCredentials` is set per request, by origin, and never
 * blanket-on. Getting this backwards produces a video that loads its manifest
 * and then stalls forever with a CORS error nobody reads.
 *
 * ── Autoplay is a promise, not an exception ───────────────────────────────
 * `video.play()` returns a promise that REJECTS when the browser refuses. It
 * does not throw, so a bare `video.play()` produces an unhandled rejection in
 * the console and no video, with nothing pointing at the cause. Every call
 * here is caught, and the first autoplay of a session starts muted, because
 * muted is the only state a browser will start unprompted.
 *
 * A refused UNMUTED start is not swallowed: it falls back to muted and plays
 * anyway, because a silent video is a disappointment and a dead frame is a bug
 * report. See the rejection handler in the play effect.
 *
 * ── Sound, and the reason it arrives on the second video ──────────────────
 * The product wants sound. Browsers will not give it before the document has
 * been touched, so the rule is: start muted, and once a real gesture has
 * happened, every playback that STARTS from then on starts with sound — which
 * in practice means from the second video onward, the same as Instagram and
 * TikTok on the web.
 *
 * The bit lives in `soundPreference.ts` and is read here imperatively, at a
 * play start and nowhere else. That is deliberate and is the whole safety
 * argument: a video already playing when somebody clicks a like button cannot
 * hear about it, so a click in the header can never make a card three
 * positions down start blaring. Read that file's header before touching any
 * of this.
 *
 * ── Controls: the three conditions, and where mute now lives ──────────────
 * This element used to have no transport at all. A click toggled mute, there
 * was no way to stop a video, and the mute state belonged to the whole feed —
 * one button in the feed header that silenced twenty players at once, which
 * is not what a person means when they turn the sound off on a video.
 *
 * Both are fixed here rather than in the zone, and deliberately so: sound and
 * playback are properties of A PLAYER, so they live with the player and every
 * surface that mounts one — feed, carousel page, tube — gets them for free.
 *
 *   · MUTE is per player. `muted` is now the DEFAULT (still true for a cold
 *     document, because a browser refuses an unmuted autoplay), and the first
 *     time a person touches this player's speaker it stops listening to every
 *     default there is. What IS shared is only the default: a press of a
 *     speaker, or the document's first gesture, changes what the next
 *     untouched video starts as. It never reaches into a player that has been
 *     given an answer, and it never changes a video that is already running.
 *   · PLAY/PAUSE is user intent, and it is a THIRD condition on top of
 *     `active`. `controls.ts` is where the three meet; read `shouldPlay` and
 *     `intentOnActiveChange` there before changing anything in this file,
 *     because the one-video-at-a-time invariant is split across them and
 *     `manualPlayback.ts`.
 *
 * ── The shape of the transport, and the button that is NOT here ───────────
 * A real player's shape, which is VLC's and QuickTime's and YouTube's:
 *
 *     ┌──────────────────────────────────────── [speaker] ─┐
 *     │                                                     │
 *     │                     the picture                     │
 *     │                                                     │
 *     │  ────────────────●──────────────────────────────    │  seek
 *     │  ▶  0:12 / 1:04                                     │  transport
 *     └─────────────────────────────────────────────────────┘
 *
 * SPEAKER top-right, on its own, in the one corner nothing else wants. It is
 * the control people reach for most and the one that must never move.
 *
 * PLAY/PAUSE bottom-left with the seek bar above it and the clock beside it —
 * out of the picture, along an edge, where a transport belongs.
 *
 * THERE IS NO CENTRE BUTTON, and its removal is the point of this layout
 * rather than a side effect. A 56px disc in the middle of a feed video sits
 * exactly where a person is trying to look, covers the frame, and does the
 * same job as pressing the picture behind it — so a fade at the wrong moment
 * reads as "the pause button doesn't work". `chromeVisible` in controls.ts
 * carries the full argument. Pressing the picture still toggles play/pause;
 * that behaviour was always right and is untouched.
 *
 * The whole transport HIDES while the video plays and comes back on hover, on
 * keyboard focus, or on a tap, then fades again CONTROLS_HIDE_MS after the
 * last interaction. A hidden control is not a tab stop and is `aria-hidden`,
 * so nothing that cannot be seen can be reached by Tab or read aloud.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type Hls from "hls.js"
import {
  CONTROLS_HIDE_MS,
  chromeVisible,
  formatClock,
  intentOnActiveChange,
  keyAction,
  progressFraction,
  restingLineVisible,
  scrubTarget,
  scrubberVisible,
  seekTarget,
  shouldPlay,
  tapOutcome,
  toggleIntent,
  type PlaybackIntent,
} from "./controls"
import { PauseGlyph, PlayGlyph, Volume2Glyph, VolumeXGlyph } from "./icons"
import { claimManualPlayback, releaseManualPlayback, revokeManualPlaybackExcept } from "./manualPlayback"
import {
  armSound,
  disarmSound,
  noteUnmutedPlaybackRefused,
  soundIsArmed,
  watchForSoundGesture,
} from "./soundPreference"
import type { MediaSessionInfo } from "./mediaSession"
import { useMediaSession } from "./useMediaSession"
import { HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS, WatchSession, type WatchEvent, type WatchSessionInfo } from "./watchTracker"

export interface VideoSource {
  /** Same-origin gateway path to a master playlist. Preferred. */
  hlsUrl?: string
  /** A signed progressive MP4, used when HLS will not attach. */
  progressiveUrl?: string
  posterUrl?: string
  durationMs?: number
  width?: number
  height?: number
}

export interface MomentumVideoProps {
  source: VideoSource
  /**
   * Should this be playing? Owned by the coordinator, never by this component:
   * an element that decided for itself would be a second place the
   * one-video-at-a-time rule could be broken.
   */
  active: boolean
  /**
   * The DEFAULT sound state for a COLD document, not a shared one.
   *
   * True, and it has to be: a browser refuses to start an unmuted video
   * unprompted, and the refusal arrives as a rejected promise rather than an
   * exception — so an unmuted autoplay is not "louder", it is a video that
   * silently never starts.
   *
   * It is the weakest of three inputs and is overruled in turn by each of the
   * other two:
   *
   *   · once the document has had a real user gesture, a playback STARTING
   *     from then on starts with sound instead — see `soundPreference.ts`, and
   *     note that it changes what starts, never what is already running;
   *   · once a person has used THIS player's speaker, their choice wins for
   *     ever and later changes to this prop are ignored. That is what makes
   *     mute per player rather than per feed: a feed-wide toggle meant
   *     scrolling changed the volume of a video you had never touched.
   */
  muted: boolean
  /**
   * A stable id for this player, used only to arbitrate hand-started playback
   * between players — see `manualPlayback.ts`. Omit and the arbitration is
   * skipped, which is safe on a surface that mounts exactly one player.
   */
  playbackId?: string
  loop?: boolean
  /**
   * Classes for the player's box — which MUST position it.
   *
   * `absolute inset-0` inside a sized frame is what the feed passes and what
   * this is built for; `relative` on a box of your own is equally fine. The
   * controls are absolutely placed inside this element, so an unpositioned box
   * would let them escape to the nearest positioned ancestor — which, in a
   * feed, is a card several hundred pixels away.
   *
   * Nothing is appended to what you pass. See the note at the render site for
   * the bug that rule exists to prevent.
   */
  className?: string
  /**
   * Draw the transport controls. On by default.
   *
   * A surface with its own chrome — a full-bleed reels viewer that draws its
   * own scrubber — turns this off and keeps everything else.
   */
  controls?: boolean
  /** Describes the video for a screen reader. From the post's alt text. */
  ariaLabel?: string
  /** Watch measurement. Omit and nothing is tracked. */
  session?: WatchSessionInfo
  onWatchEvent?: (event: WatchEvent) => void
  /**
   * What the OS should say this is — the lock screen, the headset button, the
   * media keys. Omit and no media session is claimed at all.
   *
   * Only claimed while `active`, so the one item the coordinator chose is the
   * one the operating system describes. Read the header of `mediaSession.ts`
   * before building a feature on this: it does NOT give the page background
   * audio, and never will.
   */
  mediaSession?: MediaSessionInfo | null
  /**
   * Lock-screen skip buttons. Wired ONLY when supplied, and a feed must not
   * supply them — see the long note at the registration site in
   * `useMediaSession`. A surface with a real ordered queue should.
   */
  onPreviousTrack?: () => void
  onNextTrack?: () => void
  /** Fired when neither HLS nor the progressive fallback would load. */
  onUnplayable?: () => void
  /**
   * Told, not asked.
   *
   * The player owns its own sound now, so this is a notification with the new
   * value — for a zone that wants to remember a preference or count it — and
   * NOT the thing that performs the toggle. A caller that ignores it loses
   * nothing.
   */
  onToggleMuted?: (nextMuted: boolean) => void
  /**
   * Last chance to fix up a PLAYLIST url before it is fetched. The zone's job,
   * not this package's — see the note above `pLoader` below.
   */
  resolveUrl?: (url: string) => string
}

type AttachState = "idle" | "attaching" | "ready" | "failed"

/** Same-origin means "send the cookie". Anything else must not get one. */
function isSameOrigin(url: string): boolean {
  if (url.startsWith("/")) return true
  if (typeof window === "undefined") return false
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

export function MomentumVideo({
  source,
  active,
  muted,
  playbackId,
  loop = false,
  className,
  controls = true,
  ariaLabel,
  session,
  onWatchEvent,
  mediaSession,
  onPreviousTrack,
  onNextTrack,
  onUnplayable,
  onToggleMuted,
  resolveUrl,
}: MomentumVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [attach, setAttach] = useState<AttachState>("idle")
  const [usingProgressive, setUsingProgressive] = useState(false)

  /* ── The person's two decisions ───────────────────────────────────────── */

  /**
   * Null until they touch the speaker, and their answer for ever after.
   *
   * Not seeded from the prop and then diverging — that would be two sources
   * for one value, and the second render would overwrite the first choice.
   * `null` is "nobody has said", which is a different thing from "muted", and
   * is what lets a default flow through until it is overruled.
   */
  const [userMuted, setUserMuted] = useState<boolean | null>(null)

  /**
   * Did THIS playback start with sound because the document had been touched?
   *
   * Set once, at a play start, from `soundIsArmed()` — never from a render and
   * never from a subscription. That is the whole of the non-retroactivity
   * guarantee: a video already running when somebody clicks a like button
   * cannot hear about it, so it cannot suddenly speak. See the header of
   * `soundPreference.ts`.
   */
  const [startedWithSound, setStartedWithSound] = useState(false)

  /**
   * The browser refused an unmuted start on this element.
   *
   * It outranks everything, including an explicit unmute, because it is not an
   * opinion — the element is muted, and a speaker glyph claiming otherwise
   * would be the UI lying about audio. Cleared at the next play start and by
   * the next press of the speaker, both of which are fresh attempts.
   */
  const [refusedUnmuted, setRefusedUnmuted] = useState(false)

  /**
   * Three defaults and one choice, in precedence order.
   *
   * The prop is the FEED's default, `startedWithSound` is the DOCUMENT's
   * default once a gesture has happened, and `userMuted` is this person's
   * answer for this video — which beats both, for ever, and is the rule that
   * makes mute per player rather than per feed. Sound-after-gesture changes
   * what an untouched player defaults to; it may not overrule somebody who has
   * already told this player what they want.
   */
  const isMuted = refusedUnmuted || (userMuted ?? (startedWithSound ? false : muted))

  /**
   * Watch for the document's first gesture while this player exists.
   *
   * Refcounted inside the module: twenty players install three listeners
   * between them, and the first gesture removes them. Mounting is also what
   * starts the clock — a click that happened before there was any video on the
   * page cannot arm sound.
   */
  useEffect(() => watchForSoundGesture(), [])

  /** "auto" until they press something. See `controls.ts`. */
  const [intent, setIntent] = useState<PlaybackIntent>("auto")

  /**
   * Whether the ELEMENT is stopped, which is not the same as `intent`.
   *
   * Read from the element's own `play`/`pause` events rather than computed,
   * because three other things move it: a refused autoplay, the
   * `visibilitychange` handler below, and the OS media controls, whose play
   * and pause handlers in `useMediaSession` act on the element directly. A
   * button drawn from `intent` would show "pause" over a video the lock screen
   * had already stopped.
   */
  const [elementPaused, setElementPaused] = useState(true)

  const watchRef = useRef<WatchSession | null>(null)
  const attachStartedAt = useRef<number>(0)
  const bufferingRef = useRef(false)

  /**
   * The callback is held in a ref and the emitter is STABLE.
   *
   * This is not a micro-optimisation, it is the difference between measuring a
   * view and destroying it. A caller naturally writes
   * `onWatchEvent={(e) => record(item, session, e)}` — a new function identity
   * on every render. If the tracker effect depended on it, every render would
   * tear the WatchSession down, fire a `play_end` on the way out, and start a
   * fresh one with the counters back at zero. A feed re-renders on every
   * scroll frame, so a thirty-second view would arrive at the server as
   * several dozen views of nothing and a creator would be paid for none of it.
   */
  const onWatchEventRef = useRef(onWatchEvent)
  onWatchEventRef.current = onWatchEvent
  const emit = useCallback((event: WatchEvent) => {
    onWatchEventRef.current?.(event)
  }, [])

  /**
   * `onUnplayable` gets the same treatment, and for a failure that is even
   * harder to see.
   *
   * A caller writes `onUnplayable={() => onStale(item.id)}` — a new identity
   * every render. With that in the attach effect's dependencies, every render
   * destroys the hls.js instance and builds another one, and each new instance
   * starts over by fetching the master playlist. Nothing errors: the player
   * just never gets far enough to request a level, so every video sits at
   * readyState 0 for ever.
   *
   * It was measured on this feed before the fix — 208 master-playlist requests
   * for 14 videos, zero child playlists, zero segments, and an empty console.
   */
  const onUnplayableRef = useRef(onUnplayable)
  onUnplayableRef.current = onUnplayable

  /* ── Attaching a source ───────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    const resolve = resolveUrl ?? ((u: string) => u)
    const hlsUrl = source.hlsUrl ? resolve(source.hlsUrl) : undefined
    const progressive = source.progressiveUrl

    /** Last resort. Also the FIRST resort when there is no HLS URL at all. */
    const fallbackToProgressive = () => {
      if (cancelled) return
      if (!progressive) {
        setAttach("failed")
        onUnplayableRef.current?.()
        return
      }
      setUsingProgressive(true)
      video.src = progressive
      setAttach("ready")
    }

    attachStartedAt.current = performance.now()

    if (!hlsUrl) {
      fallbackToProgressive()
      return () => {
        cancelled = true
      }
    }

    /**
     * hls.js FIRST, native HLS only as a fallback.
     *
     * The tempting order is the other way round — "use the browser's own
     * implementation when it has one" — and it is wrong, because
     * `canPlayType("application/vnd.apple.mpegurl")` cannot be trusted. Chrome
     * answers "maybe" for it and then cannot play an m3u8 at all: the element
     * takes the URL, sits at readyState 0, and never errors. Verified on this
     * feed — every video showed its poster and nothing else, with an empty
     * console, until this order was flipped.
     *
     * hls.js's own guidance is this order, and it degrades correctly: iOS
     * Safari has no Media Source Extensions, so `isSupported()` is false there
     * and native takes over, which is exactly where native is the real thing.
     */
    setAttach("attaching")
    let hls: Hls | null = null

    /** Native HLS, for a browser that genuinely has it. */
    const attachNativeHls = () => {
      if (cancelled) return
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl
        setAttach("ready")
        return
      }
      fallbackToProgressive()
    }

    import("hls.js")
      .then(({ default: HlsCtor }) => {
        if (cancelled) return
        if (!HlsCtor.isSupported()) {
          attachNativeHls()
          return
        }

        /**
         * Rewrite PLAYLIST urls, and only playlist urls.
         *
         * The master playlist's child references are absolute paths generated
         * by media-service — `/v1/media/{id}/hls/360p.m3u8` — and a player
         * resolves those against the ORIGIN, so under a zone basePath they
         * miss the proxy entirely and every video stalls after the manifest
         * with no error worth reading.
         *
         * The fix cannot live in this package: only the zone knows what its
         * own prefix is. So the zone supplies `resolveUrl` and it is applied
         * here, at the one place a playlist url is about to be fetched.
         *
         * `pLoader`, NOT `loader`. Fragment urls are absolute, pre-signed
         * links to the media host; putting a zone prefix on one would produce
         * a 404 and putting our cookie on one would fail CORS. Playlists are
         * ours, segments are not, and hls.js draws exactly that line.
         */
        interface PlaylistLoaderLike {
          load(context: { url: string }, config: unknown, callbacks: unknown): void
        }
        const BasePlaylistLoader = HlsCtor.DefaultConfig.loader as unknown as new (
          config: unknown
        ) => PlaylistLoaderLike

        class PrefixedPlaylistLoader extends BasePlaylistLoader {
          load(context: { url: string }, config: unknown, callbacks: unknown) {
            context.url = resolve(context.url)
            super.load(context, config, callbacks)
          }
        }

        hls = new HlsCtor({
          pLoader: PrefixedPlaylistLoader as never,
          // Small buffers: a feed has many players and a generous forward
          // buffer on each one is a lot of memory and a lot of bandwidth spent
          // on videos that are about to scroll off.
          maxBufferLength: 12,
          maxMaxBufferLength: 30,
          backBufferLength: 10,
          // Start conservatively. The first seconds of a feed video decide
          // whether it looks instant, and a 720p first segment on a slow link
          // looks like a stall.
          startLevel: 0,
          xhrSetup: (xhr, url) => {
            // The playlists are ours and need the session; the segments are
            // signed and cross-origin and must NOT get a credentialed request.
            xhr.withCredentials = isSameOrigin(url)
          },
        })
        hlsRef.current = hls

        hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
          if (process.env.NODE_ENV !== "production") {
            // Every HLS failure mode here is invisible by default — a stalled
            // player looks exactly like a slow one, and the recovery paths
            // below can mask a permanent problem as an endless retry. This is
            // the only thread that ever says which it was.
            console.warn(
              `[player] hls ${data.fatal ? "fatal" : "non-fatal"} ${data.type}/${data.details}`,
              data.response?.code ?? "",
              (data.url ?? "").slice(0, 120)
            )
          }
          if (!data.fatal) return
          switch (data.type) {
            case HlsCtor.ErrorTypes.NETWORK_ERROR:
              // A signed segment that expired mid-playback lands here. One
              // reload of the playlist re-signs it.
              hls?.startLoad()
              break
            case HlsCtor.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError()
              break
            default:
              hls?.destroy()
              hlsRef.current = null
              fallbackToProgressive()
          }
        })

        hls.loadSource(hlsUrl)
        hls.attachMedia(video)
        if (!cancelled) setAttach("ready")
      })
      .catch(() => {
        // The chunk itself failed to load — offline, or a blocked CDN.
        fallbackToProgressive()
      })

    return () => {
      cancelled = true
      hls?.destroy()
      hlsRef.current = null
    }
  }, [source.hlsUrl, source.progressiveUrl, resolveUrl])

  /* ── Play / pause: `active`, and what the person said about it ─────────── */

  /**
   * The two mute inputs, readable from an effect that must not DEPEND on them.
   *
   * This is the subtle half of making mute per player. `muted` used to be in
   * the play/pause effect's dependency array, which was harmless while the
   * only thing that changed it was a feed-wide button nobody pressed. Now that
   * the speaker is on every card, that dependency would mean: person pauses a
   * video, person unmutes it, the effect re-runs, sees `active` is still true,
   * and calls `play()` — the pause button undone by the mute button, once per
   * card, with nothing in either handler to point at.
   *
   * `startedWithSound` is deliberately NOT among them and is not read here at
   * all: the effect is what SETS it, from the module, at the one moment sound
   * is decided. Reading it back would be a loop.
   */
  const userMutedRef = useRef(userMuted)
  userMutedRef.current = userMuted
  const mutedPropRef = useRef(muted)
  mutedPropRef.current = muted

  useEffect(() => {
    const video = videoRef.current
    if (!video || attach !== "ready") return

    /** Guards the async `play()` rejection against a stale effect run. */
    let stale = false

    if (shouldPlay(active, intent)) {
      /*
        The one moment sound is decided, and the only moment it is read.

        `soundIsArmed()` is asked HERE, imperatively, rather than subscribed
        to — see the header of `soundPreference.ts`. Reading it during render
        would make every player re-render on the first click anywhere on the
        page and would unmute a video that was already running, which is the
        blaring-video failure this whole design is shaped to make impossible.

        An untouched document always answers false, so the first video of a
        session is muted, which is the only state a browser will start
        unprompted.
      */
      const armed = soundIsArmed()
      setStartedWithSound(armed)
      setRefusedUnmuted(false)
      const wantMuted = userMutedRef.current ?? (armed ? false : mutedPropRef.current)
      video.muted = wantMuted
      // A video that ran to the end is showing its last frame; "play" there
      // means watch it again, not resume a finished thing for zero seconds.
      if (video.ended) video.currentTime = 0
      const p = video.play()
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          if (stale) return
          if (!wantMuted) {
            /*
              The browser refused an UNMUTED start, and the refusal is the
              browser telling the truth. The wrong response is to swallow it:
              that leaves a poster where a video should be, with a clean
              console, and reads as "the videos stopped working".

              So: fall back to muted and keep playing. A silent video is a
              recoverable disappointment; a dead frame is a bug report. The
              module is told as well, so the rest of the session stops
              attempting a permission this browser is not going to grant —
              Safari refuses every time, and without the latch every video
              would hitch on the same failed attempt.
            */
            noteUnmutedPlaybackRefused()
            setRefusedUnmuted(true)
            setStartedWithSound(false)
            video.muted = true
            const retry = video.play()
            if (retry && typeof retry.catch === "function") retry.catch(() => {})
            return
          }
          // A MUTED start was refused, which a browser essentially never does.
          // Nothing to do and nothing to say: the poster stays up and the
          // person can press play. Swallowing it here is what keeps the
          // console clean enough that real errors are visible.
        })
      }
    } else {
      video.pause()
      /*
        The feed moving on ends this playback's claim on sound; a deliberate
        pause does not.

        Same distinction the rewind below draws, for the same reason. A person
        who paused is still watching this video and will press play again, and
        flipping the speaker glyph to "muted" underneath them — then back on
        resume — is the icon flickering for no reason they can see. A card the
        feed has scrolled past is a poster again, and a poster advertising
        sound it is not making is the feed-wide mute button coming back in
        through the icon.
      */
      if (!active && intent !== "pause") setStartedWithSound(false)
      /*
        Rewind so the next time it becomes active it starts from the top
        rather than resuming a view nobody remembers starting.

        Both guards are load-bearing and the second one was learned in the
        browser. `!active` alone is not "the feed moved on": a video the
        person started by hand on a surface where the coordinator chose
        nothing — a whole reduced-motion session — is inactive the entire time
        it plays. Pausing one of those took the `!active` branch and jumped the
        playhead back to zero, so the pause button was a stop button wearing
        the wrong icon. Checking the INTENT is what tells the two apart: a
        deliberate pause keeps its place, the feed moving on does not.
      */
      if (!active && intent !== "pause" && video.currentTime > 0 && !loop) {
        video.currentTime = 0
      }
    }

    /*
      `play()` settles on a later turn of the loop, and by then the coordinator
      may well have moved on. Without this the rejection handler above could
      restart a video the feed had already left — the one-video rule broken by
      a promise arriving late.
    */
    return () => {
      stale = true
    }
  }, [active, intent, attach, loop])

  /**
   * The coordinator changing its mind clears whatever the person said.
   *
   * Both edges, and the reasoning for each is written out in
   * `intentOnActiveChange`. The short version: `active` going false rewinds
   * the video, so a pause held across that edge refers to a playhead that no
   * longer exists.
   *
   * It also revokes any hand-started playback elsewhere in the document, which
   * is what keeps the one-video rule true when a person has pressed play on a
   * card the coordinator never chose. See `manualPlayback.ts`.
   */
  const firstActiveRun = useRef(true)
  useEffect(() => {
    if (firstActiveRun.current) {
      firstActiveRun.current = false
      return
    }
    setIntent(intentOnActiveChange)
    if (active) revokeManualPlaybackExcept(playbackId ?? null)
  }, [active, playbackId])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.muted = isMuted
  }, [isMuted])

  /**
   * Hold or release the manual-playback slot.
   *
   * Claimed only for a video playing WITHOUT the coordinator's blessing, which
   * is the only case that needs arbitrating — under normal autoplay `active`
   * already guarantees there is one of them.
   */
  useEffect(() => {
    if (!playbackId) return
    if (intent === "play" && !active) {
      claimManualPlayback(playbackId, () => setIntent("auto"))
      return () => releaseManualPlayback(playbackId)
    }
    releaseManualPlayback(playbackId)
    return undefined
  }, [playbackId, intent, active])

  /* ── A tab that is not being looked at is not being watched ───────────── */
  useEffect(() => {
    if (typeof document === "undefined") return
    const onHidden = () => {
      if (document.visibilityState === "hidden") videoRef.current?.pause()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => document.removeEventListener("visibilitychange", onHidden)
  }, [])

  /* ── Watch measurement ────────────────────────────────────────────────── */

  /**
   * The session, read through a ref so it is not an effect dependency.
   *
   * `sessionId` is the ONLY thing that may restart a tracker, because a new
   * id is what "a new view" means. Depending on the object would restart it
   * whenever the caller happened to produce a fresh one — and the restart is
   * destructive: it ends the view and zeroes the counters.
   */
  const sessionRef = useRef(session)
  sessionRef.current = session
  const sessionId = session?.sessionId

  useEffect(() => {
    const info = sessionRef.current
    if (!info) return
    const tracker = new WatchSession(info, emit)
    watchRef.current = tracker
    return () => {
      // Whatever ended this view — scrolled away, unmounted, navigated — the
      // view is over and the numbers have to go. `end` is idempotent, which is
      // what makes it safe to also call it from the pagehide handler below.
      tracker.end("swipe_next")
      watchRef.current = null
    }
  }, [sessionId, emit])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onLeave = () => watchRef.current?.end("backgrounded")
    window.addEventListener("pagehide", onLeave)
    return () => window.removeEventListener("pagehide", onLeave)
  }, [])

  /**
   * The 1-second sampler.
   *
   * A timer rather than `timeupdate`, because `timeupdate` fires at a rate the
   * browser chooses (typically 4Hz, but throttled hard in a background tab)
   * and the arithmetic in WatchSession assumes a known interval. The timer
   * only runs while something is actually playing.
   */
  useEffect(() => {
    const video = videoRef.current
    // `sessionId` rather than the session object, for the same reason as the
    // tracker effect above: a fresh object identity must not restart the clock.
    if (!video || !sessionId) return

    let last = performance.now()
    const id = window.setInterval(() => {
      const tracker = watchRef.current
      if (!tracker || video.paused || video.ended) {
        last = performance.now()
        return
      }
      const now = performance.now()
      const elapsed = now - last
      last = now
      tracker.playbackSpeed = video.playbackRate || 1
      tracker.sample(video.currentTime * 1000, elapsed, bufferingRef.current)
    }, SAMPLE_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [sessionId, attach])

  /* ── The OS's copy of all this ────────────────────────────────────────── */

  /**
   * Still the coordinator's answer, widened by exactly one case.
   *
   * The rule this used to state — "ownership follows `active`, not is-playing"
   * — is intact and is still the right one: autoplay can be refused, a video
   * can buffer, a person can pause, and none of those mean the OS should start
   * describing a different post. Passing `elementPaused` here would blank the
   * lock screen the instant somebody pressed pause, and put the play button
   * out of reach of the one video they are looking at.
   *
   * The one case `active` alone does not cover is a video the person started
   * BY HAND on a surface where the coordinator chose nothing — the whole of a
   * reduced-motion session. That video is unambiguously the thing playing, so
   * it is the thing the lock screen should name, and `manualPlayback.ts`
   * guarantees there is at most one of it. So the claim is `active OR the
   * manual slot`, which still cannot be held by two players at once — which
   * was the actual invariant.
   */
  const ownsPlayback = active || (intent === "play" && Boolean(playbackId))

  useMediaSession({
    videoRef,
    active: ownsPlayback,
    info: mediaSession,
    onPreviousTrack,
    onNextTrack,
  })

  /**
   * How this view started, for `play_start`.
   *
   * Set by the control handlers before they touch the element, and read once
   * by the tracker. "tap" for a cold press of play, "resume" for a press that
   * undoes an earlier pause — the contract's three start methods are a real
   * distinction on the creator dashboard (an autoplayed view and a chosen one
   * are not worth the same) and inferring it from `active` got it wrong for
   * every hand-started video.
   */
  const startMethodRef = useRef<"autoplay" | "tap" | "resume">("autoplay")

  const handlePlaying = useCallback(() => {
    bufferingRef.current = false
    setElementPaused(false)
    const tracker = watchRef.current
    const video = videoRef.current
    if (!tracker || !video || tracker.hasStarted) return
    tracker.start({
      startMethod: startMethodRef.current,
      isMuted: video.muted,
      isAutoplay: startMethodRef.current === "autoplay",
      timeToFirstFrameMs: Math.max(0, performance.now() - attachStartedAt.current),
      playheadMs: video.currentTime * 1000,
    })
  }, [])

  const handleEnded = useCallback(() => {
    setElementPaused(true)
    if (!loop) watchRef.current?.end("ended")
  }, [loop])

  /* ── The controls ─────────────────────────────────────────────────────── */

  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [recentlyMoved, setRecentlyMoved] = useState(false)
  /**
   * A finger asked for the transport. See `tapOutcome` and `chromeVisible`.
   *
   * `hovered` deliberately never becomes true for a touch or a pen — a finger
   * is not hovering, and pretending it is would break the reveal-first rule:
   * a browser fires `pointerenter` on the way into a tap, so the chrome would
   * already be "visible" by the time the tap was decided and the first tap
   * would toggle blind after all.
   */
  const [revealed, setRevealed] = useState(false)

  /**
   * Progress.
   *
   * `timeupdate` fires about four times a second, which sounds expensive in a
   * feed and is not: the coordinator guarantees ONE video is playing, a paused
   * element fires nothing, and the state lives in this component so a card's
   * header, caption and action bar are not re-rendered by it. Four renders a
   * second of a `<video>` whose attributes have not changed is a reconcile and
   * no DOM writes.
   */
  const [playhead, setPlayhead] = useState(0)
  const [duration, setDuration] = useState(0)

  const isPlaying = !elementPaused
  const drawable = controls && attach !== "failed"
  /**
   * "This video has actually run", which is not the same as "it is stopped".
   *
   * A feed is nineteen posters and one video, and a poster is stopped at zero.
   * Treating those as paused videos would paint a full transport on every card.
   * See `scrubberVisible`.
   */
  const started = playhead > 0
  const chrome = { playing: isPlaying, started, hovered, focused, recentlyMoved, revealed }
  const chromeShown = drawable && chromeVisible(chrome)
  /**
   * The seek bar's own condition, and the one that keeps a feed navigable.
   *
   * This is not only an opacity: the `role="slider"` is not RENDERED at all
   * unless it is true, so an untouched feed of twenty videos contains zero
   * sliders rather than twenty carrying `tabIndex={-1}`. See `scrubberVisible`.
   */
  const scrubVisible = scrubberVisible(chrome) && drawable
  const restingVisible = drawable && restingLineVisible(chrome)

  /** Read by the pointer handlers, which run outside a render. */
  const chromeShownRef = useRef(chromeShown)
  chromeShownRef.current = chromeShown

  /**
   * Which device produced the last press. `click` does not carry it, so it is
   * captured from the `pointerdown` that preceded it.
   */
  const pointerKind = useRef<string>("mouse")

  const hideTimer = useRef(0)
  const noteActivity = useCallback(() => {
    setRecentlyMoved(true)
    if (typeof window === "undefined") return
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = 0
      setRecentlyMoved(false)
      // The touch reveal decays on the same clock. Two timers for one fade is
      // how a transport ends up half on screen.
      setRevealed(false)
    }, CONTROLS_HIDE_MS)
  }, [])

  /**
   * Somebody just DID something — pressed play, moved the scrubber, tapped the
   * picture — as opposed to merely moving a mouse across it.
   *
   * The difference matters on a touchscreen, where `hovered` is never true and
   * the auto-hide timer alone therefore holds nothing on screen. Without this,
   * pressing play on a phone made the transport vanish in the same frame: the
   * timer was running but no condition in `chromeVisible` was satisfied. Every
   * deliberate interaction now holds the transport for CONTROLS_HIDE_MS,
   * whatever the person used to make it.
   */
  const noteInteraction = useCallback(() => {
    setRevealed(true)
    noteActivity()
  }, [noteActivity])

  /**
   * Nothing invisible may hold the focus.
   *
   * The controls fade but stay in the document, and while they are faded they
   * are `tabIndex={-1}` and `aria-hidden`. That is right for a keyboard user
   * arriving from outside — but it leaves one hole: press the speaker with the
   * MOUSE and it has DOM focus without being focus-visible, so the transport
   * is free to fade three seconds later and leave the focus sitting on a
   * button nobody can see. Screen-reader focus would then be inside an
   * `aria-hidden` subtree, which is exactly the state the ARIA spec calls out.
   *
   * So when the transport goes, the focus comes back out to the player itself,
   * which is always focusable while the controls exist. Focus stays on the
   * card — the person does not lose their place — and it lands somewhere
   * visible.
   */
  useEffect(() => {
    if (chromeShown || !controls) return
    const root = rootRef.current
    if (typeof document === "undefined" || !root) return
    const active = document.activeElement
    if (active && active !== root && root.contains(active)) root.focus()
  }, [chromeShown, controls])

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    []
  )

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    const next = toggleIntent(active, intent)
    if (next === "play") {
      // A press that undoes a pause is a resume; a press on something that was
      // never playing is a tap. Set before the effect runs `play()`.
      startMethodRef.current = video && video.currentTime > 0 && !video.ended ? "resume" : "tap"
    }
    setIntent(next)
    noteInteraction()
  }, [active, intent, noteInteraction])

  /**
   * A press on the picture itself.
   *
   * With a mouse this is play/pause, unchanged and correct — it is what every
   * video on the web does. With a finger it is play/pause ONLY once the
   * transport is already on screen; the first tap on a playing video summons
   * the transport instead of silently stopping something the person cannot
   * see. `tapOutcome` holds the rule and the reasoning.
   */
  const onPictureClick = useCallback(() => {
    if (tapOutcome(pointerKind.current, chromeShownRef.current) === "reveal") {
      noteInteraction()
      return
    }
    togglePlay()
  }, [noteInteraction, togglePlay])

  /**
   * The speaker, which does two things now — one for this player and one for
   * the feed, and the difference between them is the whole of the mute rule.
   *
   * FOR THIS PLAYER it records `userMuted`, which is final: no default, from
   * the prop or from the document's gesture history, may ever overrule it
   * again on this video.
   *
   * FOR THE FEED it moves the DEFAULT the next untouched video will start
   * from. A deliberate press of a speaker is the strongest statement about
   * sound a person can make, in both directions — "let me hear this" and "stop
   * making noise at me" — and it would be strange for a feed to hear it, apply
   * it to one clip, and then go back to guessing. It reaches no other player;
   * `soundPreference.ts` has no way to.
   *
   * It toggles from the DISPLAYED state rather than from `userMuted`, so the
   * button always does what its glyph says even when a refused unmuted start
   * has forced the element quiet underneath a choice to the contrary.
   */
  const toggleMuted = useCallback(() => {
    const next = !isMuted
    setUserMuted(next)
    // The refusal was about the last attempt. This press IS a user gesture, in
    // the handler, which is exactly what the browser was holding out for.
    setRefusedUnmuted(false)
    if (next) disarmSound()
    else armSound()
    onToggleMuted?.(next)
    noteInteraction()
  }, [isMuted, onToggleMuted, noteInteraction])

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = seekTarget(video.currentTime, deltaSeconds, video.duration)
      // The tracker is NOT told. It works a seek out for itself from the size
      // of the playhead jump at the next sample — see the header of
      // watchTracker.ts — so announcing it here would count one seek twice and
      // would put the definition of "a seek" in two places.
      setPlayhead(video.currentTime)
      noteInteraction()
    },
    [noteInteraction]
  )

  const seekToFraction = useCallback(
    (fraction: number) => {
      const video = videoRef.current
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
      video.currentTime = seekTarget(0, fraction * video.duration, video.duration)
      setPlayhead(video.currentTime)
      noteInteraction()
    },
    [noteInteraction]
  )

  /**
   * Keys, and the two things that make them safe inside a feed.
   *
   * `preventDefault` only once the key is known to be ours — Space would
   * otherwise stop scrolling the page from a focused card. And
   * `stopPropagation`, because this player can be a page of a carousel whose
   * track also listens for the arrow keys: without it one press would seek the
   * video AND turn the page.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const action = keyAction(event.key, {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
      })
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      // Somebody is driving this from the keyboard, whatever moved the focus
      // here originally. From now on the transport stays up while they are on
      // it — see `focused` in `onFocus` for why arriving by mouse does not
      // count.
      setFocused(true)
      switch (action.kind) {
        case "toggle-play":
          togglePlay()
          break
        case "toggle-muted":
          toggleMuted()
          break
        case "seek":
          seekBy(action.deltaSeconds)
          break
        case "seek-to-fraction":
          seekToFraction(action.fraction)
          break
      }
    },
    [togglePlay, toggleMuted, seekBy, seekToFraction]
  )

  const scrubRef = useRef<HTMLDivElement | null>(null)
  const onScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bar = scrubRef.current
      const video = videoRef.current
      if (!bar || !video) return
      const rect = bar.getBoundingClientRect()
      video.currentTime = scrubTarget(event.clientX - rect.left, rect.width, video.duration)
      setPlayhead(video.currentTime)
      noteInteraction()
    },
    [noteInteraction]
  )

  const progress = progressFraction(playhead, duration)
  const label = ariaLabel || "Video"

  /**
   * Whether a faded control can still be clicked. It cannot.
   *
   * Exactly ONE of the two pointer-events classes is ever emitted, which is
   * the point: Tailwind orders `.pointer-events-none` before
   * `.pointer-events-auto` in its own sheet, so a class list carrying both
   * would silently resolve to `auto` however they were written and an
   * invisible button would still be sitting over the picture eating clicks.
   */
  const hit = chromeShown ? "pointer-events-auto" : "pointer-events-none"

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       The group is the player's keyboard surface. Its role is `group` rather
       than `button` because it contains buttons; the keys it claims are the
       transport conventions and every one of them also has a visible control. */
    <div
      /*
        The caller's classes and NOTHING else, which is a rule this box learned
        the hard way.

        The controls are `absolute` inside this element, so it has to be their
        containing block — and the obvious way to guarantee that is to append
        `relative`. Doing so is wrong here and the failure is silent: PostMedia
        passes `absolute inset-0`, Tailwind emits `.relative` AFTER `.absolute`
        in its position utilities, so the later rule wins, the box stops being
        pinned to the media frame, and it lays out at the video's own intrinsic
        height instead. Measured in the live feed: a frame correctly clamped to
        675px with a 1005px player hanging out of it.

        An absolutely positioned element is already a containing block for its
        absolute descendants, so appending anything was never needed. What this
        does mean is a contract: whatever a caller passes here must position
        the box. See `className` in the props.
      */
      className={className}
      ref={rootRef}
      // A `group`, not an `application` and not a `region`: the picture is the
      // content and the buttons inside are the controls. Focusable so the
      // transport keys have somewhere to land, which is the whole reason a
      // keyboard user can drive this at all.
      role="group"
      aria-label={label}
      tabIndex={controls ? 0 : -1}
      onKeyDown={controls ? onKeyDown : undefined}
      /*
        A touch or a pen never counts as hover, and never starts the auto-hide
        clock by arriving. See `revealed` above: a browser fires `pointerenter`
        on the way into a tap, so treating that as hover would mean the chrome
        was already "visible" when the tap was decided, and the reveal-first
        rule would quietly never fire.
      */
      onPointerDown={(event) => {
        pointerKind.current = event.pointerType || "mouse"
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") return
        setHovered(true)
        noteActivity()
      }}
      // Always clears, whatever the pointer was: a stale `hovered` left behind
      // on a hybrid laptop would pin the transport open over the picture.
      onPointerLeave={() => setHovered(false)}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") return
        noteActivity()
      }}
      /*
        KEYBOARD focus pins the transport open. A click that merely happened to
        move the DOM focus here does not.

        This box is `tabIndex={0}`, so pressing the picture to pause also
        focuses it — and treating that as "focused" meant the transport never
        faded again for the rest of the session. One click and the controls
        were welded over the picture, which is most of what was wrong with the
        old chrome in the first place.

        `:focus-visible` is the browser's own answer to exactly this question
        and it is already the product's focus-ring rule (tokens.css draws the
        cyan ring on `*:focus-visible`), so the controls now appear under the
        same condition as the ring: if you can see that this is focused, you
        can see the transport. `onKeyDown` upgrades it the moment a key is
        used, which is how a browser upgrades focus-visible too.
      */
      onFocus={(event) => {
        const target = event.target as HTMLElement | null
        try {
          setFocused(target?.matches?.(":focus-visible") ?? true)
        } catch {
          // A browser without :focus-visible keeps the old, safer behaviour:
          // any focus shows the controls.
          setFocused(true)
        }
      }}
      onBlur={(event) => {
        // Focus moving between the group and its own buttons is not "left".
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption --
          User-generated video; the platform has no caption track to attach and
          inventing an empty one would tell a screen reader captions exist. */}
      <video
        ref={videoRef}
        poster={source.posterUrl}
        muted={isMuted}
        loop={loop}
        playsInline
        preload="metadata"
        aria-label={label}
        className="h-full w-full object-contain"
        onPlaying={handlePlaying}
        onPlay={() => setElementPaused(false)}
        onPause={() => setElementPaused(true)}
        /*
          `emptied` counts as stopped, and this is not a theoretical case.

          Tearing a source off an element — `hls.destroy()`, a new `src`, the
          load algorithm running again — sets `paused` back to true and fires
          `emptied`, and Chrome does NOT fire `pause` on the way. So a video
          that had begun to play and then had its source replaced left React
          believing it was still playing for ever after. The whole transport
          hangs off that flag, so the consequence was a STOPPED video wearing
          no controls at all: nothing to press, and the auto-hide rule saying
          it was fine because the video was "playing".

          Seen in the live feed: `play` (paused=false), then `emptied`
          (paused=true), and no `pause` in between. The fix is to believe the
          element rather than to reason about which events ought to arrive.
        */
        onEmptied={() => setElementPaused(true)}
        onWaiting={() => {
          bufferingRef.current = true
        }}
        onStalled={() => {
          bufferingRef.current = true
        }}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration
          setDuration(Number.isFinite(d) ? d : 0)
        }}
        onDurationChange={(event) => {
          const d = event.currentTarget.duration
          setDuration(Number.isFinite(d) ? d : 0)
        }}
        onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
        onEnded={handleEnded}
        onError={() => {
          if (!usingProgressive) setAttach("failed")
        }}
        // A click on the picture is play/pause — every video on the web, and
        // what the phone does. It used to toggle mute, which is why there was
        // no way to stop a video in this feed at all. On a touchscreen the
        // first tap summons the transport instead; see `onPictureClick`.
        onClick={controls ? onPictureClick : undefined}
      />

      {controls && attach !== "failed" && (
        <>
          {/*
            The speaker. Top-right, on its own, and nowhere else ever.

            One place is the whole requirement. It used to be bottom-left,
            wedged between a duration badge and a scrubber that had to carry
            `pl-10` to avoid it — three things fighting over one edge. The
            top-right corner is the only one a transport does not want, so the
            control people reach for most gets a corner to itself and never has
            to move for a carousel, a badge or a seek bar.

            It fades with the rest of the transport, which it could not do
            before: the old objection was that a touchscreen has no hover to
            bring it back. It has a tap now — see `tapOutcome` — so the sound
            is one tap away on a phone and a hover away on a desktop, and the
            picture is unobstructed in between.

            Colour: this sits over PHOTOGRAPHY, so nothing here may rely on a
            theme colour alone. `--mo-ink` on `--mo-bg` at .70 is the scrim the
            carousel's overlays already use, measured 6.46 against a pure white
            frame — AA at any size, and better over anything darker.
          */}
          <button
            type="button"
            onClick={toggleMuted}
            aria-pressed={isMuted}
            // A faded control is not a control. Out of the tab order and out
            // of the accessibility tree while it cannot be seen, so a keyboard
            // user never lands on something invisible — and back in the moment
            // focus reaches the player, because `chromeVisible` is true
            // whenever anything inside this group has focus.
            aria-hidden={!chromeShown}
            tabIndex={chromeShown ? 0 : -1}
            aria-label={isMuted ? `Unmute ${label}` : `Mute ${label}`}
            className={[
              OVERLAY_BUTTON,
              hit,
              "absolute right-2 top-2 h-9 w-9",
              "transition-opacity duration-150 ease-mo motion-reduce:transition-none",
              chromeShown ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {isMuted ? (
              <VolumeXGlyph className="h-4 w-4" />
            ) : (
              <Volume2Glyph className="h-4 w-4" />
            )}
          </button>

          {/*
            The resting playhead: a hairline along the very bottom edge,
            drawn only while the transport is NOT.

            This is `ProgressLine` from the Android tube player, which shows
            exactly this once its controls auto-hide. It answers "how much is
            left" — the one question a person has about a video they are
            already watching — without putting a control over the picture to
            do it, and it is what stops the frame from looking like a still
            image with nothing happening.
          */}
          {restingVisible && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-mo-bg/40">
              <div className="h-full bg-mo-ink/80" style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          {/*
            ── The transport bar ──────────────────────────────────────────

            Seek along the top, then play/pause at the bottom-left with the
            clock beside it. That is VLC's shape, and QuickTime's, and
            YouTube's, and it is the shape because it works: the controls are
            along an edge instead of over the middle of the picture, the seek
            bar gets the full width of the frame to aim at, and the play button
            is where the eye already goes when it leaves a video.

            The right-hand end of the transport row is deliberately EMPTY. A
            carousel prints its own per-page duration badge at bottom-right and
            its position pips at bottom-centre; keeping our content left-anchored
            means the three never collide, so a video inside a carousel looks
            the same as one outside it.
          */}
          <div
            aria-hidden={!chromeShown}
            className={[
              "pointer-events-none absolute inset-x-0 bottom-0",
              "transition-opacity duration-150 ease-mo motion-reduce:transition-none",
              chromeShown ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {/*
              The scrim, and why it is a gradient rather than a bar of colour.

              Everything below sits on user photography, which can be a white
              sky. A hard-edged strip would be a black bar stapled across the
              bottom of every video; a gradient reads as light falling off and
              is what a real player uses. It is sized so the controls sit in
              its dense end: `--mo-bg` at .95 at the very bottom easing to .65
              at the halfway line, which puts the play glyph and the clock on
              roughly .83 and the seek bar on roughly .60. Against the worst
              case — a pure white frame — that is 9.5:1 for the glyph and the
              clock (AAA at any size) and 4.2:1 for the seek bar, which is
              non-text and needs 3.0. Over anything darker it only improves.
            */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-mo-bg/95 via-mo-bg/65 to-transparent"
            />

            <div className="relative flex flex-col gap-1 px-3 pb-2">
              {/*
                The seek bar, and the rule that keeps a feed navigable.

                A `role="slider"` is RENDERED ONLY for a video that has
                actually run. Not hidden, not `tabIndex={-1}` — absent. A feed
                is nineteen posters and one video, and nineteen sliders is
                nineteen extra tab stops and nineteen extra things for a screen
                reader to read out on the way down the page. What the other
                nineteen get is the inert track below: the same line, in the
                same place, with no semantics and nothing to focus.
              */}
              {scrubVisible ? (
                <div
                  ref={scrubRef}
                  // A real slider: `role` and the three values, so the position
                  // is announced and the arrow keys work from the bar itself.
                  // The keys are handled on the group above, which this sits
                  // inside, so they behave identically wherever focus is.
                  role="slider"
                  aria-label={`Seek ${label}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round(playhead)}
                  aria-valuetext={`${formatClock(playhead)} of ${formatClock(duration)}`}
                  tabIndex={0}
                  onPointerDown={onScrub}
                  onKeyDown={onKeyDown}
                  className={
                    hit +
                    " group/scrub relative h-4 w-full cursor-pointer rounded-mo-pill" +
                    " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
                  }
                >
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-mo-pill bg-mo-ink/30 transition-[height] duration-150 ease-mo group-hover/scrub:h-1.5 motion-reduce:transition-none">
                    {/*
                      The filled part is `--mo-ink` rather than the ember: a
                      scrubber is a MARK, not the primary action on the screen,
                      and an ember bar on every video would put twenty gradient
                      fills in a feed that has one accent colour for the thing
                      it actually wants you to press.
                    */}
                    <div
                      className="h-full rounded-mo-pill bg-mo-ink"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  {/* The handle. A seek bar without one is a progress bar. */}
                  <div
                    aria-hidden="true"
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-mo-pill bg-mo-ink shadow-mo-sm"
                    style={{ left: `${progress * 100}%` }}
                  />
                </div>
              ) : (
                <div aria-hidden="true" className="pointer-events-none relative h-4 w-full">
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-mo-pill bg-mo-ink/30" />
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  // Not focusable, and hidden from assistive technology: it is
                  // the same action as Space on the group and as a press on
                  // the picture. A third tab stop per video would put twenty
                  // of them between a keyboard user and the bottom of the
                  // feed, and a third announcement of the same control is
                  // noise. The group above carries the label and the keys.
                  tabIndex={-1}
                  aria-hidden="true"
                  className={
                    hit +
                    " inline-flex h-8 w-8 items-center justify-center rounded-mo-pill text-mo-ink" +
                    " transition-colors duration-150 ease-mo hover:bg-mo-ink/20 motion-reduce:transition-none"
                  }
                >
                  {isPlaying ? <PauseGlyph className="h-5 w-5" /> : <PlayGlyph className="h-5 w-5" />}
                </button>
                {/*
                  Elapsed in ink, total in body — one is a live number and the
                  other is a fact about the file, and setting them in one
                  colour makes the person read the slash to tell which is
                  which. The total is omitted entirely until metadata arrives,
                  because "0:00 / 0:00" over a poster looks like a broken file.
                */}
                <span className="pointer-events-none select-none text-xs tabular-nums text-mo-ink">
                  {formatClock(playhead)}
                  {duration > 0 && <span className="text-mo-body"> / {formatClock(duration)}</span>}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The shape every overlay control shares.
 *
 * A circle of scrim with `--mo-ink` on it. The scrim is not decoration: these
 * sit on user photography which can be any colour, including a white sky, and
 * a themed button with no ground behind it disappears into half the pictures
 * on the platform. `--mo-ink` on `--mo-bg` at .70 measures 6.46 against pure
 * white, 11.62 over mid grey and 17.38 over black — the same table the
 * carousel's pill was built from.
 *
 * It carries no `pointer-events` of its own. That belongs to the caller,
 * because it depends on whether the control is currently on screen — see `hit`
 * in the component, and the note there about why both classes must never
 * appear together.
 */
const OVERLAY_BUTTON =
  "inline-flex items-center justify-center rounded-mo-pill " +
  "bg-mo-bg/70 text-mo-ink backdrop-blur-sm transition-colors duration-150 ease-mo " +
  "hover:bg-mo-bg/85 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-mo"

export { HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS }
