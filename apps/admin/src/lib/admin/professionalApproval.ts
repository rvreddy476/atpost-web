import { isRecord, type Row } from "./data"
import { approvalBlockers, readReadiness, stepLabel, type DoorstepWrite } from "./doorstep"

/** The linked document must be approved; unrelated approved uploads never qualify. */
export function professionalApproval(detail: Row | null) {
  const professional = detail && isRecord(detail.professional) ? detail.professional : null
  const confirmIdentity = Boolean(professional && isRecord(professional.application)
    && detail?.identity_document_approved === true
    && readReadiness(detail).missing.includes("identity_review"))
  return {
    confirmIdentity,
    blockers: approvalBlockers(detail).filter(label => !confirmIdentity || label !== stepLabel("identity_review")),
  }
}

type Outcome = { kind: "done" | "approval" | "cancelled" }
type Execute = (write: DoorstepWrite, body: Record<string, unknown>) => Promise<Outcome>

/** One explicit confirmation, two audited operations. Never continue after cancellation or a queued review. */
export async function approveProfessional(execute: Execute, identity: { gender: string } | null, reason: string) {
  if (identity) {
    const result = await execute("pro.identity_review", {
      gender: identity.gender,
      reason: reason || "Identity evidence reviewed during partner approval.",
    })
    if (result.kind !== "done") return result
  }
  return execute("pro.approve", reason ? { reason } : {})
}
