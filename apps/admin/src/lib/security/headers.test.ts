import { describe, expect, it } from "vitest"
import { buildContentSecurityPolicy, resolveAdminBasePath, sanitiseOrigin, splitOrigins, staticSecurityHeaders } from "./headers"

const NONCE = "AAAAAAAAAAAAAAAAAAAAAAAA"

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/)
      return [name, values]
    }),
  )
}

describe("admin CSP", () => {
  it("is strict in production", () => {
    const d = directives(buildContentSecurityPolicy({ nonce: NONCE, dev: false, apiOrigin: "https://api.cleestudio.com/v1" }))
    expect(d["default-src"]).toEqual(["'none'"])
    expect(d["script-src"]).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"])
    expect(d["connect-src"]).toEqual(["'self'", "https://api.cleestudio.com"])
    expect(d["frame-ancestors"]).toEqual(["'none'"])
    expect(d["object-src"]).toEqual(["'none'"])
    expect(d["base-uri"]).toEqual(["'none'"])
    expect(d["upgrade-insecure-requests"]).toEqual([])
    const all = Object.values(d).flat()
    expect(all).not.toContain("'unsafe-eval'")
    expect(d["script-src"]).not.toContain("'unsafe-inline'")
    expect(d["style-src-elem"]).not.toContain("'unsafe-inline'")
  })

  it("adds only what the dev server needs in development", () => {
    const d = directives(buildContentSecurityPolicy({ nonce: NONCE, dev: true }))
    expect(d["script-src"]).toContain("'unsafe-eval'")
    expect(d["connect-src"]).toEqual(["'self'", "ws:", "wss:"])
    expect(d["upgrade-insecure-requests"]).toBeUndefined()
  })

  it("refuses a weak nonce and drops malformed origins", () => {
    expect(() => buildContentSecurityPolicy({ nonce: "abc", dev: false })).toThrow()
    const d = directives(
      buildContentSecurityPolicy({ nonce: NONCE, dev: false, apiOrigin: "javascript:alert(1)", imageOrigins: ["https://*.cleestudio.com", "data:x; script-src *"] }),
    )
    expect(d["connect-src"]).toEqual(["'self'"])
    expect(d["img-src"]).toEqual(["'self'", "data:", "blob:", "https://*.cleestudio.com"])
    expect(d["script-src"]).toHaveLength(3)
  })

  it("sanitises origins", () => {
    expect(sanitiseOrigin("https://media.cleestudio.com/path?q=1")).toBe("https://media.cleestudio.com")
    expect(sanitiseOrigin("ftp://x")).toBeNull()
    expect(splitOrigins("https://a.example, https://b.example nonsense")).toEqual(["https://a.example", "https://b.example"])
  })
})

describe("static headers", () => {
  it("sets HSTS only in production and never leaks referrers", () => {
    const prod = Object.fromEntries(staticSecurityHeaders({ production: true }).map((h) => [h.key, h.value]))
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=63072000/)
    expect(prod["Referrer-Policy"]).toBe("no-referrer")
    expect(prod["Permissions-Policy"]).toMatch(/camera=\(\)/)
    const dev = staticSecurityHeaders({ production: false }).map((h) => h.key)
    expect(dev).not.toContain("Strict-Transport-Security")
  })
})

describe("base path", () => {
  it("defaults to /admin and serves at the root when set empty", () => {
    expect(resolveAdminBasePath(undefined)).toBe("/admin")
    expect(resolveAdminBasePath("")).toBe("")
    expect(resolveAdminBasePath("/")).toBe("")
    expect(resolveAdminBasePath("/ops/")).toBe("/ops")
    expect(() => resolveAdminBasePath("admin")).toThrow()
    expect(() => resolveAdminBasePath("/a b")).toThrow()
  })
})
