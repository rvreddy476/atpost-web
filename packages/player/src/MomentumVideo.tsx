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
 * here is caught, and every autoplay starts muted, because muted is the only
 * state a browser will start unprompted.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type Hls from "hls.js"
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
  /** Starts true and stays true until a person says otherwise. */
  muted: boolean
  loop?: boolean
  className?: string
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
  onToggleMuted?: () => void
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
  loop = false,
  className,
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
  const hlsRef = useRef<Hls | null>(null)
  const [attach, setAttach] = useState<AttachState>("idle")
  const [usingProgressive, setUsingProgressive] = useState(false)

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

  /* ── Play / pause, driven entirely by `active` ────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video || attach !== "ready") return

    if (active) {
      // Muted first, always. An unmuted autoplay is refused by every browser
      // and the refusal arrives as a rejected promise, not an exception.
      video.muted = muted
      const p = video.play()
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Refused. Nothing to do and nothing to say: the poster stays up and
          // the person can press play. Swallowing it here is what keeps the
          // console clean enough that real errors are visible.
        })
      }
    } else {
      video.pause()
      // Rewind so the next time it becomes active it starts from the top
      // rather than resuming a view nobody remembers starting.
      if (video.currentTime > 0 && !loop) video.currentTime = 0
    }
  }, [active, attach, muted, loop])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.muted = muted
  }, [muted])

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
   * Deliberately passed `active` — the coordinator's answer — rather than
   * anything this component works out for itself. That is the whole ownership
   * rule: the one item the feed decided is playing is the one item the lock
   * screen describes, and there is no second place for that decision to be made.
   */
  useMediaSession({
    videoRef,
    active,
    info: mediaSession,
    onPreviousTrack,
    onNextTrack,
  })

  const handlePlaying = useCallback(() => {
    bufferingRef.current = false
    const tracker = watchRef.current
    const video = videoRef.current
    if (!tracker || !video || tracker.hasStarted) return
    tracker.start({
      startMethod: active ? "autoplay" : "tap",
      isMuted: video.muted,
      isAutoplay: active,
      timeToFirstFrameMs: Math.max(0, performance.now() - attachStartedAt.current),
      playheadMs: video.currentTime * 1000,
    })
  }, [active])

  const handleEnded = useCallback(() => {
    if (!loop) watchRef.current?.end("ended")
  }, [loop])

  return (
    <div className={className}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption --
          User-generated video; the platform has no caption track to attach and
          inventing an empty one would tell a screen reader captions exist. */}
      <video
        ref={videoRef}
        poster={source.posterUrl}
        muted={muted}
        loop={loop}
        playsInline
        preload="metadata"
        aria-label={ariaLabel}
        className="h-full w-full object-contain"
        onPlaying={handlePlaying}
        onWaiting={() => {
          bufferingRef.current = true
        }}
        onStalled={() => {
          bufferingRef.current = true
        }}
        onEnded={handleEnded}
        onError={() => {
          if (!usingProgressive) setAttach("failed")
        }}
        onClick={onToggleMuted}
      />
    </div>
  )
}

export { HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS }
