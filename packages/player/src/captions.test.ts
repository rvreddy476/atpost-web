import { afterEach, describe, expect, it } from "vitest"
import {
  CAPTIONS_OFF,
  captionLabel,
  captionOptions,
  captionsAvailable,
  captionsButtonLabel,
  cueLines,
  cueText,
  findCaptionByLanguage,
  initialCaptionIndex,
  readCaptionLanguage,
  toggleCaptions,
  writeCaptionLanguage,
  type CaptionTrackLike,
} from "./captions"

const TRACKS: CaptionTrackLike[] = [
  { lang: "en", label: "English", kind: "subtitles" },
  { lang: "es", label: "Español", kind: "subtitles" },
  { lang: "en", label: "English (CC)", kind: "captions" },
]

function installStorage(store: Record<string, string> = {}) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => (key in store ? store[key]! : null),
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
      },
    },
  })
  return store
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined })
})

describe("captionLabel", () => {
  it("prefers the author's own label", () => {
    expect(captionLabel({ label: "English (auto-generated)", lang: "en" }, 0)).toBe(
      "English (auto-generated)"
    )
  })

  it("falls back to the language tag, uppercased so it is not a typo", () => {
    expect(captionLabel({ lang: "pt-BR" }, 1)).toBe("PT-BR")
  })

  it("falls back to a position so two unnamed tracks stay distinct", () => {
    expect(captionLabel({}, 2)).toBe("Track 3")
  })
})

describe("captionOptions", () => {
  it("keeps the manifest's order rather than sorting alphabetically", () => {
    expect(captionOptions(TRACKS).map((o) => o.label)).toEqual([
      "English",
      "Español",
      "English (CC)",
    ])
  })

  it("keeps the index into the ORIGINAL track list", () => {
    const options = captionOptions([{ kind: "metadata" }, { lang: "en", kind: "subtitles" }])
    expect(options).toHaveLength(1)
    expect(options[0]!.index).toBe(1)
  })

  it("drops metadata and description tracks — never printable text", () => {
    const options = captionOptions([
      { kind: "metadata", label: "chapters" },
      { kind: "descriptions", label: "audio description" },
    ])
    expect(options).toEqual([])
  })

  it("treats a track with no kind as subtitles, which is what a manifest means", () => {
    expect(captionOptions([{ lang: "fr" }])).toHaveLength(1)
  })
})

describe("captionsAvailable", () => {
  it("is false with no tracks, which is what hides the button entirely", () => {
    expect(captionsAvailable([])).toBe(false)
  })

  it("is true for a single track, which IS a choice — on or off", () => {
    expect(captionsAvailable(captionOptions([{ lang: "en" }]))).toBe(true)
  })
})

describe("findCaptionByLanguage", () => {
  const options = captionOptions(TRACKS)

  it("matches a language exactly", () => {
    expect(findCaptionByLanguage(options, "es")?.label).toBe("Español")
  })

  it("matches case-insensitively, because manifests are written by hand", () => {
    expect(findCaptionByLanguage(options, "ES")?.label).toBe("Español")
  })

  it("falls back to the primary subtag so en-GB finds en", () => {
    expect(findCaptionByLanguage(options, "en-GB")?.label).toBe("English")
  })

  it("is null for a language this video does not have, and for none", () => {
    expect(findCaptionByLanguage(options, "de")).toBeNull()
    expect(findCaptionByLanguage(options, null)).toBeNull()
    expect(findCaptionByLanguage(options, "")).toBeNull()
  })
})

describe("toggleCaptions", () => {
  const options = captionOptions(TRACKS)

  it("turns them off when something is on", () => {
    expect(toggleCaptions(1, options, "es")).toBe(CAPTIONS_OFF)
  })

  it("turns the remembered language on when they are off", () => {
    expect(toggleCaptions(CAPTIONS_OFF, options, "es")).toBe(1)
  })

  it("turns the first track on when nothing is remembered — not a menu", () => {
    expect(toggleCaptions(CAPTIONS_OFF, options, null)).toBe(0)
  })

  it("turns the first track on when the remembered language is absent here", () => {
    expect(toggleCaptions(CAPTIONS_OFF, options, "de")).toBe(0)
  })

  it("stays off when there is nothing to turn on", () => {
    expect(toggleCaptions(CAPTIONS_OFF, [], "en")).toBe(CAPTIONS_OFF)
  })
})

describe("initialCaptionIndex", () => {
  it("starts a new video on the remembered language", () => {
    expect(initialCaptionIndex(captionOptions(TRACKS), "es")).toBe(1)
  })

  it("starts OFF when nothing is remembered — captions are opt-in", () => {
    expect(initialCaptionIndex(captionOptions(TRACKS), null)).toBe(CAPTIONS_OFF)
  })

  it("honours a publisher's default track when the viewer has said nothing", () => {
    expect(initialCaptionIndex(captionOptions(TRACKS), null, "es")).toBe(1)
  })

  it("lets the viewer's own language outrank the publisher's default", () => {
    expect(initialCaptionIndex(captionOptions(TRACKS), "es", "en")).toBe(1)
  })

  it("is off when the publisher's default language is not in the list", () => {
    expect(initialCaptionIndex(captionOptions(TRACKS), null, "de")).toBe(CAPTIONS_OFF)
  })
})

describe("captionsButtonLabel", () => {
  it("names the consequence and the language, not the state", () => {
    expect(captionsButtonLabel("English")).toBe("Turn off captions (English)")
    expect(captionsButtonLabel(null)).toBe("Turn on captions")
  })
})

describe("cueText", () => {
  it("strips WebVTT markup rather than printing angle brackets over the video", () => {
    expect(cueText("<v Roger>Hello <b>there</b>")).toBe("Hello there")
  })

  it("strips karaoke timestamp tags", () => {
    expect(cueText("Come <00:01:02.000>on")).toBe("Come on")
  })

  it("keeps the author's line breaks, and normalises CRLF", () => {
    expect(cueText("one\r\ntwo")).toBe("one\ntwo")
  })

  it("trims the edges", () => {
    expect(cueText("  hello  ")).toBe("hello")
  })
})

describe("cueLines", () => {
  it("flattens several active cues into lines, in order", () => {
    expect(cueLines(["one\ntwo", "three"])).toEqual(["one", "two", "three"])
  })

  it("drops blank lines, which is what a cue of pure markup becomes", () => {
    expect(cueLines(["<c.yellow></c>", "real"])).toEqual(["real"])
  })

  it("is empty when nothing is on screen", () => {
    expect(cueLines([])).toEqual([])
  })
})

describe("readCaptionLanguage / writeCaptionLanguage", () => {
  it("round-trips a language", () => {
    installStorage()
    writeCaptionLanguage("u-7", "es")
    expect(readCaptionLanguage("u-7")).toBe("es")
  })

  it("is null for a viewer who has never chosen", () => {
    installStorage()
    expect(readCaptionLanguage("u-7")).toBeNull()
  })

  it("forgets the language when captions go off", () => {
    const store = installStorage()
    writeCaptionLanguage("u-7", "es")
    writeCaptionLanguage("u-7", null)
    expect("momentum.player.captions.u-7" in store).toBe(false)
  })
})
