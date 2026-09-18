/**
 * The four things a player remembers about a viewer, and the storage rules.
 *
 * Speed, quality, caption language and volume. Nothing else: this package
 * still builds no URLs and makes no requests, and `localStorage` is the only
 * state it is allowed to keep between page loads.
 *
 * ── Why every access is wrapped, every time ───────────────────────────────
 * `window.localStorage` is a GETTER that raises `SecurityError` before any
 * read or write happens, in a browser set to block site data, in some
 * private-window configurations, and inside a third-party frame with storage
 * partitioned off. An unguarded read during render throws and React unmounts
 * the tree — the video page would go blank for exactly the people who turned
 * cookies off. A WRITE can also throw on its own after a successful read
 * (quota), so the two are guarded separately rather than sharing one try.
 * This is the shape apps/tube/src/watch/autoplayPreference.ts uses, for the
 * same reasons, and it is worth keeping them identical.
 *
 * ── Why not in `soundPreference.ts` ───────────────────────────────────────
 * Because sound is a different question and its header says so at length: the
 * armed bit is half a statement about the DOCUMENT ("a gesture has happened
 * here"), a reload destroys that half, and persisting the other half alone
 * would make every video of a new session attempt an unmuted start and be
 * refused. None of that applies to a playback rate. A person who set 1.5×
 * yesterday expects 1.5× today, and restoring it costs nobody an unexpected
 * noise.
 *
 * ── Per viewer, not per device ────────────────────────────────────────────
 * The key carries the account id the caller passes. Two people sharing a
 * machine do not inherit each other's speed. A signed-out visitor gets the
 * shared anonymous key, which is the honest answer: there is nobody to
 * attribute it to.
 *
 * ── A stored value is never trusted ───────────────────────────────────────
 * Every reader below parses rather than casts. Storage holds whatever some
 * other version of this app, an extension, or a person with devtools put
 * there, and a `playbackRate` of `"fast"` assigned to a video element throws.
 * Anything unrecognised means "no preference", which is always the default.
 */

/** Namespaced: every zone in this product shares one origin. */
const PREFIX = "momentum.player"

/**
 * The storage key for one preference and one viewer.
 *
 * Exported and tested because a key that changes shape silently orphans every
 * preference already stored — a person's settings would simply vanish once,
 * with nothing to point at.
 */
export function preferenceKey(name: string, viewerId: string | null | undefined): string {
  const id = (viewerId ?? "").trim()
  return id ? `${PREFIX}.${name}.${id}` : `${PREFIX}.${name}.anon`
}

/** The raw stored string, or null when there is none and when storage bites. */
export function readPreference(name: string, viewerId: string | null | undefined): string | null {
  try {
    return window.localStorage.getItem(preferenceKey(name, viewerId))
  } catch {
    // Storage is unavailable. There is no preference, which is a state every
    // caller already handles — it is what a first visit looks like.
    return null
  }
}

/**
 * Remember it, or don't.
 *
 * A failure is silent on purpose. The control still moved and the video is
 * still playing at the new speed; telling somebody their browser refused to
 * write 4 bytes is noise about something they cannot fix from a video player.
 */
export function writePreference(
  name: string,
  viewerId: string | null | undefined,
  value: string
): void {
  try {
    window.localStorage.setItem(preferenceKey(name, viewerId), value)
  } catch {
    // Quota, or a browser that allows reads and refuses writes.
  }
}

/** Forget it — used when a choice returns to "no preference" (captions off). */
export function clearPreference(name: string, viewerId: string | null | undefined): void {
  try {
    window.localStorage.removeItem(preferenceKey(name, viewerId))
  } catch {
    // Same as above.
  }
}
