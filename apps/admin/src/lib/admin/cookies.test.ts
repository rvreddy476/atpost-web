import { describe, expect, it } from "vitest"
import { adminOnlyCookieHeader, adminProxyHeaders, readCookie, safeNextPath } from "./cookies"
import { isWrite, shouldRefreshOn401 } from "./api"

describe("admin cookies", () => {
  it("the proxy forwards only the three admin cookies, values untouched", () => {
    const header =
      "access_token=consumer.jwt; refresh_token=c-r; csrf_token=c-c; admin_access_token=a.b+c/d=; admin_refresh_token=r%2B1; admin_csrf_token=k; admin_other=x; theme=dark"
    expect(adminOnlyCookieHeader(header)).toBe("admin_access_token=a.b+c/d=; admin_refresh_token=r%2B1; admin_csrf_token=k")
    expect(adminOnlyCookieHeader("access_token=x; csrf_token=y")).toBe("")
    expect(adminOnlyCookieHeader(null)).toBe("")
  })

  it("the proxy drops the Cookie header when no admin cookie is present, and always drops Authorization", () => {
    const consumerOnly = adminProxyHeaders(new Headers({ cookie: "access_token=x", authorization: "Bearer y", "x-csrf-token": "k" }))
    expect(consumerOnly.get("cookie")).toBeNull()
    expect(consumerOnly.get("authorization")).toBeNull()
    expect(consumerOnly.get("x-csrf-token")).toBe("k")

    const admin = adminProxyHeaders(new Headers({ cookie: "access_token=x; admin_access_token=z" }))
    expect(admin.get("cookie")).toBe("admin_access_token=z")
  })

  it("reads the admin CSRF cookie, not the consumer one", () => {
    const jar = "csrf_token=consumer; admin_csrf_token=admin%20value"
    expect(readCookie(jar, "admin_csrf_token")).toBe("admin value")
    expect(readCookie("csrf_token=consumer", "admin_csrf_token")).toBeNull()
    expect(readCookie("admin_csrf_token=", "admin_csrf_token")).toBeNull()
  })

  it("only same-app paths are post-sign-in destinations", () => {
    expect(safeNextPath("/sellers?tab=kyc")).toBe("/sellers?tab=kyc")
    for (const bad of [null, "", "sellers", "//evil.example", "/\\evil.example", "https://evil.example", "/x?u=https://e"]) {
      expect(safeNextPath(bad)).toBe("/")
    }
  })
})

describe("admin client rules", () => {
  it("echoes CSRF on writes only", () => {
    expect(["post", "PUT", "patch", "delete"].every(isWrite)).toBe(true)
    expect(isWrite("get")).toBe(false)
    expect(isWrite(undefined)).toBe(false)
  })

  it("never refreshes on the sign-in, refresh or sign-out routes", () => {
    expect(shouldRefreshOn401("/v1/admin/me")).toBe(true)
    expect(shouldRefreshOn401("/v1/auth/admin-session/step-up")).toBe(true)
    for (const url of ["/v1/auth/admin-session/login", "/v1/auth/admin-session/verify-2fa", "/v1/auth/admin-session/refresh?x=1", "/v1/auth/admin-session/logout"]) {
      expect(shouldRefreshOn401(url)).toBe(false)
    }
  })
})
