/**
 * What a page landing, or failing to, does to a list.
 *
 * ── Why these are pure functions with a test and not lines in a hook ──────
 * The zone's 75 existing tests touch none of this, and the two defects fixed
 * here were both invisible from the outside:
 *
 *   · a failed NEXT page was caught, discarded, and the loading flag cleared.
 *     The list simply stopped growing, with nothing on screen to say why and
 *     nothing in the state for a caller to render. That is one line's
 *     difference from the correct behaviour and no amount of clicking finds
 *     it, because it looks exactly like the end of the feed.
 *   · a failed FIRST page must do the opposite and replace the list, because
 *     there is nothing true on screen to protect.
 *
 * Both are one function of (state, outcome, mode), so they are tested as a
 * table, which is how everything else in this zone is tested.
 */

import { describe, expect, it } from "vitest"
import type { FeedItem } from "@atpost/types/feed"
import type { LoadedPage } from "./tabApi"
import { applyFailure, applyPage, startLoading, type ListState } from "./useTabbedFeed"

function item(id: string): FeedItem {
  return {
    id,
    author_id: `author-${id}`,
    content_type: "post",
    created_at: "2026-09-18T10:00:00Z",
    counts: { likes: 0, comments: 0 },
  }
}

const EMPTY: ListState = {
  items: [],
  cursor: null,
  status: "loading",
  failure: null,
  loadingMore: false,
  reachedEnd: false,
  loadMoreFailure: null,
  authorsUnresolved: false,
}

function ready(overrides: Partial<ListState> = {}): ListState {
  return { ...EMPTY, items: [item("a"), item("b")], status: "ready", cursor: "c1", ...overrides }
}

function page(overrides: Partial<LoadedPage> = {}): LoadedPage {
  return { items: [item("c")], nextCursor: "c2", ...overrides }
}

describe("startLoading", () => {
  it("only flags loadingMore for an append", () => {
    expect(startLoading(EMPTY, "append").loadingMore).toBe(true)
    expect(startLoading(EMPTY, "replace").loadingMore).toBe(false)
  })

  it("clears a previous next-page failure on the ATTEMPT", () => {
    // Not on its outcome: a retry button and the sentence explaining why it
    // is there must not both be on screen while that retry is in the air.
    const failed = ready({ loadMoreFailure: { status: 503 } })
    expect(startLoading(failed, "append").loadMoreFailure).toBeNull()
  })

  it("keeps the posts that are already on screen", () => {
    expect(startLoading(ready(), "append").items).toHaveLength(2)
  })
})

describe("applyPage", () => {
  it("replaces the list on a reload and appends on a next page", () => {
    expect(applyPage(ready(), page(), "replace").items.map((i) => i.id)).toEqual(["c"])
    expect(applyPage(ready(), page(), "append").items.map((i) => i.id)).toEqual(["a", "b", "c"])
  })

  it("dedupes by id, because the ranker repeats items across pages", () => {
    // Two cards with the same React key is a silent rendering corruption
    // rather than a visible bug, which is why this is not left to the cursor.
    const repeat = page({ items: [item("b"), item("c")] })
    expect(applyPage(ready(), repeat, "append").items.map((i) => i.id)).toEqual(["a", "b", "c"])
  })

  it("reads the absence of a cursor as the end of the list", () => {
    // These endpoints only send `meta.next_cursor` when the page came back
    // FULL, so a short page IS the terminating condition.
    expect(applyPage(EMPTY, page({ nextCursor: null }), "replace").reachedEnd).toBe(true)
    expect(applyPage(EMPTY, page(), "replace").reachedEnd).toBe(false)
  })

  it("clears both failures and the loading flag", () => {
    const broken = ready({ status: "error", failure: { status: 500 }, loadMoreFailure: { status: 503 }, loadingMore: true })
    const next = applyPage(broken, page(), "append")
    expect(next.status).toBe("ready")
    expect(next.failure).toBeNull()
    expect(next.loadMoreFailure).toBeNull()
    expect(next.loadingMore).toBe(false)
  })

  it("keeps authorsUnresolved across an append", () => {
    // A later page whose names resolved does not make the earlier page's
    // unnamed cards named. The notice is about what is on screen.
    const unnamed = ready({ authorsUnresolved: true })
    expect(applyPage(unnamed, page(), "append").authorsUnresolved).toBe(true)
  })

  it("lets a reload clear authorsUnresolved, which is what makes the retry work", () => {
    const unnamed = ready({ authorsUnresolved: true })
    expect(applyPage(unnamed, page(), "replace").authorsUnresolved).toBe(false)
  })

  it("raises authorsUnresolved when the page says the lookup failed", () => {
    expect(applyPage(EMPTY, page({ authorsUnresolved: true }), "replace").authorsUnresolved).toBe(
      true
    )
  })
})

describe("applyFailure", () => {
  it("keeps the posts a failed NEXT page cannot invalidate", () => {
    const next = applyFailure(ready(), { status: 503 }, "append")
    expect(next.items).toHaveLength(2)
    expect(next.status).toBe("ready")
    expect(next.loadingMore).toBe(false)
  })

  it("RECORDS that failure rather than dropping it", () => {
    // The whole defect: without this the list stalls and looks like the end
    // of the feed. The caller renders a retry off this field, and disarms the
    // pager's sentinel off it too.
    expect(applyFailure(ready(), { status: 503 }, "append").loadMoreFailure).toEqual({ status: 503 })
  })

  it("replaces the list when the FIRST page failed", () => {
    const next = applyFailure(EMPTY, { status: 401 }, "replace")
    expect(next.status).toBe("error")
    expect(next.failure).toEqual({ status: 401 })
    // And it is not also reported as a next-page failure: two notices for one
    // failure would be two things to dismiss.
    expect(next.loadMoreFailure).toBeNull()
  })

  it("keeps a 401 distinguishable, because the next step differs", () => {
    expect(applyFailure(ready(), { status: 401 }, "append").loadMoreFailure?.status).toBe(401)
  })
})
