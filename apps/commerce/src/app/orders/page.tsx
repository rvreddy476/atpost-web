'use client'

import Link from 'next/link'
import { useOrders } from '@/hooks/useCommerce'

const statusColor: Record<string, string> = {
  payment_pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  packed: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  return_requested: 'bg-orange-100 text-orange-800',
}

export default function OrdersPage() {
  const { data: orders, isLoading } = useOrders()

  if (isLoading) return <div className="p-8">Loading orders…</div>
  if (!orders || orders.length === 0)
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <h1 className="text-2xl font-semibold mb-4">No orders yet</h1>
        <Link href="/commerce" className="text-indigo-600 hover:underline">
          Start shopping
        </Link>
      </div>
    )

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold mb-6">Your Orders</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-300"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Order {o.order_number}</div>
                <div className="text-sm text-gray-500">
                  {new Date(o.created_at).toLocaleDateString()} · {o.currency} {o.final_amount.toFixed(2)}
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  statusColor[o.status] ?? 'bg-gray-100 text-gray-700'
                }`}
              >
                {o.status.replace(/_/g, ' ')}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
