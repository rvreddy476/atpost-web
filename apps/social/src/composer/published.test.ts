/**
 * The bridge between the composer and the list it posts into.
 *
 * The interesting cases are all about a post that does NOT succeed, because
 * those are the ones a person only sees when something has gone wrong and so
 * the ones nobody drives by hand.
 */

import { describe, expect, it } from "vitest"
import { confirmedItem, onPublish, optimisticItem, publish, tempPostId } from "./published"

const base = {
  id: "pending-1",
  authorId: "3f0b0c2e-1111-4222-8333-444455556666",
  text: "hello",
  visibility: "public" as const,
  hasMedia: false,
}

describe("onPublish", () => {
  it("delivers to every subscriber and stops on unsubscribe", () => {
    const seen: string[] = []
    const off = onPublish((e) => seen.push(e.kind))
    publish({ kind: "withdrawn", tempId: "x" })
    off()
    publish({ kind: "withdrawn", tempId: "y" })
    expect(seen).toEqual(["withdrawn"])
  })

  it("survives a listener that unsubscribes while it is being called", () => {
    // Which is exactly what a feed unmounting mid-publish does. Iterating the
    // live Set would mutate the collection being iterated.
    const seen: string[] = []
    const off = onPublish((e) => {
      seen.push(e.kind)
      off()
    })
    const off2 = onPublish((e) => seen.push(`second:${e.kind}`))
    expect(() => publish({ kind: "withdrawn", tempId: "x" })).not.toThrow()
    expect(seen).toEqual(["withdrawn", "second:withdrawn"])
    off2()
  })
})

describe("tempPostId", () => {
  it("is recognisable and unique", () => {
    const a = tempPostId()
    expect(a.startsWith("pending-")).toBe(true)
    expect(a).not.toBe(tempPostId())
  })
})

describe("optimisticItem", () => {
  it("starts every count at zero rather than guessing one", () => {
    const item = optimisticItem(base)
    expect(item.counts).toEqual({ likes: 0, comments: 0 })
    expect(item.repost_count).toBe(0)
  })

  it("carries NO media array, even when the post has attachments", () => {
    // A `FeedMedia` needs signed `variants` to render and this client has
    // none — the gateway signs them when it serves the post. An invented
    // entry would draw a broken image.
    expect(optimisticItem({ ...base, hasMedia: true }).media).toBeUndefined()
  })

  it("says it is processing exactly when there is something to process", () => {
    expect(optimisticItem(base).is_processing).toBe(false)
    expect(optimisticItem({ ...base, hasMedia: true }).is_processing).toBe(true)
  })

  it("claims content_type 'post' even for a video, because that is what was asked", () => {
    // post-service classifies a plain "post" carrying a video from the
    // MEASUREMENT once transcode lands. Claiming long_video here would draw
    // one card for a second and then change it.
    expect(optimisticItem({ ...base, hasMedia: true }).content_type).toBe("post")
  })

  it("carries the author, so somebody's own post is not by a stranger", () => {
    const item = optimisticItem({
      ...base,
      author: { id: base.authorId, display_name: "Ada" },
    })
    expect(item.author_id).toBe(base.authorId)
    expect(item.author?.display_name).toBe("Ada")
  })
})

describe("confirmedItem", () => {
  const optimistic = optimisticItem(base)

  it("takes the server's id, which is what every action on the card needs", () => {
    // like, save, report and comment are all keyed on the post id. A row left
    // holding `pending-…` is a card whose every control 404s.
    const item = confirmedItem({ id: "real-id" }, optimistic)
    expect(item.id).toBe("real-id")
  })

  it("prefers the server's timestamp over this machine's clock", () => {
    const item = confirmedItem({ id: "real", created_at: "2026-01-01T00:00:00Z" }, optimistic)
    expect(item.created_at).toBe("2026-01-01T00:00:00Z")
  })

  it("keeps the optimistic value for anything the server did not restate", () => {
    const item = confirmedItem({ id: "real" }, optimistic)
    expect(item.text).toBe("hello")
    expect(item.visibility).toBe("public")
    expect(item.counts).toEqual({ likes: 0, comments: 0 })
  })

  it("accepts a server-side reclassification of the content type", () => {
    // A plain "post" that carried a short portrait video comes back a flick.
    const item = confirmedItem({ id: "real", content_type: "flick" }, optimistic)
    expect(item.content_type).toBe("flick")
  })

  it("takes an empty string from the server rather than treating it as absent", () => {
    // `?? ` would keep "hello" here. The server is authoritative about the
    // stored text, including when it stored nothing.
    const item = confirmedItem({ id: "real", text: "" }, optimistic)
    expect(item.text).toBe("")
  })
})
