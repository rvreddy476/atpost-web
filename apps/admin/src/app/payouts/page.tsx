"use client"

import { ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/blocks/PageHeader"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { buttonPrimary } from "@/components/blocks/buttons"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { usePendingPayouts, type PendingPayout } from "@/hooks/useAdminCommerce"
import { adminErrorMessage, isStepUpRequired } from "@/lib/admin/mutation"
import { formatPaise, rupeesToPaise } from "@/lib/admin/money"
import { findNavGroup } from "@/lib/admin/me"

const money = (rupees: number | undefined) => <span className="font-mo-mono">{formatPaise(rupeesToPaise(rupees))}</span>

const columns: DataColumn<PendingPayout>[] = [
  { key: "seller", header: "Seller", value: (p) => p.store_name ?? p.seller_id, sortable: true, filterable: true },
  { key: "count", header: "Remittances", value: (p) => p.remittance_count ?? null, sortable: true, align: "right" },
  { key: "gross", header: "Gross", value: (p) => rupeesToPaise(p.total_gross), sortable: true, align: "right", cell: (p) => money(p.total_gross) },
  { key: "fees", header: "Commission + fees", value: (p) => rupeesToPaise((p.total_commission ?? 0) + (p.total_platform_fee ?? 0)), align: "right", cell: (p) => money((p.total_commission ?? 0) + (p.total_platform_fee ?? 0)) },
  { key: "tds", header: "TDS", value: (p) => rupeesToPaise(p.total_tds), align: "right", cell: (p) => money(p.total_tds) },
  { key: "net", header: "Net payout", value: (p) => rupeesToPaise(p.total_net), sortable: true, align: "right", cell: (p) => money(p.total_net) },
  { key: "oldest", header: "Oldest delivery", value: (p) => p.oldest_delivered ?? null, sortable: true, cell: (p) => (p.oldest_delivered ? new Date(p.oldest_delivered).toLocaleDateString() : "—") },
]

/**
 * Pending payouts, by seller. Even READING them needs a step-up, so a
 * STEP_UP_REQUIRED answer is not an error here: it is a prompt to confirm with
 * 2FA, after which the list is fetched once more.
 */
export default function PayoutsPage() {
  const { nav } = useAdmin()
  const allowed = findNavGroup(nav, "commerce")?.links.some((l) => l.id === "payouts") ?? false
  const payouts = usePendingPayouts({ enabled: allowed })
  const stepUp = useStepUp()
  const needsStepUp = payouts.isError && isStepUpRequired(payouts.error)

  if (!allowed) return <NoAccessToApp />

  return (
    <div>
      <PageHeader eyebrow="MStore" title="Pending payouts" description="Payout details are money data: viewing them needs a fresh 2FA code. Email addresses are not shown." />
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
          rowId={(p) => p.seller_id}
          loading={payouts.isLoading}
          error={payouts.isError ? adminErrorMessage(payouts.error, "Payouts could not be loaded.") : null}
          onRetry={() => void payouts.refetch()}
          emptyMessage="No pending payouts."
        />
      )}
    </div>
  )
}
