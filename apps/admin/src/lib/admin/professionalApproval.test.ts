import { describe, expect, it, vi } from "vitest"
import { approveProfessional, professionalApproval } from "./professionalApproval"

const application = (missing: unknown = ["identity_review"], approved = true) => ({
  professional: { application: { first_name: "Test" } },
  identity_document_approved: approved,
  readiness: { missing_steps: missing },
})

describe("professional approval", () => {
  it("combines the remaining identity confirmation with approval", () => {
    expect(professionalApproval(application())).toEqual({ confirmIdentity: true, blockers: [] })
  })
  it("does not mistake unrelated approved uploads for the linked identity", () => {
    expect(professionalApproval({ ...application(undefined, false), documents: [{ kind: "passport", status: "approved" }] })).toEqual({ confirmIdentity: false, blockers: ["Manual identity review"] })
  })
  it("keeps selfie, skills and bank checks, and does not exempt PAN", () => {
    expect(professionalApproval(application(["identity_review", "selfie_face_match", "skills", "pan", "bank"])).blockers).toEqual(["Selfie face match", "Skills", "PAN number", "Bank account"])
  })
  it("fails closed for unreadable readiness and older servers without the linked identity flag", () => {
    for (const detail of [null, {}, application(null), application([null])]) expect(professionalApproval(detail).blockers.length).toBeGreaterThan(0)
    const { identity_document_approved: _, ...old } = application()
    expect(professionalApproval(old).confirmIdentity).toBe(false)
  })
  it("does not repeat completed identity reviews", () => {
    expect(professionalApproval(application([]))).toEqual({ confirmIdentity: false, blockers: [] })
  })
  it("records the identity decision before approving", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "done" })
    await approveProfessional(execute, { gender: "unknown" }, "")
    expect(execute.mock.calls.map(call => call[0])).toEqual(["pro.identity_review", "pro.approve"])
    expect(execute.mock.calls[0][1]).toEqual({ gender: "unknown", reason: "Identity evidence reviewed during partner approval." })
  })
  it.each(["cancelled", "approval"])("never approves when identity review is %s", async kind => {
    const execute = vi.fn().mockResolvedValue({ kind })
    expect(await approveProfessional(execute, { gender: "female" }, "Checked evidence")).toEqual({ kind })
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it("never proceeds after a failed identity review", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("Review failed"))
    await expect(approveProfessional(execute, { gender: "unknown" }, "")).rejects.toThrow("Review failed")
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it("directly approves previously reviewed identity without manufacturing another decision", async () => {
    const execute = vi.fn().mockResolvedValue({ kind: "done" })
    await approveProfessional(execute, null, "Reviewed application")
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith("pro.approve", { reason: "Reviewed application" })
  })
})
