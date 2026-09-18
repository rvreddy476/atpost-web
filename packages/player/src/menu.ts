/**
 * The gear menu's keyboard, as a state machine over an index.
 *
 * ── Why a menu and not a listbox, and why it matters here ─────────────────
 * The WAI-ARIA menu pattern is a ROVING TABSTOP: the menu itself is one stop,
 * exactly one item is focusable at a time, and the arrows move that focus.
 * The alternative — every item a tab stop — is what a naive implementation
 * does, and inside a video player it is the worse failure of the two: a
 * settings menu with eight speeds in it would put eight extra stops between a
 * keyboard user and the rest of the page, on a control that is supposed to be
 * a shortcut.
 *
 * Home and End are part of the pattern and are cheap to support; a menu of
 * eight speeds where `End` reaches 2× in one press is the difference between
 * a menu a keyboard user tolerates and one they avoid.
 *
 * ── Wrapping, here, is right ──────────────────────────────────────────────
 * Opposite to `stepRate`, deliberately. A menu is a ring: it is small, closed,
 * entirely visible, and the spec says so — down from the last item goes to the
 * first. The reason `<` and `>` clamp instead is that they act on a list
 * nobody can see, where a wrap from 2× to 0.25× is an unexplained lurch.
 *
 * ── Escape gives the focus back ───────────────────────────────────────────
 * Closing a menu without restoring focus to the button that opened it leaves a
 * keyboard user at the top of the document with no idea what happened. That is
 * `MomentumVideo`'s job to perform; this file only names the action.
 */

/** What a key press means inside an open menu. */
export type MenuAction =
  | { kind: "move"; index: number }
  | { kind: "activate" }
  | { kind: "close" }

/**
 * Where an arrow lands, given where it started.
 *
 * `count` of 0 has no valid index and returns -1 rather than throwing — a menu
 * can be re-rendered empty (a quality list arriving after a source switch)
 * between the key press and the handler.
 */
export function nextMenuIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return -1
  const at = current < 0 || current >= count ? 0 : current
  switch (key) {
    case "ArrowDown":
      return (at + 1) % count
    case "ArrowUp":
      return (at - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

/**
 * What a key does to an open menu, or null to let it through.
 *
 * ── The keys this claims and the ones it must not ─────────────────────────
 * Arrows, Home, End, Enter, Space and Escape are the menu's. Tab is
 * deliberately NOT: the pattern says Tab closes the menu and moves on, and
 * trapping it would make the menu a focus trap inside a video inside a page.
 * `MomentumVideo` closes on blur, which covers it without claiming the key.
 *
 * A modified press is never ours. Alt+ArrowDown is "history forward" in some
 * browsers and Cmd+ArrowUp is "top of document" on macOS.
 *
 * This runs INSTEAD of the player's own `keyAction` while the menu is open,
 * which is the whole reason it exists: ArrowUp inside an open menu must move
 * the highlight, not the volume, and ArrowLeft must not seek the video out
 * from under somebody reading a speed list.
 */
export function menuKeyAction(
  key: string,
  count: number,
  current: number,
  modifiers: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}
): MenuAction | null {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return null
  switch (key) {
    case "Escape":
      return { kind: "close" }
    case "Enter":
    case " ":
    case "Spacebar":
      return { kind: "activate" }
    // Left is "back" in a submenu and is handled as a close by the caller,
    // which is the same key the pattern gives for leaving a nested menu.
    case "ArrowLeft":
      return { kind: "close" }
    default: {
      const index = nextMenuIndex(current, count, key)
      return index === null ? null : { kind: "move", index }
    }
  }
}

/**
 * Was a click outside the menu?
 *
 * The rule is "outside the menu AND outside the button that opens it" — a
 * press on the gear while the menu is open must be a toggle and nothing else.
 * Counting it as an outside click closes the menu, and then the button's own
 * handler reopens it in the same gesture: the menu flickers and never closes,
 * which is a bug that only appears with a mouse.
 */
export function isOutsidePress(
  target: Node | null,
  menu: Node | null,
  trigger: Node | null
): boolean {
  if (!target) return true
  if (menu && (menu === target || menu.contains(target))) return false
  if (trigger && (trigger === target || trigger.contains(target))) return false
  return true
}
