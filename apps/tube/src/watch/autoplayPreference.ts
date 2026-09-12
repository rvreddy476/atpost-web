/**
 * Whether this viewer wants the next episode to start by itself.
 *
 * The same shape as ../chrome/railStorage.ts, for the same reasons, and they
 * are worth restating because the failure is silent:
 *
 * ── Why localStorage throws, and why every access is wrapped ──────────────
 * `window.localStorage` is a GETTER that raises `SecurityError` before any
 * read or write in a browser set to block site data, in some private-window
 * configurations, and inside a third-party frame with storage partitioned
 * off. An unguarded read during render throws, and React unmounts the tree:
 * the watch page would go blank for exactly the people who turned cookies
 * off. A write can also throw on its own after a successful read (quota), so
 * the two are guarded separately.
 *
 * ── Per viewer, not per device ────────────────────────────────────────────
 * The key carries the account id, so two people sharing a machine do not
 * inherit each other's choice. A signed-out visitor gets the shared anonymous
 * key, which is the honest answer: there is nobody to attribute it to.
 *
 * ── The default is ON, and only an explicit "0" turns it off ──────────────
 * The founder's decision. And the parser is strict in the same direction the
 * rail's is: absent, "", "true", "false", "off", or anything some other
 * version of this app wrote all mean the default. A parser that read every
 * non-"1" as off would switch autoplay off for anyone whose storage held a
 * stray value, and they would never know a countdown existed.
 */

const PREFIX = "momentum.tube.autoplay-next"

/** The storage key for one viewer. Namespaced: every zone shares one origin. */
export function autoplayNextKey(viewerId: string | null | undefined): string {
  const id = (viewerId ?? "").trim()
  return id ? `${PREFIX}.${id}` : `${PREFIX}.anon`
}

/** What a stored value means. Only the exact string "0" is off. */
export function parseAutoplayNext(raw: string | null | undefined): boolean {
  return raw !== "0"
}

/** The stored preference. True when there is none and when storage bites. */
export function readAutoplayNext(viewerId: string | null | undefined): boolean {
  try {
    return parseAutoplayNext(window.localStorage.getItem(autoplayNextKey(viewerId)))
  } catch {
    // Storage is unavailable. The default is the founder's default, and it is
    // also the state whose consequence is visible (a ten-second card with a
    // Cancel on it) rather than the one that silently never offers.
    return true
  }
}

/** Remember it. A failure is silent on purpose: the switch still moved. */
export function writeAutoplayNext(viewerId: string | null | undefined, enabled: boolean): void {
  try {
    window.localStorage.setItem(autoplayNextKey(viewerId), enabled ? "1" : "0")
  } catch {
    // Quota, or a browser that allows reads and refuses writes. The choice
    // holds for this page and will not survive the tab. Saying so would be
    // noise about something the person cannot fix from here.
  }
}
