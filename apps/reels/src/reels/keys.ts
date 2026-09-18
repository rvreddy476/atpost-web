/**
 * Which key does what on the shorts surface.
 *
 * ── This file used to share the keyboard, and no longer does ──────────────
 * `MomentumVideo` binds its own `onKeyDown` and claims Space, `k`, `m`, the
 * arrows, Home, End and the digits — but ONLY when it is drawing its own
 * transport. This zone now passes `controls={false}` and draws the playhead,
 * the speaker and the pause affordance itself (see ./ReelTransport.tsx), and
 * with controls off the player is `tabIndex={-1}` and binds no key handler at
 * all. So there is exactly one keyboard owner on this surface: this file.
 *
 * That is why `m`, `l`, `c` and Space can be claimed here without the overlap
 * argument the old header had to make. It also means the keys the player used
 * to provide are this zone's responsibility now, and Space is the one that
 * would otherwise be a regression: a full-screen video with no way to pause it
 * from the keyboard is worse than the split ownership it replaced.
 *
 * ── Modifier chords are never ours ────────────────────────────────────────
 * Ctrl+Home is "top of document", Cmd+Down is "end of document" on macOS, and
 * claiming either would break the browser to move a video. Any modifier means
 * the press was not for us.
 *
 * ── Home and End are still deliberately absent ────────────────────────────
 * "First short / last short" sounds harmless and is not: the feed is ranked
 * and paginated, so "last" means the last one FETCHED, which changes under the
 * person as they watch. A key whose destination moves is worse than no key.
 *
 * No React and no DOM in this file: the mapping is the part worth asserting,
 * and it can be asserted without either.
 */

/**
 * Everything a key press on this surface can mean.
 *
 * A union rather than a bare delta so that adding a binding forces every call
 * site to say what it does with it — the previous version returned only a move
 * and the viewer's handler could not have grown a second case without somebody
 * noticing it had to.
 */
export type ReelKeyAction =
  /** Move by one short, in the direction given. */
  | { kind: "move"; delta: 1 | -1 }
  /** Play or pause the short on screen. */
  | { kind: "playPause" }
  /** Flip the shared sound preference. */
  | { kind: "mute" }
  /** Like or unlike the short on screen. */
  | { kind: "like" }
  /** Open the comments panel. */
  | { kind: "comments" }

export function reelKeyAction(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}
): ReelKeyAction | null {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt || modifiers.shift) return null

  switch (key) {
    case "ArrowDown":
    case "PageDown":
    // j/k are the reader's pair — j down, k up — from every mail client and
    // issue tracker that has ever had a list.
    case "j":
    case "J":
      return { kind: "move", delta: 1 }
    case "ArrowUp":
    case "PageUp":
    case "k":
    case "K":
      return { kind: "move", delta: -1 }

    // The web's universal play/pause, and the reason it has to be claimed
    // here: with the player's own transport off, nothing else binds it.
    case " ":
    // Older engines report the space bar under this name, and a surface whose
    // pause key works in one browser and not another is not production ready.
    case "Spacebar":
      return { kind: "playPause" }

    // YouTube's letters, which is where anybody who reaches for one of these
    // will have learned them. `m` mute, `l` like, `c` comments.
    case "m":
    case "M":
      return { kind: "mute" }
    case "l":
    case "L":
      return { kind: "like" }
    case "c":
    case "C":
      return { kind: "comments" }

    default:
      return null
  }
}

/**
 * Where a move lands.
 *
 * Clamped rather than wrapped. A shorts surface that jumped from the last one
 * back to the first would look like it had silently reloaded, and the pager
 * has no way to say "you have reached the end" from the top of the list. The
 * end of the feed is the end of the feed, and the surface says so on screen.
 */
export function moveTarget(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, current + delta))
}
