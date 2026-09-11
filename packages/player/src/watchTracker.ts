/**
 * Watch measurement — the numbers a creator is paid on.
 *
 * A port of Android's `VideoWatchTracker`, kept deliberately close to it,
 * because the two clients' numbers land in the same table and a web view that
 * measures watch time differently from a phone view is a payout bug that shows
 * up as an unexplainable difference in a dashboard months later.
 *
 * ── Why the client cannot simply send the answer ──────────────────────────
 * `is_display_view` and `percent_viewed` — the two fields the payout actually
 * reads — are computed BY THE SERVER, in ingest.go, from `watched_ms_total`,
 * `content_duration_ms` and `loop_count`, using the server's own label for the
 * content. A copy sent by a client is dropped. So there is no way to be
 * generous or careless here and have it not matter: the only lever a client
 * has on what a creator is paid is whether those three numbers are true.
 *
 * ── Which is why watch time comes from the PLAYHEAD ───────────────────────
 * Two clocks, on purpose:
 *
 *   SAMPLE every 1s — read `currentTime` and add the DELTA. Wall-clock time
 *   would count buffering, a paused tab and a stalled network as watching. The
 *   playhead only moves when frames are actually being shown.
 *
 *   REPORT every 5s — and only when some watching has happened since the last
 *   report. A stalled video emits no heartbeats at all, rather than a run of
 *   heartbeats claiming zero.
 *
 * A seek contributes NOTHING. A jump backwards, or forwards by more than two
 * ticks' worth of playback — the tick as actually measured, never less than
 * the nominal interval — is a seek and not viewing; otherwise dragging the
 * scrubber to the end would pay out a full view.
 *
 * ── Loops ─────────────────────────────────────────────────────────────────
 * A short flick loops, and a loop is a backwards jump that IS viewing. It is
 * distinguished from a seek by where it came from and where it landed: from
 * near the end to near the beginning. Getting this wrong in the other
 * direction — counting every rewind as a loop — would let a scrubber inflate
 * watch time without limit, which is why `loop_count` is capped at 20 and the
 * server refuses more.
 */

import {
  PERCENT_LADDER,
  timeLadderFor,
  type AnalyticsSurface,
  type EndReason,
  type StartMethod,
} from "@momentum/analytics"
import { analyticsContentType } from "./playability"

export const SAMPLE_INTERVAL_MS = 1_000
export const HEARTBEAT_INTERVAL_MS = 5_000
/** A backwards jump only counts as a loop if it started this close to the end. */
const LOOP_TAIL_MS = 1_500
const MAX_LOOP_COUNT = 20

/**
 * The semantic events this tracker emits.
 *
 * They are NOT the analytics wire shape. The tracker says what happened; the
 * zone decides what to do with it. That separation is what lets tube attach a
 * different analytics surface, and lets a test assert on watch time without a
 * queue anywhere in sight.
 */
export type WatchEvent =
  | {
      kind: "play_start"
      startMethod: StartMethod
      isMuted: boolean
      isAutoplay: boolean
      timeToFirstFrameMs: number
      initialBufferMs: number
      contentDurationMs: number
    }
  | {
      kind: "heartbeat"
      /** 1-based, for the local dedupe key. Not a wire field. */
      sequence: number
      /**
       * The loops so far, capped like play_end's. A session that loses its
       * final event (tab closed, M-08) is finalised from its heartbeats, and
       * without this the server could only credit one pass of a looped flick
       * (M-29): its clamp is duration x (loops + 1).
       */
      loopCount: number
      /** So the server can clamp each running total as it arrives (M-26). */
      contentDurationMs: number
      watchedMsIncrement: number
      watchedMsTotal: number
      playheadPositionMs: number
      bufferingMsIncrement: number
      seekCountIncrement: number
      playbackSpeed: number
    }
  | { kind: "milestone"; milestone: string; watchedMs: number }
  | {
      kind: "play_end"
      endReason: EndReason
      watchedMsTotal: number
      maxContinuousWatchMs: number
      contentDurationMs: number
      loopCount: number
    }

export interface WatchSessionInfo {
  /** Per-VIEW, not per-app-launch. A re-watch mints a new one. */
  sessionId: string
  contentId: string
  contentDurationMs: number
  surface: AnalyticsSurface
  position?: number
  creatorId?: string
}

interface Mutable {
  watchedMs: number
  continuousMs: number
  maxContinuousMs: number
  bufferingMs: number
  seekCount: number
  loopCount: number
  lastPlayheadMs: number

  watchedAtLastHeartbeat: number
  bufferingAtLastHeartbeat: number
  seeksAtLastHeartbeat: number
  msSinceHeartbeat: number
  heartbeatSequence: number

  started: boolean
  ended: boolean
  milestonesSent: Set<string>
}

/**
 * One view of one piece of content.
 *
 * Framework-free by design: it is driven by `sample()` calls and knows nothing
 * about a `<video>` element, React, or a timer. The hook in ./useWatchTracker
 * supplies those. That is what makes the loop and seek arithmetic testable.
 */
export class WatchSession {
  private readonly emit: (event: WatchEvent) => void
  private readonly state: Mutable
  readonly info: WatchSessionInfo

  constructor(info: WatchSessionInfo, emit: (event: WatchEvent) => void) {
    this.info = info
    this.emit = emit
    this.state = {
      watchedMs: 0,
      continuousMs: 0,
      maxContinuousMs: 0,
      bufferingMs: 0,
      seekCount: 0,
      loopCount: 0,
      lastPlayheadMs: 0,
      watchedAtLastHeartbeat: 0,
      bufferingAtLastHeartbeat: 0,
      seeksAtLastHeartbeat: 0,
      msSinceHeartbeat: 0,
      heartbeatSequence: 0,
      started: false,
      ended: false,
      milestonesSent: new Set(),
    }
  }

  get watchedMs(): number {
    return this.state.watchedMs
  }

  get hasStarted(): boolean {
    return this.state.started
  }

  /**
   * The first frame is on screen.
   *
   * Refuses a zero or negative duration outright: the server divides by it to
   * get `percent_viewed`, and a duration of zero is either a metadata bug or a
   * live stream, neither of which should be reporting a percentage.
   */
  start(opts: {
    startMethod: StartMethod
    isMuted: boolean
    isAutoplay: boolean
    timeToFirstFrameMs: number
    initialBufferMs?: number
    playheadMs?: number
  }): void {
    if (this.state.started || this.state.ended) return
    if (this.info.contentDurationMs <= 0) return

    this.state.started = true
    this.state.lastPlayheadMs = opts.playheadMs ?? 0
    this.emit({
      kind: "play_start",
      startMethod: opts.startMethod,
      isMuted: opts.isMuted,
      isAutoplay: opts.isAutoplay,
      timeToFirstFrameMs: clamp(opts.timeToFirstFrameMs, 0, 600_000),
      initialBufferMs: clamp(opts.initialBufferMs ?? 0, 0, 600_000),
      contentDurationMs: this.info.contentDurationMs,
    })
  }

  /**
   * One 1-second tick.
   *
   * `playheadMs` is where the video is now; `elapsedMs` is how much wall-clock
   * time passed; `buffering` says the element was stalled for this tick. The
   * caller supplies elapsed rather than this class reading a clock so that a
   * test can drive a whole minute of viewing in a loop.
   */
  sample(playheadMs: number, elapsedMs: number, buffering = false): void {
    if (!this.state.started || this.state.ended) return

    const s = this.state
    const duration = this.info.contentDurationMs
    const delta = playheadMs - s.lastPlayheadMs

    if (buffering) {
      s.bufferingMs += elapsedMs
    }

    // A wrap from near the end to near the start is a loop, and the frames
    // between the old position and the end were genuinely watched.
    const wrapped =
      duration > 0 && s.lastPlayheadMs >= duration - LOOP_TAIL_MS && playheadMs <= LOOP_TAIL_MS

    if (wrapped) {
      if (s.loopCount < MAX_LOOP_COUNT) s.loopCount += 1
      const tail = Math.max(0, duration - s.lastPlayheadMs) + Math.max(0, playheadMs)
      s.watchedMs += tail
      s.continuousMs += tail
    } else {
      // Two ticks of headroom, scaled by playback rate, so that a dropped frame
      // or a slow tick is not mistaken for a scrub. The tick is the MEASURED
      // one: a setInterval is not promised its interval, and hls.js parsing on
      // a scrolling feed routinely lands a 2-3s tick during continuous
      // playback — sizing the ceiling from the nominal interval charged that
      // as a seek, discarded the watch time and sent a false seek count
      // (M-27, fixture slow_tick_continuous_watch). The nominal interval stays
      // as the floor so a fast tick cannot shrink the ceiling either.
      const tickMs = Math.max(Number.isFinite(elapsedMs) ? elapsedMs : 0, SAMPLE_INTERVAL_MS)
      const ceiling = tickMs * 2 * Math.max(1, this.playbackSpeed)
      if (delta < 0 || delta > ceiling) {
        // A seek. No watch time, and the continuous run is broken.
        s.seekCount += 1
        s.maxContinuousMs = Math.max(s.maxContinuousMs, s.continuousMs)
        s.continuousMs = 0
      } else if (delta > 0) {
        s.watchedMs += delta
        s.continuousMs += delta
      }
      // delta === 0 is a paused or stalled tick: nothing is added, which is
      // the entire reason watch time is read from the playhead.
    }

    s.maxContinuousMs = Math.max(s.maxContinuousMs, s.continuousMs)
    s.lastPlayheadMs = playheadMs
    s.msSinceHeartbeat += elapsedMs

    this.emitMilestones()

    if (s.msSinceHeartbeat >= HEARTBEAT_INTERVAL_MS && s.watchedMs > s.watchedAtLastHeartbeat) {
      this.emitHeartbeat(playheadMs)
    }
  }

  /** Playback rate, used only to size the seek ceiling. */
  playbackSpeed = 1

  private emitHeartbeat(playheadMs: number): void {
    const s = this.state
    s.heartbeatSequence += 1
    const watchedIncrement = clamp(s.watchedMs - s.watchedAtLastHeartbeat, 0, s.watchedMs)

    this.emit({
      kind: "heartbeat",
      sequence: s.heartbeatSequence,
      loopCount: Math.min(s.loopCount, MAX_LOOP_COUNT),
      contentDurationMs: this.info.contentDurationMs,
      watchedMsIncrement: Math.round(watchedIncrement),
      watchedMsTotal: Math.round(s.watchedMs),
      playheadPositionMs: Math.max(0, Math.round(playheadMs)),
      bufferingMsIncrement: clamp(Math.round(s.bufferingMs - s.bufferingAtLastHeartbeat), 0, 600_000),
      seekCountIncrement: clamp(s.seekCount - s.seeksAtLastHeartbeat, 0, 1_000),
      playbackSpeed: clamp(this.playbackSpeed, 0.25, 4),
    })

    s.watchedAtLastHeartbeat = s.watchedMs
    s.bufferingAtLastHeartbeat = s.bufferingMs
    s.seeksAtLastHeartbeat = s.seekCount
    s.msSinceHeartbeat = 0
  }

  /**
   * Fire any threshold newly crossed.
   *
   * Each fires exactly once per session — a rewatch of the same ten seconds
   * must not fire VIEW_10S twice — which is what `milestonesSent` is for. The
   * time ladder is chosen by duration, matching the server's classification;
   * the percent ladder is the same for both.
   */
  private emitMilestones(): void {
    const s = this.state
    if (!s.started) return

    const watched = s.watchedMs
    for (const step of timeLadderFor(this.info.contentDurationMs)) {
      if (watched >= step.thresholdMs && !s.milestonesSent.has(step.name)) {
        s.milestonesSent.add(step.name)
        this.emit({ kind: "milestone", milestone: step.name, watchedMs: Math.round(watched) })
      }
    }

    if (this.info.contentDurationMs > 0) {
      const percent = (watched * 100) / this.info.contentDurationMs
      for (const step of PERCENT_LADDER) {
        if (percent >= step.percent && !s.milestonesSent.has(step.name)) {
          s.milestonesSent.add(step.name)
          this.emit({ kind: "milestone", milestone: step.name, watchedMs: Math.round(watched) })
        }
      }
    }
  }

  /**
   * End the view. Idempotent, and that is load-bearing.
   *
   * The server has a partial unique index on (actor, session, content) for
   * `play_end` alone, so a SECOND play_end for one view is swallowed whatever
   * `event_id` it carries — no error, no retry, just a number that never
   * arrives. A web player has at least three ways to end a view (scrolled
   * away, tab hidden, component unmounted) and they routinely happen together,
   * so this has to be the thing that stops it rather than the queue.
   */
  end(endReason: EndReason): void {
    if (this.state.ended) return
    this.state.ended = true
    if (!this.state.started) return

    const s = this.state
    const watched = Math.round(s.watchedMs)
    this.emit({
      kind: "play_end",
      endReason,
      watchedMsTotal: watched,
      // Cannot exceed the total: the server rejects the batch if it does.
      maxContinuousWatchMs: Math.min(Math.round(Math.max(s.maxContinuousMs, s.continuousMs)), watched),
      contentDurationMs: this.info.contentDurationMs,
      loopCount: Math.min(s.loopCount, MAX_LOOP_COUNT),
    })
  }
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, v))
}

export { analyticsContentType }
