import { describe, expect, it, vi } from "vitest"

/**
 * The channel page's own network, with the api-client mocked out — the way
 * ../links/api.test.ts and ../watch/postSeries.test.ts do it, because this
 * repo has no server to point at and the interesting part is the request we
 * SEND and the shape we accept back.
 *
 * Two things here are worth more than the rest. `type=flick,reel` on the
 * Shorts tab is the difference between showing a channel's shorts and showing
 * only the ones posted since the rename; and the "never throws" promise on
 * the two decoration calls is what keeps a failed count or a missing banner
 * from taking a channel page down.
 */

const get = vi.fn()
vi.mock("@atpost/api-client", () => ({
  default: { get: (...args: unknown[]) => get(...args) },
}))

const {
  CHANNEL_FEED_TYPE,
  fetchAuthorCounts,
  fetchChannelPlaylists,
  fetchChannelPosts,
  fetchChannelProfileExtras,
  playlistCoverPost,
} = await import("./api")

const AUTHOR = "9c1c0d4e-1111-4222-8333-444455556666"

describe("fetchChannelPosts", () => {
  it("asks for long video on the Videos tab", async () => {
    get.mockResolvedValueOnce({ data: { data: [], meta: {} } })
    await fetchChannelPosts(AUTHOR, "videos")
    expect(get).toHaveBeenCalledWith(
      `/v1/posts/by-author/${AUTHOR}`,
      expect.objectContaining({ params: expect.objectContaining({ type: "long_video" }) })
    )
  })

  it("asks for BOTH names of a short on the Shorts tab", async () => {
    // `flick` is canonical and `reel` is its legacy synonym. Asking for one
    // would silently hide the oldest shorts on the channel.
    expect(CHANNEL_FEED_TYPE.shorts).toBe("flick,reel")
    get.mockResolvedValueOnce({ data: { data: [], meta: {} } })
    await fetchChannelPosts(AUTHOR, "shorts")
    expect(get).toHaveBeenCalledWith(
      `/v1/posts/by-author/${AUTHOR}`,
      expect.objectContaining({ params: expect.objectContaining({ type: "flick,reel" }) })
    )
  })

  it("sends no cursor on the first page and echoes one back verbatim after that", async () => {
    // `get` is a module-level mock shared by the whole file, so the LAST call
    // is the one this case made.
    const lastParams = () => get.mock.calls.at(-1)![1].params

    get.mockResolvedValueOnce({ data: { data: [], meta: {} } })
    await fetchChannelPosts(AUTHOR, "videos")
    expect(lastParams().cursor).toBeUndefined()

    // A `/v1/posts/*` cursor is a bare RFC3339Nano timestamp. Nothing here
    // constructs or re-encodes one — handing the wrong family's cursor back is
    // a 400.
    const cursor = "2026-09-09T10:11:12.131415Z"
    get.mockResolvedValueOnce({ data: { data: [], meta: {} } })
    await fetchChannelPosts(AUTHOR, "videos", cursor)
    expect(lastParams().cursor).toBe(cursor)
  })

  it("reads the next cursor, and turns an absent one into the end of the list", async () => {
    get.mockResolvedValueOnce({ data: { data: [{ id: "a" }], meta: { next_cursor: "c2" } } })
    await expect(fetchChannelPosts(AUTHOR, "videos")).resolves.toEqual({
      items: [{ id: "a" }],
      nextCursor: "c2",
    })

    get.mockResolvedValueOnce({ data: { data: [], meta: { next_cursor: "" } } })
    expect((await fetchChannelPosts(AUTHOR, "videos")).nextCursor).toBeNull()
  })

  it("survives a body with no data array rather than crashing the tab", async () => {
    get.mockResolvedValueOnce({ data: {} })
    await expect(fetchChannelPosts(AUTHOR, "videos")).resolves.toEqual({
      items: [],
      nextCursor: null,
    })
  })
})

describe("fetchAuthorCounts", () => {
  it("reads a count per kind", async () => {
    get.mockResolvedValueOnce({ data: { data: { long_video: 7, flick: 4 } } })
    await expect(fetchAuthorCounts(AUTHOR)).resolves.toEqual({ videos: 7, shorts: 4 })
  })

  it("SUMS both names of a kind, because a channel can hold rows of each era", async () => {
    // Four `flick` rows and two older `reel` rows is six shorts. Reporting
    // four would be wrong in exactly the way the dual-name filter exists to
    // prevent.
    get.mockResolvedValueOnce({ data: { data: { flick: 4, reel: 2, long_video: 1, video: 3 } } })
    await expect(fetchAuthorCounts(AUTHOR)).resolves.toEqual({ videos: 4, shorts: 6 })
  })

  it("reads a map nested under `counts` too", async () => {
    get.mockResolvedValueOnce({ data: { data: { counts: { long_video: 2 } } } })
    expect((await fetchAuthorCounts(AUTHOR)).videos).toBe(2)
  })

  it("answers null — never zero — for a kind the body did not mention", async () => {
    // A tab reading "Shorts 0" because the key was missing is a false
    // statement about somebody's channel; a bare "Shorts" has only said less.
    get.mockResolvedValueOnce({ data: { data: { long_video: 5 } } })
    await expect(fetchAuthorCounts(AUTHOR)).resolves.toEqual({ videos: 5, shorts: null })
  })

  it("never throws, because a tab label may not take the page down", async () => {
    get.mockRejectedValueOnce(new Error("gateway down"))
    await expect(fetchAuthorCounts(AUTHOR)).resolves.toEqual({ videos: null, shorts: null })

    get.mockResolvedValueOnce({ data: { data: "not an object" } })
    await expect(fetchAuthorCounts(AUTHOR)).resolves.toEqual({ videos: null, shorts: null })
  })
})

describe("fetchChannelProfileExtras", () => {
  it("takes a cover only when it is something a browser could load", async () => {
    get.mockResolvedValueOnce({ data: { data: { cover_url: "https://cdn/c.jpg?sig=1" } } })
    expect((await fetchChannelProfileExtras("u-1")).coverUrl).toBe("https://cdn/c.jpg?sig=1")

    get.mockResolvedValueOnce({ data: { data: { banner_url: "/media/banner.jpg" } } })
    expect((await fetchChannelProfileExtras("u-1")).coverUrl).toBe("/media/banner.jpg")
  })

  it("REFUSES a media id, which is the field the profile actually carries", async () => {
    // A media id is not a URL: the one derivable from it is unsigned and
    // 403s. Accepting it would put a broken picture across somebody's channel.
    get.mockResolvedValueOnce({
      data: { data: { cover_media_id: "6f3a1b2c-dead-4beef-8000-000000000000" } },
    })
    expect((await fetchChannelProfileExtras("u-1")).coverUrl).toBeNull()
  })

  it("reads the account's created_at as the joined date", async () => {
    get.mockResolvedValueOnce({ data: { data: { created_at: "2025-03-04T00:00:00Z" } } })
    expect((await fetchChannelProfileExtras("u-1")).joinedAt).toBe("2025-03-04T00:00:00Z")
  })

  it("never throws, because a header may not fail over its wallpaper", async () => {
    get.mockRejectedValueOnce(new Error("404"))
    await expect(fetchChannelProfileExtras("u-1")).resolves.toEqual({
      coverUrl: null,
      joinedAt: null,
    })
  })
})

describe("fetchChannelPlaylists", () => {
  it("asks the creator route and returns the rows as they came", async () => {
    // No client-side visibility filter: the server returns public to everyone
    // and public + unlisted + private to the creator, and a second copy of
    // that rule here could only ever disagree with it.
    const rows = [
      { id: "p1", title: "Builds", visibility: "public" },
      { id: "p2", title: "Drafts", visibility: "private" },
    ]
    get.mockResolvedValueOnce({ data: { data: rows } })
    await expect(fetchChannelPlaylists(AUTHOR)).resolves.toEqual(rows)
    expect(get).toHaveBeenCalledWith(`/v1/creators/${AUTHOR}/playlists`)
  })

  it("THROWS on a failed request rather than answering an empty list", async () => {
    // An empty list and a failed list are different sentences. Collapsing them
    // would print "this channel has no playlists" over a network error.
    get.mockRejectedValueOnce(new Error("500"))
    await expect(fetchChannelPlaylists(AUTHOR)).rejects.toThrow()
  })
})

describe("playlistCoverPost", () => {
  it("takes the first item that actually carries a hydrated post", async () => {
    const post = { id: "v2" }
    expect(
      playlistCoverPost({
        items: [{ post: null }, { post: post as never }, { post: { id: "v3" } as never }],
      })
    ).toBe(post)
  })

  it("is null for an empty playlist, and for one with nothing hydrated", () => {
    expect(playlistCoverPost({})).toBeNull()
    expect(playlistCoverPost({ items: [] })).toBeNull()
    expect(playlistCoverPost({ items: [{ post: null }] })).toBeNull()
  })

  it("does not walk a long playlist looking for one", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      i === 30 ? { post: { id: "late" } as never } : { post: null }
    )
    expect(playlistCoverPost({ items })).toBeNull()
  })
})
