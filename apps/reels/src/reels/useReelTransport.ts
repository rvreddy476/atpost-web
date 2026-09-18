"use client"

/**
 * This zone's transport, driven by the player's own props.
 *
 * ── What this used to be, and why it is worth writing down ────────────────
 * It used to find the `<video>` by querying the subtree `MomentumVideo` had
 * rendered — `container.querySelector("video")` — then set `muted` on it by
 * hand and re-state that on every `play`, because the `muted` prop was a cold
 * default the player stopped listening to. It worked, and it would have failed
 * silently on this surface the first day an element moved inside that package.
 * All three of the things it was reaching for are props now:
 *
 *   · `videoRef` — the real element, merged into the player's own ref, so a
 *     seek is an element API call rather than a DOM hunt;
 *   · `onTimeUpdate(currentMs, durationMs)` — throttled to 1s, let through
 *     immediately on a seek or a loop, and `0` rather than `NaN` before a
 *     duration is known. Four `addEventListener` calls went away with it, and
 *     so did the progress bar re-rendering at whatever rate the browser
 *     happened to fire `timeupdate` at;
 *   · `muted`, genuinely controlled — a CHANGE to the prop becomes this
 *     player's answer and outranks the document-wide arming, while a browser
 *     refusal still outranks everything. So nothing here touches `video.muted`
 *     any more, and `resolveMuted` in the package is the single place that
 *     precedence lives.
 *
 * ── What is still read off the element, and why that is not a workaround ──
 * `paused` and `started`. There is no `onPlay`/`onPause` prop and there does
 * not need to be one: these are two listeners on an element the package HANDED
 * us, which is what `videoRef` is for, rather than an element we went looking
 * for. If it is ever exposed as a callback this is four lines shorter.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 * A second owner of playback. `active` decides what MAY play; the coordinator
 * owns it and nothing here argues with it. `togglePlay` below is the PERSON
 * pausing the short in front of them — the hand-started case the package
 * arbitrates with `playbackId`, and the only thing on this surface that calls
 * `play()` or `pause()`.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { armSound, disarmSound } from "@momentum/player"
import { seekTarget } from "./transport"

export interface ReelTransport {
  /**
   * Hand this to `MomentumVideo`'s `videoRef`.
   *
   * A callback ref rather than an object one, because this hook has to
   * RE-RENDER when the element arrives — a bare `useRef` would be filled
   * silently and the transport would never know it had a video. It is
   * `useCallback`'d with no dependencies so its identity never changes, which
   * matters: the package's own note records that an unstable ref gets nulled
   * and re-set on every render.
   */
  attach: (element: HTMLVideoElement | null) => void
  /** Hand this to `MomentumVideo`'s `onTimeUpdate`. */
  onTimeUpdate: (currentMs: number, durationMs: number) => void
  video: HTMLVideoElement | null
  paused: boolean
  /**
   * Has this element ever played?
   *
   * The paused MARK hangs off this and not off `paused` alone, because a video
   * that has not started yet is also "paused" — so without it a big play glyph
   * flashes over the centre of every short for the half-second between the
   * player mounting and `play()` resolving, on every single swipe.
   */
  started: boolean
  currentSeconds: number
  durationSeconds: number
  /** Seek to a fraction in [0, 1] of the duration. */
  seek: (fraction: number) => void
  /** Returns what it became, so the caller can announce it. */
  togglePlay: () => "playing" | "paused"
}

export function useReelTransport(): ReelTransport {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [paused, setPaused] = useState(true)
  const [started, setStarted] = useState(false)
  const [currentSeconds, setCurrentSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)

  const attach = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    setVideo(element)
    if (!element) {
      // The short left the mount window. Everything the transport drew about
      // it is now about nothing, and a stale playhead left behind would be
      // painted over whatever takes this slot next.
      setPaused(true)
      setStarted(false)
      setCurrentSeconds(0)
      setDurationSeconds(0)
    }
  }, [])

  /**
   * Seconds, from the package's milliseconds.
   *
   * The conversion happens here and nowhere else. `durationMs` is 0 rather
   * than NaN before metadata arrives, which is why the arithmetic in
   * ./transport.ts can be about numbers instead of about `Number.isFinite` —
   * although it still guards, because it is also given `video.duration`
   * directly by `seek`.
   */
  const onTimeUpdate = useCallback((currentMs: number, durationMs: number) => {
    setCurrentSeconds(currentMs / 1000)
    setDurationSeconds(durationMs / 1000)
  }, [])

  /** Is it playing? Two listeners on the element the package handed us. */
  useEffect(() => {
    if (!video) return
    const onPlay = () => {
      setPaused(false)
      setStarted(true)
    }
    const onPause = () => setPaused(true)

    video.addEventListener("play", onPlay)
    video.addEventListener("playing", onPlay)
    video.addEventListener("pause", onPause)
    // `emptied` is a stop the browser does not announce as one: tearing a
    // source off an element sets `paused` back to true and fires this WITHOUT
    // firing `pause`. The player's own note records seeing exactly that in the
    // live feed, and a transport that missed it would draw a pause glyph over
    // a video that had stopped.
    video.addEventListener("emptied", onPause)
    setPaused(video.paused)

    return () => {
      video.removeEventListener("play", onPlay)
      video.removeEventListener("playing", onPlay)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("emptied", onPause)
    }
  }, [video])

  const seek = useCallback((fraction: number) => {
    const el = videoRef.current
    if (!el) return
    const duration = Number.isFinite(el.duration) ? el.duration : 0
    if (duration <= 0) return
    const target = seekTarget(fraction, duration)
    el.currentTime = target
    // Painted from here as well as from the player's own emit. The package
    // lets a seek through its throttle immediately, so this is the same number
    // one frame earlier — and the frame is the point, because a scrubber that
    // lags the finger reads as a scrubber that is not working.
    setCurrentSeconds(target)
  }, [])

  const togglePlay = useCallback((): "playing" | "paused" => {
    const el = videoRef.current
    if (!el) return "paused"
    if (el.paused) {
      // `play()` rejects rather than throwing when the browser refuses. The
      // element stays where it was and the `pause` listener above has already
      // told the UI so; there is nothing to say and nothing to repair.
      const attempt = el.play()
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => {})
      return "playing"
    }
    el.pause()
    return "paused"
  }, [])

  return {
    attach,
    onTimeUpdate,
    video,
    paused,
    started,
    currentSeconds,
    durationSeconds,
    seek,
    togglePlay,
  }
}

/**
 * The viewer's one sound answer, and the shared default it moves.
 *
 * ── One mute for the surface, which is the phone's model ──────────────────
 * The web feed has per-player mute because it shows twenty videos at once and
 * silencing one of them means that one. A full-screen shorts surface shows
 * ONE, and "the sound is off" is a statement about the session — press it and
 * the next short is silent too, which is what the phone does and what every
 * product in this shape does. The controlled `muted` prop is what carries it
 * now: a change to it becomes each player's own answer.
 *
 * ── It moves the package's default as well, and still must ────────────────
 * The prop settles the short on screen. `armSound` / `disarmSound` settles the
 * NEXT one, which mounts with the prop as a cold default and has had no change
 * to react to. It is also the only thing that clears a previous browser
 * refusal — a deliberate press of a speaker IS the gesture the browser was
 * holding out for — and `disarmSound` ends the module's inference for good, so
 * a later stray click cannot hand sound back to somebody who turned it off.
 *
 * Starting muted is not a preference: a browser refuses to start an unmuted
 * video before the document has been touched, and the refusal arrives as a
 * rejected promise — so an unmuted default is not louder, it is a short that
 * silently never plays.
 */
export function useSoundPreference(): { muted: boolean; setMuted: (next: boolean) => void } {
  const [muted, setMutedState] = useState(true)

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next)
    if (next) disarmSound()
    else armSound()
  }, [])

  return { muted, setMuted }
}
