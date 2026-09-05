"use client"

import { Table, TBody, TD, TH, THead, TR } from "@atpost/ui"
import { useSellerQueue, useApproveSeller, useRejectSeller, useVerifySellerKYC } from "@/hooks/useAdminCommerce"

export default function SellersQueuePage() {
  const { data: sellers, isLoading } = useSellerQueue()
  const approve = useApproveSeller()
  const reject = useRejectSeller()
  const verifyKyc = useVerifySellerKYC()
  const busy = approve.isPending || reject.isPending || verifyKyc.isPending

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Seller queue</h1>
      <Table
        loading={isLoading}
        empty={!sellers || sellers.length === 0}
        emptyMessage="No sellers awaiting review."
      >
        <THead>
          <TR>
            <TH>Store</TH>
            <TH>Email</TH>
            <TH>Type</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {sellers?.map((s) => (
            <TR key={s.id}>
              <TD className="font-medium">{s.store_name}</TD>
              <TD className="text-gray-600">{s.email}</TD>
              <TD className="text-gray-600">{s.seller_type}</TD>
              <TD className="text-gray-600">{s.status}</TD>
              <TD>
                <div className="flex justify-end gap-2">
                  <button
                    disabled={busy}
                    onClick={() => verifyKyc.mutate({ id: s.id })}
                    className="rounded-lg border border-gray-300 px-3 py-1 hover:border-gray-400 disabled:opacity-50"
                  >
                    Verify KYC
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => approve.mutate({ id: s.id })}
                    className="rounded-lg bg-gray-900 px-3 py-1 text-white hover:bg-black disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => reject.mutate({ id: s.id, body: { reason: "rejected by admin" } })}
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
