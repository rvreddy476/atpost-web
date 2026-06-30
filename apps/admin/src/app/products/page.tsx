"use client"

import { useProductQueue, useApproveProduct, useRejectProduct } from "@/hooks/useAdminCommerce"

export default function ProductsQueuePage() {
  const { data: products, isLoading } = useProductQueue()
  const approve = useApproveProduct()
  const reject = useRejectProduct()
  const busy = approve.isPending || reject.isPending

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Product queue</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !products || products.length === 0 ? (
        <p className="text-gray-500">No products awaiting review.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Approval</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3 text-gray-600">{p.approval_status}</td>
                  <td className="px-4 py-3">
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
