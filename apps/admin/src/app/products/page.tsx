"use client"

import { Table, TBody, TD, TH, THead, TR } from "@atpost/ui"
import { useProductQueue, useApproveProduct, useRejectProduct } from "@/hooks/useAdminCommerce"

export default function ProductsQueuePage() {
  const { data: products, isLoading } = useProductQueue()
  const approve = useApproveProduct()
  const reject = useRejectProduct()
  const busy = approve.isPending || reject.isPending

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Product queue</h1>
      <Table
        loading={isLoading}
        empty={!products || products.length === 0}
        emptyMessage="No products awaiting review."
      >
        <THead>
          <TR>
            <TH>Title</TH>
            <TH>Approval</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {products?.map((p) => (
            <TR key={p.id}>
              <TD className="font-medium">{p.title}</TD>
              <TD className="text-gray-600">{p.approval_status}</TD>
              <TD>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={busy}
                    onClick={() => approve.mutate({ id: p.id, body: { notes: "approved by admin" } })}
                    className="rounded-lg bg-gray-900 px-3 py-1 text-white hover:bg-black disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => reject.mutate({ id: p.id, body: { reason: "rejected by admin" } })}
                    className="rounded-lg border border-red-300 px-3 py-1 text-red-600 hover:border-red-400 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
