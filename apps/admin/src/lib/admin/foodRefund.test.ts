import { describe, expect, it } from "vitest"
import { foodRefundExecution } from "./foodRefund"

describe("Food refund execution", () => {
  it("does not label approval as completed", () => {
    expect(foodRefundExecution({ status: "approved", execution_refund_id: "r", execution_status: "SUBMITTED" }).label).toBe("Processing")
    expect(foodRefundExecution({ status: "processed", refund_txn_id: "provider-r" }).detail).toBe("provider-r")
  })
  it("requires explicit review of legacy approvals, but never duplicate commands for provider failures", () => {
    expect(foodRefundExecution({ status: "approved" }).retryApproval).toBe(true)
    const failed = foodRefundExecution({ status: "approved", execution_refund_id: "r", execution_error: "provider_failure_requires_finance_review" })
    expect(failed.retryApproval).toBe(false)
    expect(failed.label).toContain("needs review")
    expect(foodRefundExecution({ status: "approved", execution_refund_id: "r", execution_error: "submission_failed_retry_pending" }).label).toBe("Retry pending")
    expect(foodRefundExecution({ status: "rejected" }).retryApproval).toBe(false)
  })
})
