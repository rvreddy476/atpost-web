import { describe, expect, it } from "vitest"
import type { EndScreen, VideoCard } from "@/watch/api"
import { activeCard, activeEndScreens, endScreenSlot, inEndScreenWindow } from "@/watch/timeline"
import {
  IncompleteLinkSet,
  buildCardsPayload,
  buildEndScreensPayload,
  cardPassthrough,
  endScreenPassthrough,
} from "./payload"
import type { AlternateDraft } from "./model"
import { UP_NEXT_POSITION, emptyUpNext, type UpNextDraft } from "./upnext"

/**
 * The full-replace payload builders.
 *
 * `POST …/cards` and `POST …/end-screens` DELETE every row for the post and
 * INSERT the body. `{"cards":[]}` answers `{"saved":0}` and leaves none. So a
 * body that is missing a row is a body that deleted it, and these tests are
 * about the two ways that happens: a row the creator was halfway through, and
 * a row this editor never knew about.
 */

const SUBJECT = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const THIRD = "33333333-3333-4333-8333-333333333333"

function draft(over: Partial<AlternateDraft> = {}): AlternateDraft {
  return {
    key: "k",
    targetId: OTHER,
    targetTitle: "Another",
    title: "Watch this next",
    teaser: "",
    atMs: 30_000,
    ...over,
  }
}

function storedCard(over: Partial<VideoCard> = {}): VideoCard {
  return {
    id: "row-id",
    post_id: SUBJECT,
    type: "poll",
    title: "Vote",
    appear_at_ms: 5_000,
    ...over,
  }
}

function storedScreen(over: Partial<EndScreen> = {}): EndScreen {
  return {
    id: "row-id",
    post_id: SUBJECT,
    type: "playlist",
    target_id: THIRD,
    title: "More like this",
    position: { x: 0.1, y: 0.1 },
    start_ms: 100_000,
    end_ms: 110_000,
    ...over,
  }
}

describe("buildCardsPayload", () => {
  it("sends the whole set, because the endpoint replaces the whole set", () => {
    const body = buildCardsPayload(
      [draft({ key: "a", targetId: OTHER, atMs: 0 }), draft({ key: "b", targetId: THIRD, atMs: 60_000 })],
      [],
      SUBJECT,
      120_000
    )
    expect(body.cards).toHaveLength(2)
    expect(body.cards.map((c) => c.target_id)).toEqual([OTHER, THIRD])
  })

  it("builds an empty body for no alternates, which is how they are cleared", () => {
    expect(buildCardsPayload([], [], SUBJECT, 120_000)).toEqual({ cards: [] })
  })

  it("throws rather than dropping the row somebody was still typing", () => {
    // The whole hazard. Omitting the bad row and sending the rest is a save
    // that silently deletes a card because its title had not been filled in.
    const good = draft({ key: "a", targetId: OTHER, atMs: 0 })
    const half = draft({ key: "b", targetId: "", title: "", atMs: 60_000 })
    expect(() => buildCardsPayload([good, half], [], SUBJECT, 120_000)).toThrow(IncompleteLinkSet)
  })

  it("throws for a collision, a duplicate and an over-length set", () => {
    const at = (key: string, targetId: string, atMs: number) => draft({ key, targetId, atMs })
    expect(() =>
      buildCardsPayload([at("a", OTHER, 0), at("b", THIRD, 1_000)], [], SUBJECT, 120_000)
    ).toThrow(IncompleteLinkSet)
    expect(() =>
      buildCardsPayload([at("a", OTHER, 0), at("b", OTHER, 60_000)], [], SUBJECT, 120_000)
    ).toThrow(IncompleteLinkSet)
    expect(() =>
      buildCardsPayload(
        [
          at("a", OTHER, 0),
          at("b", THIRD, 60_000),
          at("c", "44444444-4444-4444-8444-444444444444", 120_000),
          at("d", "55555555-5555-4555-8555-555555555555", 180_000),
        ],
        [],
        SUBJECT,
        600_000
      )
    ).toThrow(IncompleteLinkSet)
  })

  it("clamps a negative timestamp rather than trusting it through", () => {
    // Guarded twice: validation refuses it, and if a caller ever bypassed that
    // the builder still cannot emit one. The server stores negatives verbatim.
    const body = buildCardsPayload([draft({ atMs: 0 })], [], SUBJECT, 120_000)
    expect(body.cards[0]!.appear_at_ms).toBe(0)
    expect(body.cards.every((c) => c.appear_at_ms >= 0)).toBe(true)
  })

  it("always writes `video` and never a type from the end-screen enum", () => {
    const body = buildCardsPayload([draft()], [], SUBJECT, 120_000)
    expect(body.cards[0]!.type).toBe("video")
  })

  it("omits an empty teaser rather than sending a blank string", () => {
    const body = buildCardsPayload([draft({ teaser: "  " })], [], SUBJECT, 120_000)
    expect(body.cards[0]).not.toHaveProperty("teaser_text")
    const withTeaser = buildCardsPayload([draft({ teaser: " look " })], [], SUBJECT, 120_000)
    expect(withTeaser.cards[0]!.teaser_text).toBe("look")
  })

  it("carries through a card this editor cannot edit", () => {
    // A `poll` card has no control on this screen and no web surface on the
    // watch page either. Leaving it out of the body would delete it.
    const poll = storedCard()
    const body = buildCardsPayload([draft()], [poll], SUBJECT, 120_000)
    expect(body.cards).toHaveLength(2)
    expect(body.cards[1]).toEqual({ type: "poll", title: "Vote", appear_at_ms: 5_000 })
  })

  it("keeps a passthrough card even when there is nothing else to save", () => {
    const body = buildCardsPayload([], [storedCard()], SUBJECT, 120_000)
    expect(body.cards).toHaveLength(1)
  })

  it("produces a card the watch page will actually show", () => {
    // The round trip that matters: what this builds, `activeCard` picks up.
    const body = buildCardsPayload([draft({ atMs: 30_000 })], [], SUBJECT, 120_000)
    const asRow: VideoCard = {
      id: "new",
      post_id: SUBJECT,
      type: "video",
      target_id: body.cards[0]!.target_id!,
      title: body.cards[0]!.title,
      appear_at_ms: body.cards[0]!.appear_at_ms,
    }
    expect(activeCard([asRow], 30_000, new Set())).toBe(asRow)
    expect(activeCard([asRow], 29_999, new Set())).toBeNull()
  })
})

describe("cardPassthrough", () => {
  it("drops the server's own fields", () => {
    const out = cardPassthrough(storedCard({ type: "video", target_id: THIRD }))
    expect(out).not.toHaveProperty("id")
    expect(out).not.toHaveProperty("post_id")
    expect(out).not.toHaveProperty("created_at")
  })

  it("refuses a type nobody here has seen rather than guessing", () => {
    expect(() => cardPassthrough(storedCard({ type: "hologram" as never }))).toThrow(
      IncompleteLinkSet
    )
  })

  it("normalises a null title, which is what a titleless row reads back as", () => {
    expect(cardPassthrough(storedCard({ title: "" })).title).toBe("")
  })
})

describe("buildEndScreensPayload", () => {
  const tile = (over: Partial<UpNextDraft> = {}): UpNextDraft => ({
    ...emptyUpNext(),
    targetId: OTHER,
    targetTitle: "Next one",
    title: "Up next",
    ...over,
  })

  it("always sends a position, because the column is NOT NULL with no default", () => {
    // Omitting it is a 500: `null value in column "position" … violates
    // not-null constraint`. Verified.
    const body = buildEndScreensPayload(tile(), [], 120_000)
    expect(body.screens[0]!.position).toEqual(UP_NEXT_POSITION)
    expect(body.screens.every((s) => s.position !== undefined && s.position !== null)).toBe(true)
  })

  it("places the tile in the closing stretch, not at a typed millisecond", () => {
    const body = buildEndScreensPayload(tile(), [], 120_000)
    expect(body.screens[0]!.start_ms).toBe(100_000)
    expect(body.screens[0]!.end_ms).toBe(120_000)
  })

  it("writes `video` and never a type from the card enum", () => {
    expect(buildEndScreensPayload(tile(), [], 120_000).screens[0]!.type).toBe("video")
  })

  it("builds an empty body when there is no tile, which is how one is removed", () => {
    expect(buildEndScreensPayload(emptyUpNext(), [], 120_000)).toEqual({ screens: [] })
  })

  it("throws when a tile was asked for and the duration is unknown", () => {
    // There is no honest window for a video of unknown length, and the server
    // would take any two numbers.
    expect(() => buildEndScreensPayload(tile(), [], 0)).toThrow(IncompleteLinkSet)
  })

  it("carries through an end screen this editor does not manage", () => {
    const body = buildEndScreensPayload(tile(), [storedScreen()], 120_000)
    expect(body.screens).toHaveLength(2)
    expect(body.screens[1]!.type).toBe("playlist")
    expect(body.screens[1]!.start_ms).toBe(100_000)
  })

  it("keeps a passthrough screen when the tile itself is removed", () => {
    const body = buildEndScreensPayload(emptyUpNext(), [storedScreen()], 120_000)
    expect(body.screens).toHaveLength(1)
  })

  it("produces a tile the watch page will draw, in a place it will draw it", () => {
    const body = buildEndScreensPayload(tile(), [], 120_000)
    const row: EndScreen = {
      id: "new",
      post_id: SUBJECT,
      type: "video",
      target_id: body.screens[0]!.target_id!,
      title: body.screens[0]!.title,
      position: body.screens[0]!.position,
      start_ms: body.screens[0]!.start_ms,
      end_ms: body.screens[0]!.end_ms,
    }
    // Inside its own window …
    expect(activeEndScreens([row], 110_000)).toEqual([row])
    expect(activeEndScreens([row], 99_999)).toEqual([])
    // … and inside the page's second gate, which refuses anything earlier than
    // the last max(30s, 20%) whatever the row says.
    expect(inEndScreenWindow(row.start_ms, 120_000)).toBe(true)
    // … and its position parses rather than falling back to the flow row.
    expect(endScreenSlot(row.position)).not.toBeNull()
  })
})

describe("endScreenPassthrough", () => {
  it("echoes a position it cannot read rather than replacing it", () => {
    const odd = storedScreen({ position: { placement: "corner" } })
    expect(endScreenPassthrough(odd).position).toEqual({ placement: "corner" })
  })

  it("substitutes an empty object for a missing position", () => {
    // The column is NOT NULL so this should not occur, but a body with no
    // position at all is a 500 and an empty object is a row that lays out.
    expect(endScreenPassthrough(storedScreen({ position: undefined })).position).toEqual({})
  })

  it("refuses a type nobody here has seen", () => {
    expect(() => endScreenPassthrough(storedScreen({ type: "hologram" as never }))).toThrow(
      IncompleteLinkSet
    )
  })
})
