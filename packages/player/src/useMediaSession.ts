"use client"

/**
 * Wiring one <video> to the OS media controls, for exactly as long as the
 * coordinator says that video is the one playing.
 *
 * Read `mediaSession.ts` first — the ownership rule, the per-call guards and
 * the honest statement of what this does NOT do (background audio) all live
 * there. This file is only the React half: when to claim, when to release, and
 * how often to tell the OS where the playhead is.
 *
 * ── Ownership follows `active`, not "is playing" ──────────────────────────
 * `active` is the autoplay coordinator's single answer to "which one item is
 * the one on screen". Tying the session to it, rather than to whether the
 * element happens to be unpaused, is what guarantees the lock screen names the
 * post you are looking at: autoplay can be refused, a video can buffer, a
 * person can pause — none of those mean the OS should start describing a
 * different post, or nothing at all.
 *
 * Claimed when `active` goes true. Released when it goes false, when the
 * component unmounts, and on nothing else — in particular NOT when playback
 * ends. An ended video is still the item on screen, and releasing there would
 * blank the lock screen mid-scroll and put the play button out of reach of the
 * one video the person is looking at.
 *
 * ── Nothing unstable reaches a dependency array ───────────────────────────
 * Every trap MomentumVideo documents applies here with more force, because a
 * media-session effect that re-runs per render re-registers seven action
 * handlers and rebuilds a MediaMetadata each time. Callers pass fresh closures
 * (`onNextTrack={() => go(i + 1)}`) and fresh metadata objects (the feed
 * rebuilds an item on every like), so:
 *   · callbacks live in refs and the effect reads `.current` at CALL time
 *   · metadata lives in a ref, and the effect depends on `metadataKey()` — a
 *     string that only changes when the words actually change
 */

import { useEffect, useRef, type RefObject } from "react"
import {
  applyActionHandler,
  applyMetadata,
  applyPlaybackState,
  applyPositionState,
  claimMediaSession,
  createMediaSessionClaim,
  hasMediaSession,
  metadataKey,
  releaseMediaSession,
  safePositionState,
  type MediaSessionClaim,
  type MediaSessionInfo,
} from "./mediaSession"

/**
 * How often the position is re-published while playing.
 *
 * NOT on `timeupdate`, which fires about four times a second and would send
 * ~240 cross-process messages a minute per video to say something the OS
 * already knows. `setPositionState` is not a tick: the OS is given position,
 * duration and playbackRate and EXTRAPOLATES the scrubber itself, so a second
 * update at the same rate carries no information.
 *
 * What it needs instead is a correction whenever the extrapolation stops being
 * true, and those are events, not intervals — play, pause, seek, rate change,
 * a duration that has only just become known, a buffer stall. All of those are
 * wired below. This timer exists only for the drift those events miss: hls.js
 * can rebuffer inside a segment without the element ever firing `waiting`, and
 * five seconds is a tight enough bound on the resulting error that a lock
 * screen scrubber never visibly disagrees with the picture, while costing 12
 * calls a minute instead of 240.
 */
export const POSITION_SYNC_INTERVAL_MS = 5_000

/** The spec's own default when the OS does not name one. */
const DEFAULT_SEEK_OFFSET_SECONDS = 10

export interface UseMediaSessionOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  /** The coordinator's decision. Exactly one item in a feed may be true. */
  active: boolean
  /** Metadata plus the owning id. Null disables the session for this item. */
  info?: MediaSessionInfo | null
  /**
   * Only wired when supplied — see the note at the registration site for why a
   * FEED does not supply them and an ordered pager should.
   */
  onPreviousTrack?: () => void
  onNextTrack?: () => void
  seekOffsetSeconds?: number
}

export function useMediaSession({
  videoRef,
  active,
  info,
  onPreviousTrack,
  onNextTrack,
  seekOffsetSeconds = DEFAULT_SEEK_OFFSET_SECONDS,
}: UseMediaSessionOptions): void {
  /** The live claim, or null. Read at event time so effects need not re-run. */
  const claimRef = useRef<MediaSessionClaim | null>(null)

  const infoRef = useRef(info)
  infoRef.current = info
  const previousRef = useRef(onPreviousTrack)
  previousRef.current = onPreviousTrack
  const nextRef = useRef(onNextTrack)
  nextRef.current = onNextTrack
  const seekOffsetRef = useRef(seekOffsetSeconds)
  seekOffsetRef.current = seekOffsetSeconds

  const ownerId = info?.id ?? null
  const key = metadataKey(info)
  const engaged = active && ownerId !== null
  // Booleans, not the functions. Whether a handler EXISTS is a real change of
  // capability and must re-register; the function's identity is not.
  const wantsPrevious = Boolean(onPreviousTrack)
  const wantsNext = Boolean(onNextTrack)

  /* ── Claim, describe, wire; release on the way out ─────────────────────── */
  useEffect(() => {
    if (!engaged || ownerId === null) return
    if (!hasMediaSession()) return

    const claim = createMediaSessionClaim(ownerId)
    claimRef.current = claim
    claimMediaSession(claim)

    const current = infoRef.current
    if (current) applyMetadata(claim, current)

    /**
     * `play` — the OS asking for sound.
     *
     * Note what this does NOT do: unmute. The first autoplay of a session is
     * muted because no browser will start an unmuted video unprompted, and
     * sound belongs to the player and to the person — `userMuted` in
     * `MomentumVideo`, and the document-wide default in `soundPreference.ts`.
     * A lock-screen button reaching past both would be the one place in the
     * product that overrules somebody's own choice on a video.
     *
     * The practical consequence is worth knowing: Chrome will not surface
     * these controls at all until the element is audible, so on the first,
     * silent video this handler is registered and never called. From the
     * second video — once the document has been touched and sound is on — it
     * works.
     */
    applyActionHandler(claim, "play", () => {
      const video = videoRef.current
      if (!video) return
      // Same rule as everywhere else in this package: play() REJECTS, it does
      // not throw, and an uncaught rejection here would surface as a console
      // error with no stack worth reading.
      const p = video.play()
      if (p && typeof p.catch === "function") p.catch(() => {})
    })

    applyActionHandler(claim, "pause", () => {
      videoRef.current?.pause()
    })

    /**
     * `seekto` — the lock-screen scrubber. This is the one that makes
     * `setPositionState` worth publishing at all.
     */
    applyActionHandler(claim, "seekto", (details) => {
      const video = videoRef.current
      const time = details.seekTime
      if (!video || typeof time !== "number" || !Number.isFinite(time)) return
      // `fastSeek` is the browser saying "this is a drag, precision can wait".
      // Honouring it keeps a scrub smooth instead of decoding every keyframe.
      if (details.fastSeek && typeof video.fastSeek === "function") {
        video.fastSeek(time)
        return
      }
      video.currentTime = time
    })

    applyActionHandler(claim, "seekbackward", (details) => {
      const video = videoRef.current
      if (!video) return
      const offset = details.seekOffset ?? seekOffsetRef.current
      video.currentTime = Math.max(0, video.currentTime - offset)
    })

    applyActionHandler(claim, "seekforward", (details) => {
      const video = videoRef.current
      if (!video) return
      const offset = details.seekOffset ?? seekOffsetRef.current
      const limit = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY
      video.currentTime = Math.min(limit, video.currentTime + offset)
    })

    /**
     * `previoustrack` / `nexttrack` — registered ONLY when a caller supplies
     * them, and the feed deliberately does not.
     *
     * A feed has no track list. "Next" there is a scroll: the coordinator picks
     * the item by geometry, so the only honest way to implement a next-track
     * button would be to scroll the page. And this package must not be the
     * thing that knows what comes after what — the autoplay coordinator holds
     * no array of items on purpose (see its header: an index-based autoplay is
     * exactly the bug that shipped on Android), and giving the player a
     * sequence would put that knowledge back.
     *
     * Wiring them anyway would also produce a specific, silly failure: the OS
     * jumps to the "next" video, the viewport has not moved, and the
     * coordinator immediately pauses it because the item on screen is still
     * the previous one. A button that undoes itself is worse than no button.
     *
     * A surface that genuinely HAS an ordered list — tube's up-next queue, a
     * full-screen reels pager where "next" really is one item — passes the
     * callbacks and gets the buttons. The decision belongs to whoever owns the
     * ordering, which is never this package.
     */
    if (wantsPrevious) {
      applyActionHandler(claim, "previoustrack", () => previousRef.current?.())
    }
    if (wantsNext) {
      applyActionHandler(claim, "nexttrack", () => nextRef.current?.())
    }

    // Seed both pieces of state immediately rather than waiting for the next
    // element event: a video that is already playing when it becomes active
    // fires nothing, and the lock screen would sit on "none" until it paused.
    const video = videoRef.current
    applyPlaybackState(claim, video && !video.paused && !video.ended ? "playing" : "paused")
    if (video) {
      applyPositionState(
        claim,
        safePositionState(video.duration, video.currentTime, video.playbackRate)
      )
    }

    return () => {
      claimRef.current = null
      // Only clears if this claim is still the owner — a late cleanup from a
      // preempted item must not wipe the live one. See `releaseMediaSession`.
      releaseMediaSession(claim)
    }
  }, [engaged, ownerId, key, wantsPrevious, wantsNext, videoRef])

  /* ── Keep it true while it plays ───────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!engaged || !video) return

    /**
     * Every publish reads the claim from the ref rather than closing over one,
     * which is what lets this effect stay attached across a metadata change
     * (which re-claims) without re-binding eight listeners.
     */
    const publish = () => {
      const claim = claimRef.current
      if (!claim) return
      applyPlaybackState(claim, video.paused || video.ended ? "paused" : "playing")
      applyPositionState(
        claim,
        safePositionState(video.duration, video.currentTime, video.playbackRate)
      )
    }

    /**
     * The moments the OS's own extrapolation stops being true. `waiting` is in
     * the list and `timeupdate` is not: a stall is the one thing that makes a
     * freely-running scrubber wrong, and a tick is the one thing that does not.
     *
     * `loadedmetadata` and `durationchange` are where a duration first stops
     * being NaN — before them `safePositionState` returns null and the OS
     * correctly shows no scrubber at all.
     */
    const EVENTS = [
      "play",
      "playing",
      "pause",
      "ended",
      "seeked",
      "ratechange",
      "waiting",
      "loadedmetadata",
      "durationchange",
    ] as const

    for (const name of EVENTS) video.addEventListener(name, publish)

    const timer = window.setInterval(() => {
      // A paused playhead does not drift, and re-publishing over a scrub the
      // person is in the middle of would fight them.
      if (video.paused || video.ended) return
      publish()
    }, POSITION_SYNC_INTERVAL_MS)

    return () => {
      for (const name of EVENTS) video.removeEventListener(name, publish)
      window.clearInterval(timer)
    }
  }, [engaged, videoRef])
}
