import { describe, expect, it, vi } from "vitest"

/**
 * `GET /v1/posts/{id}/series`, as this client reads it.
 *
 * The endpoint was built in parallel with the page and coded against its
 * written contract, so the assertions here are about the contract: a payload
 * of the documented shape comes out as the rail's own `SeriesEpisode` rows,
 * the 404 that most videos answer is null and not an error, and the two
 * honest absences (`next: null` on the last episode, `prev: null` on the
 * first) stay absences.
 */

const get = vi.fn()
vi.mock("@atpost/api-client", () => ({ default: { get: (...args: unknown[]) => get(...args) } }))

const { fetchPostSeries, isNotFound, parsePostSeries } = await import("./api")

const WIRE = {
  series: { id: "s1", creator_id: "c1", title: "Building it in the open", episode_count: 3 },
  episodes: [
    { post_id: "p1", episode_num: 1, title: "Where this started" },
    { post_id: "p2", episode_num: 2, title: null },
    { post_id: "p3", episode_num: 3, title: "The end" },
  ],
  current: { episode_num: 3 },
  next: null,
  prev: { post_id: "p2", episode_num: 2, title: null },
}

describe("parsePostSeries", () => {
  it("widens every episode row to the rail's own shape, with the series id on it", () => {
    const parsed = parsePostSeries(WIRE)!
    expect(parsed.series.id).toBe("s1")
    expect(parsed.series.title).toBe("Building it in the open")
    expect(parsed.episodes.map((e) => e.series_id)).toEqual(["s1", "s1", "s1"])
    expect(parsed.episodes[1]).toEqual({ series_id: "s1", post_id: "p2", episode_num: 2, title: null })
    expect(parsed.current.episode_num).toBe(3)
  })

  // The last episode has no next. Turning that into anything but null is how
  // a countdown gets offered to nowhere.
  it("preserves a null next and a real prev", () => {
    const parsed = parsePostSeries(WIRE)!
    expect(parsed.next).toBeNull()
    expect(parsed.prev).toEqual({ post_id: "p2", episode_num: 2, title: null })
  })

  it("is null for no data, and for data that is not a series", () => {
    expect(parsePostSeries(undefined)).toBeNull()
    expect(parsePostSeries(null)).toBeNull()
    expect(parsePostSeries({})).toBeNull()
    expect(parsePostSeries({ series: { title: "no id" } })).toBeNull()
  })

  it("drops a row it cannot place rather than a whole series", () => {
    const parsed = parsePostSeries({
      ...WIRE,
      episodes: [{ post_id: "p1", episode_num: 1 }, { post_id: "", episode_num: 2 }, null, { post_id: "p3" }],
    })!
    expect(parsed.episodes.map((e) => e.post_id)).toEqual(["p1"])
  })

  it("refuses a neighbour without a usable post id or number", () => {
    const parsed = parsePostSeries({ ...WIRE, next: { post_id: "", episode_num: 4 }, prev: { post_id: "p2" } })!
    expect(parsed.next).toBeNull()
    expect(parsed.prev).toBeNull()
  })
})

describe("fetchPostSeries", () => {
  it("asks the one endpoint and returns the normalised answer", async () => {
    get.mockResolvedValueOnce({ data: { data: WIRE } })
    const found = await fetchPostSeries("p3")
    expect(get).toHaveBeenCalledWith("/v1/posts/p3/series")
    expect(found?.series.id).toBe("s1")
    expect(found?.next).toBeNull()
  })

  // Most videos are in no series, and the server answers the same 404 for
  // one in a series the viewer cannot see. Neither is an error.
  it("turns a 404 into null", async () => {
    get.mockRejectedValueOnce({ response: { status: 404 } })
    await expect(fetchPostSeries("lonely")).resolves.toBeNull()
  })

  // "We could not find out" is not "there is none": the hook decides what to
  // show, and it can only decide if the two arrive differently.
  it("rethrows anything else", async () => {
    get.mockRejectedValueOnce({ response: { status: 500 } })
    await expect(fetchPostSeries("p3")).rejects.toEqual({ response: { status: 500 } })
  })
})

describe("isNotFound", () => {
  it("recognises the api-client's 404 and nothing else", () => {
    expect(isNotFound({ response: { status: 404 } })).toBe(true)
    expect(isNotFound({ response: { status: 403 } })).toBe(false)
    expect(isNotFound(new Error("network"))).toBe(false)
    expect(isNotFound(null)).toBe(false)
  })
})
