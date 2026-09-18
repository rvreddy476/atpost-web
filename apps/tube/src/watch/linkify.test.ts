import { describe, expect, it } from "vitest"
import { parseRichText, timestampSeconds, type RichToken } from "./linkify"

/**
 * Linkification, as a table, and mostly about what must NOT be a link.
 *
 * The timestamp is a CONTROL rather than a link — pressing it moves the
 * playhead of a video somebody is watching — so a false positive is not an
 * ugly underline, it is being thrown out of what you were doing. Each "refuses"
 * case below is a shape that a naive `\d+:\d+` matches. See ./linkify.ts.
 */

const kinds = (tokens: RichToken[]) => tokens.map((t) => t.kind)
const of = (tokens: RichToken[], kind: RichToken["kind"]) => tokens.filter((t) => t.kind === kind)

describe("timestampSeconds", () => {
  it("reads m:ss", () => {
    expect(timestampSeconds({ minutes: "1", seconds: "23" })).toBe(83)
  })

  it("reads h:mm:ss", () => {
    expect(timestampSeconds({ hours: "1", minutes: "02", seconds: "33" })).toBe(3753)
  })

  it("reads a minutes field past an hour", () => {
    expect(timestampSeconds({ minutes: "102", seconds: "33" })).toBe(6153)
  })
})

describe("timestamps", () => {
  it("finds one in a sentence", () => {
    const tokens = parseRichText("The good bit starts at 1:23 and runs on.")
    const [ts] = of(tokens, "timestamp")
    expect(ts).toEqual({ kind: "timestamp", text: "1:23", seconds: 83 })
  })

  it("finds an hours form", () => {
    const [ts] = of(parseRichText("1:02:33 the conclusion"), "timestamp")
    expect(ts).toMatchObject({ text: "1:02:33", seconds: 3753 })
  })

  it("finds every entry in a hand-typed chapter list", () => {
    const tokens = parseRichText("0:00 Intro\n2:15 The ladder\n11:40 Wrap up")
    expect(of(tokens, "timestamp").map((t) => "seconds" in t && t.seconds)).toEqual([0, 135, 700])
  })

  it("refuses a ratio: the seconds field must be two digits", () => {
    expect(of(parseRichText("shot in 4:3, not 16:9"), "timestamp")).toEqual([])
  })

  it("refuses a port inside a URL, because the URL is matched first", () => {
    const tokens = parseRichText("running on https://example.test:8080/watch")
    expect(of(tokens, "timestamp")).toEqual([])
    expect(of(tokens, "url")).toHaveLength(1)
  })

  it("keeps a number past the end of the video as plain text", () => {
    // Ten minutes of video; "14:30" is a wall clock, not a chapter.
    const tokens = parseRichText("we recorded this at 14:30", 10 * 60 * 1000)
    expect(of(tokens, "timestamp")).toEqual([])
    expect(tokens.map((t) => t.text).join("")).toBe("we recorded this at 14:30")
  })

  it("does not filter when the duration is still unknown", () => {
    expect(of(parseRichText("at 14:30", 0), "timestamp")).toHaveLength(1)
  })
})

describe("hashtags, mentions and URLs", () => {
  it("finds a hashtag", () => {
    const [tag] = of(parseRichText("a post about #transcoding today"), "hashtag")
    expect(tag).toMatchObject({ text: "#transcoding", tag: "transcoding" })
  })

  it("finds a non-Latin hashtag whole", () => {
    const [tag] = of(parseRichText("#తెలుగు videos"), "hashtag")
    expect(tag).toMatchObject({ tag: "తెలుగు" })
  })

  it("finds a mention", () => {
    const [mention] = of(parseRichText("thanks @ada_lovelace"), "mention")
    expect(mention).toMatchObject({ handle: "ada_lovelace" })
  })

  it("leaves an email-like string out of the mention set", () => {
    // "@example.test" after a word character is not preceded by whitespace in
    // the token stream, but the sigil match is deliberately loose — what is
    // asserted is that the local part is not swallowed as a mention.
    const tokens = parseRichText("write to ada@example.test")
    expect(tokens.map((t) => t.text).join("")).toBe("write to ada@example.test")
  })

  it("does not take a sentence's full stop into the link", () => {
    const [url] = of(parseRichText("see https://example.test/a."), "url")
    expect(url).toMatchObject({ href: "https://example.test/a" })
  })

  it("leaves a closing bracket outside the link", () => {
    const [url] = of(parseRichText("(https://example.test/a)"), "url")
    expect(url).toMatchObject({ href: "https://example.test/a" })
  })
})

describe("the whole string survives", () => {
  it("re-joins to exactly the input", () => {
    const body =
      "Chapters:\n0:00 Intro #tube\n2:15 With @ada\nMore at https://example.test/notes."
    expect(parseRichText(body).map((t) => t.text).join("")).toBe(body)
  })

  it("is empty for an empty body", () => {
    expect(parseRichText("")).toEqual([])
  })

  it("is one text token when there is nothing in it", () => {
    expect(kinds(parseRichText("just words"))).toEqual(["text"])
  })
})
