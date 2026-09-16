"use client"

import { useState } from "react"
import { Check, X } from "lucide-react"
import { PageHeader } from "@/components/blocks/PageHeader"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { buttonDanger, buttonPrimary } from "@/components/blocks/buttons"
import { useApprovals, useDecideApproval } from "@/hooks/useApprovals"
import { approvalDetails, canDecide, type ApprovalItem } from "@/lib/admin/approvals"
import { IdText } from "@/components/blocks/bits"
import { adminErrorMessage } from "@/lib/admin/mutation"

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—")

/**
 * Two-person approvals waiting for this admin. admin-service lists only the
 * requests the caller may decide and never their own; approving asks for a
 * reason and a fresh 2FA code, and then carries the action out.
 */
export default function ApprovalsPage() {
  const approvals = useApprovals()
  const approve = useDecideApproval("approve")
  const reject = useDecideApproval("reject")
  const [pending, setPending] = useState<{ item: ApprovalItem; decision: "approve" | "reject" } | null>(null)
  const busy = approve.isPending || reject.isPending

  const columns: DataColumn<ApprovalItem>[] = [
    { key: "app", header: "Application", value: (r) => r.appLabel, sortable: true, filterable: true },
    {
      key: "operation",
      header: "Request",
      value: (r) => r.summary,
      sortable: true,
      filterable: true,
      cell: (r) => (
        <div>
          <div className="font-semibold">{r.summary}</div>
          {r.reason ? <div className="text-xs text-mo-body">“{r.reason}”</div> : null}
        </div>
      ),
    },
    {
      key: "requested",
      header: "Requested",
      value: (r) => r.requestedAt,
      sortable: true,
      cell: (r) => (
        <div>
          <div>{when(r.requestedAt)}</div>
          <div className="text-xs text-mo-body">
            by {r.requestedBy ? <IdText id={r.requestedBy} /> : "unknown"}
          </div>
        </div>
      ),
    },
    { key: "expires", header: "Expires", value: (r) => r.expiresAt, sortable: true, cell: (r) => when(r.expiresAt) },
    {
      key: "actions",
      header: "Decision",
      value: () => null,
      align: "right",
      cell: (r) =>
        canDecide(r) ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={buttonPrimary}
              disabled={busy}
              onClick={() => setPending({ item: r, decision: "approve" })}
              aria-label={`Approve ${r.summary}`}
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Approve
            </button>
            <button
              type="button"
              className={buttonDanger}
              disabled={busy}
              onClick={() => setPending({ item: r, decision: "reject" })}
              aria-label={`Reject ${r.summary}`}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-mo-body">{r.requestedByMe ? "Raised by you" : r.status}</span>
        ),
    },
  ]

  const decide = (reason: string) => {
    if (!pending) return
    const mutation = pending.decision === "approve" ? approve : reject
    mutation.mutate({ id: pending.item.id, reason }, { onSettled: () => setPending(null) })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Console"
        title="Approvals"
        description="Money actions and permanent bans need a second admin. Requests you raised go to someone else."
      />
      <DataTable
        caption="Pending approvals"
        rows={approvals.items}
        columns={columns}
        rowId={(r) => r.id}
        loading={approvals.isLoading}
        error={approvals.isError ? adminErrorMessage(approvals.error, "Approvals could not be loaded.") : null}
        onRetry={() => void approvals.refetch()}
        emptyMessage="No approvals are waiting for you."
      />
      <ConfirmReasonDialog
        open={pending !== null}
        title={pending?.decision === "approve" ? "Approve this request?" : "Reject this request?"}
        description={
          pending ? (
            <>
              <dl className="my-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 rounded-mo-sm border border-mo bg-mo-sunken p-3 text-xs" aria-label="What you are deciding">
                {approvalDetails(pending.item).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-mo-body">{label}</dt>
                    <dd className="break-all text-mo-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {pending.decision === "approve"
                ? "Approving carries the action out now and needs a fresh 2FA code."
                : "The requester will see your reason."}
            </>
          ) : null
        }
        confirmLabel={pending?.decision === "approve" ? "Approve" : "Reject"}
        destructive={pending?.decision === "reject"}
        requireReason
        busy={busy}
        onConfirm={decide}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
