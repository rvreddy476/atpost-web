/**
 * A video's caption tracks, turned into the four fields the player wants.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE URL IS THE WHOLE PROBLEM, AND IT IS A CREDENTIALS PROBLEM
 *
 * `GET /v1/subtitles/{mediaId}` lists a video's tracks and
 * `GET /v1/subtitles/{mediaId}/track/{language}.vtt` serves one as WebVTT.
 * Both are gated exactly like the media itself — media-service runs
 * `AuthorizeMediaRead` on each — so the request has to carry the session.
 *
 * A `<track>` has no credentials mode of its own: its fetch follows the
 * `<video>`'s `crossorigin` attribute, and @momentum/player deliberately does
 * NOT set that attribute, because it governs the media fetch as well and the
 * HLS segments are pre-signed cross-origin URLs that a credentialed request
 * cannot load at all. The package's own header says so and says what the zone
 * must do instead: give it a SAME-ORIGIN src.
 *
 * Same-origin is exactly what this zone already has. `next.config.mjs` rewrites
 * `/v1/:path*` onto `/api/proxy/:path*`, the basePath makes that
 * `/tube/v1/...`, and the proxy route forwards the `cookie` header upstream.
 * So `resolveUrl("/v1/subtitles/…")` — the same function the player is handed
 * for HLS playlists — produces a URL on this very origin, the browser attaches
 * the session cookie to it without anybody asking for credentials mode, and the
 * gateway sees an authenticated read.
 *
 * `sameOriginVtt` below is therefore an ASSERTION rather than a hope: it is
 * what ./useCaptions.ts checks before handing a URL to the player, and the
 * blob fallback there exists for the one configuration in which it could be
 * false (a build pointed at an absolute API origin). A cross-origin `<track>`
 * fails silently — the element exists, the cues never arrive, and the CC button
 * turns on nothing — so it must never be guessed at.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT INVENTED
 *
 * `media_subtitles` has no "default track" column and no "is a translation"
 * column. So no row is marked `default` — the player's `initialCaptionIndex`
 * then leaves captions off unless the viewer has remembered a language, which
 * is the correct behaviour for a platform where nobody has ever said a video
 * should be watched with captions on — and every row is `kind: "captions"`,
 * because every row in that table is a transcript of this video's own audio
 * (written by the owner or by the ASR job), not a translation of it. Claiming
 * `subtitles` for a row would be claiming a fact the schema does not hold.
 */

import type { CaptionSource } from "@momentum/player"

/**
 * One row of `GET /v1/subtitles/{mediaId}`, as media-service's
 * `postgres.MediaSubtitle` spells it.
 *
 * `content` is the transcript inline — the reason that endpoint is gated at all
 * — and this page never reads it: the player wants a URL to a VTT file, and the
 * `/track/{language}.vtt` route is the thing that renders these cues as one.
 * It is typed here so nobody reaches for it thinking it is already WebVTT; it
 * is not, it is the stored cue text.
 */
export interface SubtitleTrack {
  id: string
  media_asset_id: string
  language: string
  /** `auto` (the ASR job) or `manual`/`owner`. Used only to break a tie. */
  source?: string
  format?: string
  content_url?: string
  content?: string
  confidence?: number | null
  edited_by_owner?: boolean
  created_at?: string
}

/**
 * The gateway path for one track's WebVTT body.
 *
 * Gateway-RELATIVE, exactly like `hls_url` on a feed row, because the thing
 * that puts this zone's prefix on a gateway path is `resolveUrl` and there must
 * not be a second one. The `.vtt` suffix is not decoration: media-service's
 * route is `/track/:language` and the handler trims `.vtt` off the parameter,
 * and the extension is what makes the response a stable, cacheable file to
 * every intermediary that looks at paths.
 */
export function subtitleTrackPath(mediaId: string, language: string): string {
  return `/v1/subtitles/${encodeURIComponent(mediaId)}/track/${encodeURIComponent(language)}.vtt`
}

/**
 * The human name for a BCP-47 tag.
 *
 * `Intl.DisplayNames` where the browser has it, the tag itself where it does
 * not. Never a hand-written table: a map of forty languages in this file would
 * be wrong for the forty-first, and the platform already ships the answer.
 *
 * The tag is upper-cased in the fallback so that "en" reads as a label ("EN")
 * rather than as a typo, and a tag the browser cannot name at all — a private
 * subtag, an empty string that got this far — comes back as itself rather than
 * as "undefined".
 */
export function captionLabel(language: string): string {
  const tag = language.trim()
  if (!tag) return ""
  try {
    const names = new Intl.DisplayNames(undefined, { type: "language" })
    const name = names.of(tag)
    if (name && name.toLowerCase() !== tag.toLowerCase()) return name
  } catch {
    /* No Intl.DisplayNames, or a tag it refuses to parse. Fall through. */
  }
  return tag.toUpperCase()
}

/**
 * Which of two rows for the same language wins.
 *
 * A video can have an auto-generated track AND one the owner corrected —
 * `PATCH /v1/subtitles/{mediaId}` writes the correction as its own row — and
 * two entries with the same `srclang` in one menu is a person choosing between
 * "English" and "English". The owner's edit wins, then a non-auto source, then
 * the first row the server listed.
 */
function betterTrack(current: SubtitleTrack, candidate: SubtitleTrack): SubtitleTrack {
  if (current.edited_by_owner) return current
  if (candidate.edited_by_owner) return candidate
  const currentAuto = (current.source ?? "").toLowerCase() === "auto"
  const candidateAuto = (candidate.source ?? "").toLowerCase() === "auto"
  if (currentAuto && !candidateAuto) return candidate
  return current
}

/**
 * The rows the player should be offered, one per language, in the server's
 * order.
 *
 * A row with no language is dropped rather than shown as a blank menu entry:
 * `srclang` is what the player remembers a viewer's choice by (see
 * `writeCaptionLanguage` in @momentum/player), so a track with no tag is a
 * track whose selection cannot be remembered and whose menu row has no name.
 *
 * `resolve` is injected rather than imported so this file has no window in it
 * and can be tested as a table. The one caller passes `resolveUrl`.
 */
export function toCaptionSources(
  mediaId: string,
  rows: readonly SubtitleTrack[],
  resolve: (path: string) => string
): CaptionSource[] {
  if (!mediaId) return []

  const byLanguage = new Map<string, SubtitleTrack>()
  for (const row of rows) {
    const language = row?.language?.trim()
    if (!language) continue
    const existing = byLanguage.get(language)
    byLanguage.set(language, existing ? betterTrack(existing, row) : row)
  }

  return [...byLanguage.values()].map((row) => ({
    language: row.language.trim(),
    label: captionLabel(row.language),
    src: resolve(subtitleTrackPath(mediaId, row.language.trim())),
    kind: "captions" as const,
  }))
}

/**
 * Will a `<track>` pointed at this send the session cookie?
 *
 * Only if it is same-origin, because the element cannot ask for credentials —
 * see the header. A relative URL is same-origin by construction; an absolute
 * one is compared against the document. An unparseable string is treated as NOT
 * same-origin, which routes it to the blob fallback rather than to a track that
 * quietly never loads.
 */
export function sameOriginVtt(url: string, documentOrigin: string): boolean {
  if (!url) return false
  if (url.startsWith("blob:")) return true
  try {
    return new URL(url, documentOrigin).origin === new URL(documentOrigin).origin
  } catch {
    return false
  }
}
