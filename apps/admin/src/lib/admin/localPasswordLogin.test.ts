import { describe, expect, it } from "vitest"
import { localPasswordProxyOptions } from "./localPasswordLogin"
import { isLocalPasswordSession, initialSignInState, signInReducer } from "./signIn"

const env = { ADMIN_LOCAL_PASSWORD_LOGIN_KEY: "k".repeat(32), AUTH_SERVICE_URL: "http://identity-auth:8081" }
const path = ["auth", "admin-session", "login"]

describe("local admin password sign-in", () => {
  it("only allows the explicitly configured development admin hostname", () => {
    const development = {...env, ADMIN_DEV_PASSWORD_HOST:"admin.cleestudio.com"}
    expect(localPasswordProxyOptions("http://container:3000",path,development,"admin.cleestudio.com")?.upstream).toBe(env.AUTH_SERVICE_URL)
    for (const host of ["admin.cleestudio.com.evil.test","partner.cleestudio.com","admin.cleestudio.com:8080","admin.cleestudio.com/path"]) {
      expect(localPasswordProxyOptions("http://container:3000",path,development,host)).toBeUndefined()
    }
    expect(localPasswordProxyOptions("http://container:3000",["auth","admin-session","step-up"],development,"admin.cleestudio.com")).toBeUndefined()
  })
  it("injects the server-only key only for localhost admin login", () => {
    const options = localPasswordProxyOptions("http://localhost:3002/admin/api/proxy/auth/admin-session/login", path, env)
    expect(options?.upstream).toBe(env.AUTH_SERVICE_URL)
    expect(options?.headers.get("X-Admin-Local-Password-Key")).toBe(env.ADMIN_LOCAL_PASSWORD_LOGIN_KEY)
    expect(localPasswordProxyOptions("https://admin.cleestudio.com/admin/api/proxy", path, env)).toBeUndefined()
    expect(localPasswordProxyOptions("http://localhost:3002/admin/api/proxy", ["auth", "login"], env)).toBeUndefined()
    expect(localPasswordProxyOptions("http://localhost:3002/admin/api/proxy", path, {})).toBeUndefined()
    expect(localPasswordProxyOptions("http://localhost:3002/admin/api/proxy", path, { ...env, AUTH_SERVICE_URL: undefined })).toBeUndefined()
    expect(localPasswordProxyOptions("http://localhost.evil.test:3002/admin/api/proxy", path, env)).toBeUndefined()
    expect(localPasswordProxyOptions("http://0.0.0.0:3000/admin/api/proxy", path, env, "localhost:3002")?.upstream).toBe(env.AUTH_SERVICE_URL)
    expect(localPasswordProxyOptions("http://0.0.0.0:3000/admin/api/proxy", path, env, "admin.cleestudio.com")).toBeUndefined()
    expect(localPasswordProxyOptions("http://0.0.0.0:3000/admin/api/proxy", path, env, "localhost:3002/path")).toBeUndefined()
    expect(localPasswordProxyOptions("http://localhost:3002/admin/api/proxy", path, { ...env, ADMIN_LOCAL_PASSWORD_LOGIN_KEY: "short" })).toBeUndefined()
  })
  it("only navigates after an explicit successful local session answer", () => {
    const body = { requires_2fa: false, local_password_login: true, admin_mfa: false, session_id: "s", user: { id: "u" } }
    expect(isLocalPasswordSession({ data: body })).toBe(true)
    expect(isLocalPasswordSession(body)).toBe(true)
    expect(isLocalPasswordSession({ ...body, session_id: "" })).toBe(false)
    expect(isLocalPasswordSession({ ...body, local_password_login: undefined })).toBe(false)
    expect(isLocalPasswordSession({ ...body, requires_2fa: true })).toBe(false)
    expect(isLocalPasswordSession(null)).toBe(false)
    expect(signInReducer(initialSignInState, { type: "local-session-accepted" })).toBe(initialSignInState)
    const busy = signInReducer(initialSignInState, { type: "submit-credentials" })
    expect(signInReducer(busy, { type: "local-session-accepted" })).toEqual({ step: "done" })
  })
})
