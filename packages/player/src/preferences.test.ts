import { afterEach, describe, expect, it } from "vitest"
import { clearPreference, preferenceKey, readPreference, writePreference } from "./preferences"

/**
 * A fake `window.localStorage`, because there is no jsdom here and there is not
 * going to be one.
 *
 * The interesting cases are not "does a Map work" — they are the two ways a
 * real browser refuses: a `window.localStorage` GETTER that throws before any
 * read happens (site data blocked, partitioned storage), and a `setItem` that
 * throws on its own after reads have been working (quota). Both are installed
 * below as their own store, because both have taken a React tree down.
 */
type Store = Record<string, string>

function installStorage(store: Store, options: { writeThrows?: boolean } = {}) {
  const localStorage = {
    getItem: (key: string) => (key in store ? store[key]! : null),
    setItem: (key: string, value: string) => {
      if (options.writeThrows) throw new Error("QuotaExceededError")
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  })
}

function installHostileStorage() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    get() {
      // The shape a browser with site data blocked presents: touching the
      // property is itself the SecurityError.
      throw new Error("SecurityError")
    },
  })
}

function removeStorage() {
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined })
}

afterEach(() => {
  removeStorage()
})

describe("preferenceKey", () => {
  it("namespaces by product and by viewer", () => {
    expect(preferenceKey("speed", "u-7")).toBe("momentum.player.speed.u-7")
  })

  it("falls back to one shared anonymous key when nobody is signed in", () => {
    expect(preferenceKey("speed", null)).toBe("momentum.player.speed.anon")
    expect(preferenceKey("speed", undefined)).toBe("momentum.player.speed.anon")
    expect(preferenceKey("speed", "   ")).toBe("momentum.player.speed.anon")
  })

  it("keeps two viewers on one machine apart", () => {
    expect(preferenceKey("volume", "a")).not.toBe(preferenceKey("volume", "b"))
  })
})

describe("readPreference / writePreference", () => {
  it("round-trips a value for one viewer", () => {
    installStorage({})
    writePreference("speed", "u-7", "1.5")
    expect(readPreference("speed", "u-7")).toBe("1.5")
  })

  it("does not hand one viewer another viewer's value", () => {
    installStorage({})
    writePreference("speed", "u-7", "1.5")
    expect(readPreference("speed", "u-8")).toBeNull()
  })

  it("answers null rather than throwing when storage is blocked", () => {
    installHostileStorage()
    expect(readPreference("speed", "u-7")).toBeNull()
  })

  it("swallows a write that storage refuses", () => {
    installHostileStorage()
    expect(() => writePreference("speed", "u-7", "1.5")).not.toThrow()
  })

  it("swallows a quota failure on a store whose reads work", () => {
    const store: Store = { "momentum.player.speed.u-7": "1.25" }
    installStorage(store, { writeThrows: true })
    expect(() => writePreference("speed", "u-7", "2")).not.toThrow()
    // The old value survives, which is the honest outcome: nothing was written.
    expect(readPreference("speed", "u-7")).toBe("1.25")
  })

  it("clears a preference back to absent", () => {
    installStorage({})
    writePreference("captions", "u-7", "en")
    clearPreference("captions", "u-7")
    expect(readPreference("captions", "u-7")).toBeNull()
  })

  it("swallows a clear that storage refuses", () => {
    installHostileStorage()
    expect(() => clearPreference("captions", "u-7")).not.toThrow()
  })
})
