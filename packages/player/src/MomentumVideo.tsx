"use client"

/**
 * The video element, and everything about getting bytes into it.
 *
 * ── The rule this package exists to enforce ───────────────────────────────
 * There is no API client in here and no URL is constructed. A caller passes a
 * source it has already resolved, and gets events back. That is what lets tube
 * mount the same player against different analytics, and it is the only reason
 * any of this can be tested — a player that fetched its own feed would need a
 * gateway to render a rectangle.
 *
 * ── HLS ───────────────────────────────────────────────────────────────────
 * hls.js where Media Source Extensions exist, the browser's own HLS where they
 * do not (iOS Safari), and a progressive MP4 if neither works. That order is
 * deliberate and is the opposite of the intuitive one — see the long note at
 * the attach site for the Chrome behaviour that makes "prefer native" wrong.
 *
 * hls.js is imported DYNAMICALLY: it is ~500KB, the feed's first paint is
 * mostly text posts, and a browser that never scrolls to a video should never
 * pay for it. The import happens on the first attach, not on module load.
 *
 * ── Credentials, and why not on everything ────────────────────────────────
 * The playlists are same-origin gateway paths and need the session cookie —
 * the manifest 404s without it. The SEGMENTS inside the child playlist are
 * absolute, pre-signed URLs on the media host, and sending credentials to
 * those would fail CORS outright: a cross-origin credentialed request cannot
 * be answered with `Access-Control-Allow-Origin: *`, which is what an object
 * store returns. So `withCredentials` is set per request, by origin, and never
 * blanket-on. Getting this backwards produces a video that loads its manifest
 * and then stalls forever with a CORS error nobody reads.
 *
 * ── Autoplay is a promise, not an exception ───────────────────────────────
 * `video.play()` returns a promise that REJECTS when the browser refuses. It
 * does not throw, so a bare `video.play()` produces an unhandled rejection in
 * the console and no video, with nothing pointing at the cause. Every call
 * here is caught, and the first autoplay of a session starts muted, because
 * muted is the only state a browser will start unprompted.
 *
 * A refused UNMUTED start is not swallowed: it falls back to muted and plays
 * anyway, because a silent video is a disappointment and a dead frame is a bug
 * report. See the rejection handler in the play effect.
 *
 * ── Sound, and the reason it arrives on the second video ──────────────────
 * The product wants sound. Browsers will not give it before the document has
 * been touched, so the rule is: start muted, and once a real gesture has
 * happened, every playback that STARTS from then on starts with sound — which
 * in practice means from the second video onward, the same as Instagram and
 * TikTok on the web.
 *
 * The bit lives in `soundPreference.ts` and is read here imperatively, at a
 * play start and nowhere else. That is deliberate and is the whole safety
 * argument: a video already playing when somebody clicks a like button cannot
 * hear about it, so a click in the header can never make a card three
 * positions down start blaring. Read that file's header before touching any
 * of this.
 *
 * ── Controls: the three conditions, and where mute now lives ──────────────
 * This element used to have no transport at all. A click toggled mute, there
 * was no way to stop a video, and the mute state belonged to the whole feed —
 * one button in the feed header that silenced twenty players at once, which
 * is not what a person means when they turn the sound off on a video.
 *
 * Both are fixed here rather than in the zone, and deliberately so: sound and
 * playback are properties of A PLAYER, so they live with the player and every
 * surface that mounts one — feed, carousel page, tube — gets them for free.
 *
 *   · MUTE is per player. `muted` is now the DEFAULT (still true for a cold
 *     document, because a browser refuses an unmuted autoplay), and the first
 *     time a person touches this player's speaker it stops listening to every
 *     default there is. What IS shared is only the default: a press of a
 *     speaker, or the document's first gesture, changes what the next
 *     untouched video starts as. It never reaches into a player that has been
 *     given an answer, and it never changes a video that is already running.
 *   · PLAY/PAUSE is user intent, and it is a THIRD condition on top of
 *     `active`. `controls.ts` is where the three meet; read `shouldPlay` and
 *     `intentOnActiveChange` there before changing anything in this file,
 *     because the one-video-at-a-time invariant is split across them and
 *     `manualPlayback.ts`.
 *
 * ── The shape of the transport, and the button that is NOT here ───────────
 * A real player's shape, which is VLC's and QuickTime's and YouTube's:
 *
 *     ┌──────────────────────────────────────── [speaker] ─┐
 *     │                                                     │
 *     │                     the picture                     │
 *     │                                                     │
 *     │  ────────────────●──────────────────────────────    │  seek
 *     │  ▶  0:12 / 1:04                                     │  transport
 *     └─────────────────────────────────────────────────────┘
 *
 * SPEAKER top-right, on its own, in the one corner nothing else wants. It is
 * the control people reach for most and the one that must never move.
 *
 * PLAY/PAUSE bottom-left with the seek bar above it and the clock beside it —
 * out of the picture, along an edge, where a transport belongs.
 *
 * THERE IS NO CENTRE BUTTON, and its removal is the point of this layout
 * rather than a side effect. A 56px disc in the middle of a feed video sits
 * exactly where a person is trying to look, covers the frame, and does the
 * same job as pressing the picture behind it — so a fade at the wrong moment
 * reads as "the pause button doesn't work". `chromeVisible` in controls.ts
 * carries the full argument. Pressing the picture still toggles play/pause;
 * that behaviour was always right and is untouched.
 *
 * The whole transport HIDES while the video plays and comes back on hover, on
 * keyboard focus, or on a tap, then fades again CONTROLS_HIDE_MS after the
 * last interaction. A hidden control is not a tab stop and is `aria-hidden`,
 * so nothing that cannot be seen can be reached by Tab or read aloud.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import type Hls from "hls.js"
import {
  CONTROLS_HIDE_MS,
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
  type PlaybackIntent,
} from "./controls"
import { chromeFeatures, settingsMenuUseful, type PlayerChrome, type PlayerFeatures } from "./chrome"
import {
  CaptionsGlyph,
  MaximizeGlyph,
  MinimizeGlyph,
  PauseGlyph,
  PictureInPictureGlyph,
  PlayGlyph,
  SettingsGlyph,
  Volume2Glyph,
  VolumeXGlyph,
} from "./icons"
import { SettingsMenu, type MenuRow } from "./SettingsMenu"
import {
  PLAYBACK_RATES,
  normalizeRate,
  rateAriaLabel,
  rateIsNotable,
  rateLabel,
  readPlaybackRate,
  stepRate,
  writePlaybackRate,
} from "./playbackRate"
import {
  AUTO_LEVEL,
  currentQualityLabel,
  nearestLevelForHeight,
  qualityMenuAvailable,
  qualityOptions,
  readQualityHeight,
  writeQualityHeight,
  type LevelLike,
} from "./quality"
import {
  CAPTIONS_OFF,
  captionOptions,
  captionsAvailable,
  captionsButtonLabel,
  cueLines,
  initialCaptionIndex,
  readCaptionLanguage,
  toggleCaptions,
  writeCaptionLanguage,
  type CaptionTrackLike,
} from "./captions"
import {
  clampVolume,
  readVolume,
  stepVolume,
  volumeChange,
  volumeFromPointer,
  volumeOnUnmute,
  volumePercent,
  writeVolume,
} from "./volume"
import {
  activePlayerChapter,
  chapterMarks,
  orderedPlayerChapters,
  type PlayerChapter,
} from "./chapters"
import { bufferedSpans, hoverFraction, tooltipLeftPercent, type BufferedSpan } from "./scrubber"
import {
  assignRef,
  mutedPropChanged,
  resolveMuted,
  shouldEmitTimeUpdate,
  type ElementRef,
  type TimeUpdateMemo,
} from "./controlled"
import { isOutsidePress, menuKeyAction } from "./menu"
import {
  canFullscreen,
  canPictureInPicture,
  fullscreenLabel,
  pictureInPictureLabel,
} from "./presentation"
import { claimManualPlayback, releaseManualPlayback, revokeManualPlaybackExcept } from "./manualPlayback"
import {
  armSound,
  disarmSound,
  noteUnmutedPlaybackRefused,
  soundIsArmed,
  watchForSoundGesture,
} from "./soundPreference"
import type { MediaSessionInfo } from "./mediaSession"
import { useMediaSession } from "./useMediaSession"
import { HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS, WatchSession, type WatchEvent, type WatchSessionInfo } from "./watchTracker"

export interface VideoSource {
  /** Same-origin gateway path to a master playlist. Preferred. */
  hlsUrl?: string
  /** A signed progressive MP4, used when HLS will not attach. */
  progressiveUrl?: string
  posterUrl?: string
  durationMs?: number
  width?: number
  height?: number
}

/**
 * One subtitle track, as `GET /v1/subtitles/{mediaId}` describes it.
 *
 * The package does not fetch that list and never will — the zone does, and
 * hands the rows here. Each `src` is the WebVTT endpoint
 * (`/v1/subtitles/{mediaId}/track/{language}.vtt`), which this renders as a
 * `<track>` child.
 *
 * ── Credentials, and the thing this component cannot do ───────────────────
 * A `<track>` has no credentials mode of its own. Its fetch follows the
 * `<video>`'s `crossorigin` attribute, and that attribute is NOT set here and
 * must not be: it governs the MEDIA fetch as well, and the segments in a child
 * playlist are absolute, pre-signed, cross-origin URLs that a credentialed
 * request cannot load at all (an object store answers
 * `Access-Control-Allow-Origin: *`, which is illegal for a credentialed
 * response). That is the same line `xhrSetup` draws for hls.js.
 *
 * So: a SAME-ORIGIN `src` sends the session cookie and works, which is what a
 * gateway path is. A CROSS-ORIGIN `src` needing credentials cannot be made to
 * work from here, and the symptom is silent — the track exists, the cues never
 * arrive, and the CC button turns on nothing. The zone's way out is to fetch
 * the VTT itself, with credentials, and pass a `blob:` URL in `src`.
 */
export interface CaptionSource {
  /** BCP-47, as the subtitles API reports it. Becomes `srclang`. */
  language: string
  /** The human name for the menu. */
  label: string
  /** The WebVTT URL, or a `blob:` URL the zone made from a fetched body. */
  src: string
  /**
   * The publisher said this video should be watched with this track on.
   *
   * Honoured only where the viewer has said nothing — see
   * `initialCaptionIndex`. The viewer's own remembered language always wins.
   */
  default?: boolean
  /** `subtitles` (a translation) or `captions` (sound as well as speech). */
  kind?: "subtitles" | "captions"
}

export interface MomentumVideoProps {
  source: VideoSource
  /**
   * Should this be playing? Owned by the coordinator, never by this component:
   * an element that decided for itself would be a second place the
   * one-video-at-a-time rule could be broken.
   */
  active: boolean
  /**
   * The DEFAULT sound state for a COLD document, not a shared one.
   *
   * True, and it has to be: a browser refuses to start an unmuted video
   * unprompted, and the refusal arrives as a rejected promise rather than an
   * exception — so an unmuted autoplay is not "louder", it is a video that
   * silently never starts.
   *
   * It is the weakest of three inputs and is overruled in turn by each of the
   * other two:
   *
   *   · once the document has had a real user gesture, a playback STARTING
   *     from then on starts with sound instead — see `soundPreference.ts`, and
   *     note that it changes what starts, never what is already running;
   *   · once a person has used THIS player's speaker, their choice wins over
   *     every DEFAULT. That is what makes mute per player rather than per
   *     feed: a feed-wide toggle meant scrolling changed the volume of a video
   *     you had never touched.
   *
   * ── It is also CONTROLLED, and that is not a contradiction ──────────────
   * A consumer with its own mute button — MShorts has one — needs this to be a
   * two-way value, and the version of that which breaks everything is "the
   * prop wins on every render": @momentum/content's feed and apps/reels both
   * pass a CONSTANT, so this player's own speaker would be overwritten a frame
   * after it was pressed and the button would appear dead.
   *
   * So a CHANGE to this prop is what is authoritative, never its value.
   * Passing the same boolean for ever behaves exactly as it always has; moving
   * it is the consumer making the same kind of statement a press of our
   * speaker makes, and it becomes this player's answer — which outranks the
   * document-wide arming in `soundPreference.ts`, because arming only decides
   * what an UNTOUCHED player starts as. A browser's refusal still outranks all
   * of it. `resolveMuted` in ./controlled.ts is the whole ladder, tested.
   */
  muted: boolean
  /**
   * A stable id for this player, used only to arbitrate hand-started playback
   * between players — see `manualPlayback.ts`. Omit and the arbitration is
   * skipped, which is safe on a surface that mounts exactly one player.
   */
  playbackId?: string
  loop?: boolean
  /**
   * Classes for the player's box — which MUST position it.
   *
   * `absolute inset-0` inside a sized frame is what the feed passes and what
   * this is built for; `relative` on a box of your own is equally fine. The
   * controls are absolutely placed inside this element, so an unpositioned box
   * would let them escape to the nearest positioned ancestor — which, in a
   * feed, is a card several hundred pixels away.
   *
   * Nothing is appended to what you pass. See the note at the render site for
   * the bug that rule exists to prevent.
   */
  className?: string
  /**
   * Draw the transport controls. On by default.
   *
   * A surface with its own chrome — a full-bleed reels viewer that draws its
   * own scrubber — turns this off and keeps everything else.
   */
  controls?: boolean
  /**
   * WHICH controls, which is a different question from whether there are any.
   *
   * `"minimal"` (the default) is the transport the feed and reels have always
   * had and must keep: play/pause, a speaker, a seek bar, and the original
   * keyboard map. `"full"` is the long-video player — speed, quality,
   * captions, a volume slider, fullscreen, picture-in-picture, chapters,
   * buffered ranges and a gear menu, plus the five extra chords.
   *
   * The default is the small one on purpose. A caller that says nothing gets
   * exactly the player it had before any of this existed; see ./chrome.ts.
   */
  chrome?: PlayerChrome
  /**
   * Individual overrides on top of `chrome`, for a caller that draws one of
   * these itself. Tube passes `{ fullscreen: false }` because its own expand
   * control (apps/tube/src/watch/expand.ts) owns the page-level layout and the
   * theatre fallback — two fullscreen buttons in one corner is the duplication
   * this exists to prevent. `undefined` means "say nothing", not "off".
   */
  features?: Partial<PlayerFeatures>
  /**
   * Who is watching, for the preference keys only.
   *
   * Speed, quality, caption language and volume are remembered per viewer, so
   * two people sharing a machine do not inherit each other's settings. Omit it
   * and everything is stored under one shared anonymous key, which is the
   * honest answer for a signed-out visitor. It is never sent anywhere: this
   * package still makes no requests.
   */
  viewerId?: string | null
  /**
   * Chapter marks for the scrubber and the title beside the clock.
   *
   * Two fields, deliberately not the wire shape — see ./chapters.ts. Drawn
   * only with the `chapters` feature on, and only once the duration is known.
   */
  chapters?: readonly PlayerChapter[]
  /**
   * The subtitle tracks for this video, from `GET /v1/subtitles/{mediaId}`.
   *
   * Rendered as `<track>` children — the existence of that path is why the
   * `media-has-caption` lint suppression is gone from the element below. HLS
   * subtitle renditions need none of this: hls.js puts those on the element by
   * itself and the player finds them in `textTracks` either way, so the two
   * kinds end up in one menu.
   *
   * Empty or omitted and no `<track>` is rendered; with no HLS renditions
   * either, the CC button is absent rather than disabled. Read `CaptionSource`
   * for what a cross-origin `src` cannot do.
   */
  captions?: readonly CaptionSource[]
  /**
   * The element to take fullscreen. Defaults to the player's own box.
   *
   * It is a getter rather than a ref object so a caller holding the element in
   * STATE (which tube does — the same element feeds `useExpand` and
   * `usePlayhead`) can pass it without an adapter. Whatever it returns must
   * never be re-parented: moving the player would unmount hls.js and the
   * WatchSession with it. ./presentation.ts has the full argument.
   */
  fullscreenTarget?: () => HTMLElement | null
  /**
   * Delegate fullscreen to the caller instead of calling the API here.
   *
   * Supply this and the player's button and the `f` key call it, and
   * `isFullscreen` drives the glyph. It is how tube keeps ONE owner for an
   * expansion that also has a theatre fallback and a document scroll lock.
   */
  onToggleFullscreen?: () => void
  /** The caller's fullscreen state, when it is the caller's to own. */
  isFullscreen?: boolean
  /** Describes the video for a screen reader. From the post's alt text. */
  ariaLabel?: string
  /** Watch measurement. Omit and nothing is tracked. */
  session?: WatchSessionInfo
  onWatchEvent?: (event: WatchEvent) => void
  /**
   * What the OS should say this is — the lock screen, the headset button, the
   * media keys. Omit and no media session is claimed at all.
   *
   * Only claimed while `active`, so the one item the coordinator chose is the
   * one the operating system describes. Read the header of `mediaSession.ts`
   * before building a feature on this: it does NOT give the page background
   * audio, and never will.
   */
  mediaSession?: MediaSessionInfo | null
  /**
   * Lock-screen skip buttons. Wired ONLY when supplied, and a feed must not
   * supply them — see the long note at the registration site in
   * `useMediaSession`. A surface with a real ordered queue should.
   */
  onPreviousTrack?: () => void
  onNextTrack?: () => void
  /** Fired when neither HLS nor the progressive fallback would load. */
  onUnplayable?: () => void
  /**
   * Told, not asked.
   *
   * The player owns its own sound now, so this is a notification with the new
   * value — for a zone that wants to remember a preference or count it — and
   * NOT the thing that performs the toggle. A caller that ignores it loses
   * nothing.
   */
  onToggleMuted?: (nextMuted: boolean) => void
  /**
   * The `<video>` element itself, for a zone with its own transport.
   *
   * ── Why this exists, which is worth writing down ────────────────────────
   * Because MShorts was querying the DOM for it — `container.querySelector
   * ("video")` — and driving it directly. That works exactly until an element
   * moves inside this package, and then it fails on somebody else's surface,
   * silently, with nothing pointing here. A prop cannot rot that way.
   *
   * It is the real element and not an imperative handle, deliberately: the
   * things a zone wants it for (`currentTime`, `requestPictureInPicture`, a
   * canvas grab) are element APIs, and a handle would be this package guessing
   * which of them anybody will ever need.
   *
   * What it is NOT is a second owner of playback. `active`, `intent` and the
   * one-video-at-a-time rule are still this component's, and a zone that calls
   * `play()` on this element behind the coordinator's back will be paused by
   * it a frame later. Use `active` for that.
   *
   * Both ref shapes work — an object from `useRef`, or a callback.
   */
  videoRef?: ElementRef<HTMLVideoElement>
  /**
   * Where the playhead is, throttled, for a zone drawing its own progress bar.
   *
   * Milliseconds, both of them, because the wire contract and the watch
   * tracker are in milliseconds and a consumer converting between two units to
   * talk to two halves of one package is a bug waiting to happen.
   * `durationMs` is 0 until metadata arrives — not NaN, which is what the
   * element reports and what would propagate into a caller's arithmetic.
   *
   * Throttled to `TIME_UPDATE_INTERVAL_MS`, with seeks let through
   * immediately; see `shouldEmitTimeUpdate` for why both halves of that
   * matter. The element's own `timeupdate` fires at a rate the browser
   * chooses, so passing it through raw would hand a consumer an unpredictable
   * render rate per video.
   *
   * It is NOT the watch tracker. Nothing a caller does with this reaches
   * analytics; `session`/`onWatchEvent` are still the only path there, and the
   * numbers a creator is paid from do not come through here.
   */
  onTimeUpdate?: (currentMs: number, durationMs: number) => void
  /**
   * Last chance to fix up a PLAYLIST url before it is fetched. The zone's job,
   * not this package's — see the note above `pLoader` below.
   */
  resolveUrl?: (url: string) => string
}

type AttachState = "idle" | "attaching" | "ready" | "failed"

/** Same-origin means "send the cookie". Anything else must not get one. */
function isSameOrigin(url: string): boolean {
  if (url.startsWith("/")) return true
  if (typeof window === "undefined") return false
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

export function MomentumVideo({
  source,
  active,
  muted,
  playbackId,
  loop = false,
  className,
  controls = true,
  chrome: chromeKind = "minimal",
  features: featureOverrides,
  viewerId,
  chapters: chapterProp,
  captions: captionSources,
  fullscreenTarget,
  onToggleFullscreen,
  isFullscreen: isFullscreenProp,
  ariaLabel,
  session,
  onWatchEvent,
  mediaSession,
  onPreviousTrack,
  onNextTrack,
  onUnplayable,
  onToggleMuted,
  videoRef: forwardedVideoRef,
  onTimeUpdate,
  resolveUrl,
}: MomentumVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [attach, setAttach] = useState<AttachState>("idle")
  const [usingProgressive, setUsingProgressive] = useState(false)

  /* ── Which controls exist at all ──────────────────────────────────────── */

  /**
   * Recomputed every render and that is fine: it is a ten-boolean object built
   * from two props, it is never an effect dependency (the individual booleans
   * are), and memoising it on an override object a caller writes inline would
   * memoise nothing.
   */
  const features = chromeFeatures(chromeKind, featureOverrides)
  /** For the handlers, which run outside a render. */
  const featuresRef = useRef(features)
  featuresRef.current = features
  const viewerRef = useRef(viewerId)
  viewerRef.current = viewerId

  /* ── Speed, quality, captions, volume ─────────────────────────────────── */

  /**
   * The speed, in React and never read back off the element.
   *
   * `video.playbackRate` is reset to 1 by the media element's LOAD ALGORITHM,
   * which runs on every `src` change and every hls.js re-attach — so a rate
   * held only on the element silently returns to normal when the source
   * switches, which is the one requirement this has beyond "set a number".
   * Holding it here and re-applying it on each attach is what survives that.
   *
   * Read from storage lazily, once, and only when the feature is on: a feed of
   * twenty cards must not touch localStorage twenty times for a control it
   * does not draw.
   */
  const [rate, setRate] = useState(() =>
    chromeFeatures(chromeKind, featureOverrides).speed ? readPlaybackRate(viewerId) : 1
  )

  /** The ladder hls.js reported, and where it is. Empty on native and MP4. */
  const [levels, setLevels] = useState<LevelLike[]>([])
  const [currentLevel, setCurrentLevel] = useState(AUTO_LEVEL)
  const [selectedLevel, setSelectedLevel] = useState(AUTO_LEVEL)

  /** The element's text tracks, as rows, and which one is on. */
  const [captionRows, setCaptionRows] = useState<CaptionTrackLike[]>([])
  const [captionIndex, setCaptionIndex] = useState(CAPTIONS_OFF)
  const [cues, setCues] = useState<string[]>([])

  /**
   * The level, separate from mute, which is the point of having both.
   *
   * See ./volume.ts: implementing mute as `volume = 0` loses the level a
   * person set, so unmuting has nowhere to go but full.
   */
  const [volume, setVolume] = useState(() =>
    chromeFeatures(chromeKind, featureOverrides).volume ? readVolume(viewerId) : 1
  )

  /* ── The person's two decisions ───────────────────────────────────────── */

  /**
   * Null until they touch the speaker, and their answer for ever after.
   *
   * Not seeded from the prop and then diverging — that would be two sources
   * for one value, and the second render would overwrite the first choice.
   * `null` is "nobody has said", which is a different thing from "muted", and
   * is what lets a default flow through until it is overruled.
   */
  const [userMuted, setUserMuted] = useState<boolean | null>(null)

  /**
   * Did THIS playback start with sound because the document had been touched?
   *
   * Set once, at a play start, from `soundIsArmed()` — never from a render and
   * never from a subscription. That is the whole of the non-retroactivity
   * guarantee: a video already running when somebody clicks a like button
   * cannot hear about it, so it cannot suddenly speak. See the header of
   * `soundPreference.ts`.
   */
  const [startedWithSound, setStartedWithSound] = useState(false)

  /**
   * The browser refused an unmuted start on this element.
   *
   * It outranks everything, including an explicit unmute, because it is not an
   * opinion — the element is muted, and a speaker glyph claiming otherwise
   * would be the UI lying about audio. Cleared at the next play start and by
   * the next press of the speaker, both of which are fresh attempts.
   */
  const [refusedUnmuted, setRefusedUnmuted] = useState(false)

  /**
   * Three defaults and one choice, in precedence order.
   *
   * The prop is the FEED's default, `startedWithSound` is the DOCUMENT's
   * default once a gesture has happened, and `userMuted` is this person's
   * answer for this video — which beats both, for ever, and is the rule that
   * makes mute per player rather than per feed. Sound-after-gesture changes
   * what an untouched player defaults to; it may not overrule somebody who has
   * already told this player what they want.
   */
  const isMuted = resolveMuted({
    prop: muted,
    answered: userMuted,
    startedWithSound,
    refused: refusedUnmuted,
  })

  /**
   * A CHANGED `muted` prop becomes this player's answer.
   *
   * The whole of "controlled", and the reason it is an effect on a change
   * rather than a term in the expression above: the feed and reels pass a
   * constant, and a prop that won on every render would overwrite a speaker
   * press one frame after it happened. `mutedPropChanged` treats the first
   * render as no change, so a default stays a default.
   *
   * It does NOT arm or disarm the document. Only a real gesture on a speaker
   * moves what OTHER players default to — a consumer re-rendering with a new
   * boolean is not a person pressing anything, and letting a render change
   * global sound state is how a click in a header ends up unmuting a card
   * three positions down. This player follows the prop; every other player is
   * still `soundPreference.ts`'s business.
   */
  const prevMutedProp = useRef<boolean | null>(null)
  useEffect(() => {
    if (!mutedPropChanged(prevMutedProp.current, muted)) {
      prevMutedProp.current = muted
      return
    }
    prevMutedProp.current = muted
    setUserMuted(muted)
    // The refusal was about the LAST attempt. A consumer moving this is very
    // often doing it from inside its own button's handler, which is exactly
    // the gesture the browser was holding out for, so the latch is a fresh
    // question again. If it refuses once more it re-latches immediately.
    setRefusedUnmuted(false)
  }, [muted])

  /**
   * Watch for the document's first gesture while this player exists.
   *
   * Refcounted inside the module: twenty players install three listeners
   * between them, and the first gesture removes them. Mounting is also what
   * starts the clock — a click that happened before there was any video on the
   * page cannot arm sound.
   */
  useEffect(() => watchForSoundGesture(), [])

  /** "auto" until they press something. See `controls.ts`. */
  const [intent, setIntent] = useState<PlaybackIntent>("auto")

  /**
   * Whether the ELEMENT is stopped, which is not the same as `intent`.
   *
   * Read from the element's own `play`/`pause` events rather than computed,
   * because three other things move it: a refused autoplay, the
   * `visibilitychange` handler below, and the OS media controls, whose play
   * and pause handlers in `useMediaSession` act on the element directly. A
   * button drawn from `intent` would show "pause" over a video the lock screen
   * had already stopped.
   */
  const [elementPaused, setElementPaused] = useState(true)

  const watchRef = useRef<WatchSession | null>(null)
  const attachStartedAt = useRef<number>(0)
  const bufferingRef = useRef(false)

  /**
   * The callback is held in a ref and the emitter is STABLE.
   *
   * This is not a micro-optimisation, it is the difference between measuring a
   * view and destroying it. A caller naturally writes
   * `onWatchEvent={(e) => record(item, session, e)}` — a new function identity
   * on every render. If the tracker effect depended on it, every render would
   * tear the WatchSession down, fire a `play_end` on the way out, and start a
   * fresh one with the counters back at zero. A feed re-renders on every
   * scroll frame, so a thirty-second view would arrive at the server as
   * several dozen views of nothing and a creator would be paid for none of it.
   */
  const onWatchEventRef = useRef(onWatchEvent)
  onWatchEventRef.current = onWatchEvent
  const emit = useCallback((event: WatchEvent) => {
    onWatchEventRef.current?.(event)
  }, [])

  /**
   * `onUnplayable` gets the same treatment, and for a failure that is even
   * harder to see.
   *
   * A caller writes `onUnplayable={() => onStale(item.id)}` — a new identity
   * every render. With that in the attach effect's dependencies, every render
   * destroys the hls.js instance and builds another one, and each new instance
   * starts over by fetching the master playlist. Nothing errors: the player
   * just never gets far enough to request a level, so every video sits at
   * readyState 0 for ever.
   *
   * It was measured on this feed before the fix — 208 master-playlist requests
   * for 14 videos, zero child playlists, zero segments, and an empty console.
   */
  const onUnplayableRef = useRef(onUnplayable)
  onUnplayableRef.current = onUnplayable

  /* ── The element, handed to a caller that asked for it ────────────────── */

  /**
   * One callback ref, feeding two places: ours and theirs.
   *
   * `useCallback([])`, because React DETACHES a changed callback ref — it
   * calls the old one with `null` before calling the new one with the element.
   * An inline arrow here would therefore null our own `videoRef` on every
   * render, and every effect in this file that starts `const video =
   * videoRef.current; if (!video) return` would begin doing nothing.
   */
  const forwardedVideoRefHeld = useRef(forwardedVideoRef)
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    assignRef(forwardedVideoRefHeld.current, element)
  }, [])

  /**
   * A caller that swaps which ref it passes gets the element moved across.
   *
   * Rare, and cheap to support. The old one is cleared first, because a stale
   * ref still holding an element is a consumer reading `currentTime` off a
   * video it no longer owns.
   */
  useEffect(() => {
    if (forwardedVideoRefHeld.current === forwardedVideoRef) return
    assignRef(forwardedVideoRefHeld.current, null)
    forwardedVideoRefHeld.current = forwardedVideoRef
    assignRef(forwardedVideoRef, videoRef.current)
  }, [forwardedVideoRef])

  /* ── The playhead, for a consumer's own progress bar ──────────────────── */

  /**
   * Same treatment as `onWatchEvent`, for the same reason: a caller writes
   * `onTimeUpdate={(ms) => setProgress(ms)}` — a new identity every render —
   * and anything that DEPENDED on it would be rebuilt four times a second.
   */
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate
  const timeUpdateMemo = useRef<TimeUpdateMemo>({ lastEmitAtMs: null, lastCurrentMs: 0 })

  /**
   * `force` is for the events that are not a tick: metadata arriving, and a
   * duration changing. A consumer waiting a whole second to be told how long
   * the video is draws a progress bar with no end on it.
   */
  const emitTimeUpdate = useCallback((video: HTMLVideoElement, force = false) => {
    const listener = onTimeUpdateRef.current
    if (!listener) return
    const currentMs = video.currentTime * 1000
    const now = performance.now()
    if (!force && !shouldEmitTimeUpdate(timeUpdateMemo.current, now, currentMs)) return
    timeUpdateMemo.current = { lastEmitAtMs: now, lastCurrentMs: currentMs }
    // 0 rather than NaN for a duration the element has not worked out yet:
    // NaN propagates silently through a caller's arithmetic and comes out as
    // an empty progress bar with no error anywhere.
    const d = video.duration
    listener(currentMs, Number.isFinite(d) ? d * 1000 : 0)
  }, [])

  /** A new source is a new timeline, so the throttle starts over. */
  useEffect(() => {
    timeUpdateMemo.current = { lastEmitAtMs: null, lastCurrentMs: 0 }
  }, [source.hlsUrl, source.progressiveUrl])

  /* ── Attaching a source ───────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    const resolve = resolveUrl ?? ((u: string) => u)
    const hlsUrl = source.hlsUrl ? resolve(source.hlsUrl) : undefined
    const progressive = source.progressiveUrl

    /*
      A new source is a new ladder, and the old one must not survive the
      switch: the quality menu would otherwise offer heights from the previous
      video and `hls.currentLevel` would be set to an index that means
      something different now. Auto is the right state to land in — see the
      note on remembering a HEIGHT rather than an index in ./quality.ts.
    */
    setLevels([])
    setCurrentLevel(AUTO_LEVEL)
    setSelectedLevel(AUTO_LEVEL)

    /** Last resort. Also the FIRST resort when there is no HLS URL at all. */
    const fallbackToProgressive = () => {
      if (cancelled) return
      if (!progressive) {
        setAttach("failed")
        onUnplayableRef.current?.()
        return
      }
      setUsingProgressive(true)
      video.src = progressive
      setAttach("ready")
    }

    attachStartedAt.current = performance.now()

    if (!hlsUrl) {
      fallbackToProgressive()
      return () => {
        cancelled = true
      }
    }

    /**
     * hls.js FIRST, native HLS only as a fallback.
     *
     * The tempting order is the other way round — "use the browser's own
     * implementation when it has one" — and it is wrong, because
     * `canPlayType("application/vnd.apple.mpegurl")` cannot be trusted. Chrome
     * answers "maybe" for it and then cannot play an m3u8 at all: the element
     * takes the URL, sits at readyState 0, and never errors. Verified on this
     * feed — every video showed its poster and nothing else, with an empty
     * console, until this order was flipped.
     *
     * hls.js's own guidance is this order, and it degrades correctly: iOS
     * Safari has no Media Source Extensions, so `isSupported()` is false there
     * and native takes over, which is exactly where native is the real thing.
     */
    setAttach("attaching")
    let hls: Hls | null = null

    /** Native HLS, for a browser that genuinely has it. */
    const attachNativeHls = () => {
      if (cancelled) return
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl
        setAttach("ready")
        return
      }
      fallbackToProgressive()
    }

    import("hls.js")
      .then(({ default: HlsCtor }) => {
        if (cancelled) return
        if (!HlsCtor.isSupported()) {
          attachNativeHls()
          return
        }

        /**
         * Rewrite PLAYLIST urls, and only playlist urls.
         *
         * The master playlist's child references are absolute paths generated
         * by media-service — `/v1/media/{id}/hls/360p.m3u8` — and a player
         * resolves those against the ORIGIN, so under a zone basePath they
         * miss the proxy entirely and every video stalls after the manifest
         * with no error worth reading.
         *
         * The fix cannot live in this package: only the zone knows what its
         * own prefix is. So the zone supplies `resolveUrl` and it is applied
         * here, at the one place a playlist url is about to be fetched.
         *
         * `pLoader`, NOT `loader`. Fragment urls are absolute, pre-signed
         * links to the media host; putting a zone prefix on one would produce
         * a 404 and putting our cookie on one would fail CORS. Playlists are
         * ours, segments are not, and hls.js draws exactly that line.
         */
        interface PlaylistLoaderLike {
          load(context: { url: string }, config: unknown, callbacks: unknown): void
        }
        const BasePlaylistLoader = HlsCtor.DefaultConfig.loader as unknown as new (
          config: unknown
        ) => PlaylistLoaderLike

        class PrefixedPlaylistLoader extends BasePlaylistLoader {
          load(context: { url: string }, config: unknown, callbacks: unknown) {
            context.url = resolve(context.url)
            super.load(context, config, callbacks)
          }
        }

        hls = new HlsCtor({
          pLoader: PrefixedPlaylistLoader as never,
          // Small buffers: a feed has many players and a generous forward
          // buffer on each one is a lot of memory and a lot of bandwidth spent
          // on videos that are about to scroll off.
          maxBufferLength: 12,
          maxMaxBufferLength: 30,
          backBufferLength: 10,
          // Start conservatively. The first seconds of a feed video decide
          // whether it looks instant, and a 720p first segment on a slow link
          // looks like a stall.
          startLevel: 0,
          xhrSetup: (xhr, url) => {
            // The playlists are ours and need the session; the segments are
            // signed and cross-origin and must NOT get a credentialed request.
            xhr.withCredentials = isSameOrigin(url)
          },
        })
        hlsRef.current = hls

        /*
          The quality ladder, and the remembered height applied to it.

          `MANIFEST_PARSED` is the first moment the levels exist; before it
          `hls.levels` is empty and a menu built from it would be Auto alone.
          The remembered choice is a HEIGHT and is resolved against THIS
          ladder — see `nearestLevelForHeight` for why an index would hand
          somebody a different quality on every video.

          `LEVEL_SWITCHED` is what lets the Auto row say what it resolved to.
          It is also the only honest source: `hls.loadLevel` is the level being
          fetched, which is not the one on screen while a switch is in flight.
        */
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_evt, data) => {
          if (cancelled) return
          const ladder = (data.levels ?? []) as LevelLike[]
          setLevels(ladder)
          if (!featuresRef.current.quality) return
          const wanted = nearestLevelForHeight(ladder, readQualityHeight(viewerRef.current))
          setSelectedLevel(wanted)
          if (wanted !== AUTO_LEVEL && hls) hls.currentLevel = wanted
        })
        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_evt, data) => {
          if (!cancelled) setCurrentLevel(data.level)
        })

        hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
          if (process.env.NODE_ENV !== "production") {
            // Every HLS failure mode here is invisible by default — a stalled
            // player looks exactly like a slow one, and the recovery paths
            // below can mask a permanent problem as an endless retry. This is
            // the only thread that ever says which it was.
            console.warn(
              `[player] hls ${data.fatal ? "fatal" : "non-fatal"} ${data.type}/${data.details}`,
              data.response?.code ?? "",
              (data.url ?? "").slice(0, 120)
            )
          }
          if (!data.fatal) return
          switch (data.type) {
            case HlsCtor.ErrorTypes.NETWORK_ERROR:
              // A signed segment that expired mid-playback lands here. One
              // reload of the playlist re-signs it.
              hls?.startLoad()
              break
            case HlsCtor.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError()
              break
            default:
              hls?.destroy()
              hlsRef.current = null
              fallbackToProgressive()
          }
        })

        hls.loadSource(hlsUrl)
        hls.attachMedia(video)
        if (!cancelled) setAttach("ready")
      })
      .catch(() => {
        // The chunk itself failed to load — offline, or a blocked CDN.
        fallbackToProgressive()
      })

    return () => {
      cancelled = true
      hls?.destroy()
      hlsRef.current = null
    }
  }, [source.hlsUrl, source.progressiveUrl, resolveUrl])

  /* ── Play / pause: `active`, and what the person said about it ─────────── */

  /**
   * The two mute inputs, readable from an effect that must not DEPEND on them.
   *
   * This is the subtle half of making mute per player. `muted` used to be in
   * the play/pause effect's dependency array, which was harmless while the
   * only thing that changed it was a feed-wide button nobody pressed. Now that
   * the speaker is on every card, that dependency would mean: person pauses a
   * video, person unmutes it, the effect re-runs, sees `active` is still true,
   * and calls `play()` — the pause button undone by the mute button, once per
   * card, with nothing in either handler to point at.
   *
   * `startedWithSound` is deliberately NOT among them and is not read here at
   * all: the effect is what SETS it, from the module, at the one moment sound
   * is decided. Reading it back would be a loop.
   */
  const userMutedRef = useRef(userMuted)
  userMutedRef.current = userMuted
  const mutedPropRef = useRef(muted)
  mutedPropRef.current = muted

  useEffect(() => {
    const video = videoRef.current
    if (!video || attach !== "ready") return

    /** Guards the async `play()` rejection against a stale effect run. */
    let stale = false

    if (shouldPlay(active, intent)) {
      /*
        The one moment sound is decided, and the only moment it is read.

        `soundIsArmed()` is asked HERE, imperatively, rather than subscribed
        to — see the header of `soundPreference.ts`. Reading it during render
        would make every player re-render on the first click anywhere on the
        page and would unmute a video that was already running, which is the
        blaring-video failure this whole design is shaped to make impossible.

        An untouched document always answers false, so the first video of a
        session is muted, which is the only state a browser will start
        unprompted.
      */
      const armed = soundIsArmed()
      setStartedWithSound(armed)
      setRefusedUnmuted(false)
      const wantMuted = userMutedRef.current ?? (armed ? false : mutedPropRef.current)
      video.muted = wantMuted
      // A video that ran to the end is showing its last frame; "play" there
      // means watch it again, not resume a finished thing for zero seconds.
      if (video.ended) video.currentTime = 0
      const p = video.play()
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          if (stale) return
          if (!wantMuted) {
            /*
              The browser refused an UNMUTED start, and the refusal is the
              browser telling the truth. The wrong response is to swallow it:
              that leaves a poster where a video should be, with a clean
              console, and reads as "the videos stopped working".

              So: fall back to muted and keep playing. A silent video is a
              recoverable disappointment; a dead frame is a bug report. The
              module is told as well, so the rest of the session stops
              attempting a permission this browser is not going to grant —
              Safari refuses every time, and without the latch every video
              would hitch on the same failed attempt.
            */
            noteUnmutedPlaybackRefused()
            setRefusedUnmuted(true)
            setStartedWithSound(false)
            video.muted = true
            const retry = video.play()
            if (retry && typeof retry.catch === "function") retry.catch(() => {})
            return
          }
          // A MUTED start was refused, which a browser essentially never does.
          // Nothing to do and nothing to say: the poster stays up and the
          // person can press play. Swallowing it here is what keeps the
          // console clean enough that real errors are visible.
        })
      }
    } else {
      video.pause()
      /*
        The feed moving on ends this playback's claim on sound; a deliberate
        pause does not.

        Same distinction the rewind below draws, for the same reason. A person
        who paused is still watching this video and will press play again, and
        flipping the speaker glyph to "muted" underneath them — then back on
        resume — is the icon flickering for no reason they can see. A card the
        feed has scrolled past is a poster again, and a poster advertising
        sound it is not making is the feed-wide mute button coming back in
        through the icon.
      */
      if (!active && intent !== "pause") setStartedWithSound(false)
      /*
        Rewind so the next time it becomes active it starts from the top
        rather than resuming a view nobody remembers starting.

        Both guards are load-bearing and the second one was learned in the
        browser. `!active` alone is not "the feed moved on": a video the
        person started by hand on a surface where the coordinator chose
        nothing — a whole reduced-motion session — is inactive the entire time
        it plays. Pausing one of those took the `!active` branch and jumped the
        playhead back to zero, so the pause button was a stop button wearing
        the wrong icon. Checking the INTENT is what tells the two apart: a
        deliberate pause keeps its place, the feed moving on does not.
      */
      if (!active && intent !== "pause" && video.currentTime > 0 && !loop) {
        video.currentTime = 0
      }
    }

    /*
      `play()` settles on a later turn of the loop, and by then the coordinator
      may well have moved on. Without this the rejection handler above could
      restart a video the feed had already left — the one-video rule broken by
      a promise arriving late.
    */
    return () => {
      stale = true
    }
  }, [active, intent, attach, loop])

  /**
   * The coordinator changing its mind clears whatever the person said.
   *
   * Both edges, and the reasoning for each is written out in
   * `intentOnActiveChange`. The short version: `active` going false rewinds
   * the video, so a pause held across that edge refers to a playhead that no
   * longer exists.
   *
   * It also revokes any hand-started playback elsewhere in the document, which
   * is what keeps the one-video rule true when a person has pressed play on a
   * card the coordinator never chose. See `manualPlayback.ts`.
   */
  const firstActiveRun = useRef(true)
  useEffect(() => {
    if (firstActiveRun.current) {
      firstActiveRun.current = false
      return
    }
    setIntent(intentOnActiveChange)
    if (active) revokeManualPlaybackExcept(playbackId ?? null)
  }, [active, playbackId])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.muted = isMuted
  }, [isMuted])

  /**
   * Hold or release the manual-playback slot.
   *
   * Claimed only for a video playing WITHOUT the coordinator's blessing, which
   * is the only case that needs arbitrating — under normal autoplay `active`
   * already guarantees there is one of them.
   */
  useEffect(() => {
    if (!playbackId) return
    if (intent === "play" && !active) {
      claimManualPlayback(playbackId, () => setIntent("auto"))
      return () => releaseManualPlayback(playbackId)
    }
    releaseManualPlayback(playbackId)
    return undefined
  }, [playbackId, intent, active])

  /* ── Speed and volume, applied to the element ─────────────────────────── */

  /**
   * Re-applied on every attach, which is the whole reason the rate is state.
   *
   * `attach` and `usingProgressive` both change when the source does, and the
   * media element's load algorithm has just reset `playbackRate` to 1 by then.
   * `onLoadedMetadata` re-applies it a second time for the case this effect
   * cannot see: hls.js swapping the media without React hearing about it.
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = rate
  }, [rate, attach, usingProgressive])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !features.volume) return
    video.volume = clampVolume(volume)
  }, [volume, attach, features.volume])

  /* ── Captions ─────────────────────────────────────────────────────────── */

  /**
   * The element's own track list is the ONE source, for both kinds.
   *
   * `<track>` children are there because a caller put them there; hls.js puts
   * its SUBTITLES renditions on the same list. Reading one list means the
   * button, the menu and the cue box do not have to know which kind they are
   * driving — only the selection below has to, and only for one extra line.
   *
   * `addtrack` matters: an HLS subtitle rendition does not exist at mount. It
   * appears when the manifest is parsed, which is after the first paint, so a
   * one-shot read would find nothing and the CC button would never appear.
   */
  useEffect(() => {
    if (!features.captions) return
    const video = videoRef.current
    if (!video) return
    const list = video.textTracks
    const sync = () => {
      const rows: CaptionTrackLike[] = []
      for (let i = 0; i < list.length; i += 1) {
        const track = list[i]
        if (!track) continue
        rows.push({ lang: track.language, label: track.label, kind: track.kind })
      }
      setCaptionRows(rows)
    }
    sync()
    list.addEventListener("addtrack", sync)
    list.addEventListener("removetrack", sync)
    return () => {
      list.removeEventListener("addtrack", sync)
      list.removeEventListener("removetrack", sync)
    }
  }, [features.captions, attach])

  /**
   * The remembered language, applied ONCE per source.
   *
   * The latch is what stops it fighting the person: without it, turning
   * captions off would be undone the next time the track list changed — and
   * an HLS track list changes whenever a level switch re-signals its
   * renditions.
   */
  const captionsDecided = useRef(false)
  useEffect(() => {
    captionsDecided.current = false
    setCaptionIndex(CAPTIONS_OFF)
  }, [source.hlsUrl, source.progressiveUrl])

  /**
   * The publisher's own default, read through a ref.
   *
   * A caller writes `captions={rows}` where `rows` came out of a fetch, so the
   * array's identity changes whenever that hook re-renders. Depending on it
   * would re-run the selection and undo the person's choice; the latch above
   * already guards that, and the ref means the dependency is not even there.
   */
  const defaultCaptionLang = captionSources?.find((row) => row.default)?.language ?? null
  const defaultCaptionLangRef = useRef(defaultCaptionLang)
  defaultCaptionLangRef.current = defaultCaptionLang

  useEffect(() => {
    if (!features.captions || captionsDecided.current) return
    const options = captionOptions(captionRows)
    if (options.length === 0) return
    captionsDecided.current = true
    setCaptionIndex(
      initialCaptionIndex(
        options,
        readCaptionLanguage(viewerRef.current),
        defaultCaptionLangRef.current
      )
    )
  }, [captionRows, features.captions])

  /**
   * The selection, pushed to the element — and to hls.js, which needs telling
   * separately or the rendition's fragments are never fetched at all.
   *
   * `hidden` rather than `showing`: the cues are drawn by this package (see
   * ./captions.ts), and `disabled` would stop `cuechange` firing, so there
   * would be nothing to draw.
   */
  useEffect(() => {
    const video = videoRef.current
    // Gated, so a feed card and a reel behave EXACTLY as they did: without the
    // captions feature this component does not touch `textTracks` or
    // `hls.subtitleTrack` at all, which is the compatibility promise in
    // ./chrome.ts applied to something that is not a button.
    if (!video || !features.captions) return
    const list = video.textTracks
    for (let i = 0; i < list.length; i += 1) {
      const track = list[i]
      if (!track) continue
      track.mode = i === captionIndex ? "hidden" : "disabled"
    }
    const hls = hlsRef.current
    if (!hls) return
    if (captionIndex < 0) {
      hls.subtitleTrack = -1
      return
    }
    const chosen = list[captionIndex]
    const renditions = hls.subtitleTracks ?? []
    const match = renditions.findIndex(
      (rendition) =>
        (rendition.lang ?? "") === (chosen?.language ?? "") &&
        (rendition.name ?? "") === (chosen?.label ?? "")
    )
    // A `<track>` child has no rendition to match, and leaving hls.js alone is
    // right there: switching its subtitle track off would kill a rendition the
    // person may be about to choose.
    if (match >= 0) hls.subtitleTrack = match
  }, [captionIndex, captionRows, attach, features.captions])

  /** The cues on screen right now, from the one selected track. */
  useEffect(() => {
    const video = videoRef.current
    const track =
      video && features.captions && captionIndex >= 0 ? video.textTracks[captionIndex] : null
    if (!track) {
      setCues([])
      return
    }
    const onCueChange = () => {
      const active = track.activeCues
      const texts: string[] = []
      for (let i = 0; i < (active?.length ?? 0); i += 1) {
        const cue = active?.[i] as (TextTrackCue & { text?: string }) | undefined
        if (typeof cue?.text === "string") texts.push(cue.text)
      }
      setCues(texts)
    }
    onCueChange()
    track.addEventListener("cuechange", onCueChange)
    return () => {
      track.removeEventListener("cuechange", onCueChange)
      setCues([])
    }
  }, [captionIndex, captionRows, attach, features.captions])

  /* ── Fullscreen and picture-in-picture ────────────────────────────────── */

  /**
   * The caller's delegate, held in a ref so its identity cannot churn an
   * effect. A caller naturally writes `onToggleFullscreen={() => expand()}`.
   */
  const onToggleFullscreenRef = useRef(onToggleFullscreen)
  onToggleFullscreenRef.current = onToggleFullscreen
  const delegatesFullscreen = Boolean(onToggleFullscreen)
  const fullscreenTargetRef = useRef(fullscreenTarget)
  fullscreenTargetRef.current = fullscreenTarget

  const [selfFullscreen, setSelfFullscreen] = useState(false)
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [pipSupported, setPipSupported] = useState(false)

  /** Which box goes fullscreen: the caller's, or ours. Never re-parented. */
  const fullscreenBox = useCallback(
    () => fullscreenTargetRef.current?.() ?? rootRef.current,
    []
  )

  /**
   * Capabilities, decided from the live element after mount.
   *
   * Never during render: `document` does not exist on the server, and a button
   * rendered on the server and removed on hydration is a layout shift on every
   * video. After mount both are stable for this element.
   */
  useEffect(() => {
    setFullscreenSupported(canFullscreen(fullscreenBox(), delegatesFullscreen))
    setPipSupported(
      canPictureInPicture(
        videoRef.current,
        typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled)
      )
    )
  }, [attach, delegatesFullscreen, fullscreenBox])

  /**
   * The browser's state, not ours.
   *
   * There are four ways out of fullscreen this component does not initiate —
   * Escape, F11, the browser's own control, and a tab switch on some
   * platforms — and a flag held from the click alone would leave the glyph
   * claiming a fullscreen that ended, with no way to fix it but pressing
   * twice. The same lesson apps/tube/src/watch/useExpand.ts learned.
   */
  useEffect(() => {
    if (typeof document === "undefined" || delegatesFullscreen) return
    const onChange = () => {
      setSelfFullscreen(
        Boolean(document.fullscreenElement) && document.fullscreenElement === fullscreenBox()
      )
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [delegatesFullscreen, fullscreenBox])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const entered = () => setPipActive(true)
    const left = () => setPipActive(false)
    video.addEventListener("enterpictureinpicture", entered)
    video.addEventListener("leavepictureinpicture", left)
    return () => {
      video.removeEventListener("enterpictureinpicture", entered)
      video.removeEventListener("leavepictureinpicture", left)
    }
  }, [])

  const isFullscreen = isFullscreenProp ?? selfFullscreen

  /* ── A tab that is not being looked at is not being watched ───────────── */
  useEffect(() => {
    if (typeof document === "undefined") return
    const onHidden = () => {
      if (document.visibilityState === "hidden") videoRef.current?.pause()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => document.removeEventListener("visibilitychange", onHidden)
  }, [])

  /* ── Watch measurement ────────────────────────────────────────────────── */

  /**
   * The session, read through a ref so it is not an effect dependency.
   *
   * `sessionId` is the ONLY thing that may restart a tracker, because a new
   * id is what "a new view" means. Depending on the object would restart it
   * whenever the caller happened to produce a fresh one — and the restart is
   * destructive: it ends the view and zeroes the counters.
   */
  const sessionRef = useRef(session)
  sessionRef.current = session
  const sessionId = session?.sessionId

  useEffect(() => {
    const info = sessionRef.current
    if (!info) return
    const tracker = new WatchSession(info, emit)
    watchRef.current = tracker
    return () => {
      // Whatever ended this view — scrolled away, unmounted, navigated — the
      // view is over and the numbers have to go. `end` is idempotent, which is
      // what makes it safe to also call it from the pagehide handler below.
      tracker.end("swipe_next")
      watchRef.current = null
    }
  }, [sessionId, emit])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onLeave = () => watchRef.current?.end("backgrounded")
    window.addEventListener("pagehide", onLeave)
    return () => window.removeEventListener("pagehide", onLeave)
  }, [])

  /**
   * The 1-second sampler.
   *
   * A timer rather than `timeupdate`, because `timeupdate` fires at a rate the
   * browser chooses (typically 4Hz, but throttled hard in a background tab)
   * and the arithmetic in WatchSession assumes a known interval. The timer
   * only runs while something is actually playing.
   */
  useEffect(() => {
    const video = videoRef.current
    // `sessionId` rather than the session object, for the same reason as the
    // tracker effect above: a fresh object identity must not restart the clock.
    if (!video || !sessionId) return

    let last = performance.now()
    const id = window.setInterval(() => {
      const tracker = watchRef.current
      if (!tracker || video.paused || video.ended) {
        last = performance.now()
        return
      }
      const now = performance.now()
      const elapsed = now - last
      last = now
      tracker.playbackSpeed = video.playbackRate || 1
      tracker.sample(video.currentTime * 1000, elapsed, bufferingRef.current)
    }, SAMPLE_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [sessionId, attach])

  /* ── The OS's copy of all this ────────────────────────────────────────── */

  /**
   * Still the coordinator's answer, widened by exactly one case.
   *
   * The rule this used to state — "ownership follows `active`, not is-playing"
   * — is intact and is still the right one: autoplay can be refused, a video
   * can buffer, a person can pause, and none of those mean the OS should start
   * describing a different post. Passing `elementPaused` here would blank the
   * lock screen the instant somebody pressed pause, and put the play button
   * out of reach of the one video they are looking at.
   *
   * The one case `active` alone does not cover is a video the person started
   * BY HAND on a surface where the coordinator chose nothing — the whole of a
   * reduced-motion session. That video is unambiguously the thing playing, so
   * it is the thing the lock screen should name, and `manualPlayback.ts`
   * guarantees there is at most one of it. So the claim is `active OR the
   * manual slot`, which still cannot be held by two players at once — which
   * was the actual invariant.
   */
  const ownsPlayback = active || (intent === "play" && Boolean(playbackId))

  useMediaSession({
    videoRef,
    active: ownsPlayback,
    info: mediaSession,
    onPreviousTrack,
    onNextTrack,
  })

  /**
   * How this view started, for `play_start`.
   *
   * Set by the control handlers before they touch the element, and read once
   * by the tracker. "tap" for a cold press of play, "resume" for a press that
   * undoes an earlier pause — the contract's three start methods are a real
   * distinction on the creator dashboard (an autoplayed view and a chosen one
   * are not worth the same) and inferring it from `active` got it wrong for
   * every hand-started video.
   */
  const startMethodRef = useRef<"autoplay" | "tap" | "resume">("autoplay")

  const handlePlaying = useCallback(() => {
    bufferingRef.current = false
    setElementPaused(false)
    const tracker = watchRef.current
    const video = videoRef.current
    if (!tracker || !video || tracker.hasStarted) return
    tracker.start({
      startMethod: startMethodRef.current,
      isMuted: video.muted,
      isAutoplay: startMethodRef.current === "autoplay",
      timeToFirstFrameMs: Math.max(0, performance.now() - attachStartedAt.current),
      playheadMs: video.currentTime * 1000,
    })
  }, [])

  const handleEnded = useCallback(() => {
    setElementPaused(true)
    if (!loop) watchRef.current?.end("ended")
  }, [loop])

  /* ── The controls ─────────────────────────────────────────────────────── */

  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [recentlyMoved, setRecentlyMoved] = useState(false)
  /**
   * A finger asked for the transport. See `tapOutcome` and `chromeVisible`.
   *
   * `hovered` deliberately never becomes true for a touch or a pen — a finger
   * is not hovering, and pretending it is would break the reveal-first rule:
   * a browser fires `pointerenter` on the way into a tap, so the chrome would
   * already be "visible" by the time the tap was decided and the first tap
   * would toggle blind after all.
   */
  const [revealed, setRevealed] = useState(false)

  /**
   * Progress.
   *
   * `timeupdate` fires about four times a second, which sounds expensive in a
   * feed and is not: the coordinator guarantees ONE video is playing, a paused
   * element fires nothing, and the state lives in this component so a card's
   * header, caption and action bar are not re-rendered by it. Four renders a
   * second of a `<video>` whose attributes have not changed is a reconcile and
   * no DOM writes.
   */
  const [playhead, setPlayhead] = useState(0)
  const [duration, setDuration] = useState(0)

  /**
   * What is loaded, as spans rather than one number.
   *
   * ./scrubber.ts says why: after a seek there are two spans, and a single bar
   * from zero would claim the gap between them is ready to play when it is the
   * exact thing that will stall.
   */
  const [buffered, setBuffered] = useState<BufferedSpan[]>([])
  const syncBuffered = useCallback(() => {
    const video = videoRef.current
    if (!video || !featuresRef.current.buffered) return
    setBuffered(bufferedSpans(video.buffered, video.duration))
  }, [])

  /** Where the pointer is on the seek bar, 0..1, or null for "not on it". */
  const [hoverAt, setHoverAt] = useState<number | null>(null)
  const [barWidth, setBarWidth] = useState(0)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  /* ── The gear menu ────────────────────────────────────────────────────── */

  type MenuPage = "root" | "speed" | "quality" | "captions"
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPage, setMenuPage] = useState<MenuPage>("root")
  /** -1 until the keyboard is used, so a mouse user sees no stray highlight. */
  const [menuIndex, setMenuIndex] = useState(-1)
  /**
   * A stable id for the gear, so the menu can name it with `aria-labelledby`.
   *
   * `useId` and not a counter: this component server-renders, and an id that
   * differed between the server's markup and the client's is a hydration
   * mismatch that React repairs by throwing the subtree away.
   */
  const gearId = useId()
  const gearRef = useRef<HTMLButtonElement | null>(null)
  const menuElRef = useRef<HTMLDivElement | null>(null)
  const menuRowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rowRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      menuRowRefs.current[index] = el
    },
    []
  )

  const isPlaying = !elementPaused
  const drawable = controls && attach !== "failed"
  /**
   * "This video has actually run", which is not the same as "it is stopped".
   *
   * A feed is nineteen posters and one video, and a poster is stopped at zero.
   * Treating those as paused videos would paint a full transport on every card.
   * See `scrubberVisible`.
   */
  const started = playhead > 0
  const chrome = { playing: isPlaying, started, hovered, focused, recentlyMoved, revealed }
  const chromeShown = drawable && chromeVisible(chrome)
  /**
   * The seek bar's own condition, and the one that keeps a feed navigable.
   *
   * This is not only an opacity: the `role="slider"` is not RENDERED at all
   * unless it is true, so an untouched feed of twenty videos contains zero
   * sliders rather than twenty carrying `tabIndex={-1}`. See `scrubberVisible`.
   */
  const scrubVisible = scrubberVisible(chrome) && drawable
  const restingVisible = drawable && restingLineVisible(chrome)

  /** Read by the pointer handlers, which run outside a render. */
  const chromeShownRef = useRef(chromeShown)
  chromeShownRef.current = chromeShown

  /**
   * Which device produced the last press. `click` does not carry it, so it is
   * captured from the `pointerdown` that preceded it.
   */
  const pointerKind = useRef<string>("mouse")

  const hideTimer = useRef(0)
  const noteActivity = useCallback(() => {
    setRecentlyMoved(true)
    if (typeof window === "undefined") return
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = 0
      setRecentlyMoved(false)
      // The touch reveal decays on the same clock. Two timers for one fade is
      // how a transport ends up half on screen.
      setRevealed(false)
    }, CONTROLS_HIDE_MS)
  }, [])

  /**
   * Somebody just DID something — pressed play, moved the scrubber, tapped the
   * picture — as opposed to merely moving a mouse across it.
   *
   * The difference matters on a touchscreen, where `hovered` is never true and
   * the auto-hide timer alone therefore holds nothing on screen. Without this,
   * pressing play on a phone made the transport vanish in the same frame: the
   * timer was running but no condition in `chromeVisible` was satisfied. Every
   * deliberate interaction now holds the transport for CONTROLS_HIDE_MS,
   * whatever the person used to make it.
   */
  const noteInteraction = useCallback(() => {
    setRevealed(true)
    noteActivity()
  }, [noteActivity])

  /**
   * Nothing invisible may hold the focus.
   *
   * The controls fade but stay in the document, and while they are faded they
   * are `tabIndex={-1}` and `aria-hidden`. That is right for a keyboard user
   * arriving from outside — but it leaves one hole: press the speaker with the
   * MOUSE and it has DOM focus without being focus-visible, so the transport
   * is free to fade three seconds later and leave the focus sitting on a
   * button nobody can see. Screen-reader focus would then be inside an
   * `aria-hidden` subtree, which is exactly the state the ARIA spec calls out.
   *
   * So when the transport goes, the focus comes back out to the player itself,
   * which is always focusable while the controls exist. Focus stays on the
   * card — the person does not lose their place — and it lands somewhere
   * visible.
   */
  useEffect(() => {
    if (chromeShown || !controls) return
    const root = rootRef.current
    if (typeof document === "undefined" || !root) return
    const active = document.activeElement
    if (active && active !== root && root.contains(active)) root.focus()
  }, [chromeShown, controls])

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    []
  )

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    const next = toggleIntent(active, intent)
    if (next === "play") {
      // A press that undoes a pause is a resume; a press on something that was
      // never playing is a tap. Set before the effect runs `play()`.
      startMethodRef.current = video && video.currentTime > 0 && !video.ended ? "resume" : "tap"
    }
    setIntent(next)
    noteInteraction()
  }, [active, intent, noteInteraction])

  /**
   * A press on the picture itself.
   *
   * With a mouse this is play/pause, unchanged and correct — it is what every
   * video on the web does. With a finger it is play/pause ONLY once the
   * transport is already on screen; the first tap on a playing video summons
   * the transport instead of silently stopping something the person cannot
   * see. `tapOutcome` holds the rule and the reasoning.
   */
  const onPictureClick = useCallback(() => {
    if (tapOutcome(pointerKind.current, chromeShownRef.current) === "reveal") {
      noteInteraction()
      return
    }
    togglePlay()
  }, [noteInteraction, togglePlay])

  /**
   * The speaker, which does two things now — one for this player and one for
   * the feed, and the difference between them is the whole of the mute rule.
   *
   * FOR THIS PLAYER it records `userMuted`, which is final: no default, from
   * the prop or from the document's gesture history, may ever overrule it
   * again on this video.
   *
   * FOR THE FEED it moves the DEFAULT the next untouched video will start
   * from. A deliberate press of a speaker is the strongest statement about
   * sound a person can make, in both directions — "let me hear this" and "stop
   * making noise at me" — and it would be strange for a feed to hear it, apply
   * it to one clip, and then go back to guessing. It reaches no other player;
   * `soundPreference.ts` has no way to.
   *
   * It toggles from the DISPLAYED state rather than from `userMuted`, so the
   * button always does what its glyph says even when a refused unmuted start
   * has forced the element quiet underneath a choice to the contrary.
   */
  const toggleMuted = useCallback(() => {
    const next = !isMuted
    setUserMuted(next)
    // The refusal was about the last attempt. This press IS a user gesture, in
    // the handler, which is exactly what the browser was holding out for.
    setRefusedUnmuted(false)
    if (next) disarmSound()
    else armSound()
    /*
      Unmuting must land somewhere audible.

      A player muted at level 0 has nothing to go back to: the speaker would
      flip to "sound on" and stay silent, and the person would press it twice
      and conclude the audio is broken. `volumeOnUnmute` gives it one step.
      Only with the volume feature on — where there is no slider there is no
      level to have moved, and `video.volume` is 1.
    */
    if (!next && featuresRef.current.volume) {
      const level = volumeOnUnmute(volumeRef.current)
      if (level !== volumeRef.current) {
        setVolume(level)
        writeVolume(viewerRef.current, level)
      }
    }
    onToggleMuted?.(next)
    noteInteraction()
  }, [isMuted, onToggleMuted, noteInteraction])

  /* ── The new controls' handlers ───────────────────────────────────────── */

  /**
   * The values the handlers read, in refs.
   *
   * Every one of these is here for the reason the `onWatchEvent` note at the
   * top of this file gives: a handler that DEPENDED on them would get a new
   * identity whenever a level switched or a cue changed, and a new identity on
   * a control inside a feed is a re-render of every card.
   */
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const isMutedRef = useRef(isMuted)
  isMutedRef.current = isMuted
  const levelsRef = useRef(levels)
  levelsRef.current = levels
  const captionRowsRef = useRef(captionRows)
  captionRowsRef.current = captionRows
  const captionIndexRef = useRef(captionIndex)
  captionIndexRef.current = captionIndex
  const menuOpenRef = useRef(menuOpen)
  menuOpenRef.current = menuOpen

  /**
   * The language the CC button toggles back ON.
   *
   * Held for this mount as well as in storage, and the difference is the whole
   * behaviour: storage forgets the language when captions go OFF, because a
   * remembered language there would silently switch captions on for the next
   * video somebody opened. This ref is what makes the BUTTON a toggle rather
   * than a reset — press it twice and you get the track you had, not the first
   * one in the manifest.
   */
  const lastCaptionLang = useRef<string | null>(null)

  const changeRate = useCallback(
    (next: number) => {
      const value = normalizeRate(next)
      setRate(value)
      writePlaybackRate(viewerRef.current, value)
      noteInteraction()
    },
    [noteInteraction]
  )

  const changeVolume = useCallback(
    (next: number) => {
      const { volume: level, muted } = volumeChange(next)
      setVolume(level)
      writeVolume(viewerRef.current, level)
      setUserMuted(muted)
      // This press IS the gesture a browser was holding out for, so a previous
      // refusal no longer applies — the same reasoning as in `toggleMuted`.
      setRefusedUnmuted(false)
      /*
        The document-wide DEFAULT moves only when the mute state actually
        flips. Nudging the volume from 40% to 45% is not a statement about
        whether the NEXT video should have sound, and calling `armSound` on
        every step would make it one.
      */
      if (muted !== isMutedRef.current) {
        if (muted) disarmSound()
        else armSound()
        onToggleMuted?.(muted)
      }
      noteInteraction()
    },
    [noteInteraction, onToggleMuted]
  )

  const chooseLevel = useCallback(
    (index: number) => {
      setSelectedLevel(index)
      const hls = hlsRef.current
      // -1 IS the API's own value for "adapt", so this one assignment covers
      // both choosing a height and going back to Auto.
      if (hls) hls.currentLevel = index
      const height = index === AUTO_LEVEL ? 0 : Math.round(levelsRef.current[index]?.height ?? 0)
      writeQualityHeight(viewerRef.current, height)
      noteInteraction()
    },
    [noteInteraction]
  )

  const chooseCaption = useCallback(
    (index: number) => {
      // The latch, so the remembered-language effect cannot undo this choice
      // the next time the track list is re-signalled.
      captionsDecided.current = true
      setCaptionIndex(index)
      const lang = index >= 0 ? (captionRowsRef.current[index]?.lang ?? "").trim() : ""
      if (lang) lastCaptionLang.current = lang
      writeCaptionLanguage(viewerRef.current, index >= 0 ? lang : null)
      noteInteraction()
    },
    [noteInteraction]
  )

  const toggleCaptionTrack = useCallback(() => {
    const options = captionOptions(captionRowsRef.current)
    const remembered = lastCaptionLang.current ?? readCaptionLanguage(viewerRef.current)
    chooseCaption(toggleCaptions(captionIndexRef.current, options, remembered))
  }, [chooseCaption])

  /**
   * Fullscreen: the caller's, if it has one.
   *
   * A delegate wins outright and the API is not touched — tube's expand hook
   * owns a theatre fallback and a document scroll lock that this component
   * knows nothing about, and two owners for one expansion is a player that
   * enters fullscreen and immediately leaves it. Without a delegate this drives
   * the Fullscreen API on the box the caller named, which is never re-parented.
   */
  const toggleFullscreen = useCallback(() => {
    noteInteraction()
    const delegate = onToggleFullscreenRef.current
    if (delegate) {
      delegate()
      return
    }
    if (typeof document === "undefined") return
    if (document.fullscreenElement) {
      // Guarded: `exitFullscreen()` rejects when nothing is fullscreen.
      void document.exitFullscreen().catch(() => undefined)
      return
    }
    const box = fullscreenBox()
    if (!box || typeof box.requestFullscreen !== "function") return
    // Refusal is a REJECTED PROMISE, not an exception, and it is silent: inside
    // an iframe without `allow="fullscreen"` and under some enterprise
    // policies. Caught so it does not surface as an unhandled rejection.
    void box.requestFullscreen().catch(() => undefined)
  }, [fullscreenBox, noteInteraction])

  const togglePip = useCallback(() => {
    noteInteraction()
    const video = videoRef.current
    if (typeof document === "undefined" || !video) return
    if (document.pictureInPictureElement === video) {
      void document.exitPictureInPicture().catch(() => undefined)
      return
    }
    if (typeof video.requestPictureInPicture !== "function") return
    void video.requestPictureInPicture().catch(() => undefined)
  }, [noteInteraction])

  /**
   * Closing the menu, and the half that is easy to leave out.
   *
   * `restoreFocus` puts the focus back on the gear. Escape must: a menu that
   * closes and drops the focus leaves a keyboard user at the top of the
   * document with no idea what happened. An OUTSIDE CLICK must not — the
   * person is already pressing something else, and yanking the focus back to a
   * gear would fight them.
   */
  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false)
    setMenuPage("root")
    setMenuIndex(-1)
    if (restoreFocus) gearRef.current?.focus()
  }, [])

  const toggleMenu = useCallback(() => {
    setMenuPage("root")
    setMenuIndex(-1)
    setMenuOpen((open) => !open)
    noteInteraction()
  }, [noteInteraction])

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = seekTarget(video.currentTime, deltaSeconds, video.duration)
      // The tracker is NOT told. It works a seek out for itself from the size
      // of the playhead jump at the next sample — see the header of
      // watchTracker.ts — so announcing it here would count one seek twice and
      // would put the definition of "a seek" in two places.
      setPlayhead(video.currentTime)
      noteInteraction()
    },
    [noteInteraction]
  )

  const seekToFraction = useCallback(
    (fraction: number) => {
      const video = videoRef.current
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
      video.currentTime = seekTarget(0, fraction * video.duration, video.duration)
      setPlayhead(video.currentTime)
      noteInteraction()
    },
    [noteInteraction]
  )

  /**
   * Keys, and the two things that make them safe inside a feed.
   *
   * `preventDefault` only once the key is known to be ours — Space would
   * otherwise stop scrolling the page from a focused card. And
   * `stopPropagation`, because this player can be a page of a carousel whose
   * track also listens for the arrow keys: without it one press would seek the
   * video AND turn the page.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      /*
        An open menu owns the keyboard, and the group keeps out of it.

        Without this, ArrowUp inside a speed list would move the highlight AND
        step the volume, and ArrowLeft would seek the video out from under
        somebody reading it. The menu's own handler claims what it wants; the
        rest is simply ignored rather than falling through to the transport.
      */
      if (menuOpenRef.current) return

      /*
        A focused BUTTON gets its own activation key back.

        Space on a focused button is the browser's own convention, and the
        group claiming it means the gear cannot be opened with Space — a
        control that a keyboard user can reach and not use. Only the controls
        that carry `data-mo-activate` are exempted, so the speaker keeps the
        behaviour it has always had on the feed and in reels.
      */
      const target = event.target as HTMLElement | null
      if (
        target?.dataset?.moActivate === "true" &&
        (event.key === " " || event.key === "Spacebar" || event.key === "Enter")
      ) {
        return
      }

      const action = keyAction(
        event.key,
        {
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
        },
        {
          speed: features.speed,
          volume: features.volume,
          captions: features.captions && captionsAvailable(captionOptions(captionRowsRef.current)),
          fullscreen: features.fullscreen && fullscreenSupported,
          pictureInPicture: features.pictureInPicture && pipSupported,
        }
      )
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      // Somebody is driving this from the keyboard, whatever moved the focus
      // here originally. From now on the transport stays up while they are on
      // it — see `focused` in `onFocus` for why arriving by mouse does not
      // count.
      setFocused(true)
      switch (action.kind) {
        case "toggle-play":
          togglePlay()
          break
        case "toggle-muted":
          toggleMuted()
          break
        case "seek":
          seekBy(action.deltaSeconds)
          break
        case "seek-to-fraction":
          seekToFraction(action.fraction)
          break
        case "step-rate":
          changeRate(stepRate(rate, action.direction))
          break
        case "step-volume":
          changeVolume(stepVolume(volumeRef.current, action.direction))
          break
        case "toggle-captions":
          toggleCaptionTrack()
          break
        case "toggle-fullscreen":
          toggleFullscreen()
          break
        case "toggle-pip":
          togglePip()
          break
      }
    },
    [
      togglePlay,
      toggleMuted,
      seekBy,
      seekToFraction,
      changeRate,
      changeVolume,
      toggleCaptionTrack,
      toggleFullscreen,
      togglePip,
      rate,
      features.speed,
      features.volume,
      features.captions,
      features.fullscreen,
      features.pictureInPicture,
      fullscreenSupported,
      pipSupported,
    ]
  )

  const scrubRef = useRef<HTMLDivElement | null>(null)
  const onScrub = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bar = scrubRef.current
      const video = videoRef.current
      if (!bar || !video) return
      const rect = bar.getBoundingClientRect()
      video.currentTime = scrubTarget(event.clientX - rect.left, rect.width, video.duration)
      setPlayhead(video.currentTime)
      noteInteraction()
    },
    [noteInteraction]
  )

  const progress = progressFraction(playhead, duration)
  const label = ariaLabel || "Video"

  /* ── What the optional controls are made of ───────────────────────────── */

  const captionOpts = useMemo(() => captionOptions(captionRows), [captionRows])
  const captionsExist = features.captions && captionsAvailable(captionOpts)
  const currentCaptionLabel =
    captionIndex >= 0 ? (captionOpts.find((o) => o.index === captionIndex)?.label ?? null) : null
  const qualityRows = useMemo(() => qualityOptions(levels), [levels])
  const qualityExists = features.quality && qualityMenuAvailable(levels)
  const gearShown =
    settingsMenuUseful(features, { quality: qualityExists, captions: captionsExist }) && drawable

  /**
   * The chapters, cleaned once.
   *
   * `chapterProp` is an array a caller builds from a fetch, so its identity
   * changes on every one of that hook's renders — the memo is keyed on it
   * anyway because the work is small and the alternative (a ref) would not
   * re-render the ticks when the chapters finally arrive.
   */
  const chapters = useMemo(
    () => (chapterProp ? orderedPlayerChapters(chapterProp) : []),
    [chapterProp]
  )
  const chaptersShown = features.chapters && chapters.length > 0
  const marks = useMemo(
    () => (chaptersShown ? chapterMarks(chapters, duration) : []),
    [chaptersShown, chapters, duration]
  )
  const chapterIndex = chaptersShown ? activePlayerChapter(chapters, playhead * 1000) : -1
  const chapterLabel = chapterIndex >= 0 ? chapters[chapterIndex]!.title.trim() : ""

  /** The cue box's content. Empty means the box is not rendered at all. */
  const captionLines = useMemo(() => (features.captions ? cueLines(cues) : []), [features.captions, cues])

  /* ── The menu's rows, and what a press on one does ────────────────────── */

  const menuRows = useMemo<MenuRow[]>(() => {
    if (menuPage === "speed") {
      const at = normalizeRate(rate)
      return PLAYBACK_RATES.map((value) => ({
        id: `rate-${value}`,
        label: rateLabel(value),
        checked: value === at,
      }))
    }
    if (menuPage === "quality") {
      return qualityRows.map((option) => ({
        id: `level-${option.index}`,
        label:
          option.index === AUTO_LEVEL
            ? currentQualityLabel(levels, AUTO_LEVEL, currentLevel)
            : option.label,
        checked: option.index === selectedLevel,
      }))
    }
    if (menuPage === "captions") {
      return [
        { id: "cc-off", label: "Off", checked: captionIndex === CAPTIONS_OFF },
        ...captionOpts.map((option) => ({
          id: `cc-${option.index}`,
          label: option.label,
          checked: option.index === captionIndex,
        })),
      ]
    }
    const rows: MenuRow[] = []
    if (features.speed) rows.push({ id: "speed", label: "Speed", value: rateLabel(rate) })
    if (qualityExists) {
      rows.push({
        id: "quality",
        label: "Quality",
        value: currentQualityLabel(levels, selectedLevel, currentLevel),
      })
    }
    if (captionsExist) {
      rows.push({ id: "captions", label: "Captions", value: currentCaptionLabel ?? "Off" })
    }
    return rows
  }, [
    menuPage,
    rate,
    qualityRows,
    levels,
    currentLevel,
    selectedLevel,
    captionOpts,
    captionIndex,
    features.speed,
    qualityExists,
    captionsExist,
    currentCaptionLabel,
  ])

  const menuTitle =
    menuPage === "speed"
      ? "Speed"
      : menuPage === "quality"
        ? "Quality"
        : menuPage === "captions"
          ? "Captions"
          : null

  const onMenuActivate = useCallback(
    (index: number) => {
      const row = menuRows[index]
      if (!row) return
      if (menuPage === "root") {
        // Opening a page resets the highlight: the row a person wants is the
        // one that is checked, not the third one because the third one was
        // highlighted on the page they came from.
        setMenuIndex(-1)
        if (row.id === "speed") setMenuPage("speed")
        else if (row.id === "quality") setMenuPage("quality")
        else if (row.id === "captions") setMenuPage("captions")
        return
      }
      if (menuPage === "speed") changeRate(PLAYBACK_RATES[index] ?? 1)
      else if (menuPage === "quality") chooseLevel(qualityRows[index]?.index ?? AUTO_LEVEL)
      else if (menuPage === "captions") {
        chooseCaption(index === 0 ? CAPTIONS_OFF : (captionOpts[index - 1]?.index ?? CAPTIONS_OFF))
      }
      // Back to the root, the way every player's settings menu behaves: the
      // choice is made and the summary on the root row now shows it.
      setMenuPage("root")
      setMenuIndex(-1)
    },
    [menuRows, menuPage, changeRate, chooseLevel, chooseCaption, qualityRows, captionOpts]
  )

  const onMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const action = menuKeyAction(event.key, menuRows.length, menuIndex, {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
      })
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      if (action.kind === "move") {
        setMenuIndex(action.index)
        return
      }
      if (action.kind === "activate") {
        onMenuActivate(menuIndex < 0 ? 0 : menuIndex)
        return
      }
      /*
        Escape leaves the MENU and gives the gear its focus back. ArrowLeft only
        leaves a PAGE, which is the pattern's "back out of a submenu" — and on
        the root page there is nothing to back out of, so it does nothing rather
        than closing, because a left arrow that sometimes closes a menu is a
        menu that closes when somebody meant to go back.
      */
      if (event.key === "Escape") {
        closeMenu(true)
        return
      }
      if (menuPage !== "root") {
        setMenuPage("root")
        setMenuIndex(-1)
      }
    },
    [menuRows.length, menuIndex, menuPage, onMenuActivate, closeMenu]
  )

  /** A press anywhere else closes it — but not on the gear. See ./menu.ts. */
  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") return
    const onDown = (event: PointerEvent) => {
      if (isOutsidePress(event.target as Node | null, menuElRef.current, gearRef.current)) {
        closeMenu(false)
      }
    }
    // Capture, so a control that stops propagation cannot leave the menu open.
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [menuOpen, closeMenu])

  /** The roving tabstop, moved for real. -1 means the pointer is driving. */
  useEffect(() => {
    if (!menuOpen || menuIndex < 0) return
    menuRowRefs.current[menuIndex]?.focus()
  }, [menuOpen, menuIndex, menuPage])

  /** A menu over a video that has gone away is a menu over a poster. */
  useEffect(() => {
    if (menuOpen && !gearShown) closeMenu(false)
  }, [menuOpen, gearShown, closeMenu])

  /**
   * Whether a faded control can still be clicked. It cannot.
   *
   * Exactly ONE of the two pointer-events classes is ever emitted, which is
   * the point: Tailwind orders `.pointer-events-none` before
   * `.pointer-events-auto` in its own sheet, so a class list carrying both
   * would silently resolve to `auto` however they were written and an
   * invisible button would still be sitting over the picture eating clicks.
   */
  const hit = chromeShown ? "pointer-events-auto" : "pointer-events-none"

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       The group is the player's keyboard surface. Its role is `group` rather
       than `button` because it contains buttons; the keys it claims are the
       transport conventions and every one of them also has a visible control. */
    <div
      /*
        The caller's classes and NOTHING else, which is a rule this box learned
        the hard way.

        The controls are `absolute` inside this element, so it has to be their
        containing block — and the obvious way to guarantee that is to append
        `relative`. Doing so is wrong here and the failure is silent: PostMedia
        passes `absolute inset-0`, Tailwind emits `.relative` AFTER `.absolute`
        in its position utilities, so the later rule wins, the box stops being
        pinned to the media frame, and it lays out at the video's own intrinsic
        height instead. Measured in the live feed: a frame correctly clamped to
        675px with a 1005px player hanging out of it.

        An absolutely positioned element is already a containing block for its
        absolute descendants, so appending anything was never needed. What this
        does mean is a contract: whatever a caller passes here must position
        the box. See `className` in the props.
      */
      className={className}
      ref={rootRef}
      // A `group`, not an `application` and not a `region`: the picture is the
      // content and the buttons inside are the controls. Focusable so the
      // transport keys have somewhere to land, which is the whole reason a
      // keyboard user can drive this at all.
      role="group"
      aria-label={label}
      tabIndex={controls ? 0 : -1}
      onKeyDown={controls ? onKeyDown : undefined}
      /*
        A touch or a pen never counts as hover, and never starts the auto-hide
        clock by arriving. See `revealed` above: a browser fires `pointerenter`
        on the way into a tap, so treating that as hover would mean the chrome
        was already "visible" when the tap was decided, and the reveal-first
        rule would quietly never fire.
      */
      onPointerDown={(event) => {
        pointerKind.current = event.pointerType || "mouse"
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") return
        setHovered(true)
        noteActivity()
      }}
      // Always clears, whatever the pointer was: a stale `hovered` left behind
      // on a hybrid laptop would pin the transport open over the picture.
      onPointerLeave={() => setHovered(false)}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") return
        noteActivity()
      }}
      /*
        KEYBOARD focus pins the transport open. A click that merely happened to
        move the DOM focus here does not.

        This box is `tabIndex={0}`, so pressing the picture to pause also
        focuses it — and treating that as "focused" meant the transport never
        faded again for the rest of the session. One click and the controls
        were welded over the picture, which is most of what was wrong with the
        old chrome in the first place.

        `:focus-visible` is the browser's own answer to exactly this question
        and it is already the product's focus-ring rule (tokens.css draws the
        cyan ring on `*:focus-visible`), so the controls now appear under the
        same condition as the ring: if you can see that this is focused, you
        can see the transport. `onKeyDown` upgrades it the moment a key is
        used, which is how a browser upgrades focus-visible too.
      */
      onFocus={(event) => {
        const target = event.target as HTMLElement | null
        try {
          setFocused(target?.matches?.(":focus-visible") ?? true)
        } catch {
          // A browser without :focus-visible keeps the old, safer behaviour:
          // any focus shows the controls.
          setFocused(true)
        }
      }}
      onBlur={(event) => {
        // Focus moving between the group and its own buttons is not "left".
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      {/*
        No lint suppression here any more, and that is the point.

        This element used to carry an `eslint-disable` for
        `jsx-a11y/media-has-caption` with the note "the platform has no caption
        track to attach". It has one now: `GET /v1/subtitles/{mediaId}` lists a
        video's tracks, the zone fetches that list and passes it as `captions`,
        and each row becomes a real `<track>` below. A video with no tracks
        renders none — which is the honest state, and is also why the rule is
        satisfied rather than silenced: the markup can express captions, so the
        linter has nothing to warn about.
      */}
      <video
        ref={attachVideo}
        poster={source.posterUrl}
        muted={isMuted}
        loop={loop}
        playsInline
        preload="metadata"
        aria-label={label}
        className="h-full w-full object-contain"
        onPlaying={handlePlaying}
        onPlay={() => setElementPaused(false)}
        onPause={() => setElementPaused(true)}
        /*
          `emptied` counts as stopped, and this is not a theoretical case.

          Tearing a source off an element — `hls.destroy()`, a new `src`, the
          load algorithm running again — sets `paused` back to true and fires
          `emptied`, and Chrome does NOT fire `pause` on the way. So a video
          that had begun to play and then had its source replaced left React
          believing it was still playing for ever after. The whole transport
          hangs off that flag, so the consequence was a STOPPED video wearing
          no controls at all: nothing to press, and the auto-hide rule saying
          it was fine because the video was "playing".

          Seen in the live feed: `play` (paused=false), then `emptied`
          (paused=true), and no `pause` in between. The fix is to believe the
          element rather than to reason about which events ought to arrive.
        */
        onEmptied={() => setElementPaused(true)}
        onWaiting={() => {
          bufferingRef.current = true
        }}
        onStalled={() => {
          bufferingRef.current = true
        }}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration
          setDuration(Number.isFinite(d) ? d : 0)
          /*
            Re-apply the speed HERE, not only from the effect.

            The media element's load algorithm resets `playbackRate` to 1, and
            it runs at moments React is not told about — hls.js swapping the
            media, a `src` assignment from the fallback path. This is the one
            event that always fires afterwards, so it is where "the rate
            survives a source switch" is actually guaranteed.
          */
          event.currentTarget.playbackRate = rate
          syncBuffered()
          // Forced: this is the first moment there IS a duration to report.
          emitTimeUpdate(event.currentTarget, true)
        }}
        // `progress` is the event that says the buffer moved. `timeupdate`
        // alone would only redraw the loaded bar while the video is PLAYING,
        // so a paused video buffering ahead would show nothing filling.
        onProgress={syncBuffered}
        onDurationChange={(event) => {
          const d = event.currentTarget.duration
          setDuration(Number.isFinite(d) ? d : 0)
          emitTimeUpdate(event.currentTarget, true)
        }}
        onTimeUpdate={(event) => {
          setPlayhead(event.currentTarget.currentTime)
          syncBuffered()
          emitTimeUpdate(event.currentTarget)
        }}
        onEnded={handleEnded}
        onError={() => {
          if (!usingProgressive) setAttach("failed")
        }}
        // A click on the picture is play/pause — every video on the web, and
        // what the phone does. It used to toggle mute, which is why there was
        // no way to stop a video in this feed at all. On a touchscreen the
        // first tap summons the transport instead; see `onPictureClick`.
        onClick={controls ? onPictureClick : undefined}
      >
        {/*
          The subtitle tracks, as elements.

          `default` is deliberately NOT forwarded to the attribute. The browser
          would then set that track `showing` and draw its own cue box — and the
          cue box is ours (see ./captions.ts: `::cue` cannot be styled with
          tokens and cannot be moved above the transport). The publisher's
          default is honoured by `initialCaptionIndex` instead, which puts it
          behind the viewer's own remembered language where it belongs.

          `resolveUrl` is applied for the same reason it is applied to a
          playlist: these are same-origin gateway paths, and under a zone
          basePath an unprefixed one misses the proxy and the cues never arrive.
        */}
        {captionSources?.map((track) => (
          <track
            key={`${track.language}:${track.src}`}
            kind={track.kind ?? "subtitles"}
            srcLang={track.language}
            label={track.label}
            src={resolveUrl ? resolveUrl(track.src) : track.src}
          />
        ))}
      </video>

      {controls && attach !== "failed" && (
        <>
          {/*
            The speaker. Top-right, on its own, and nowhere else ever.

            One place is the whole requirement. It used to be bottom-left,
            wedged between a duration badge and a scrubber that had to carry
            `pl-10` to avoid it — three things fighting over one edge. The
            top-right corner is the only one a transport does not want, so the
            control people reach for most gets a corner to itself and never has
            to move for a carousel, a badge or a seek bar.

            It fades with the rest of the transport, which it could not do
            before: the old objection was that a touchscreen has no hover to
            bring it back. It has a tap now — see `tapOutcome` — so the sound
            is one tap away on a phone and a hover away on a desktop, and the
            picture is unobstructed in between.

            Colour: this sits over PHOTOGRAPHY, so nothing here may rely on a
            theme colour alone. `--mo-ink` on `--mo-bg` at .70 is the scrim the
            carousel's overlays already use, measured 6.46 against a pure white
            frame — AA at any size, and better over anything darker.
          */}
          <button
            type="button"
            onClick={toggleMuted}
            aria-pressed={isMuted}
            // A faded control is not a control. Out of the tab order and out
            // of the accessibility tree while it cannot be seen, so a keyboard
            // user never lands on something invisible — and back in the moment
            // focus reaches the player, because `chromeVisible` is true
            // whenever anything inside this group has focus.
            aria-hidden={!chromeShown}
            tabIndex={chromeShown ? 0 : -1}
            aria-label={isMuted ? `Unmute ${label}` : `Mute ${label}`}
            className={[
              OVERLAY_BUTTON,
              hit,
              "absolute right-2 top-2 h-9 w-9",
              "transition-opacity duration-150 ease-mo motion-reduce:transition-none",
              chromeShown ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {isMuted ? (
              <VolumeXGlyph className="h-4 w-4" />
            ) : (
              <Volume2Glyph className="h-4 w-4" />
            )}
          </button>

          {/*
            The volume slider, beside the speaker and never instead of it.

            ── Why both ─────────────────────────────────────────────────────
            Mute is a destination and volume is a journey. "Stop making noise
            at me, now" is one press; "a bit quieter" is a drag. A player with
            only a slider makes the urgent case a two-handed operation, and one
            with only a button loses the level somebody set (see ./volume.ts:
            unmuting a `volume = 0` player has nowhere to go but full blast).

            It sits to the LEFT of the speaker because the speaker's corner is
            promised to the speaker — the header of this file is emphatic that
            it never moves for anything — so the new control is the one that
            gives ground.

            It is a `role="slider"` and therefore a tab stop — but only while
            the chrome is on screen, the same rule every other control here
            follows, so a hidden transport adds nothing to the tab order.
          */}
          {features.volume && (
            <div
              role="slider"
              aria-label={`Volume for ${label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={volumePercent(isMuted ? 0 : volume)}
              aria-valuetext={isMuted ? "Muted" : `${volumePercent(volume)} percent`}
              aria-hidden={!chromeShown}
              tabIndex={chromeShown ? 0 : -1}
              onKeyDown={onKeyDown}
              onPointerDown={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                changeVolume(volumeFromPointer(event.clientX - rect.left, rect.width))
              }}
              className={[
                hit,
                // 40px tall for the touch target, and `top-1.5` so its centre
                // line is the speaker's: two controls side by side whose middles
                // disagree by two pixels look like a mistake at every size.
                "absolute right-12 top-1.5 flex h-10 w-20 cursor-pointer items-center",
                "rounded-mo-pill bg-mo-bg/70 px-2 backdrop-blur-sm",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo",
                "transition-opacity duration-150 ease-mo motion-reduce:transition-none",
                chromeShown ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              <div className="relative h-1 w-full overflow-hidden rounded-mo-pill bg-mo-ink/30">
                <div
                  className="h-full rounded-mo-pill bg-mo-ink"
                  style={{ width: `${volumePercent(isMuted ? 0 : volume)}%` }}
                />
              </div>
            </div>
          )}

          {/*
            The cue box.

            Ours rather than the browser's, for the two reasons in
            ./captions.ts: `::cue` cannot be given a `--mo-*` colour, and the
            browser's box sits at the bottom of the frame where the transport
            is. This one moves up out of the way when the transport appears,
            which is what every native player does the moment controls show.

            Not `aria-live`. The audio IS the announcement: a screen-reader user
            hearing the video does not need its dialogue read to them a second
            time, and a live region firing on every cue would talk over it.
          */}
          {captionLines.length > 0 && (
            <div
              className={[
                "pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-0.5 px-4",
                "transition-[bottom] duration-150 ease-mo motion-reduce:transition-none",
                chromeShown ? "bottom-20" : "bottom-6",
              ].join(" ")}
            >
              {captionLines.map((line, index) => (
                <span
                  key={`${index}-${line}`}
                  className="max-w-full rounded-mo-sm bg-mo-bg/80 px-2 py-0.5 text-center text-sm leading-snug text-mo-ink"
                >
                  {line}
                </span>
              ))}
            </div>
          )}

          {/*
            The resting playhead: a hairline along the very bottom edge,
            drawn only while the transport is NOT.

            This is `ProgressLine` from the Android tube player, which shows
            exactly this once its controls auto-hide. It answers "how much is
            left" — the one question a person has about a video they are
            already watching — without putting a control over the picture to
            do it, and it is what stops the frame from looking like a still
            image with nothing happening.
          */}
          {restingVisible && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-mo-bg/40">
              <div className="h-full bg-mo-ink/80" style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          {/*
            ── The transport bar ──────────────────────────────────────────

            Seek along the top, then play/pause at the bottom-left with the
            clock beside it. That is VLC's shape, and QuickTime's, and
            YouTube's, and it is the shape because it works: the controls are
            along an edge instead of over the middle of the picture, the seek
            bar gets the full width of the frame to aim at, and the play button
            is where the eye already goes when it leaves a video.

            The right-hand end of the transport row is deliberately EMPTY. A
            carousel prints its own per-page duration badge at bottom-right and
            its position pips at bottom-centre; keeping our content left-anchored
            means the three never collide, so a video inside a carousel looks
            the same as one outside it.
          */}
          <div
            aria-hidden={!chromeShown}
            className={[
              "pointer-events-none absolute inset-x-0 bottom-0",
              "transition-opacity duration-150 ease-mo motion-reduce:transition-none",
              chromeShown ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {/*
              The scrim, and why it is a gradient rather than a bar of colour.

              Everything below sits on user photography, which can be a white
              sky. A hard-edged strip would be a black bar stapled across the
              bottom of every video; a gradient reads as light falling off and
              is what a real player uses. It is sized so the controls sit in
              its dense end: `--mo-bg` at .95 at the very bottom easing to .65
              at the halfway line, which puts the play glyph and the clock on
              roughly .83 and the seek bar on roughly .60. Against the worst
              case — a pure white frame — that is 9.5:1 for the glyph and the
              clock (AAA at any size) and 4.2:1 for the seek bar, which is
              non-text and needs 3.0. Over anything darker it only improves.
            */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-mo-bg/95 via-mo-bg/65 to-transparent"
            />

            <div className="relative flex flex-col gap-1 px-3 pb-2">
              {/*
                The seek bar, and the rule that keeps a feed navigable.

                A `role="slider"` is RENDERED ONLY for a video that has
                actually run. Not hidden, not `tabIndex={-1}` — absent. A feed
                is nineteen posters and one video, and nineteen sliders is
                nineteen extra tab stops and nineteen extra things for a screen
                reader to read out on the way down the page. What the other
                nineteen get is the inert track below: the same line, in the
                same place, with no semantics and nothing to focus.
              */}
              {scrubVisible ? (
                <div
                  ref={scrubRef}
                  // A real slider: `role` and the three values, so the position
                  // is announced and the arrow keys work from the bar itself.
                  // The keys are handled on the group above, which this sits
                  // inside, so they behave identically wherever focus is.
                  role="slider"
                  aria-label={`Seek ${label}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round(playhead)}
                  aria-valuetext={`${formatClock(playhead)} of ${formatClock(duration)}`}
                  tabIndex={0}
                  onPointerDown={onScrub}
                  onKeyDown={onKeyDown}
                  /*
                    The hover readout. Pointer only: a touch that "hovers" is a
                    finger already pressing, and the tooltip would appear under
                    it where it cannot be read.
                  */
                  onPointerMove={(event) => {
                    if (!features.tooltip) return
                    if (event.pointerType === "touch") return
                    const rect = event.currentTarget.getBoundingClientRect()
                    setBarWidth(rect.width)
                    setHoverAt(hoverFraction(event.clientX - rect.left, rect.width))
                  }}
                  onPointerLeave={() => setHoverAt(null)}
                  // A keyboard user gets the same readout at the playhead:
                  // the tooltip is how the bar says what a press will do, and
                  // it may not be a pointer-only affordance.
                  onFocus={(event) => {
                    if (!features.tooltip) return
                    setBarWidth(event.currentTarget.getBoundingClientRect().width)
                    setHoverAt(progress)
                  }}
                  onBlur={() => setHoverAt(null)}
                  className={
                    hit +
                    " group/scrub relative h-4 w-full cursor-pointer rounded-mo-pill" +
                    " focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
                  }
                >
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-mo-pill bg-mo-ink/30 transition-[height] duration-150 ease-mo group-hover/scrub:h-1.5 motion-reduce:transition-none">
                    {/*
                      What is LOADED, behind what has been PLAYED.

                      Each span separately, which is the whole point: after a
                      seek there are two, and one bar from zero would claim the
                      gap between them is ready when it is the exact thing that
                      is about to stall. ./scrubber.ts has the argument.

                      `--mo-ink` at .45 — between the .30 track and the solid
                      played bar, so the three layers read as three depths of
                      the same material rather than as three colours.
                    */}
                    {buffered.map((span) => (
                      <div
                        key={`${span.start}-${span.end}`}
                        aria-hidden="true"
                        className="absolute inset-y-0 bg-mo-ink/45"
                        style={{
                          left: `${span.start * 100}%`,
                          width: `${(span.end - span.start) * 100}%`,
                        }}
                      />
                    ))}
                    {/*
                      The filled part is `--mo-ink` rather than the ember: a
                      scrubber is a MARK, not the primary action on the screen,
                      and an ember bar on every video would put twenty gradient
                      fills in a feed that has one accent colour for the thing
                      it actually wants you to press.
                    */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-mo-pill bg-mo-ink"
                      style={{ width: `${progress * 100}%` }}
                    />
                    {/*
                      Chapter ticks. Drawn in the GROUND colour rather than as
                      marks on top, so a tick reads as a gap in the bar — which
                      is what it is — and stays visible over the played part,
                      the buffered part and the bare track alike.
                    */}
                    {marks.map((at) => (
                      <div
                        key={at}
                        aria-hidden="true"
                        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-mo-bg/90"
                        style={{ left: `${at * 100}%` }}
                      />
                    ))}
                  </div>
                  {/* The handle. A seek bar without one is a progress bar. */}
                  <div
                    aria-hidden="true"
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-mo-pill bg-mo-ink shadow-mo-sm"
                    style={{ left: `${progress * 100}%` }}
                  />
                  {/*
                    The time under the cursor.

                    `aria-hidden`: the slider's own `aria-valuetext` already
                    says where the playhead is, and a screen reader being told
                    a hover position it cannot aim at is noise. This is a
                    sighted-pointer affordance and says so.
                  */}
                  {features.tooltip && hoverAt !== null && duration > 0 && (
                    <div
                      ref={tooltipRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-mo-sm bg-mo-bg/90 px-1.5 py-0.5 text-[11px] tabular-nums text-mo-ink shadow-mo-sm"
                      style={{
                        left: `${tooltipLeftPercent(
                          hoverAt,
                          barWidth,
                          tooltipRef.current?.offsetWidth ?? 0
                        )}%`,
                      }}
                    >
                      {formatClock(hoverAt * duration)}
                    </div>
                  )}
                </div>
              ) : (
                <div aria-hidden="true" className="pointer-events-none relative h-4 w-full">
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-mo-pill bg-mo-ink/30" />
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  // Not focusable, and hidden from assistive technology: it is
                  // the same action as Space on the group and as a press on
                  // the picture. A third tab stop per video would put twenty
                  // of them between a keyboard user and the bottom of the
                  // feed, and a third announcement of the same control is
                  // noise. The group above carries the label and the keys.
                  tabIndex={-1}
                  aria-hidden="true"
                  className={
                    hit +
                    " inline-flex h-8 w-8 items-center justify-center rounded-mo-pill text-mo-ink" +
                    " transition-colors duration-150 ease-mo hover:bg-mo-ink/20 motion-reduce:transition-none"
                  }
                >
                  {isPlaying ? <PauseGlyph className="h-5 w-5" /> : <PlayGlyph className="h-5 w-5" />}
                </button>
                {/*
                  Elapsed in ink, total in body — one is a live number and the
                  other is a fact about the file, and setting them in one
                  colour makes the person read the slash to tell which is
                  which. The total is omitted entirely until metadata arrives,
                  because "0:00 / 0:00" over a poster looks like a broken file.
                */}
                <span className="pointer-events-none select-none text-xs tabular-nums text-mo-ink">
                  {formatClock(playhead)}
                  {duration > 0 && <span className="text-mo-body"> / {formatClock(duration)}</span>}
                </span>
                {/*
                  The chapter, beside the clock and after it.

                  Where you are in the video, then what that part is called —
                  the same order the clock already reads in. Truncated rather
                  than wrapped: a long chapter title must not push the transport
                  row to two lines and move the play button under the picture.
                */}
                {chaptersShown && chapterLabel && (
                  <span className="pointer-events-none min-w-0 flex-1 select-none truncate text-xs text-mo-body">
                    {chapterLabel}
                  </span>
                )}
                {/*
                  The speed, shown only when it is not Normal.

                  A permanent `1×` would be furniture that says nothing; a
                  `1.5×` is the answer to "why does this person sound like
                  that", available without opening the gear.
                */}
                {features.speed && rateIsNotable(rate) && (
                  <span
                    className="pointer-events-none select-none rounded-mo-sm bg-mo-ink/20 px-1.5 py-0.5 text-[11px] tabular-nums text-mo-ink"
                    aria-label={rateAriaLabel(rate)}
                  >
                    {rateLabel(rate)}
                  </span>
                )}

                {/*
                  ── The right-hand cluster ───────────────────────────────

                  The right end of this row used to be deliberately EMPTY, for
                  a good reason that still holds: a carousel prints its own
                  per-page duration badge at bottom-right, so a feed video's
                  transport has to stay left-anchored or the two collide.

                  That reason is about the MINIMAL chrome, and it is preserved
                  exactly — every control below is off unless a caller asked
                  for the full chrome, so a video in a feed or a carousel still
                  has nothing here. A long-video page has no duration badge and
                  wants what every long-video player has.

                  `ml-auto` and not a spacer div, so the cluster stays pinned
                  right whether or not a chapter title is between them.
                */}
                <span className="ml-auto flex items-center">
                  {captionsExist && (
                    <button
                      type="button"
                      data-mo-activate="true"
                      onClick={toggleCaptionTrack}
                      aria-pressed={captionIndex !== CAPTIONS_OFF}
                      aria-label={captionsButtonLabel(currentCaptionLabel)}
                      aria-hidden={!chromeShown}
                      tabIndex={chromeShown ? 0 : -1}
                      className={hit + " " + TRANSPORT_BUTTON}
                    >
                      <CaptionsGlyph className="h-5 w-5" />
                      {/* The underline is the "on" state a glyph alone cannot
                          carry over photography, where a colour change is not
                          reliably visible. */}
                      <span
                        aria-hidden="true"
                        className={[
                          "absolute bottom-1 h-0.5 w-4 rounded-mo-pill bg-mo-ink",
                          captionIndex === CAPTIONS_OFF ? "opacity-0" : "opacity-100",
                        ].join(" ")}
                      />
                    </button>
                  )}
                  {gearShown && (
                    <button
                      type="button"
                      data-mo-activate="true"
                      ref={gearRef}
                      id={gearId}
                      onClick={toggleMenu}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label={`Settings for ${label}`}
                      aria-hidden={!chromeShown}
                      tabIndex={chromeShown ? 0 : -1}
                      className={hit + " " + TRANSPORT_BUTTON}
                    >
                      <SettingsGlyph className="h-5 w-5" />
                    </button>
                  )}
                  {features.pictureInPicture && pipSupported && (
                    <button
                      type="button"
                      data-mo-activate="true"
                      onClick={togglePip}
                      aria-pressed={pipActive}
                      aria-label={pictureInPictureLabel(pipActive)}
                      aria-hidden={!chromeShown}
                      tabIndex={chromeShown ? 0 : -1}
                      className={hit + " " + TRANSPORT_BUTTON}
                    >
                      <PictureInPictureGlyph className="h-5 w-5" />
                    </button>
                  )}
                  {features.fullscreen && fullscreenSupported && (
                    <button
                      type="button"
                      data-mo-activate="true"
                      onClick={toggleFullscreen}
                      aria-pressed={isFullscreen}
                      aria-label={fullscreenLabel(isFullscreen)}
                      aria-hidden={!chromeShown}
                      tabIndex={chromeShown ? 0 : -1}
                      className={hit + " " + TRANSPORT_BUTTON}
                    >
                      {isFullscreen ? (
                        <MinimizeGlyph className="h-5 w-5" />
                      ) : (
                        <MaximizeGlyph className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/*
            The menu, OUTSIDE the transport's fading wrapper.

            That wrapper is `aria-hidden` and `pointer-events-none` whenever the
            chrome is down, and an open menu inside it would become unreachable
            the moment the auto-hide timer expired — three seconds after the
            gear was pressed, with the menu still on screen. It lives here
            instead, and the thing that keeps it visible is that the gear has
            focus, which makes `chromeVisible` true for as long as it does.
          */}
          {gearShown && menuOpen && (
            <SettingsMenu
              title={menuTitle}
              rows={menuRows}
              activeIndex={menuIndex}
              onActivate={onMenuActivate}
              onHover={setMenuIndex}
              onBack={() => {
                setMenuPage("root")
                setMenuIndex(-1)
              }}
              onKeyDown={onMenuKeyDown}
              menuRef={menuElRef}
              rowRef={rowRef}
              labelledBy={gearId}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * The shape every overlay control shares.
 *
 * A circle of scrim with `--mo-ink` on it. The scrim is not decoration: these
 * sit on user photography which can be any colour, including a white sky, and
 * a themed button with no ground behind it disappears into half the pictures
 * on the platform. `--mo-ink` on `--mo-bg` at .70 measures 6.46 against pure
 * white, 11.62 over mid grey and 17.38 over black — the same table the
 * carousel's pill was built from.
 *
 * It carries no `pointer-events` of its own. That belongs to the caller,
 * because it depends on whether the control is currently on screen — see `hit`
 * in the component, and the note there about why both classes must never
 * appear together.
 */
/**
 * A control in the transport row: 40px square, which is the smallest target a
 * finger hits reliably and the number the accessibility brief names.
 *
 * `relative`, because the captions button draws its on-state underline as an
 * absolutely positioned child — a glyph swap alone is not a reliable state
 * indicator over photography, where any colour can be the one behind it.
 *
 * No scrim of its own: these sit inside the transport's gradient, which is
 * already dense enough at the bottom edge to carry `--mo-ink` at 9.5:1 against
 * a pure white frame. The speaker, which floats over the picture with nothing
 * behind it, uses OVERLAY_BUTTON instead.
 */
const TRANSPORT_BUTTON =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-mo-pill " +
  "text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-ink/20 " +
  "motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-mo"

const OVERLAY_BUTTON =
  "inline-flex items-center justify-center rounded-mo-pill " +
  "bg-mo-bg/70 text-mo-ink backdrop-blur-sm transition-colors duration-150 ease-mo " +
  "hover:bg-mo-bg/85 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-mo"

export { HEARTBEAT_INTERVAL_MS, SAMPLE_INTERVAL_MS }
