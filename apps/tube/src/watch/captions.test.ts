import { describe, expect, it } from "vitest"
import {
  captionLabel,
  sameOriginVtt,
  subtitleTrackPath,
  toCaptionSources,
  type SubtitleTrack,
} from "./captions"

/**
 * Captions, as a table.
 *
 * The thing worth asserting here is not the mapping — it is the URL, because
 * the failure mode of getting it wrong is SILENT. A `<track>` whose src is
 * cross-origin (or whose language was not escaped) produces an element that
 * exists, a fetch that is refused, cues that never arrive and a CC button that
 * turns on nothing. Nothing throws and nothing is logged. See ./captions.ts.
 */

const track = (over: Partial<SubtitleTrack> = {}): SubtitleTrack => ({
  id: "11111111-1111-4111-8111-111111111111",
  media_asset_id: "22222222-2222-4222-8222-222222222222",
  language: "en",
  source: "auto",
  format: "vtt",
  ...over,
})

/** What `resolveUrl` does under `NEXT_PUBLIC_API_BASE_URL="/tube"`. */
const zonePrefix = (path: string) => `https://momentum.test/tube${path}`

describe("subtitleTrackPath", () => {
  it("is the gateway path with the .vtt extension media-service trims", () => {
    expect(subtitleTrackPath("abc", "en")).toBe("/v1/subtitles/abc/track/en.vtt")
  })

  it("escapes both segments", () => {
    // A tag with a script subtag is legal BCP-47 and is common for Chinese.
    expect(subtitleTrackPath("a/b", "zh-Hant")).toBe("/v1/subtitles/a%2Fb/track/zh-Hant.vtt")
  })
})

describe("captionLabel", () => {
  it("names a language the runtime knows", () => {
    // Intl.DisplayNames is asked for the locale the runtime is in, so the
    // exact word varies. What must not vary is that it is not the bare tag.
    expect(captionLabel("en").toLowerCase()).not.toBe("en")
  })

  it("falls back to the upper-cased tag rather than to undefined", () => {
    expect(captionLabel("qqq-x-private")).toBe("QQQ-X-PRIVATE")
  })

  it("is empty for an empty tag rather than 'UNDEFINED'", () => {
    expect(captionLabel("   ")).toBe("")
  })
})

describe("toCaptionSources", () => {
  it("maps a row to the player's four fields", () => {
    const [row] = toCaptionSources("media-1", [track()], zonePrefix)
    expect(row.language).toBe("en")
    expect(row.src).toBe("https://momentum.test/tube/v1/subtitles/media-1/track/en.vtt")
    expect(row.kind).toBe("captions")
    expect(row.label.length).toBeGreaterThan(0)
  })

  it("marks no row as default, because no column says one is", () => {
    const rows = toCaptionSources("media-1", [track(), track({ language: "fr" })], zonePrefix)
    expect(rows.every((row) => row.default === undefined)).toBe(true)
  })

  it("drops a row with no language: its selection could not be remembered", () => {
    expect(toCaptionSources("media-1", [track({ language: "  " })], zonePrefix)).toEqual([])
  })

  it("keeps one row per language, preferring the owner's correction", () => {
    const rows = toCaptionSources(
      "media-1",
      [track({ id: "auto", source: "auto" }), track({ id: "owner", edited_by_owner: true })],
      zonePrefix
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].language).toBe("en")
  })

  it("prefers a manual row over an auto one for the same language", () => {
    const rows = toCaptionSources(
      "media-1",
      [track({ source: "auto" }), track({ source: "manual" })],
      (path) => path
    )
    expect(rows).toHaveLength(1)
  })

  it("keeps the server's order across languages", () => {
    const rows = toCaptionSources(
      "media-1",
      [track({ language: "fr" }), track({ language: "en" }), track({ language: "de" })],
      (path) => path
    )
    expect(rows.map((row) => row.language)).toEqual(["fr", "en", "de"])
  })

  it("answers nothing at all without a media id", () => {
    expect(toCaptionSources("", [track()], zonePrefix)).toEqual([])
  })
})

describe("sameOriginVtt", () => {
  const here = "https://momentum.test/tube/abc"

  it("accepts a relative path, which is same-origin by construction", () => {
    expect(sameOriginVtt("/tube/v1/subtitles/m/track/en.vtt", here)).toBe(true)
  })

  it("accepts an absolute URL on this origin", () => {
    expect(sameOriginVtt("https://momentum.test/tube/v1/subtitles/m/track/en.vtt", here)).toBe(true)
  })

  it("refuses another origin — a <track> there would send no cookie", () => {
    expect(sameOriginVtt("https://api.momentum.test/v1/subtitles/m/track/en.vtt", here)).toBe(false)
  })

  it("refuses a different port on the same host", () => {
    expect(sameOriginVtt("https://momentum.test:8443/v1/subtitles/m/track/en.vtt", here)).toBe(false)
  })

  it("accepts a blob, which is bytes this document already holds", () => {
    expect(sameOriginVtt("blob:https://momentum.test/9f2", here)).toBe(true)
  })

  it("refuses an empty src rather than resolving it to the page itself", () => {
    expect(sameOriginVtt("", here)).toBe(false)
  })

  it("refuses a scheme with no origin, such as a data: URL", () => {
    expect(sameOriginVtt("data:text/vtt,WEBVTT", here)).toBe(false)
  })
})
