import { str, type Row } from "./data"

/** Approval is permission to refund, never confirmation of a bank movement. */
export function foodRefundExecution(row: Row): { label: string; detail: string; retryApproval: boolean } {
  if (str(row.status) === "processed") return { label: "Processed", detail: str(row.refund_txn_id) || "Confirmed by payment service", retryApproval: false }
  if (str(row.status) !== "approved") return { label: "Not submitted", detail: "", retryApproval: false }
  if (!str(row.execution_refund_id)) return { label: "Needs execution review", detail: "Legacy approval has no linked payment command. Review and explicitly approve execution.", retryApproval: true }
  if (str(row.execution_error) === "provider_failure_requires_finance_review") return { label: "Payment provider needs review", detail: "Review this command in Payments. Do not create a second refund.", retryApproval: false }
  if (str(row.execution_error)) return { label: "Retry pending", detail: "The saved payment command will retry automatically. No duplicate refund is needed.", retryApproval: false }
  return { label: str(row.execution_status) === "SUBMITTED" ? "Processing" : "Queued", detail: "Waiting for payment-service confirmation", retryApproval: false }
}
