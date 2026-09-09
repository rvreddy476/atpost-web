/**
 * Which key moves between reels, and — just as importantly — which does not.
 *
 * ── The surface has TWO keyboard owners and they must not overlap ─────────
 * `MomentumVideo` binds its own `onKeyDown` and claims Space, `k`, `m`,
 * ArrowLeft, ArrowRight, Home, End and the digits (see `keyAction` in
 * @momentum/player's controls.ts). It calls `stopPropagation` on every key it
 * claims, so those never reach this zone's handler at all — which is what
 * makes it safe for `k` to appear in BOTH lists: pressed with the player
 * focused it is play/pause, and pressed anywhere else on the page it is
 * "previous reel". The event never means two things at once.
 *
 * What this file must therefore never claim is a key the player also wants
 * for a DIFFERENT job in a way a person would notice. Home and End are the
 * example, and they are deliberately absent: inside the player they seek to
 * the start and end of the reel, and "first reel / last reel" would be a
 * second, invisible meaning for the same press depending on where the focus
 * happened to be. ArrowUp/ArrowDown and PageUp/PageDown are claimed by
 * neither, which is why they are the primary bindings.
 *
 * Modifier chords are never ours. Ctrl+Home is "top of document", Cmd+Down is
 * "end of document" on macOS, and claiming either would break the browser to
 * move a video.
 *
 * No React and no DOM in this file: the mapping is the part worth asserting,
 * and it can be asserted without either.
 */

/** Move by one reel, in the direction given. */
export type ReelKeyAction = { kind: "move"; delta: 1 | -1 }

export function reelKeyAction(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}
): ReelKeyAction | null {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt || modifiers.shift) return null

  switch (key) {
    case "ArrowDown":
    case "PageDown":
    // j/k are the reader's pair — j down, k up — from every mail client and
    // issue tracker that has ever had a list. See the header for why `k` is
    // safe here despite the player also wanting it.
    case "j":
    case "J":
      return { kind: "move", delta: 1 }
    case "ArrowUp":
    case "PageUp":
    case "k":
    case "K":
      return { kind: "move", delta: -1 }
    default:
      return null
  }
}

/**
 * Where a move lands.
 *
 * Clamped rather than wrapped. A reels surface that jumped from the last reel
 * back to the first would look like it had silently reloaded, and the pager
 * has no way to say "you have reached the end" from the top of the list. The
 * end of the feed is the end of the feed; `FeedEnd` says so on screen.
 */
export function moveTarget(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, current + delta))
}
