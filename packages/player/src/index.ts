/**
 * @momentum/player — HLS playback, the autoplay policy, and watch measurement.
 *
 *   import { MomentumVideo, useAutoplayCoordinator } from "@momentum/player"
 *
 * The boundary: this package takes a source and emits events. It imports no
 * API client and builds no URLs, so the zone owns every network decision and
 * tube can mount the same player against a different analytics surface. The
 * pure half — `isPlayable`, `mayAutoplay`, `WatchSession` — has no React in it
 * at all and is where the rules that matter are written down.
 */
export { MomentumVideo, HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS } from "./MomentumVideo"
export type { MomentumVideoProps, VideoSource } from "./MomentumVideo"

export { useAutoplayCoordinator } from "./autoplay"
export type { AutoplayCoordinator, AutoplayOptions } from "./autoplay"

export {
  analyticsContentType,
  areVariantsExpired,
  isModerationCleared,
  isPlayable,
  isTranscodeReady,
  mayAutoplay,
  pickPoster,
  pickProgressive,
  prefersReducedMotion,
  primaryVideo,
} from "./playability"

export { WatchSession } from "./watchTracker"
export type { WatchEvent, WatchSessionInfo } from "./watchTracker"
