'use client'

import { use } from 'react'
import Link from 'next/link'
import { useOrder, useShipment, useInvoice, useCancelOrder } from '@/hooks/useCommerce'

// Maps payment_status (server-side, from payments-service) to a label
// + tailwind classes. P6/P7 introduced 'partially_refunded' — surface
// it as a distinct amber state, not the same as a full refund.
function paymentStatusUI(status: string): { label: string; cls: string; caption?: string } {
  switch (status) {
    case 'succeeded':
      return { label: 'Paid', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    case 'partially_refunded':
      return {
        label: 'Partially refunded',
        cls: 'text-amber-800 bg-amber-50 border-amber-200',
        caption: 'A partial refund has been issued for this order.',
      }
    case 'refunded':
      return {
        label: 'Refunded',
        cls: 'text-gray-700 bg-gray-100 border-gray-200',
        caption: 'The full order has been refunded.',
      }
    case 'failed':
      return { label: 'Failed', cls: 'text-rose-700 bg-rose-50 border-rose-200' }
    case 'pending':
    case 'payment_pending':
      return { label: 'Pending', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    case 'disputed':
      return { label: 'Disputed', cls: 'text-orange-700 bg-orange-50 border-orange-200' }
    default:
      return { label: status.replace(/_/g, ' '), cls: 'text-gray-700 bg-gray-50 border-gray-200' }
  }
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)
  const { data: shipmentData } = useShipment(id)
  const { data: invoiceData } = useInvoice(id)
  const cancel = useCancelOrder()

  if (isLoading) return <div className="p-8">Loading order…</div>
  if (!order) return <div className="p-8 text-red-600">Order not found</div>

  const cancellable = ['payment_pending', 'confirmed', 'packed'].includes(order.status)
  const payUI = paymentStatusUI(order.payment_status)

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <Link href="/orders" className="text-sm text-gray-500 hover:text-indigo-600">
          ← All orders
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Order {order.order_number}</h1>
        <div className="text-sm text-gray-500">
          Placed {new Date(order.created_at).toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Status</div>
          <div className="text-lg font-semibold">{order.status.replace(/_/g, ' ')}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Payment</div>
          <div className="mt-1">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold ${payUI.cls}`}>
              {payUI.label}
            </span>
          </div>
          <div className="text-sm text-gray-500 mt-1">{order.payment_method ?? '-'}</div>
          {payUI.caption ? (
            <div className="text-xs text-gray-500 mt-2">{payUI.caption}</div>
          ) : null}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Total</div>
          <div className="text-lg font-semibold">
            {order.currency_code} {order.final_amount.toFixed(2)}
          </div>
        </div>
      </div>

      {shipmentData?.shipment ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-3">Shipment</h2>
          <div className="text-sm text-gray-700">
            Courier: <span className="font-medium">{shipmentData.shipment.courier}</span>
            {shipmentData.shipment.tracking_number ? (
              <> · AWB: <span className="font-medium">{shipmentData.shipment.tracking_number}</span></>
            ) : null}
          </div>
          {shipmentData.shipment.tracking_url ? (
            <a href={shipmentData.shipment.tracking_url} target="_blank" rel="noreferrer"
              className="text-indigo-600 hover:underline text-sm">
              Track shipment →
            </a>
          ) : null}

          {shipmentData.events && shipmentData.events.length > 0 ? (
            <ol className="mt-4 space-y-2">
              {shipmentData.events.map((e) => (
                <li key={e.id} className="border-l-2 border-indigo-400 pl-3 text-sm">
                  <div className="font-medium">{e.status.replace(/_/g, ' ')}</div>
                  {e.location ? <div className="text-gray-500">{e.location}</div> : null}
                  {e.remark ? <div className="text-gray-500">{e.remark}</div> : null}
                  <div className="text-xs text-gray-400">
                    {new Date(e.occurred_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {invoiceData?.invoice ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold mb-2">Invoice</h2>
          <div className="text-sm text-gray-700">
            Invoice {invoiceData.invoice.invoice_number}
          </div>
          {invoiceData.download_url ? (
            <a href={invoiceData.download_url} target="_blank" rel="noreferrer"
              className="inline-block mt-2 rounded bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">
              Download invoice
            </a>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {cancellable ? (
          <button
            onClick={() => {
              if (confirm('Cancel this order?')) cancel.mutate({ orderId: order.id })
            }}
            className="rounded border border-red-300 text-red-600 px-4 py-2 text-sm hover:bg-red-50"
          >
            Cancel Order
          </button>
        ) : null}
        {order.status === 'delivered' ? (
          <>
            <Link
              href={`/orders/${order.id}/review`}
              className="rounded border border-indigo-300 text-indigo-600 px-4 py-2 text-sm hover:bg-indigo-50"
            >
              Write a review
            </Link>
            <Link
              href={`/orders/${order.id}/return`}
              className="rounded border border-gray-300 text-gray-700 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Return an item
            </Link>
          </>
        ) : null}
      </div>
    </div>
  )
}
