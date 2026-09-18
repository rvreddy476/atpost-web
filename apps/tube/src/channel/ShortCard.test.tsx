import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { FeedItem } from "@atpost/types/feed"
import { SHORTS_GRID, ShortCard } from "./ShortCard"

/**
 * The Shorts tile.
 *
 * Three things here are load-bearing and the rest is decoration: it is 9:16
 * and not cropped, it LEAVES Tube with a plain anchor (a `next/link` would
 * ask for `/tube/reels/{id}` and 404), and it says so in the accessible name
 * so a screen-reader user is told before they press rather than after.
 */

function short(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "1d4d4e5f-0000-4111-8222-333344445555",
    author_id: "a-1",
    title: "Rebuilding the lathe",
    content_type: "flick" as FeedItem["content_type"],
    created_at: "2026-09-01T00:00:00Z",
    counts: {} as FeedItem["counts"],
    ...overrides,
  }
}

const render = (props: Parameters<typeof ShortCard>[0]) =>
  renderToStaticMarkup(<ShortCard {...props} />)

describe("ShortCard", () => {
  it("is a plain anchor into the reels zone, not a next/link", () => {
    const html = render({ item: short() })
    expect(html).toContain(`href="/reels/1d4d4e5f-0000-4111-8222-333344445555"`)
  })

  it("is 9:16 and never cropped to the video grid's 16:9", () => {
    // Cropping a portrait frame to landscape throws away the middle of every
    // short, and the different shape is what tells somebody this tab holds a
    // different kind of thing.
    const html = render({ item: short() })
    expect(html).toContain("aspect-[9/16]")
    expect(html).not.toContain("aspect-video")
  })

  it("says it is leaving Tube, in the name rather than only in the pixels", () => {
    expect(render({ item: short() })).toContain("opens in Momentum Reels")
  })

  it("draws a glyph rather than an empty well when the row carries no poster", () => {
    // `/v1/posts/by-author` sends no `variants`, so this is the ordinary case
    // today. An empty well reads as an image that failed.
    const html = render({ item: short() })
    expect(html).not.toContain("<img")
  })

  it("draws the poster when there is one", () => {
    const html = render({
      item: short({
        media: [
          {
            media_id: "m1",
            kind: "video",
            variants: { thumb_150: "https://cdn/t.jpg?sig=1" },
          } as never,
        ],
      }),
    })
    expect(html).toContain("https://cdn/t.jpg?sig=1")
  })

  it("says nothing about visibility on somebody else's channel", () => {
    const html = render({ item: short({ visibility: "private" }), showVisibility: false })
    expect(html).not.toContain("Private")
  })

  it("marks an unlisted row on your OWN channel, in the chip AND in the name", () => {
    const html = render({ item: short({ visibility: "unlisted" }), showVisibility: true })
    expect(html).toContain(">Unlisted<")
    // The chip is aria-hidden, so the sentence has to reach the name too or a
    // screen-reader user is the one person not told.
    expect(html).toContain("only people with the link")
  })

  it("marks nothing for a public row, even on your own channel", () => {
    const html = render({ item: short({ visibility: "public" }), showVisibility: true })
    expect(html).not.toContain("Unlisted")
    expect(html).not.toContain("Private")
  })
})

describe("SHORTS_GRID", () => {
  it("is denser than the video grid, because a 9:16 cell is tall", () => {
    // A portrait cell at the video grid's ~300px would be 530px tall, and two
    // rows would be a scroll of their own.
    expect(SHORTS_GRID).toContain("grid-cols-2")
    expect(SHORTS_GRID).toContain("2xl:grid-cols-6")
  })
})
