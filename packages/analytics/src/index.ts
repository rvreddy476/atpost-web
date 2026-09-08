/**
 * @momentum/analytics — the 13-event creator-payout contract, and the outbox.
 *
 *   import { AnalyticsQueue } from "@momentum/analytics"
 *
 * There is no URL and no HTTP client in this package. Construct the queue with
 * a `transport` — a function that takes events and reports ok / transient /
 * permanent / unauthenticated — and the zone decides how they reach the
 * gateway. That is what lets reels, tube and the feed share one implementation
 * of batching, dedupe, retry and bisection while each keeps its own wiring,
 * and it is what makes the whole thing testable without a network.
 */
export {
  LIMITS,
  LONG_VIDEO_LADDER,
  PERCENT_LADDER,
  SHORT_FORM_LADDER,
  SHORT_FORM_MAX_DURATION_MS,
  timeLadderFor,
} from "./contract"
export type {
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsPayload,
  AnalyticsSurface,
  AnalyticsTransport,
  CommonPayload,
  EndReason,
  EngagementPayload,
  ImpressionPayload,
  IngestResult,
  MilestonePayload,
  NegativeReason,
  NegativeSignalPayload,
  PlayEndPayload,
  PlayStartPayload,
  QueuedEvent,
  SendOutcome,
  StartMethod,
  WatchHeartbeatPayload,
} from "./contract"

export { AnalyticsQueue, randomEventId } from "./queue"
export type { EnqueueInput, QueueOptions } from "./queue"

export { isFreshTimestamp, isValidContentId, isValidEvent, isValidSessionId, validateEvent } from "./validate"
