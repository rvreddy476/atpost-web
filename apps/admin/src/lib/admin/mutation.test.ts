import { describe, expect, it } from "vitest"
import { adminErrorMessage, isMfaRequired, isStepUpRequired, readApiError, readApproval, runAdminMutation, type SentResponse } from "./mutation"
import { formatCountdown, isCompleteOtp, normaliseOtp, readStepUpValidUntil, stepUpErrorMessage, stepUpSecondsLeft } from "./stepUp"
import { canDecide, parseApprovals } from "./approvals"

const httpError = (status: number, code: string) => ({
  response: { status, data: { error: { code, message: code.toLowerCase() } } },
})

/** A send() that plays back the given outcomes in order and counts calls. */
function script(...outcomes: Array<SentResponse | ReturnType<typeof httpError>>) {
  let calls = 0
  const send = async () => {
    const next = outcomes[Math.min(calls, outcomes.length - 1)]
    calls += 1
    if ("response" in next) throw next
    return next
  }
  return { send, calls: () => calls }
}

function stepUpSpy(result: boolean) {
  let prompts = 0
  return {
    stepUp: async () => {
      prompts += 1
      return result
    },
    prompts: () => prompts,
  }
}

describe("runAdminMutation", () => {
  it("does not prompt when the first attempt succeeds", async () => {
    const s = script({ status: 200, data: { data: { ok: true } } })
    const p = stepUpSpy(true)
    const outcome = await runAdminMutation(s.send, p.stepUp)
    expect(outcome).toEqual({ kind: "done", status: 200, data: { data: { ok: true } } })
    expect(s.calls()).toBe(1)
    expect(p.prompts()).toBe(0)
  })

  it("on STEP_UP_REQUIRED prompts once and retries exactly once", async () => {
    const s = script(httpError(403, "STEP_UP_REQUIRED"), { status: 200, data: { data: {} } })
    const p = stepUpSpy(true)
    const outcome = await runAdminMutation(s.send, p.stepUp)
    expect(outcome.kind).toBe("done")
    expect(s.calls()).toBe(2)
    expect(p.prompts()).toBe(1)
  })

  it("does not loop when the retry still asks for step-up", async () => {
    const s = script(httpError(403, "STEP_UP_REQUIRED"), httpError(403, "STEP_UP_REQUIRED"), { status: 200, data: {} })
    const p = stepUpSpy(true)
    await expect(runAdminMutation(s.send, p.stepUp)).rejects.toMatchObject({ response: { status: 403 } })
    expect(s.calls()).toBe(2)
    expect(p.prompts()).toBe(1)
  })

  it("does not retry when the admin dismisses the prompt", async () => {
    const s = script(httpError(403, "STEP_UP_REQUIRED"), { status: 200, data: {} })
    const p = stepUpSpy(false)
    expect(await runAdminMutation(s.send, p.stepUp)).toEqual({ kind: "cancelled" })
    expect(s.calls()).toBe(1)
  })

  it.each([
    [403, "FORBIDDEN"],
    [403, "MFA_REQUIRED"],
    [401, "STEP_UP_REQUIRED"],
    [500, "INTERNAL_ERROR"],
  ])("does not prompt or retry on %i %s", async (status, code) => {
    const s = script(httpError(status, code), { status: 200, data: {} })
    const p = stepUpSpy(true)
    await expect(runAdminMutation(s.send, p.stepUp)).rejects.toMatchObject({ response: { status } })
    expect(s.calls()).toBe(1)
    expect(p.prompts()).toBe(0)
  })

  it("reports a 202 approval as pending, not as done", async () => {
    const s = script({ status: 202, data: { data: { approval: { id: "ap-1", status: "pending", operation: "payout.release" } } } })
    const outcome = await runAdminMutation(s.send, stepUpSpy(true).stepUp)
    expect(outcome).toEqual({ kind: "approval", approval: { id: "ap-1", status: "pending", operation: "payout.release" } })
  })

  it("handles an approval that follows a step-up", async () => {
    const s = script(httpError(403, "STEP_UP_REQUIRED"), { status: 202, data: { approval: { id: "ap-2", status: "pending" } } })
    const outcome = await runAdminMutation(s.send, stepUpSpy(true).stepUp)
    expect(outcome.kind).toBe("approval")
    expect(s.calls()).toBe(2)
  })
})

describe("readApproval", () => {
  it("needs a 202 and an approval id", () => {
    expect(readApproval(200, { approval: { id: "a" } })).toBeNull()
    expect(readApproval(202, { data: {} })).toBeNull()
    expect(readApproval(202, { approval: { status: "pending" } })).toBeNull()
    expect(readApproval(202, { approval: { id: "a" } })?.status).toBe("pending")
  })
})

describe("error readers", () => {
  it("reads codes from the Go error envelope and from a flat body", () => {
    expect(readApiError(httpError(403, "STEP_UP_REQUIRED"))).toEqual({ status: 403, code: "STEP_UP_REQUIRED", message: "step_up_required" })
    expect(readApiError({ response: { status: 403, data: { code: "MFA_REQUIRED" } } }).code).toBe("MFA_REQUIRED")
    expect(readApiError(new Error("network"))).toEqual({ status: null, code: null, message: null })
    expect(isStepUpRequired(httpError(403, "STEP_UP_REQUIRED"))).toBe(true)
    expect(isMfaRequired(httpError(403, "MFA_REQUIRED"))).toBe(true)
    expect(isMfaRequired(httpError(403, "STEP_UP_REQUIRED"))).toBe(false)
  })

  it("explains the admin-service codes in plain words", () => {
    expect(adminErrorMessage(httpError(403, "SELF_APPROVAL_FORBIDDEN"))).toMatch(/different admin/)
    expect(adminErrorMessage(httpError(409, "PAYLOAD_HASH_MISMATCH"))).toMatch(/changed/)
    expect(adminErrorMessage(httpError(503, "PERMISSIONS_UNAVAILABLE"))).toMatch(/nothing was done/)
    expect(adminErrorMessage(httpError(410, "GONE"))).toBe("This request has expired.")
    expect(adminErrorMessage(httpError(400, "ODD"))).toBe("odd")
    expect(adminErrorMessage(new Error("x"), "fallback")).toBe("fallback")
  })
})

describe("step-up helpers", () => {
  it("counts down whole seconds and never below zero", () => {
    expect(stepUpSecondsLeft(null, 0)).toBe(0)
    expect(stepUpSecondsLeft(300_000, 0)).toBe(300)
    expect(stepUpSecondsLeft(1_500, 1_000)).toBe(1)
    expect(stepUpSecondsLeft(1_000, 5_000)).toBe(0)
    expect(formatCountdown(299)).toBe("4:59")
    expect(formatCountdown(5)).toBe("0:05")
  })

  it("cleans an OTP as typed", () => {
    expect(normaliseOtp("12 34-567")).toBe("123456")
    expect(isCompleteOtp("12345")).toBe(false)
    expect(isCompleteOtp("123456")).toBe(true)
  })

  it("reads the new window from the step-up response", () => {
    expect(readStepUpValidUntil({ data: { step_up_valid_until: "2026-09-16T10:05:00Z" } })).toBe(Date.parse("2026-09-16T10:05:00Z"))
    expect(readStepUpValidUntil({})).toBeNull()
    expect(stepUpErrorMessage("INVALID_OTP")).toMatch(/not right/)
    expect(stepUpErrorMessage(null)).toMatch(/could not be checked/)
  })
})

describe("approvals", () => {
  it("parses the inbox and refuses self-approval even if the server lists one", () => {
    const items = parseApprovals(
      {
        data: [
          { id: "a1", status: "pending", app: "commerce", operation: "payout.release", requested_by: "u-2" },
          { id: "a2", status: "pending", app: "food", operation: "settlement.mark_paid", requested_by: "u-1" },
          { id: "a3", status: "approved", app: "nope", operation: "x" },
          { status: "pending" },
        ],
      },
      "u-1",
    )
    expect(items.map((i) => i.id)).toEqual(["a1", "a2", "a3"])
    expect(items[0].appLabel).toBe("MStore")
    expect(items.map(canDecide)).toEqual([true, false, false])
  })
})
