"use client"

/**
 * Where @momentum/player's watch events become @momentum/analytics rows.
 *
 * The sibling of `apps/social/src/feed/useFeedAnalytics.ts` and
 * `apps/reels/src/reels/useReelsAnalytics.ts`, and deliberately the same
 * shape: the mapping from a `WatchEvent` to a wire payload is a property of
 * the CONTRACT, not of the zone, so a tube-specific variation in it would be a
 * bug rather than a feature. What differs is only what this zone genuinely
 * owns — the transport (`./api`) and the surface (`./surface`).
 *
 * The surface value is not written down here on purpose. It has a whole file
 * of reasoning behind it; see `./surface.ts` before changing it.
 *
 * ── Two events the feed's version has that this one does not ──────────────
 * `impression` is not sent from this zone. It means "this was on screen in a
 * list for N milliseconds", which is a question about a feed of cards; a watch
 * page is one video that somebody navigated to on purpose, and the `play_start`
 * that follows a beat later is a strictly stronger signal about the same act.
 * The browse grid does not send one either, for the reason in
 * ../browse/card.ts: it mounts no players and measures nothing, so there is no
 * visibility clock running for an impression to read.
 *
 * `follow_from_content` IS sent, and this is one of the two surfaces that can:
 * the watch page has a Follow button next to the channel, so somebody
 * following an author because of a video, from the video, is a real thing that
 * happens here.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  AnalyticsQueue,
  LIMITS,
  type AnalyticsEventType,
  type CommonPayload,
} from "@momentum/analytics"
import { analyticsContentType, type WatchEvent, type WatchSessionInfo } from "@momentum/player"
import type { FeedItem } from "@atpost/types/feed"
import { sendAnalytics } from "./api"
import { SURFACE } from "./surface"

export interface TubeAnalytics {
  /** The watch session for a video, or undefined when it must not be measured. */
  sessionFor: (item: FeedItem, position: number) => WatchSessionInfo | undefined
  recordWatch: (item: FeedItem, session: WatchSessionInfo, event: WatchEvent) => void
  recordEngagement: (type: AnalyticsEventType, item: FeedItem, position: number) => void
  flush: () => void
}

export function useTubeAnalytics(): TubeAnalytics {
  const queue = useMemo(
    () =>
      new AnalyticsQueue({
        transport: sendAnalytics,
        onDrop: (event, reason) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[analytics] dropped ${event.type}: ${reason}`)
          }
        },
      }),
    []
  )

  /** contentId -> the session id for the view currently in progress. */
  const sessions = useRef(new Map<string, WatchSessionInfo>()).current

  const common = useCallback(
    (item: FeedItem, position: number, sessionId?: string): CommonPayload => ({
      content_id: item.id,
      // Omitted rather than sent empty: a present-but-non-UUID session_id
      // fails the whole batch of 200, not just this row.
      ...(sessionId ? { session_id: sessionId } : {}),
      surface: SURFACE,
      creator_id: item.author_id,
      // 1-based, and omitted rather than sent as 0 when we do not know it.
      ...(position > 0 ? { position } : {}),
    }),
    []
  )

  const sessionFor = useCallback(
    (item: FeedItem, position: number): WatchSessionInfo | undefined => {
      const media = (item.media ?? []).find((m) => m.kind === "video")
      const duration = media?.duration_ms ?? 0
      // A zero duration would make the server divide by zero computing
      // percent_viewed, which is half of what a creator is paid on. Refuse to
      // measure rather than send a number that cannot be right.
      if (!media || duration <= 0) return undefined

      const existing = sessions.get(item.id)
      if (existing) return existing

      const info: WatchSessionInfo = {
        sessionId:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${item.id}-${Date.now()}`,
        contentId: item.id,
        contentDurationMs: duration,
        surface: SURFACE,
        position: position > 0 ? position : undefined,
        creatorId: item.author_id,
      }
      sessions.set(item.id, info)
      return info
    },
    [sessions]
  )

  const recordWatch = useCallback(
    (item: FeedItem, session: WatchSessionInfo, event: WatchEvent) => {
      const base = common(item, session.position ?? 0, session.sessionId)

      switch (event.kind) {
        case "play_start":
          queue.enqueue({
            type: "play_start",
            dedupeKey: "start",
            payload: {
              ...base,
              content_duration_ms: event.contentDurationMs,
              // By DURATION, not by the post's declared content_type. That is
              // the server's rule as well as ours, and on THIS surface the two
              // genuinely disagree: `postclassify.Classify` sends a landscape
              // clip of any length to `long_video`, so a twelve-second
              // landscape video is a `long_video` post whose watch events are
              // correctly measured on the short-form ladder. Sending the post's
              // own type here would put it on the wrong one.
              content_type: analyticsContentType(event.contentDurationMs),
              start_method: event.startMethod,
              is_muted: event.isMuted,
              is_autoplay: event.isAutoplay,
              time_to_first_frame_ms: Math.round(event.timeToFirstFrameMs),
              initial_buffer_ms: Math.round(event.initialBufferMs),
            },
          })
          break

        case "heartbeat":
          queue.enqueue({
            type: "watch_heartbeat",
            dedupeKey: `hb-${event.sequence}`,
            payload: {
              ...base,
              watched_ms_increment: event.watchedMsIncrement,
              watched_ms_total: event.watchedMsTotal,
              playhead_position_ms: event.playheadPositionMs,
              buffering_ms_increment: event.bufferingMsIncrement,
              seek_count_increment: event.seekCountIncrement,
              playback_speed: event.playbackSpeed,
              loop_count: event.loopCount,
              content_duration_ms: event.contentDurationMs,
            },
          })
          break

        case "milestone":
          queue.enqueue({
            type: "milestone",
            dedupeKey: event.milestone,
            payload: { ...base, milestone_type: event.milestone, watched_ms: event.watchedMs },
          })
          break

        case "play_end":
          queue.enqueue({
            type: "play_end",
            dedupeKey: "end",
            payload: {
              ...base,
              watched_ms_total: event.watchedMsTotal,
              max_continuous_watch_ms: event.maxContinuousWatchMs,
              content_duration_ms: event.contentDurationMs,
              content_type: analyticsContentType(event.contentDurationMs),
              loop_count: event.loopCount,
              end_reason: event.endReason,
            },
          })
          // The view is over. The next time this video plays it is a NEW view
          // and needs a new session id, or its play_end collides with this one
          // in the server's partial unique index and is thrown away.
          sessions.delete(item.id)
          break
      }

      if (queue.shouldFlush) void queue.flush()
    },
    [common, queue, sessions]
  )

  const recordEngagement = useCallback(
    (type: AnalyticsEventType, item: FeedItem, position: number) => {
      queue.enqueue({ type, payload: common(item, position) })
      // Engagement is rare and interesting; send it rather than wait for 50.
      void queue.flush()
    },
    [common, queue]
  )

  const flush = useCallback(() => void queue.flush(), [queue])

  /** The foreground cadence, matching the Android client's five minutes. */
  useEffect(() => {
    const id = window.setInterval(() => void queue.flush(), LIMITS.FLUSH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [queue])

  /**
   * Leaving is the most important flush there is: it carries the `play_end`
   * for whatever was on screen, and that event is what the payout for the last
   * view depends on. It matters more on a long video than on a reel, because
   * the number it carries is bigger. `pagehide` rather than `beforeunload`
   * because bfcache and mobile Safari do not reliably fire the latter.
   *
   * ── The unmount flush is not belt-and-braces, and it is new ───────────────
   * Neither of those events fires for an IN-PAGE navigation, and until the
   * watch page grew a recommendations rail and a series list there was no way
   * to go from one video to another without a document load — so the gap could
   * not be reached. It can now, and it loses exactly the wrong event: the watch
   * page keys its `<Watch>` on the post id, so following a recommendation
   * unmounts the tree, @momentum/player fires `play_end` on the way out, the
   * queue holding it is discarded with the component, and the next video builds
   * a new one. A whole view's `watched_ms_total` and `max_continuous_watch_ms`
   * would be thrown away — the numbers a creator is paid from — and nothing
   * anywhere would look like an error.
   *
   * The cleanup runs AFTER the child's, so the `play_end` enqueued during
   * teardown is already in this queue when this fires. `flush` is fire-and-
   * forget; the request outlives the component, which is the point.
   */
  useEffect(() => {
    const onLeave = () => void queue.flush()
    document.addEventListener("visibilitychange", onLeave)
    window.addEventListener("pagehide", onLeave)
    return () => {
      document.removeEventListener("visibilitychange", onLeave)
      window.removeEventListener("pagehide", onLeave)
      onLeave()
    }
  }, [queue])

  return { sessionFor, recordWatch, recordEngagement, flush }
}
