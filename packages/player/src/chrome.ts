/**
 * Which controls this player draws — one switch, and the reason it defaults off.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * @momentum/player is mounted by three surfaces that want three different
 * players. The feed (@momentum/content's PostMedia) and reels want the
 * smallest transport that can still be driven: play/pause, a speaker, a seek
 * bar. A reel with a gear menu, a captions button and a fullscreen control
 * stacked along its bottom edge is not a reel any more — it is a desktop
 * player wedged into a phone-shaped hole, and those surfaces are explicit
 * that their chrome is minimal.
 *
 * Tube is the other kind: a page you navigated to, watching something long,
 * on a machine with a keyboard. That one wants everything.
 *
 * So the feature set is a PROP, and the default is the small one. A surface
 * that says nothing gets exactly the player it had before any of this existed
 * — that is the compatibility promise, and `chromeFeatures("minimal")`
 * returning all-false is the whole of it. Nothing here is a runtime sniff, a
 * viewport query or a user-agent test: a caller knows what surface it is.
 *
 * ── Why individual flags exist as well ────────────────────────────────────
 * Because a caller can already draw one of these itself and must be able to
 * say so. Tube draws its own "Full video" control (apps/tube/src/watch/
 * expand.ts owns the page-level layout, the theatre fallback and the document
 * scroll lock), so it takes the full chrome and switches the player's own
 * fullscreen BUTTON off — while still routing the `f` key to its toggle. Two
 * controls for one job, sitting on top of each other in the same corner, is
 * the failure this override exists to prevent.
 */

/**
 * `minimal` — the transport the feed and reels have always had.
 * `full` — the long-video player: speed, quality, captions, volume,
 * fullscreen, picture-in-picture, chapters, buffered ranges, a gear menu.
 */
export type PlayerChrome = "minimal" | "full"

/**
 * Every optional control, one flag each.
 *
 * Deliberately flat and deliberately not derived from each other: a resolved
 * feature set is a value the render reads directly, and a `settings` that
 * quietly meant `speed || quality || captions` would be a second place the
 * gear's visibility is decided.
 */
export interface PlayerFeatures {
  /** The 0.25–2 playback-rate list, in the gear menu, and `<` / `>`. */
  speed: boolean
  /** The hls.js level picker, in the gear menu. Absent without hls.js. */
  quality: boolean
  /** The CC button, the language menu, and `c`. */
  captions: boolean
  /** The player's own fullscreen button, and `f`. */
  fullscreen: boolean
  /** The picture-in-picture button, and `i`. */
  pictureInPicture: boolean
  /** A volume slider beside the speaker, and ArrowUp / ArrowDown. */
  volume: boolean
  /** The buffered ranges, drawn behind the played range. */
  buffered: boolean
  /** The hover/focus time tooltip over the scrubber. */
  tooltip: boolean
  /** Chapter ticks on the scrubber and the chapter title beside the clock. */
  chapters: boolean
  /** The gear itself. False leaves speed/quality/captions with no menu. */
  settings: boolean
}

const NONE: PlayerFeatures = {
  speed: false,
  quality: false,
  captions: false,
  fullscreen: false,
  pictureInPicture: false,
  volume: false,
  buffered: false,
  tooltip: false,
  chapters: false,
  settings: false,
}

const ALL: PlayerFeatures = {
  speed: true,
  quality: true,
  captions: true,
  fullscreen: true,
  pictureInPicture: true,
  volume: true,
  buffered: true,
  tooltip: true,
  chapters: true,
  settings: true,
}

/**
 * The resolved feature set: a preset, then the caller's overrides on top.
 *
 * `undefined` in an override means "say nothing", not "off" — a caller
 * spreading a partial object built from optional props must not accidentally
 * switch a preset's features off by mentioning them.
 */
export function chromeFeatures(
  chrome: PlayerChrome = "minimal",
  overrides?: Partial<PlayerFeatures>
): PlayerFeatures {
  const base = chrome === "full" ? ALL : NONE
  if (!overrides) return { ...base }
  const out = { ...base }
  for (const key of Object.keys(base) as (keyof PlayerFeatures)[]) {
    const value = overrides[key]
    if (typeof value === "boolean") out[key] = value
  }
  return out
}

/**
 * Is any of the gear menu's content available?
 *
 * The gear is drawn only when it would open onto something. A menu whose only
 * page is "Quality" on a progressive MP4 — where there are no levels to pick
 * from — is a button that opens an empty box, so the caller passes what it
 * actually has and this answers.
 */
export function settingsMenuUseful(
  features: PlayerFeatures,
  available: { quality?: boolean; captions?: boolean }
): boolean {
  if (!features.settings) return false
  if (features.speed) return true
  if (features.quality && available.quality) return true
  if (features.captions && available.captions) return true
  return false
}
