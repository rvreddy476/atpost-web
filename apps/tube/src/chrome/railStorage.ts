/**
 * Whether this viewer keeps the rail collapsed, remembered between visits.
 *
 * ── Why localStorage throws, and why every access is wrapped ──────────────
 * Not defensive habit. `window.localStorage` is a GETTER that raises
 * `SecurityError` outright — before any read or write — in a browser set to
 * block site data, in some private-window configurations, and inside a
 * third-party frame with storage partitioned off. An unguarded
 * `localStorage.getItem` in a layout does not degrade to "no preference": it
 * throws during render, and React unmounts the tree. The whole application
 * shell would go blank for exactly the people who turned cookies off.
 *
 * A write can also throw on its own after a successful read — `QuotaExceeded`
 * on a full origin — so the two are guarded separately rather than once
 * around both.
 *
 * ── Per viewer, not per device ────────────────────────────────────────────
 * Or as close as a browser gets: the key carries the account id, so two
 * people sharing a machine do not inherit each other's rail. A signed-out
 * visitor gets the shared anonymous key, which is the honest answer — there
 * is nobody to attribute the preference to.
 *
 * ── Pure parsing, testable without a DOM ──────────────────────────────────
 * `railKey` and `parseCollapsed` are the whole decision and neither touches
 * `window`, so the thing that can actually be wrong — a key that collides
 * between accounts, or a stray value read as `true` — is asserted in
 * ./rail.test.ts rather than clicked at.
 */

const PREFIX = "momentum.tube.rail.collapsed"

/**
 * The storage key for one viewer.
 *
 * Namespaced with the app and the surface because localStorage is per ORIGIN,
 * and behind the shell every zone shares one: a bare "collapsed" here would
 * be the same slot the shop or the feed might reach for.
 */
export function railKey(viewerId: string | null | undefined): string {
  const id = (viewerId ?? "").trim()
  return id ? `${PREFIX}.${id}` : `${PREFIX}.anon`
}

/**
 * What a stored value means.
 *
 * Only the exact string "1" is collapsed. Anything else — absent, "", "true",
 * a value some other version of this app wrote, a value a person typed into
 * devtools — is the default, which is the expanded rail. A parser that
 * treated every non-empty string as true would collapse the rail for anyone
 * whose storage contained the word "false".
 */
export function parseCollapsed(raw: string | null | undefined): boolean {
  return raw === "1"
}

/** The stored preference, or false when there is none and when storage bites. */
export function readCollapsed(viewerId: string | null | undefined): boolean {
  try {
    return parseCollapsed(window.localStorage.getItem(railKey(viewerId)))
  } catch {
    // Storage is unavailable, which is not the same as "expanded" but is
    // indistinguishable from it here — and an expanded rail is the state that
    // shows every destination, so it is the right thing to fail into.
    return false
  }
}

/** Remember it. A failure is silent on purpose: the rail still collapsed. */
export function writeCollapsed(viewerId: string | null | undefined, collapsed: boolean): void {
  try {
    window.localStorage.setItem(railKey(viewerId), collapsed ? "1" : "0")
  } catch {
    // Quota, or a browser that allows reads and refuses writes. The person
    // asked for a narrow rail and they have one; it simply will not survive
    // the tab. Telling them that would be noise about something they cannot
    // fix from here.
  }
}
