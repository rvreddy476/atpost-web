/**
 * Captions: which tracks exist, which one is on, and what its cues say.
 *
 * Two sources, one list. hls.js surfaces a manifest's `SUBTITLES` renditions
 * as `hls.subtitleTracks`, and a caller can also put plain `<track>` children
 * on the element; both end up as rows here, described by the same three
 * fields, so the button and the menu do not have to know which kind they are
 * driving. `MomentumVideo` owns the difference — `hls.subtitleTrack = n` for
 * the first, `textTrack.mode` for the second.
 *
 * ── The cue box is ours, and that is a deliberate cost ────────────────────
 * The chosen track is set to `hidden`, not `showing`, and the text is drawn by
 * this package instead. The browser's own rendering cannot be styled with
 * anything this product owns: `::cue` takes a handful of properties, is
 * inconsistent across engines, and would need a global stylesheet in a package
 * that ships none. Drawing it means the scrim, the type and the position come
 * from `--mo-*` like everything else, and — the part that actually matters —
 * the box can sit ABOVE the transport instead of underneath it, which is where
 * every native implementation puts it the moment controls appear.
 *
 * `hidden` and not `disabled` is the load-bearing word: a disabled track stops
 * firing `cuechange` and its `activeCues` go empty, so the captions would
 * simply not exist. Hidden keeps the parsing and the events and draws nothing.
 *
 * ── Off is a real choice and is remembered as one ─────────────────────────
 * The CC button toggles the LAST USED language rather than cycling, because
 * cycling through eleven languages to get back to English is not a toggle.
 * The language is remembered; "off" is remembered as the absence of one.
 */

import { readPreference, writePreference, clearPreference } from "./preferences"

const STORAGE_NAME = "captions"

/** The shape this file needs from a TextTrack or an hls.js subtitle track. */
export interface CaptionTrackLike {
  /** BCP-47, as the manifest or the `<track srclang>` gave it. May be empty. */
  lang?: string
  /** The human name, when there is one. */
  label?: string
  /** `subtitles`, `captions`, `descriptions`… Only the first two are ours. */
  kind?: string
}

/** One row of the captions menu. `index` indexes the ORIGINAL track list. */
export interface CaptionOption {
  index: number
  label: string
  lang: string
}

/** The value that means "no captions". Not an index into anything. */
export const CAPTIONS_OFF = -1

/**
 * What a track is called.
 *
 * The author's own label first — it is the only one that can say "English
 * (auto-generated)" or "Director's commentary". The language tag is the
 * fallback, uppercased so `en` does not read as a typo, and a bare position is
 * the last resort so two unnamed tracks are still tellable apart.
 */
export function captionLabel(track: CaptionTrackLike, index: number): string {
  const label = (track.label ?? "").trim()
  if (label) return label
  const lang = (track.lang ?? "").trim()
  if (lang) return lang.toUpperCase()
  return `Track ${index + 1}`
}

/**
 * The rows, in the order the manifest gave them.
 *
 * Not sorted: a caption list has a deliberate order (the original language
 * first, then translations) and re-sorting it alphabetically would put Arabic
 * above the language the video is actually in.
 *
 * `descriptions` and `metadata` tracks are dropped. A metadata track is how
 * chapters and ad markers travel and is not text anybody should be shown;
 * offering it in a captions menu is how a player ends up printing JSON over
 * the picture.
 */
export function captionOptions(tracks: readonly CaptionTrackLike[]): CaptionOption[] {
  const rows: CaptionOption[] = []
  tracks.forEach((track, index) => {
    const kind = (track.kind ?? "subtitles").toLowerCase()
    if (kind !== "subtitles" && kind !== "captions") return
    rows.push({ index, label: captionLabel(track, index), lang: (track.lang ?? "").trim() })
  })
  return rows
}

/** Is there anything to turn on? No tracks means no CC button at all. */
export function captionsAvailable(options: readonly CaptionOption[]): boolean {
  return options.length > 0
}

/**
 * The row for a remembered language, or null.
 *
 * Exact match first, then the primary subtag: a viewer who chose `en-GB` on
 * one video and meets a ladder carrying only `en` should get captions, not
 * silence. The comparison is case-insensitive because BCP-47 is, and manifests
 * are written by hand.
 */
export function findCaptionByLanguage(
  options: readonly CaptionOption[],
  lang: string | null | undefined
): CaptionOption | null {
  const want = (lang ?? "").trim().toLowerCase()
  if (!want) return null
  for (const option of options) {
    if (option.lang.toLowerCase() === want) return option
  }
  const primary = want.split("-")[0]!
  for (const option of options) {
    if (option.lang.toLowerCase().split("-")[0] === primary) return option
  }
  return null
}

/**
 * What the CC button does next.
 *
 * On → off. Off → the last used language if this video has it, otherwise the
 * first track, because a person pressing CC on a video with one Spanish track
 * wants that track and not a menu. Nothing to turn on → stay off, which is
 * unreachable from the UI (the button is absent) and is still written down so
 * the function is total.
 */
export function toggleCaptions(
  currentIndex: number,
  options: readonly CaptionOption[],
  lastLanguage: string | null | undefined
): number {
  if (currentIndex !== CAPTIONS_OFF) return CAPTIONS_OFF
  if (options.length === 0) return CAPTIONS_OFF
  const remembered = findCaptionByLanguage(options, lastLanguage)
  return (remembered ?? options[0]!).index
}

/**
 * The track a NEW video starts on, in precedence order.
 *
 * 1. The language this viewer last WATCHED with captions on. A person who
 *    turned Spanish on yesterday gets Spanish today, and that outranks
 *    everything because it is the only input that came from them.
 * 2. A track the publisher marked `default` — `/v1/subtitles/{mediaId}` can say
 *    so, and the HTML `default` attribute means the same thing. It is a
 *    statement about THIS video (a foreign-language interview that is
 *    unwatchable without subtitles) and is honoured where the viewer has said
 *    nothing.
 * 3. Off. Captions are otherwise opt-in: a video that starts with text over the
 *    picture for somebody who never asked is a video they turn off.
 */
export function initialCaptionIndex(
  options: readonly CaptionOption[],
  lastLanguage: string | null | undefined,
  defaultLanguage?: string | null | undefined
): number {
  const remembered = findCaptionByLanguage(options, lastLanguage)
  if (remembered) return remembered.index
  const published = findCaptionByLanguage(options, defaultLanguage)
  if (published) return published.index
  return CAPTIONS_OFF
}

/**
 * The accessible name for the CC button.
 *
 * It says what pressing it will DO and which language, because "Captions" on a
 * toggle tells a screen-reader user nothing about the state they are in —
 * `aria-pressed` carries that, and the name carries the consequence.
 */
export function captionsButtonLabel(currentLabel: string | null): string {
  return currentLabel ? `Turn off captions (${currentLabel})` : "Turn on captions"
}

/* ── Cue text ────────────────────────────────────────────────────────────── */

/**
 * The text of a cue, with WebVTT's markup taken out.
 *
 * A cue payload is not plain text: it carries `<v Roger>`, `<b>`, `<i>`,
 * `<c.yellow>` and timestamp tags like `<00:01:02.000>` for karaoke-style
 * reveal. Rendering those raw puts angle brackets over the picture. They are
 * stripped rather than honoured because this box is drawn as TEXT — React
 * escapes it, which is also the reason a cue from a third-party manifest can
 * never inject markup into this page.
 *
 * Line breaks survive: a two-line cue is two lines because whoever wrote it
 * chose where it broke.
 */
export function cueText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
}

/** The lines of everything currently on screen, in order, blanks dropped. */
export function cueLines(rawCues: readonly string[]): string[] {
  const lines: string[] = []
  for (const raw of rawCues) {
    for (const line of cueText(raw).split("\n")) {
      const trimmed = line.trim()
      if (trimmed) lines.push(trimmed)
    }
  }
  return lines
}

/* ── Remembering ─────────────────────────────────────────────────────────── */

/** The remembered language tag, or null for "off". */
export function readCaptionLanguage(viewerId: string | null | undefined): string | null {
  const raw = readPreference(STORAGE_NAME, viewerId)
  const value = (raw ?? "").trim()
  return value ? value : null
}

/** Remember a language, or — for off — forget the one that was there. */
export function writeCaptionLanguage(
  viewerId: string | null | undefined,
  lang: string | null | undefined
): void {
  const value = (lang ?? "").trim()
  if (!value) {
    clearPreference(STORAGE_NAME, viewerId)
    return
  }
  writePreference(STORAGE_NAME, viewerId, value)
}
