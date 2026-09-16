"use client"

import { useState } from "react"
import type { Seller } from "@atpost/types/commerce"
import { PageHeader } from "@/components/blocks/PageHeader"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useSellerQueue, useApproveSeller, useRejectSeller, useSuspendSeller, useVerifySellerKYC } from "@/hooks/useAdminCommerce"
import { hasPermission } from "@/lib/admin/me"
import { adminErrorMessage } from "@/lib/admin/mutation"

type Pending = { seller: Seller; action: "reject" | "suspend" }

export default function SellersQueuePage() {
  const { me } = useAdmin()
  const sellers = useSellerQueue()
  const approve = useApproveSeller()
  const reject = useRejectSeller()
  const suspend = useSuspendSeller()
  const verifyKyc = useVerifySellerKYC()
  const [pending, setPending] = useState<Pending | null>(null)
  const busy = approve.isPending || reject.isPending || suspend.isPending || verifyKyc.isPending

  // Buttons follow permissions so nobody is offered an action the server refuses.
  const canApprove = hasPermission(me, "commerce", "seller.approve")
  const canSuspend = hasPermission(me, "commerce", "seller.suspend")
  const canVerifyKyc = hasPermission(me, "commerce", "kyc.verify")

  const columns: DataColumn<Seller>[] = [
    { key: "store", header: "Store", value: (s) => s.store_name, sortable: true, filterable: true, cell: (s) => <span className="font-semibold">{s.store_name}</span> },
    { key: "email", header: "Email", value: (s) => s.email, sortable: true, filterable: true },
    { key: "type", header: "Type", value: (s) => s.seller_type, sortable: true },
    { key: "status", header: "Status", value: (s) => s.status, sortable: true },
    {
      key: "actions",
      header: "Actions",
      value: () => null,
      align: "right",
      cell: (s) => (
        <div className="flex flex-wrap justify-end gap-2">
          {canVerifyKyc ? (
            <button type="button" disabled={busy} className={buttonSecondary} onClick={() => verifyKyc.mutate({ id: s.id })}>
              Verify KYC
            </button>
          ) : null}
          {canApprove ? (
            <>
              <button type="button" disabled={busy} className={buttonPrimary} onClick={() => approve.mutate({ id: s.id })}>
                Approve
              </button>
              <button type="button" disabled={busy} className={buttonDanger} onClick={() => setPending({ seller: s, action: "reject" })}>
                Reject
              </button>
            </>
          ) : null}
          {canSuspend ? (
            <button type="button" disabled={busy} className={buttonDanger} onClick={() => setPending({ seller: s, action: "suspend" })}>
              Suspend
            </button>
          ) : null}
        </div>
      ),
    },
  ]

  const confirm = (reason: string) => {
    if (!pending) return
    const mutation = pending.action === "reject" ? reject : suspend
    mutation.mutate({ id: pending.seller.id, reason }, { onSettled: () => setPending(null) })
  }

  return (
    <div>
      <PageHeader eyebrow="MStore" title="Seller queue" description="Verifying KYC asks for a fresh 2FA code." />
      <DataTable
        caption="Sellers awaiting review"
        rows={sellers.data}
        columns={columns}
        rowId={(s) => s.id}
        loading={sellers.isLoading}
        error={sellers.isError ? adminErrorMessage(sellers.error, "The queue could not be loaded.") : null}
        onRetry={() => void sellers.refetch()}
        emptyMessage="No sellers awaiting review."
      />
      <ConfirmReasonDialog
        open={pending !== null}
        title={pending?.action === "suspend" ? "Suspend this seller?" : "Reject this seller?"}
        description={pending ? <>“{pending.seller.store_name}” will see your reason.</> : null}
        confirmLabel={pending?.action === "suspend" ? "Suspend seller" : "Reject seller"}
        destructive
        busy={reject.isPending || suspend.isPending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
      />
    </div>
  )
}
