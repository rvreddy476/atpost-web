"use client"

/**
 * Where @momentum/player's watch events become @momentum/analytics rows.
 *
 * The sibling of `apps/social/src/feed/useFeedAnalytics.ts`, and deliberately
 * the same shape: the mapping from a `WatchEvent` to a wire payload is a
 * property of the CONTRACT, not of the zone, so a reels-specific variation in
 * it would be a bug rather than a feature. What differs is only what this zone
 * genuinely owns — the transport (`./api`) and the surface (`./surface`).
 *
 * The surface value is not written down here on purpose. It has a whole file
 * of reasoning behind it; see `./surface.ts` before changing it.
 *
 * ── The one event this surface has that the feed does not ─────────────────
 * `follow_from_content`. It is one of the thirteen the server accepts and it
 * means exactly what happens here: somebody followed an author because of a
 * piece of content, from the content. The home feed has no follow control on
 * a card, so its analytics hook never had a reason to send it.
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

export interface ReelsAnalytics {
  /** The watch session for a reel, or undefined when it must not be measured. */
  sessionFor: (item: FeedItem, position: number) => WatchSessionInfo | undefined
  recordWatch: (item: FeedItem, session: WatchSessionInfo, event: WatchEvent) => void
  recordImpression: (
    item: FeedItem,
    position: number,
    visibleMs: number,
    autoplay: boolean
  ) => void
  recordEngagement: (type: AnalyticsEventType, item: FeedItem, position: number) => void
  flush: () => void
}

export function useReelsAnalytics(): ReelsAnalytics {
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
              // By DURATION, not by the post's declared content_type — 90s is
              // the split, and it is the server's rule as well as ours.
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
          // The view is over. The next time this reel plays it is a NEW view
          // and needs a new session id, or its play_end collides with this one
          // in the server's partial unique index and is thrown away. On a
          // looping surface this happens constantly.
          sessions.delete(item.id)
          break
      }

      if (queue.shouldFlush) void queue.flush()
    },
    [common, queue, sessions]
  )

  const recordImpression = useCallback(
    (item: FeedItem, position: number, visibleMs: number, autoplay: boolean) => {
      queue.enqueue({
        type: "impression",
        dedupeKey: "impression",
        payload: { ...common(item, position), visible_ms: visibleMs, is_autoplay: autoplay },
      })
      if (queue.shouldFlush) void queue.flush()
    },
    [common, queue]
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
   * view depends on. `pagehide` rather than `beforeunload` because bfcache and
   * mobile Safari do not reliably fire the latter.
   */
  useEffect(() => {
    const onLeave = () => void queue.flush()
    document.addEventListener("visibilitychange", onLeave)
    window.addEventListener("pagehide", onLeave)
    return () => {
      document.removeEventListener("visibilitychange", onLeave)
      window.removeEventListener("pagehide", onLeave)
    }
  }, [queue])

  return { sessionFor, recordWatch, recordImpression, recordEngagement, flush }
}
