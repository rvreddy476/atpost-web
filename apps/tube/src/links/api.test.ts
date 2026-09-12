import { describe, expect, it, vi } from "vitest"

/**
 * `DELETE /v1/video-series/{id}/episodes/{ref}`, as this editor sends it.
 *
 * A 204 carries no body, so there is nothing to parse; what CAN go wrong is
 * the ref on the URL and the status that gets swallowed. Both are asserted
 * here with the api-client mocked out, the way ../watch/postSeries.test.ts
 * does for the read.
 */

const del = vi.fn()
vi.mock("@atpost/api-client", () => ({
  default: { delete: (...args: unknown[]) => del(...args) },
}))

const { removeSeriesEpisode } = await import("./api")

const SERIES = "5e5b7b0e-7c3e-4d0a-9d8f-1f1f1f1f1f1f"
const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

describe("removeSeriesEpisode", () => {
  it("sends an episode number as the ref and reads a 204 as removed", async () => {
    del.mockResolvedValueOnce({ status: 204, data: "" })
    await expect(removeSeriesEpisode(SERIES, 2)).resolves.toBe("removed")
    expect(del).toHaveBeenCalledWith(`/v1/video-series/${SERIES}/episodes/2`)
  })

  it("sends a post id as the ref, because the route takes either", async () => {
    del.mockResolvedValueOnce({ status: 204, data: "" })
    await expect(removeSeriesEpisode(SERIES, POST)).resolves.toBe("removed")
    expect(del).toHaveBeenCalledWith(`/v1/video-series/${SERIES}/episodes/${POST}`)
  })

  // The creator asked for the row to not be there, and it is not there. A
  // second click, or a phone that got there first, must not read as failure.
  it("reads a 404 as already gone rather than as an error", async () => {
    del.mockRejectedValueOnce({ response: { status: 404 } })
    await expect(removeSeriesEpisode(SERIES, 2)).resolves.toBe("already-gone")
  })

  it("rethrows anything else, so the caller can roll back and say why", async () => {
    del.mockRejectedValueOnce({ response: { status: 403 } })
    await expect(removeSeriesEpisode(SERIES, 2)).rejects.toEqual({ response: { status: 403 } })
    del.mockRejectedValueOnce({ response: { status: 500 } })
    await expect(removeSeriesEpisode(SERIES, POST)).rejects.toEqual({ response: { status: 500 } })
  })

  // A bad ref would 404 and then read as "already gone": success. That is the
  // one way a bug could look like a working feature, so it is refused before
  // the request rather than after it.
  it("refuses a ref that could only ever 404, before sending anything", async () => {
    del.mockClear()
    await expect(removeSeriesEpisode(SERIES, 0)).rejects.toThrow(/start at 1/)
    await expect(removeSeriesEpisode(SERIES, -1)).rejects.toThrow(/start at 1/)
    await expect(removeSeriesEpisode(SERIES, 1.5)).rejects.toThrow(/start at 1/)
    await expect(removeSeriesEpisode(SERIES, "not-a-uuid")).rejects.toThrow(/not a valid id/)
    expect(del).not.toHaveBeenCalled()
  })
})
