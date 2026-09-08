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
 *
 * ── OS media controls, and the promise not to make ────────────────────────
 * `mediaSession` on MomentumVideo puts the playing item on the lock screen and
 * routes the headset and media keys to it. It does NOT make the page keep
 * playing with the screen off: a browser tab is throttled when it is hidden
 * and suspended when the phone locks, and no web API changes that. If a
 * roadmap item says "background audio", it means the native client. The full
 * statement is at the top of `mediaSession.ts` — read it before promising it.
 */
export { MomentumVideo, HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS } from "./MomentumVideo"
export type { MomentumVideoProps, VideoSource } from "./MomentumVideo"

// `visibleFraction` is exported because it is the ONE definition of "how much
// of this is on screen" the product has. @momentum/content's dwell tracker
// asks the same question about the same cards and must get the same answer:
// two implementations of this drifted once already, which is how an impression
// could be credited for pixels behind the header that autoplay refused to
// count. See the note on `visibleFraction` itself.
export { useAutoplayCoordinator, visibleFraction } from "./autoplay"
export type { AutoplayCoordinator, AutoplayOptions, Box, ViewportInset } from "./autoplay"

/**
 * The transport rules, as values.
 *
 * `shouldPlay` is the one to read: it is the only place the coordinator's
 * `active` and the PERSON's own play/pause decision meet. The
 * one-video-at-a-time invariant is now split across it,
 * `intentOnActiveChange`, and the arbitration in `manualPlayback.ts` — so
 * changing any one of the three without the other two is how it comes back.
 */
export {
  CONTROLS_HIDE_MS,
  SEEK_STEP_SECONDS,
  formatClock,
  intentOnActiveChange,
  keyAction,
  playGlyphVisible,
  progressFraction,
  restingLineVisible,
  scrubTarget,
  scrubberVisible,
  seekTarget,
  shouldPlay,
  toggleIntent,
} from "./controls"
export type { ChromeState, ControlAction, PlaybackIntent } from "./controls"

export {
  claimManualPlayback,
  releaseManualPlayback,
  revokeManualPlaybackExcept,
} from "./manualPlayback"

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

export {
  artworkFor,
  claimMediaSession,
  createMediaSessionClaim,
  hasMediaSession,
  holdsMediaSession,
  mediaSessionOwnerId,
  metadataForPost,
  metadataKey,
  releaseMediaSession,
  safePositionState,
} from "./mediaSession"
export type {
  MediaArtwork,
  MediaSessionClaim,
  MediaSessionInfo,
  MediaSessionMetadataInit,
  PositionState,
} from "./mediaSession"

export { useMediaSession, POSITION_SYNC_INTERVAL_MS } from "./useMediaSession"
export type { UseMediaSessionOptions } from "./useMediaSession"

export { WatchSession } from "./watchTracker"
export type { WatchEvent, WatchSessionInfo } from "./watchTracker"
