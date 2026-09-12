"use client"

/**
 * Where the video is, and how to move it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS READS THE DOM INSTEAD OF TAKING A PROP
 *
 * Chapters seek. Cards and end screens appear at timestamps. Resume sets the
 * playhead once the duration is known. All four need the media element, and
 * `MomentumVideo` exposes neither a ref to it nor a `currentTime` callback —
 * its props are a source, an `active` flag and watch EVENTS, which are a
 * measurement stream rather than a transport.
 *
 * Two ways to get one:
 *
 *   · widen @momentum/player with an imperative handle. It is the tidier
 *     boundary and it is the right answer eventually — but that package is
 *     mounted by three zones, its `watchTracker` owns the seek accounting that
 *     a creator is paid from, and a seek API added from outside without
 *     touching that accounting is how a scrub becomes a view. It is not a
 *     change to make from a page.
 *
 *   · find the one `<video>` inside the box this page already owns. The box is
 *     this component's own element — `expand.ref` is on it — and `MomentumVideo`
 *     renders exactly one media element inside it. That is what this does.
 *
 * The reach is narrow and honest: one `querySelector`, read-only except for
 * `currentTime`, and it degrades to "no chapters, no resume, no overlays" if the
 * element is ever not there rather than throwing. The player keeps owning
 * play/pause, sound and measurement; this only reads a clock and moves it.
 *
 * The one exception is `replay`, which also calls `play()`. It is the same two
 * lines the player's own transport runs when its button is pressed on an ended
 * video (`if (video.ended) video.currentTime = 0; video.play()`), reached
 * from the end screen's Replay control, and it is the only write here that is
 * not a seek. A Replay that rewound and then sat paused at a poster would be a
 * button called Replay that does not replay.
 *
 * ── The element arrives late, so it is not looked for once ────────────────
 * The box is rendered before the player decides it has anything to play, and on
 * a post with no playable media the `<video>` never appears at all. A single
 * `querySelector` in a mount effect therefore finds nothing on the first pass
 * and never looks again. A MutationObserver on the box catches it whenever it
 * lands — including after a `NoPicture` state is replaced by a real player.
 */

import { useCallback, useEffect, useRef, useState } from "react"

export interface Playhead {
  /** Milliseconds into the video. 0 before the element exists. */
  positionMs: number
  /**
   * The element's own duration in milliseconds, or 0 while it is unknown.
   *
   * Not the post's `duration_ms`. They disagree — a trimmed video's metadata
   * can lag its media — and everything on this page that clamps, seeks or
   * decides "near the end" must use the number the element will actually
   * honour. The post's duration is still the right one for ANALYTICS, which is
   * why @momentum/player is given that one and this is not.
   */
  durationMs: number
  /** The media element fired `ended`. Cleared when it plays again. */
  ended: boolean
  /** True once a media element has been found and has reported metadata. */
  ready: boolean
  /** Move the playhead. A no-op when there is no element or no duration yet. */
  seek: (ms: number) => void
  /** Back to the start, and playing. What the end screen's Replay does. */
  replay: () => void
}

export function usePlayhead(box: HTMLElement | null): Playhead {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [ended, setEnded] = useState(false)
  const [ready, setReady] = useState(false)

  /**
   * Hold the element in a ref as well as in state.
   *
   * `seek` must not be re-created every time the playhead moves — it is passed
   * to every chapter row, and a new identity four times a second would
   * re-render the whole list on a video that is simply playing.
   */
  const videoRef = useRef<HTMLVideoElement | null>(null)
  videoRef.current = video

  /** Find the media element, now or whenever it appears. */
  useEffect(() => {
    if (!box) {
      setVideo(null)
      return
    }
    const find = () => {
      const found = box.querySelector("video")
      setVideo((prev) => (prev === found ? prev : found))
    }
    find()
    const observer = new MutationObserver(find)
    observer.observe(box, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [box])

  /**
   * Subscribe.
   *
   * `timeupdate` is the cheap clock — browsers fire it about four times a
   * second, which is the right resolution for a chapter highlight and for a
   * card that appears at a whole second. `seeked` is listened for as well
   * because a scrub can move the playhead a long way between two `timeupdate`s,
   * and a card that appears eight seconds after somebody scrubbed past its
   * moment is a card appearing at random.
   *
   * `durationchange` rather than only `loadedmetadata`: an HLS stream's
   * duration is refined after the first playlist, and a live-ish or still-
   * transcoding source can report `Infinity` first. Infinity is stored as 0 —
   * "unknown" — because every consumer of this treats 0 as unknown and would
   * treat Infinity as a video that never ends.
   */
  useEffect(() => {
    if (!video) {
      setReady(false)
      return
    }

    const readTime = () => setPositionMs(Math.max(0, video.currentTime * 1000))
    const readDuration = () => {
      const seconds = video.duration
      const known = Number.isFinite(seconds) && seconds > 0
      setDurationMs(known ? seconds * 1000 : 0)
      if (known) setReady(true)
    }
    const onEnded = () => {
      setEnded(true)
      readTime()
    }
    const onPlaying = () => setEnded(false)

    readTime()
    readDuration()

    video.addEventListener("timeupdate", readTime)
    video.addEventListener("seeked", readTime)
    video.addEventListener("loadedmetadata", readDuration)
    video.addEventListener("durationchange", readDuration)
    video.addEventListener("ended", onEnded)
    video.addEventListener("playing", onPlaying)
    return () => {
      video.removeEventListener("timeupdate", readTime)
      video.removeEventListener("seeked", readTime)
      video.removeEventListener("loadedmetadata", readDuration)
      video.removeEventListener("durationchange", readDuration)
      video.removeEventListener("ended", onEnded)
      video.removeEventListener("playing", onPlaying)
    }
  }, [video])

  /**
   * Move the playhead.
   *
   * The optimistic `setPositionMs` matters: `seeked` can be several hundred
   * milliseconds away on an HLS source that has to fetch a segment, and without
   * it a chapter row stays highlighted on the OLD chapter for that whole time,
   * which reads as a click that did nothing.
   *
   * Wrapped because assigning `currentTime` on an element whose source has
   * failed to attach throws `InvalidStateError` on some browsers, and a chapter
   * click must not be able to break the page.
   */
  const seek = useCallback((ms: number) => {
    const el = videoRef.current
    if (!el) return
    const target = Math.max(0, ms)
    try {
      el.currentTime = target / 1000
      setPositionMs(target)
      setEnded(false)
    } catch {
      // Nothing to do and nothing to say: the picture is either not attached
      // yet or gone, and both already show on this page as their own state.
    }
  }, [])

  /**
   * Rewind and play.
   *
   * `play()` returns a promise that REJECTS rather than throwing when the
   * browser refuses, and here it cannot reasonably refuse: Replay is a button,
   * so the call is attributed to a gesture. The catch is for the same
   * detached-source case `seek` guards, and for the one thing a rejection
   * would otherwise become, which is an unhandled-promise line in the console
   * for a video that simply stayed at its poster.
   */
  const replay = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    try {
      el.currentTime = 0
      setPositionMs(0)
      setEnded(false)
      void el.play().catch(() => undefined)
    } catch {
      // See `seek`.
    }
  }, [])

  return { positionMs, durationMs, ended, ready, seek, replay }
}
