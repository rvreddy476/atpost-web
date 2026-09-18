import { describe, expect, it } from "vitest"
import { BRAND } from "@momentum/brand"
import type { TubeChannel } from "@/tube/channels"
import {
  channelDescription,
  channelMetadata,
  channelTitle,
  channelUrl,
  unknownChannelMetadata,
} from "./metadata"

/**
 * What a shared channel link unfurls into.
 *
 * Every assertion here is about something nobody sees while developing: a
 * missing `og:url`, a description with a newline in it, a canonical that lost
 * the zone prefix. They are invisible in the browser and obvious in a chat
 * window a week later, which is exactly what a test is for.
 */

const ORIGIN = "https://momentum.example"

function channel(overrides: Partial<TubeChannel> = {}): TubeChannel {
  return {
    user_id: "u-1",
    name: "Ada",
    handle: "ada",
    about: "Weekly builds.",
    avatar_media_id: null,
    avatar_url: null,
    video_count: 3,
    created_at: "2026-01-02T03:04:05Z",
    updated_at: "2026-01-02T03:04:05Z",
    ...overrides,
  }
}

describe("channelUrl", () => {
  it("puts the zone prefix back on, because a crawler has no Next in front of it", () => {
    // `channelHref` returns "/@ada" and next/link adds "/tube". A shared link
    // does not, and "/@ada" is a link to nothing.
    expect(channelUrl("ada", ORIGIN)).toBe(`${ORIGIN}/tube/@ada`)
  })

  it("normalises a handle that arrives with its @ still on", () => {
    expect(channelUrl("@ada", ORIGIN)).toBe(`${ORIGIN}/tube/@ada`)
  })

  it("does not produce a double slash from a trailing one on the origin", () => {
    expect(channelUrl("ada", `${ORIGIN}/`)).toBe(`${ORIGIN}/tube/@ada`)
  })
})

describe("channelDescription", () => {
  it("is null for a channel with nothing to say, so the caller can substitute", () => {
    expect(channelDescription(channel({ about: "" }))).toBeNull()
    expect(channelDescription(channel({ about: "   " }))).toBeNull()
  })

  it("flattens newlines, which a single-line meta attribute cannot carry", () => {
    expect(channelDescription(channel({ about: "One\n\nTwo   three" }))).toBe("One Two three")
  })

  it("truncates a long about on a word boundary, with an ellipsis", () => {
    const about = `${"word ".repeat(80)}end`
    const out = channelDescription(channel({ about }))!
    expect(out.length).toBeLessThanOrEqual(201)
    expect(out.endsWith("…")).toBe(true)
    expect(out).not.toContain("wor…")
  })

  it("hard-cuts a single enormous token rather than emitting nothing", () => {
    const out = channelDescription(channel({ about: "x".repeat(400) }))!
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeLessThanOrEqual(201)
  })
})

describe("channelTitle", () => {
  it("prefers the name", () => {
    expect(channelTitle(channel())).toBe("Ada")
  })

  it("falls back to the handle, never to an empty string", () => {
    expect(channelTitle(channel({ name: "  " }))).toBe("@ada")
  })

  it("has a last resort for a channel with neither", () => {
    expect(channelTitle(channel({ name: "", handle: "" }))).toBe("Channel")
  })
})

describe("channelMetadata", () => {
  it("emits the title, the description, the canonical and the OG url", () => {
    const meta = channelMetadata(channel(), ORIGIN)
    expect(meta.title).toBe("Ada")
    expect(meta.description).toBe("Weekly builds.")
    expect(meta.alternates?.canonical).toBe(`${ORIGIN}/tube/@ada`)
    expect(meta.openGraph?.url).toBe(`${ORIGIN}/tube/@ada`)
  })

  it("is an og:type of profile, carrying the handle as the username", () => {
    const og = channelMetadata(channel(), ORIGIN).openGraph as Record<string, unknown>
    expect(og.type).toBe("profile")
    expect(og.username).toBe("ada")
  })

  it("gives the card a title with context, because a preview has no tab strip", () => {
    const meta = channelMetadata(channel(), ORIGIN)
    expect(meta.openGraph?.title).toBe(`Ada — ${BRAND.name} Tube`)
    expect(meta.twitter?.title).toBe(`Ada — ${BRAND.name} Tube`)
  })

  it("uses the avatar as the image, on a summary card", () => {
    const meta = channelMetadata(channel({ avatar_url: "https://cdn/x.jpg?sig=1" }), ORIGIN)
    // `Twitter` is a union whose branches are keyed BY `card`, so reading it
    // off the union needs the cast; the value is the assertion.
    expect((meta.twitter as { card?: string }).card).toBe("summary")
    expect(JSON.stringify(meta.openGraph?.images)).toContain("https://cdn/x.jpg?sig=1")
    expect(JSON.stringify(meta.twitter?.images)).toContain("https://cdn/x.jpg?sig=1")
  })

  it("emits NO image rather than a placeholder when there is no avatar", () => {
    // A preview with no picture is clean; a preview of a grey square looks
    // broken. Every channel on the dev stack is in this branch.
    const meta = channelMetadata(channel({ avatar_url: null }), ORIGIN)
    expect(meta.openGraph?.images).toBeUndefined()
    expect(meta.twitter?.images).toBeUndefined()
  })

  it("substitutes a TRUE sentence for a channel with no about", () => {
    const meta = channelMetadata(channel({ about: "" }), ORIGIN)
    expect(meta.description).toBe(`Ada (@ada) on ${BRAND.name} Tube.`)
  })

  it("sets a metadataBase so nothing is left unresolvable", () => {
    expect(channelMetadata(channel(), ORIGIN).metadataBase?.origin).toBe(ORIGIN)
  })
})

describe("unknownChannelMetadata", () => {
  it("keeps the handle in the title, which is the one true thing known", () => {
    expect(unknownChannelMetadata("ada", ORIGIN).title).toBe("@ada")
  })

  it("emits NO rich preview for a link that may be dead", () => {
    const meta = unknownChannelMetadata("ada", ORIGIN)
    expect(meta.openGraph).toBeUndefined()
    expect(meta.twitter).toBeUndefined()
  })

  it("survives an empty ref without producing a broken URL", () => {
    expect(unknownChannelMetadata("", ORIGIN).title).toBe("Channel")
  })
})
