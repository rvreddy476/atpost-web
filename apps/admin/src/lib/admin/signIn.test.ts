import { describe, expect, it } from "vitest"
import {
  describeSignInError,
  initialSignInState,
  readPendingToken,
  signInReducer,
  type SignInError,
  type SignInEvent,
  type SignInState,
} from "./signIn"

const run = (events: SignInEvent[], from: SignInState = initialSignInState) => events.reduce(signInReducer, from)
const refusal = (status: number, code?: string) => ({ response: { status, data: code ? { error: { code, message: "x" } } : null } })
const err = (status: number, code?: string): SignInError => describeSignInError(refusal(status, code))

describe("sign-in state machine", () => {
  it("password, then code, then done", () => {
    const afterPassword = run([{ type: "submit-credentials" }, { type: "credentials-accepted", pendingToken: "p1" }])
    expect(afterPassword).toEqual({ step: "otp", busy: false, pendingToken: "p1", error: null })
    expect(run([{ type: "submit-otp" }, { type: "otp-accepted" }], afterPassword)).toEqual({ step: "done" })
  })

  it("never skips the code step: a code cannot be accepted from the password step", () => {
    expect(run([{ type: "submit-credentials" }, { type: "otp-accepted" }])).toEqual({ step: "credentials", busy: true, error: null })
    expect(run([{ type: "otp-accepted" }])).toEqual(initialSignInState)
  })

  it("ignores a double submit while busy and an accept that was never requested", () => {
    const busy = run([{ type: "submit-credentials" }])
    expect(signInReducer(busy, { type: "submit-credentials" })).toBe(busy)
    expect(signInReducer(initialSignInState, { type: "credentials-accepted", pendingToken: "p" })).toBe(initialSignInState)
    expect(signInReducer(busy, { type: "credentials-accepted", pendingToken: "" })).toBe(busy)
  })

  it.each([
    ["wrong credentials", 401, "AUTH_FAILED", "credentials"],
    ["not an admin", 403, "NOT_ADMIN", "not-admin"],
    ["2FA not enrolled", 403, "MFA_NOT_ENROLLED", "not-enrolled"],
    ["rate limited", 429, "RATE_LIMITED", "rate-limited"],
    ["inactive account", 403, "ACCOUNT_NOT_ACTIVE", "inactive"],
  ])("a %s refusal stays on the password step with its own message", (_name, status, code, kind) => {
    const state = run([{ type: "submit-credentials" }, { type: "credentials-refused", error: err(status, code) }])
    expect(state.step).toBe("credentials")
    if (state.step !== "credentials") return
    expect(state.busy).toBe(false)
    expect(state.error?.kind).toBe(kind)
    expect(state.error?.message).toBeTruthy()
  })

  it("a wrong or reused code keeps the pending sign-in; an expired one goes back to the password", () => {
    const otp = run([{ type: "submit-credentials" }, { type: "credentials-accepted", pendingToken: "p1" }])
    const wrong = run([{ type: "submit-otp" }, { type: "otp-refused", error: err(401, "INVALID_OTP") }], otp)
    expect(wrong).toMatchObject({ step: "otp", pendingToken: "p1", busy: false, error: { kind: "otp" } })
    const reused = run([{ type: "submit-otp" }, { type: "otp-refused", error: err(401, "OTP_REPLAYED") }], otp)
    expect(reused).toMatchObject({ step: "otp", error: { code: "OTP_REPLAYED" } })
    const limited = run([{ type: "submit-otp" }, { type: "otp-refused", error: err(429) }], otp)
    expect(limited).toMatchObject({ step: "otp", error: { kind: "rate-limited" } })

    const expired = run([{ type: "submit-otp" }, { type: "otp-refused", error: err(401, "ADMIN_SIGN_IN_EXPIRED") }], otp)
    expect(expired).toMatchObject({ step: "credentials", busy: false, error: { kind: "expired" } })
    const revoked = run([{ type: "submit-otp" }, { type: "otp-refused", error: err(403, "NOT_ADMIN") }], otp)
    expect(revoked.step).toBe("credentials")
  })

  it("start-over forgets the pending sign-in", () => {
    const otp = run([{ type: "submit-credentials" }, { type: "credentials-accepted", pendingToken: "p1" }])
    expect(signInReducer(otp, { type: "start-over" })).toEqual(initialSignInState)
  })
})

describe("describeSignInError", () => {
  it("maps an unknown 401 to wrong credentials and a network failure to unavailable", () => {
    expect(describeSignInError(refusal(401)).kind).toBe("credentials")
    expect(describeSignInError(new Error("Network Error")).kind).toBe("unavailable")
    expect(describeSignInError(refusal(503, "PERMISSIONS_UNAVAILABLE")).kind).toBe("unavailable")
    expect(describeSignInError(refusal(500)).message).toBe("Sign-in failed. Try again.")
  })

  it("tells a non-admin and an unenrolled admin apart", () => {
    expect(describeSignInError(refusal(403, "NOT_ADMIN")).message).toMatch(/does not have admin access/)
    expect(describeSignInError(refusal(403, "MFA_NOT_ENROLLED")).message).toMatch(/authenticator app/)
  })
})

describe("readPendingToken", () => {
  it("reads the enveloped and bare login answers", () => {
    expect(readPendingToken({ data: { requires_2fa: true, pending_token: "tok" } })).toBe("tok")
    expect(readPendingToken({ requires_2fa: true, pending_token: "tok" })).toBe("tok")
  })

  it("refuses anything that is not a 2FA challenge", () => {
    expect(readPendingToken({ data: { pending_token: "tok" } })).toBeNull()
    expect(readPendingToken({ data: { requires_2fa: true, pending_token: "" } })).toBeNull()
    expect(readPendingToken(null)).toBeNull()
  })
})
