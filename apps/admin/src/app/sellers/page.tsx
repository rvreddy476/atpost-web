"use client"

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
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !sellers || sellers.length === 0 ? (
        <p className="text-gray-500">No sellers awaiting review.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Store</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{s.store_name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email}</td>
                  <td className="px-4 py-3 text-gray-600">{s.seller_type}</td>
                  <td className="px-4 py-3 text-gray-600">{s.status}</td>
                  <td className="px-4 py-3">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
