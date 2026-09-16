"use client"

import { useState } from "react"
import type { Product } from "@atpost/types/commerce"
import { PageHeader } from "@/components/blocks/PageHeader"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { buttonDanger, buttonPrimary } from "@/components/blocks/buttons"
import { useProductQueue, useApproveProduct, useRejectProduct } from "@/hooks/useAdminCommerce"
import { adminErrorMessage } from "@/lib/admin/mutation"

export default function ProductsQueuePage() {
  const products = useProductQueue()
  const approve = useApproveProduct()
  const reject = useRejectProduct()
  const [rejecting, setRejecting] = useState<Product | null>(null)
  const busy = approve.isPending || reject.isPending

  const columns: DataColumn<Product>[] = [
    { key: "title", header: "Title", value: (p) => p.title, sortable: true, filterable: true, cell: (p) => <span className="font-semibold">{p.title}</span> },
    { key: "approval", header: "Approval", value: (p) => p.approval_status, sortable: true },
    {
      key: "actions",
      header: "Actions",
      value: () => null,
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} className={buttonPrimary} onClick={() => approve.mutate({ id: p.id })}>
            Approve
          </button>
          <button type="button" disabled={busy} className={buttonDanger} onClick={() => setRejecting(p)}>
            Reject
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader eyebrow="MStore" title="Product queue" />
      <DataTable
        caption="Products awaiting review"
        rows={products.data}
        columns={columns}
        rowId={(p) => p.id}
        loading={products.isLoading}
        error={products.isError ? adminErrorMessage(products.error, "The queue could not be loaded.") : null}
        onRetry={() => void products.refetch()}
        emptyMessage="No products awaiting review."
      />
      <ConfirmReasonDialog
        open={rejecting !== null}
        title="Reject this product?"
        description={rejecting ? <>The seller of “{rejecting.title}” will see your reason.</> : null}
        confirmLabel="Reject product"
        destructive
        busy={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && reject.mutate({ id: rejecting.id, reason }, { onSettled: () => setRejecting(null) })}
      />
    </div>
  )
}
