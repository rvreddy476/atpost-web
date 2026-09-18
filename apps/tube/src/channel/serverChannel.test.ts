import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchChannelOnServer } from "./serverChannel"

/**
 * The server-side read behind the link preview.
 *
 * The three-way result is the whole reason this function has a return type
 * instead of returning a channel or null, and it is the thing worth testing:
 * a 404 is a FACT (this handle belongs to nobody, and the route may 404) while
 * everything else is a FAILURE (we could not read it, and the page must still
 * render). Collapsing them would tell a creator their channel is gone every
 * time the gateway hiccuped.
 *
 * `fetch` is stubbed rather than a server being started, which also lets the
 * timeout and the malformed-body cases be asserted at all.
 */

const CHANNEL = {
  user_id: "u-1",
  name: "Ada",
  handle: "ada",
  about: "",
  avatar_media_id: null,
  avatar_url: null,
  video_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

function stubFetch(impl: (url: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(impl(url))))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchChannelOnServer", () => {
  it("returns the channel from the gateway's envelope", async () => {
    stubFetch(() => ({ status: 200, ok: true, json: async () => ({ data: CHANNEL }) }))
    await expect(fetchChannelOnServer("ada")).resolves.toEqual({
      status: "found",
      channel: CHANNEL,
    })
  })

  it("asks the gateway directly, not this app's own proxy", async () => {
    // A server render has no origin to be same to, and asking our own proxy
    // would leave the process and come back in to make the upstream call.
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(url)
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: CHANNEL }) })
      })
    )
    await fetchChannelOnServer("ada")
    expect(calls[0]).toContain("/v1/channels/ada")
    expect(calls[0]).not.toContain("/api/proxy")
  })

  it("encodes the ref, because a handle is user-typed text", async () => {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(url)
        return Promise.resolve({ status: 404, ok: false, json: async () => ({}) })
      })
    )
    await fetchChannelOnServer("a da/../x")
    expect(calls[0]).toContain("a%20da%2F..%2Fx")
  })

  it("reads a 404 as MISSING — the one failure that is a fact", async () => {
    stubFetch(() => ({ status: 404, ok: false, json: async () => ({}) }))
    await expect(fetchChannelOnServer("nobody")).resolves.toEqual({ status: "missing" })
  })

  it("reads a 500 as an ERROR, so the page renders instead of 404ing", async () => {
    stubFetch(() => ({ status: 500, ok: false, json: async () => ({}) }))
    await expect(fetchChannelOnServer("ada")).resolves.toEqual({ status: "error" })
  })

  it("reads a refused connection as an error and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))))
    await expect(fetchChannelOnServer("ada")).resolves.toEqual({ status: "error" })
  })

  it("reads a 200 with an unusable body as an error, not as a missing channel", async () => {
    // A 200 whose body is not a channel is a broken response. Calling it
    // "missing" would 404 a channel that exists.
    stubFetch(() => ({ status: 200, ok: true, json: async () => ({ data: { name: "Ada" } }) }))
    await expect(fetchChannelOnServer("ada")).resolves.toEqual({ status: "error" })

    stubFetch(() => ({
      status: 200,
      ok: true,
      json: async () => {
        throw new SyntaxError("not json")
      },
    }))
    await expect(fetchChannelOnServer("ada")).resolves.toEqual({ status: "error" })
  })

  it("treats an empty ref as missing without making a request at all", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    await expect(fetchChannelOnServer("   ")).resolves.toEqual({ status: "missing" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("caps how long a link preview may hold up a render", async () => {
    // A dead gateway must cost this route seconds and a generic title, not
    // thirty seconds of white screen.
    let seen: RequestInit | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        seen = init
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: CHANNEL }) })
      })
    )
    await fetchChannelOnServer("ada")
    expect(seen?.signal).toBeDefined()
  })

  it("sends NO cookie, so one viewer's state cannot land in a shared cache", async () => {
    let seen: RequestInit | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        seen = init
        return Promise.resolve({ status: 200, ok: true, json: async () => ({ data: CHANNEL }) })
      })
    )
    await fetchChannelOnServer("ada")
    expect(JSON.stringify(seen?.headers ?? {}).toLowerCase()).not.toContain("cookie")
  })
})
