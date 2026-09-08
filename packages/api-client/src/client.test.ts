import { beforeEach, describe, expect, it } from "vitest"
import type { InternalAxiosRequestConfig } from "axios"
import api, {
  SESSION_BROADCAST_KEY,
  SESSION_CHANGE_EVENT,
  clearSession,
  hasSessionCookie,
  purgeLegacySession,
} from "./client"

/**
 * What these assert, and why each one is worth a test:
 *
 *  · The client sends NO credential of its own. If an Authorization or
 *    X-User-Id header ever comes back, someone has reintroduced a token this
 *    code cannot legitimately hold.
 *  · X-CSRF-Token is the cookie's value, byte for byte, and is absent when
 *    there is no cookie. A minted value would 403 every write against the
 *    identity services, whose RequireCSRF compares the two exactly.
 *  · The legacy localStorage slots are deleted, not merely ignored.
 */

/** A cookie jar over the `document.cookie` accessor, honouring `Max-Age=0`. */
function installCookieJar(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial))
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
      },
      set cookie(entry: string) {
        const [pair, ...attrs] = entry.split(";").map((s) => s.trim())
        const eq = pair.indexOf("=")
        const name = pair.slice(0, eq)
        if (attrs.some((a) => /^max-age=0$/i.test(a))) jar.delete(name)
        else jar.set(name, pair.slice(eq + 1))
      },
    },
  })
  return jar
}

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  return store
}

/**
 * A `window` to dispatch on. The client guards every browser access behind
 * `typeof window === "undefined"`, so without one it correctly does nothing —
 * which would make these tests pass by doing no work at all.
 */
function installWindow() {
  const target = new EventTarget()
  Object.defineProperty(globalThis, "window", { configurable: true, value: target })
  return target
}

/** Run a config through the request interceptor the way axios would. */
async function throughRequestInterceptor(
  config: Partial<InternalAxiosRequestConfig>,
): Promise<InternalAxiosRequestConfig> {
  const handlers = (
    api.interceptors.request as unknown as {
      handlers: Array<{ fulfilled: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }>
    }
  ).handlers
  let next = { headers: {}, ...config } as InternalAxiosRequestConfig
  for (const handler of handlers) if (handler?.fulfilled) next = await handler.fulfilled(next)
  return next
}

beforeEach(() => {
  installCookieJar()
  installStorage()
  installWindow()
})

describe("the request interceptor", () => {
  it("sends no Authorization and no X-User-Id, because it holds neither", async () => {
    installCookieJar({ csrf_token: "abc123" })
    const config = await throughRequestInterceptor({ method: "post", url: "/v1/commerce/cart" })

    expect(config.headers["Authorization"]).toBeUndefined()
    expect(config.headers["X-User-Id"]).toBeUndefined()
    expect(config.headers["X-Admin-Role"]).toBeUndefined()
  })

  it("echoes the csrf_token cookie on a write, exactly", async () => {
    installCookieJar({ csrf_token: "cookie-value-42" })
    const config = await throughRequestInterceptor({ method: "post", url: "/v1/commerce/cart" })

    expect(config.headers["X-CSRF-Token"]).toBe("cookie-value-42")
    expect(config.headers["X-Requested-With"]).toBe("XMLHttpRequest")
  })

  it("mints nothing when there is no cookie to echo", async () => {
    // The old client generated a random token and WROTE it to document.cookie
    // when none existed. Harmless while the server ignored CSRF; now that the
    // identity services compare header against cookie, an invented pair would
    // sail through the double-submit check while standing for no session.
    const jar = installCookieJar()
    const config = await throughRequestInterceptor({ method: "post", url: "/v1/auth/logout" })

    expect(config.headers["X-CSRF-Token"]).toBeUndefined()
    expect(jar.has("csrf_token")).toBe(false)
  })

  it("leaves a GET alone: no CSRF header on a safe method", async () => {
    installCookieJar({ csrf_token: "abc123" })
    const config = await throughRequestInterceptor({ method: "get", url: "/v1/commerce/products" })

    expect(config.headers["X-CSRF-Token"]).toBeUndefined()
    expect(config.headers["X-Requested-With"]).toBeUndefined()
  })
})

describe("the presence signal", () => {
  it("is the csrf_token cookie, which the server sets and clears with the session", () => {
    installCookieJar({ csrf_token: "present" })
    expect(hasSessionCookie()).toBe(true)

    installCookieJar({ some_other_cookie: "1" })
    expect(hasSessionCookie()).toBe(false)
  })

  it("is dropped by clearSession, so a dead session stops claiming to be alive", () => {
    const jar = installCookieJar({ csrf_token: "present" })
    installStorage()
    clearSession()

    expect(jar.has("csrf_token")).toBe(false)
    expect(hasSessionCookie()).toBe(false)
  })
})

describe("telling the other tabs", () => {
  it("fires the in-tab event and writes the key that wakes the others", () => {
    const jar = installCookieJar({ csrf_token: "present" })
    const store = installStorage()
    const win = installWindow()
    let heard = 0
    const listener = () => {
      heard += 1
    }
    win.addEventListener(SESSION_CHANGE_EVENT, listener)

    clearSession()
    win.removeEventListener(SESSION_CHANGE_EVENT, listener)

    expect(heard).toBe(1)
    // The value is a timestamp nobody reads. `storage` firing in the other
    // documents is the entire payload — there is no "cookie changed" event, so
    // this is what stops a second tab believing in a session that just ended.
    expect(store.has(SESSION_BROADCAST_KEY)).toBe(true)
    expect(jar.has("csrf_token")).toBe(false)
  })
})

describe("the localStorage migration", () => {
  it("deletes the old session slots rather than leaving them to rot", () => {
    const store = installStorage({
      postbook_session: JSON.stringify({ id: "u-1" }),
      postbook_auth_tokens: JSON.stringify({ accessToken: "eyJhbGciOi...", refreshToken: "r" }),
      "unrelated:key": "keep me",
    })

    purgeLegacySession()

    // A dead access token in localStorage is still a bearer credential to
    // anything that can run script on the origin. "We stopped reading it" is
    // not the same as "it is gone".
    expect(store.has("postbook_session")).toBe(false)
    expect(store.has("postbook_auth_tokens")).toBe(false)
    expect(store.get("unrelated:key")).toBe("keep me")
  })
})
