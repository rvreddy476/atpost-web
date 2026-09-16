"use client"

import { ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/blocks/PageHeader"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { buttonPrimary } from "@/components/blocks/buttons"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { usePendingPayouts, type PendingPayout } from "@/hooks/useAdminCommerce"
import { adminErrorMessage, isStepUpRequired } from "@/lib/admin/mutation"

const columns: DataColumn<PendingPayout>[] = [
  { key: "seller", header: "Seller", value: (p) => p.seller_id, filterable: true },
  {
    key: "amount",
    header: "Amount",
    value: (p) => p.amount_minor,
    sortable: true,
    align: "right",
    cell: (p) => (
      <span className="font-mo-mono">
        {p.currency_code ?? "INR"} {(p.amount_minor / 100).toFixed(2)}
      </span>
    ),
  },
  { key: "status", header: "Status", value: (p) => p.status, sortable: true },
]

/**
 * Pending payouts. Even READING them needs a step-up, so a STEP_UP_REQUIRED
 * answer is not an error here: it is a prompt to confirm with 2FA, after which
 * the list is fetched once more.
 */
export default function PayoutsPage() {
  const payouts = usePendingPayouts()
  const stepUp = useStepUp()
  const needsStepUp = payouts.isError && isStepUpRequired(payouts.error)

  return (
    <div>
      <PageHeader eyebrow="MStore" title="Pending payouts" description="Payout details are money data: viewing them needs a fresh 2FA code." />
      {needsStepUp ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-6 text-center">
          <p className="mb-3 text-sm text-mo-body">Confirm with your authenticator to view pending payouts.</p>
          <button
            type="button"
            className={buttonPrimary}
            onClick={async () => {
              if (await stepUp()) void payouts.refetch()
            }}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Confirm with 2FA
          </button>
        </div>
      ) : (
        <DataTable
          caption="Pending payouts"
          rows={payouts.data}
          columns={columns}
          rowId={(p) => p.id}
          loading={payouts.isLoading}
          error={payouts.isError ? adminErrorMessage(payouts.error, "Payouts could not be loaded.") : null}
          onRetry={() => void payouts.refetch()}
          emptyMessage="No pending payouts."
        />
      )}
    </div>
  )
}
