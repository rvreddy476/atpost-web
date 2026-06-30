"use client"

import { usePendingPayouts } from "@/hooks/useAdminCommerce"

export default function PayoutsPage() {
  const { data: payouts, isLoading } = usePendingPayouts()

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Pending payouts</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !payouts || payouts.length === 0 ? (
        <p className="text-gray-500">No pending payouts.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Seller</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-600">{p.seller_id}</td>
                  <td className="px-4 py-3 font-medium">
                    {(p.currency_code ?? "INR")} {(p.amount_minor / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
