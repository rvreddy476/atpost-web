/**
 * "Full video" — the founder's expand control for long video, as arithmetic.
 *
 *     "We have to give to expand option for reels or video. 1. When user click
 *      on expand button for reels, it plays full page as it now. 2. When user
 *      click on Full video expand, it ill play full video"
 *
 * Pure: no React, no DOM. The hook that drives a real element is
 * ./useExpand.ts; everything that can be decided without a browser is decided
 * here so it can be asserted without one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DECISION: THE FULLSCREEN API, NOT A THEATRE ROUTE
 *
 * Two designs were available and the brief asked for one to be chosen and the
 * reason written down. This is the reason.
 *
 * ── The route that was rejected ───────────────────────────────────────────
 * `/tube/{postId}/theatre`, or a `?theatre=1` on the watch page, rendering the
 * player full-bleed. It is the obvious mirror of what reels does — there,
 * "expand" IS a route, `/reels/{postId}`, and it works because a reel is not
 * playing yet when you expand it. You are looking at a poster in a grid and
 * the route change is what starts the video.
 *
 * On a watch page the video is ALREADY PLAYING when the control is pressed,
 * and that changes the cost of a route completely. A Next route change
 * unmounts the old page's tree, so:
 *
 *   · hls.js is torn down and rebuilt, and the master and child playlists are
 *     fetched again — a stall in the middle of something somebody is watching;
 *   · the playhead goes back to zero unless it is threaded through the URL,
 *     and threading it through the URL means a shareable link that starts
 *     eleven minutes in;
 *   · and the one that decides it: `WatchSession` in @momentum/player fires
 *     `play_end` on teardown and the next mount starts a fresh session id. One
 *     view arrives at analytics as two shorter ones. That is the number a
 *     creator is PAID from — `watched_ms_total`, `max_continuous_watch_ms` and
 *     the milestone ladder all reset — so pressing "full video" would quietly
 *     cost the author of the video the credit for the half they had already
 *     earned. A control whose price is somebody else's money is the wrong
 *     control.
 *
 * ── What is built instead ─────────────────────────────────────────────────
 * `Element.requestFullscreen()` on the player's own box. The element does not
 * move in the DOM and nothing unmounts, so the video does not pause, does not
 * re-buffer, does not lose a frame of measurement, and the `<video>` keeps the
 * transport @momentum/player already draws — the speaker top-right, the seek
 * bar and play/pause bottom-left, hidden while playing and revealed on hover.
 * It is also what every long-video player on the web does, so the gesture is
 * one people already have.
 *
 * ── The fallback, and why it is a class rather than a portal ──────────────
 * `requestFullscreen` is not universal. iPhone Safari has no
 * `Element.requestFullscreen` at all (only `HTMLVideoElement.webkitEnter-
 * FullScreen`, which hands the video to the OS player and takes our transport,
 * our analytics and our controls away with it), and the call rejects outright
 * inside an iframe without `allow="fullscreen"` and under some enterprise
 * policies. A rejected promise there is silent — no exception, no console —
 * so a control built on it alone is a button that sometimes does nothing.
 *
 * So there is a second mode, `theatre`, which is the SAME element with
 * `position: fixed; inset: 0` on it (`.tube-theatre` in app/globals.css). It
 * fills the window rather than the screen, which is the honest most a page can
 * do when the browser refuses the rest. It is never a different element and
 * never a different parent: moving the player into a portal would unmount it
 * and cost exactly what the route was rejected for.
 *
 * ── The way back is visible in both, and there are three of them ──────────
 * A labelled control drawn inside the expanded player, `Escape`, and — in
 * fullscreen only — the browser's own exit affordance. The first two are what
 * this file describes. The label CHANGES with the mode: a control that still
 * says "Full video" while the video is already full screen is the commonest
 * way an expanded player traps somebody.
 */

/**
 * `inline` — the player in the page, 16:9, in the frame's centre track.
 * `fullscreen` — the browser's real fullscreen, on the player's own box.
 * `theatre` — the same box fixed over the window, when fullscreen is refused.
 */
export type ExpandMode = "inline" | "fullscreen" | "theatre"

/** Is the player filling something bigger than its slot in the page? */
export function isExpanded(mode: ExpandMode): boolean {
  return mode !== "inline"
}

/**
 * Which expansion to attempt.
 *
 * `canFullscreen` is a capability answered from the live element by
 * ./useExpand.ts, never a user-agent string. It is a parameter so the branch
 * can be asserted for both browsers in one test run.
 */
export function expandTarget(canFullscreen: boolean): Exclude<ExpandMode, "inline"> {
  return canFullscreen ? "fullscreen" : "theatre"
}

/**
 * What the control says about itself.
 *
 * "Full video" is the founder's own phrase and it is used verbatim rather than
 * translated into "Fullscreen" — it is the word this feature is called by, and
 * the control that undoes it should be recognisably its opposite.
 */
export function expandLabel(mode: ExpandMode): string {
  return isExpanded(mode) ? "Exit full video" : "Full video"
}

/**
 * The accessible name, which says more than the label has room for.
 *
 * `aria-label` rather than a `title`: a tooltip is invisible to a keyboard and
 * to a screen reader, and this is the sentence that tells somebody how to get
 * back out.
 */
export function expandAriaLabel(mode: ExpandMode): string {
  if (mode === "fullscreen") return "Exit full video. Escape also exits."
  if (mode === "theatre") return "Exit full video. Escape also exits."
  return "Play this video full screen"
}

/**
 * The classes for the player's box.
 *
 * `inline` keeps the 16:9 slot the page reserved. Both expanded modes hand the
 * work to `.tube-theatre`, and that is deliberate for FULLSCREEN too: a
 * `:fullscreen` element is sized by the browser, but its own `aspect-[16/9]`
 * would still letterbox it inside that screen, and `max-w` from the page's
 * layout would still cap it. The class removes both. The rules live in
 * app/globals.css, not here, because this file may not know about a DOM.
 */
export function frameClass(mode: ExpandMode): string {
  const base = "relative w-full overflow-hidden bg-black"
  if (isExpanded(mode)) return `${base} tube-theatre`
  return `${base} aspect-video rounded-mo`
}

/**
 * Should this key collapse the player?
 *
 * Escape only, and ONLY in the theatre mode. In real fullscreen the browser
 * consumes Escape itself and fires `fullscreenchange` on the way out, which
 * ./useExpand.ts listens for — so handling it here as well would be a second
 * exit racing the first, and the observed shape of that race is a player that
 * leaves fullscreen and then immediately re-enters it.
 *
 * A modified Escape is left alone: browsers and extensions bind them.
 */
export function collapsesOnKey(
  mode: ExpandMode,
  key: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}
): boolean {
  if (mode !== "theatre") return false
  if (mods.ctrl || mods.meta || mods.alt || mods.shift) return false
  return key === "Escape"
}

/**
 * Does the DOCUMENT need to stop scrolling?
 *
 * In theatre mode, yes: the overlay is `fixed`, so a wheel over it moves the
 * page underneath and leaving the expansion lands somewhere other than where
 * it was entered. Real fullscreen takes the document out of the picture
 * entirely and needs nothing.
 *
 * The caller puts `.tube-theatre-open` on <body> for this, and must take it
 * off again on exit, on Escape AND on unmount — a class left behind by a
 * navigation is a page that silently cannot be scrolled.
 */
export function locksDocumentScroll(mode: ExpandMode): boolean {
  return mode === "theatre"
}
