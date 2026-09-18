/**
 * Fullscreen and picture-in-picture: the capability tests and the labels.
 *
 * ── The element must never be re-parented ─────────────────────────────────
 * Both of these act on an element that STAYS WHERE IT IS. Moving the player
 * into a portal to make it full-bleed would unmount and remount the tree, and
 * the cost of that is written out at length in apps/tube/src/watch/expand.ts:
 * hls.js is destroyed and rebuilt, the playhead goes back to zero, and
 * `WatchSession` fires `play_end` and starts a fresh session id — so one view
 * arrives at analytics as two shorter ones and the creator is paid for
 * neither properly. `requestFullscreen` and `requestPictureInPicture` both
 * leave the DOM alone, which is exactly why they are the mechanisms chosen.
 *
 * ── Tube already owns fullscreen, and this does not fight it ──────────────
 * The watch page has its own expand control, its own theatre fallback for
 * browsers that refuse the Fullscreen API, and the document scroll lock that
 * goes with it. So `MomentumVideo` takes an `onToggleFullscreen` delegate: when
 * a caller supplies one, the player's button and the `f` key call it instead
 * of touching the API, and the caller's state drives the glyph. A caller that
 * supplies nothing gets the built-in behaviour on its own box. One mechanism,
 * one owner, per surface.
 *
 * ── Both controls are ABSENT when unsupported, never disabled ─────────────
 * `requestFullscreen` does not exist on iPhone Safari at all, and
 * `document.pictureInPictureEnabled` is false in a locked-down iframe and on
 * every iOS browser. A greyed-out button there is a permanent piece of
 * furniture advertising something this browser will never do; nothing at all
 * is the honest state.
 */

/** The element-side half of the Fullscreen API this package uses. */
export interface FullscreenTargetLike {
  requestFullscreen?: () => Promise<void>
}

/** The video-element half of the Picture-in-Picture API this package uses. */
export interface PipTargetLike {
  requestPictureInPicture?: () => Promise<unknown>
  disablePictureInPicture?: boolean
}

/**
 * Can this element go fullscreen?
 *
 * Asked of the ELEMENT, never of a user-agent string: the thing that will or
 * will not answer the call is the only honest source. A caller that delegates
 * (see the header) answers `true` without asking, because whatever it does
 * instead — a theatre overlay, say — is its own to guarantee.
 */
export function canFullscreen(
  target: FullscreenTargetLike | null | undefined,
  delegated: boolean
): boolean {
  if (delegated) return true
  return typeof target?.requestFullscreen === "function"
}

/**
 * Can this video go picture-in-picture?
 *
 * Three conditions, and all three are load-bearing:
 *   · the document must allow it — false inside an iframe without
 *     `allow="picture-in-picture"`, and on every iOS browser;
 *   · the element must implement it — `requestPictureInPicture` is absent on
 *     Firefox's element even though Firefox has its own PiP button;
 *   · the element must not have opted out. `disablePictureInPicture` is a
 *     content decision (a caller may set it on a live stream), and a button
 *     that throws `InvalidStateError` when pressed is worse than no button.
 */
export function canPictureInPicture(
  video: PipTargetLike | null | undefined,
  documentEnabled: boolean
): boolean {
  if (!documentEnabled) return false
  if (typeof video?.requestPictureInPicture !== "function") return false
  return video.disablePictureInPicture !== true
}

/**
 * The fullscreen button's accessible name.
 *
 * It names the action, not the state, and it mentions the way back out —
 * `Escape` is handled by the browser and a person who does not know that is a
 * person who feels trapped. `aria-pressed` carries the state.
 */
export function fullscreenLabel(isFullscreen: boolean): string {
  return isFullscreen ? "Exit full screen. Escape also exits." : "Full screen"
}

/** The PiP button's accessible name. Same rule: the action, not the state. */
export function pictureInPictureLabel(isActive: boolean): string {
  return isActive ? "Exit picture in picture" : "Play in picture in picture"
}
