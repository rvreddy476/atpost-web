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
export type { CaptionSource, MomentumVideoProps, VideoSource } from "./MomentumVideo"

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
  chromeVisible,
  formatClock,
  intentOnActiveChange,
  keyAction,
  progressFraction,
  restingLineVisible,
  scrubTarget,
  scrubberVisible,
  seekTarget,
  shouldPlay,
  tapOutcome,
  toggleIntent,
} from "./controls"
export type { ChromeState, ControlAction, PlaybackIntent } from "./controls"

export {
  claimManualPlayback,
  releaseManualPlayback,
  revokeManualPlaybackExcept,
} from "./manualPlayback"

/**
 * Sound, and the one bit that decides whether the next video has any.
 *
 * `MomentumVideo` uses all of this on its own and a zone needs none of it —
 * there is no prop to pass and nothing to wire. It is exported because a
 * surface with its own transport (tube's watch page, a reels viewer) draws its
 * own speaker button and must move the same default when somebody presses it,
 * and because a "sound is on" indicator in a zone's chrome would read
 * `soundIsArmed`.
 *
 * Read the header of `soundPreference.ts` first. The rule that matters is that
 * this changes what a playback STARTS as and never what is already playing,
 * which is what keeps a click in the header from making a video blare.
 */
export {
  armSound,
  disarmSound,
  isActivationKey,
  noteUnmutedPlaybackRefused,
  soundIsArmed,
  watchForSoundGesture,
} from "./soundPreference"

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

/**
 * The full chrome, and the switch that turns it on.
 *
 * `chrome="full"` is the long-video player — speed, quality, captions, volume,
 * fullscreen, picture-in-picture, chapters, buffered ranges and a gear menu.
 * The DEFAULT is `"minimal"`, which is the transport the feed and reels have
 * always had, and `chromeFeatures("minimal")` returning all-false is the whole
 * of the compatibility promise. Read ./chrome.ts before changing a default.
 */
export { chromeFeatures, settingsMenuUseful } from "./chrome"
export type { PlayerChrome, PlayerFeatures } from "./chrome"

/**
 * The rules behind each optional control, as values.
 *
 * Exported for the same reason the transport rules above are: a surface that
 * draws its own speed control or its own chapter list must reach the same
 * answer this player does, and two implementations of "which chapter is
 * playing" drift. Nothing here touches a DOM.
 */
export {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  normalizeRate,
  parseRate,
  rateAriaLabel,
  rateIsNotable,
  rateLabel,
  readPlaybackRate,
  stepRate,
  writePlaybackRate,
} from "./playbackRate"

export {
  AUTO_LEVEL,
  autoLabel,
  currentQualityLabel,
  levelLabel,
  nearestLevelForHeight,
  parseQualityHeight,
  qualityMenuAvailable,
  qualityOptions,
  readQualityHeight,
  writeQualityHeight,
} from "./quality"
export type { LevelLike, QualityOption } from "./quality"

export {
  CAPTIONS_OFF,
  captionLabel,
  captionOptions,
  captionsAvailable,
  captionsButtonLabel,
  cueLines,
  cueText,
  findCaptionByLanguage,
  initialCaptionIndex,
  readCaptionLanguage,
  toggleCaptions,
  writeCaptionLanguage,
} from "./captions"
export type { CaptionOption, CaptionTrackLike } from "./captions"

export {
  DEFAULT_VOLUME,
  VOLUME_STEP,
  clampVolume,
  parseVolume,
  readVolume,
  stepVolume,
  volumeChange,
  volumeFromPointer,
  volumeOnUnmute,
  volumePercent,
  writeVolume,
} from "./volume"

export {
  activePlayerChapter,
  chapterMarks,
  currentChapterTitle,
  orderedPlayerChapters,
} from "./chapters"
export type { PlayerChapter } from "./chapters"

export { bufferedAhead, bufferedSpans, hoverFraction, tooltipLeftPercent } from "./scrubber"
export type { BufferedSpan, TimeRangesLike } from "./scrubber"

export { isOutsidePress, menuKeyAction, nextMenuIndex } from "./menu"
export type { MenuAction } from "./menu"

export {
  canFullscreen,
  canPictureInPicture,
  fullscreenLabel,
  pictureInPictureLabel,
} from "./presentation"

/**
 * The preference store, exported so a zone can namespace ITS OWN player
 * preference the same way rather than inventing a second key shape. Every
 * access is already wrapped: `localStorage` throws before a read in a browser
 * with site data blocked. See ./preferences.ts.
 */
export { clearPreference, preferenceKey, readPreference, writePreference } from "./preferences"

/**
 * The consumer-facing rules a zone with its own transport needs.
 *
 * `MomentumVideo` takes `videoRef`, `onTimeUpdate` and a CONTROLLED `muted`
 * because MShorts was otherwise querying the DOM for the `<video>` element and
 * driving it by hand. `resolveMuted` is the one worth reading: it is the whole
 * precedence ladder between a browser's refusal, this player's own answer, the
 * document-wide arming in `soundPreference.ts` and the prop's cold default.
 */
export {
  TIME_UPDATE_INTERVAL_MS,
  assignRef,
  mutedPropChanged,
  resolveMuted,
  shouldEmitTimeUpdate,
} from "./controlled"
export type { ElementRef, MutedInputs, TimeUpdateMemo } from "./controlled"
