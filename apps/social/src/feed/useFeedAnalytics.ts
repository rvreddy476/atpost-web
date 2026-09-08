"use client"

/**
 * The zone's half of analytics: turning what happened into what the server
 * accepts, and deciding when to send.
 *
 * The split is the point. @momentum/analytics knows the contract and owns the
 * outbox but has no transport; @momentum/player knows how watching works but
 * emits semantic events, not wire payloads. This file is the only place the
 * two meet, and the only place `surface: "feed"` is written down — tube will
 * write `posttube` in its own equivalent and share everything else.
 *
 * ── Session ids are per VIEW ──────────────────────────────────────────────
 * Not per page load and not per app launch. The server dedupes `play_end` on
 * (actor, session, content) alone, so re-watching a flick with the same
 * session id means the second view's play_end is silently swallowed and the
 * creator is paid once for two views. A new id is minted every time an item
 * becomes the active one.
 *
 * ── What is honest here ───────────────────────────────────────────────────
 * `position` is the item's 1-based rank in the feed as delivered. It is
 * omitted rather than guessed when unknown, because the server keeps it only
 * when 1..10000 and a zero would be dropped anyway.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import type { FeedItem } from "@atpost/types/feed"
import {
  AnalyticsQueue,
  LIMITS,
  type AnalyticsEventType,
  type CommonPayload,
  type NegativeReason,
} from "@momentum/analytics"
import { analyticsContentType, type WatchEvent, type WatchSessionInfo } from "@momentum/player"
import { sendAnalytics } from "./api"

const SURFACE = "feed" as const

export interface FeedAnalytics {
  /** Start (or reuse) the watch session for the item that just became active. */
  sessionFor: (item: FeedItem, position: number) => WatchSessionInfo | undefined
  /** Map a player event onto the wire and queue it. */
  recordWatch: (item: FeedItem, session: WatchSessionInfo, event: WatchEvent) => void
  recordImpression: (item: FeedItem, position: number, visibleMs: number, autoplay: boolean) => void
  recordEngagement: (type: AnalyticsEventType, item: FeedItem, position: number) => void
  /**
   * `reason` is widened to `string` for the same reason the wire type is.
   *
   * A report's category is a MODERATION taxonomy — twelve values the trust-
   * and-safety queue routes on — while `NegativeReason` is a ranking signal
   * with eight. Five overlap; `analyticsReasonFor` maps those and passes the
   * rest through as their canonical string, which the ingest endpoint stores
   * as "unspecified". That is deliberately preferred to dropping the event: a
   * report is a strong negative signal whatever its category, and the category
   * is on the report row anyway. `NegativeSignalPayload.reason` is already
   * `NegativeReason | string` for exactly this, so this signature was the
   * narrower of the two rather than the safer one.
   */
  recordNegative: (
    type: "not_interested" | "report" | "block_creator",
    item: FeedItem,
    position: number,
    reason: NegativeReason | string
  ) => void
  flush: () => void
}

export function useFeedAnalytics(): FeedAnalytics {
  const queue = useMemo(
    () =>
      new AnalyticsQueue({
        transport: sendAnalytics,
        onDrop: (event, reason) => {
          if (process.env.NODE_ENV !== "production") {
            // Visible in development, silent in production. Telemetry that
            // logs to a real user's console is just noise in a bug report.
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
      // percent_viewed. It refuses to track rather than send a bad number.
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
            // The server dedupes heartbeats on event_id alone, so the sequence
            // key is purely local — it stops a re-render from queueing the
            // same beat twice.
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
          // The view is over. The next time this item plays it is a NEW view
          // and needs a new session id, or its play_end collides with this one
          // in the server's partial unique index and is thrown away.
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
      queue.enqueue({
        type,
        // `comment_create` is the one engagement type the server does NOT
        // collapse per session, so collapsing it locally would throw away real
        // second and third comments. Everything else gets the default
        // "session" key from the queue.
        ...(type === "comment_create" ? { dedupeKey: "" } : {}),
        payload: common(item, position),
      })
      // Engagement is rare and interesting; send it rather than wait for 50.
      void queue.flush()
    },
    [common, queue]
  )

  const recordNegative = useCallback(
    (
      type: "not_interested" | "report" | "block_creator",
      item: FeedItem,
      position: number,
      reason: NegativeReason | string
    ) => {
      queue.enqueue({ type, payload: { ...common(item, position), reason } })
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
   * Leaving is the most important flush there is: it is the one carrying the
   * `play_end` for whatever was on screen, and that event is what the payout
   * for the last view depends on. `pagehide` rather than `beforeunload`
   * because bfcache and mobile Safari do not reliably fire the latter.
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

  return {
    sessionFor,
    recordWatch,
    recordImpression,
    recordEngagement,
    recordNegative,
    flush,
  }
}
