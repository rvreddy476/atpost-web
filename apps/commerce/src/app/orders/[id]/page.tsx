'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useOrder, useOrderWithItems, useShipment, useInvoice, useCancelOrder, useCreateReview, useCreateReturn, useCreatePaymentIntent, useConfirmPayment } from '@/hooks/useCommerce'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'
import { completeOrderPayment } from '@/lib/orderPayment'

// Maps payment_status (server-side, from payments-service) to a label + a
// colour. On navy each state is carried by its text hue alone — `.status-pill`
// borrows the text colour for its border — so a status never turns into a
// solid block competing with the gold primary action. P6/P7 introduced
// 'partially_refunded'; it stays a distinct amber state, not a full refund.
function paymentStatusUI(status: string): { label: string; cls: string; caption?: string } {
  switch (status) {
    case 'succeeded':
      return { label: 'Paid', cls: 'text-shop-good' }
    case 'partially_refunded':
      return {
        label: 'Partially refunded',
        cls: 'text-shop-warn',
        caption: 'A partial refund has been issued for this order.',
      }
    case 'refunded':
      return {
        label: 'Refunded',
        cls: 'text-shop-muted',
        caption: 'The full order has been refunded.',
      }
    case 'failed':
      return { label: 'Failed', cls: 'text-shop-bad' }
    case 'pending':
    case 'payment_pending':
      return { label: 'Pending', cls: 'text-shop-warn' }
    case 'disputed':
      return { label: 'Disputed', cls: 'text-orange-300' }
    default:
      return { label: status.replace(/_/g, ' '), cls: 'text-shop-muted' }
  }
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)
  const { data: orderItemsData } = useOrderWithItems(id)
  const { data: shipmentData } = useShipment(id)
  const { data: invoiceData } = useInvoice(id)
  const cancel = useCancelOrder()
  const createReview = useCreateReview()
  const createReturn = useCreateReturn()
  const createIntent = useCreatePaymentIntent()
  const confirmPayment = useConfirmPayment()
  const [retryingPayment, setRetryingPayment] = useState(false)
  const [reviewItemId, setReviewItemId] = useState<string | null>(null)
  const [returnItemId, setReturnItemId] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')
  const [returnReason, setReturnReason] = useState('damaged')
  const [returnDescription, setReturnDescription] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  if (isLoading) return <><StoreHeader /><div className="cart-state"><span className="cart-loader" />Loading order…</div></>
  if (!order) return <><StoreHeader /><div className="cart-state cart-state-error">Order not found</div></>

  const cancellable = ['payment_pending', 'confirmed', 'packed'].includes(order.status)
  const payUI = paymentStatusUI(order.payment_status)

  return (
    <div className="flex min-h-screen flex-col"><StoreHeader /><main className="shop-page-narrow flex-1 space-y-6">
      <div>
        <Link href="/orders" className="quiet-link">← All orders</Link>
        <h1 className="shop-display mt-3 text-3xl sm:text-[38px]">Order {order.order_number}</h1>
        <div className="mt-2 text-sm text-shop-muted">
          Placed {new Date(order.created_at).toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel p-5">
          <div className="text-xs uppercase text-shop-faint">Status</div>
          <div className="text-lg font-semibold">{order.status.replace(/_/g, ' ')}</div>
        </div>
        <div className="panel p-5">
          <div className="text-xs uppercase text-shop-faint">Payment</div>
          <div className="mt-1">
            <span className={`status-pill ${payUI.cls}`}>
              {payUI.label}
            </span>
          </div>
          <div className="text-sm text-shop-faint mt-1">{order.payment_method ?? '-'}</div>
          {payUI.caption ? (
            <div className="text-xs text-shop-faint mt-2">{payUI.caption}</div>
          ) : null}
        </div>
        <div className="panel p-5">
          <div className="text-xs uppercase text-shop-faint">Total</div>
          <div className="text-lg font-semibold">
            {order.currency_code} {order.final_amount.toFixed(2)}
          </div>
        </div>
      </div>

      {orderItemsData?.items?.length ? (
        <section className="panel panel-pad">
          <h2 className="panel-heading">Items</h2>
          <div className="divide-y divide-white/10">
            {orderItemsData.items.map((item) => {
              const delivered = item.status === 'delivered' || order.status === 'delivered'
              const returnEligible = delivered && (!item.return_eligible_until || new Date(item.return_eligible_until) >= new Date())
              return (
                <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div><p className="font-medium">{item.product_title}</p><p className="text-sm text-shop-faint">{item.sku} · Qty {item.quantity}</p></div>
                    <div className="sm:text-right"><p className="font-semibold">{order.currency_code} {item.final_price.toFixed(2)}</p><p className="text-xs text-shop-faint">{item.status.replace(/_/g, ' ')}</p></div>
                  </div>
                  {delivered ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => { setReviewItemId(reviewItemId === item.id ? null : item.id); setReturnItemId(null); setActionMessage(null) }} className="btn btn-outline btn-sm">Write a review</button>
                      {returnEligible ? <button onClick={() => { setReturnItemId(returnItemId === item.id ? null : item.id); setReviewItemId(null); setActionMessage(null) }} className="btn btn-outline btn-sm">Return item</button> : null}
                    </div>
                  ) : null}
                  {reviewItemId === item.id ? (
                    <form className="panel-quiet mt-4 space-y-3 p-4" onSubmit={async (event) => {
                      event.preventDefault()
                      await createReview.mutateAsync({ product_id: item.product_id, seller_id: item.seller_id, order_item_id: item.id, rating, body: reviewBody.trim() || undefined })
                      setReviewItemId(null); setReviewBody(''); setActionMessage('Your verified-purchase review was submitted.')
                    }}>
                      <label className="block text-sm font-medium">Rating<select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="field ml-3 inline-flex w-auto">{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select></label>
                      <textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} placeholder="What should other customers know?" maxLength={2000} className="field" />
                      <button disabled={createReview.isPending} className="btn btn-gold btn-sm">{createReview.isPending ? 'Submitting…' : 'Submit review'}</button>
                    </form>
                  ) : null}
                  {returnItemId === item.id ? (
                    <form className="panel-quiet mt-4 space-y-3 p-4" onSubmit={async (event) => {
                      event.preventDefault()
                      await createReturn.mutateAsync({ order_id: order.id, order_item_id: item.id, seller_id: item.seller_id, reason_code: returnReason, reason_description: returnDescription.trim() || undefined })
                      setReturnItemId(null); setReturnDescription(''); setActionMessage('Your return request was submitted.')
                    }}>
                      <label className="block text-sm font-medium">Reason<select value={returnReason} onChange={(event) => setReturnReason(event.target.value)} className="field ml-3 inline-flex w-auto"><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="not_as_described">Not as described</option><option value="quality_issue">Quality issue</option><option value="changed_mind">Changed my mind</option></select></label>
                      <textarea value={returnDescription} onChange={(event) => setReturnDescription(event.target.value)} placeholder="Describe the issue" maxLength={1000} className="field" />
                      <button disabled={createReturn.isPending} className="btn btn-outline btn-sm">{createReturn.isPending ? 'Submitting…' : 'Request return'}</button>
                    </form>
                  ) : null}
                </div>
              )
            })}
          </div>
          {actionMessage ? <p role="status" className="mt-4 text-sm font-medium text-shop-good">{actionMessage}</p> : null}
          {(createReview.error || createReturn.error) ? <p role="alert" className="mt-3 text-sm text-shop-bad">The request could not be submitted. Check the details and try again.</p> : null}
        </section>
      ) : null}

      {shipmentData?.shipment ? (
        <section className="panel panel-pad">
          <h2 className="panel-heading">Shipment</h2>
          <div className="text-sm text-shop-muted">
            Courier: <span className="font-medium">{shipmentData.shipment.courier}</span>
            {shipmentData.shipment.tracking_number ? (
              <> · AWB: <span className="font-medium">{shipmentData.shipment.tracking_number}</span></>
            ) : null}
          </div>
          {shipmentData.shipment.tracking_url ? (
            <a href={shipmentData.shipment.tracking_url} target="_blank" rel="noreferrer"
              className="gold-link mt-2">
              Track shipment →
            </a>
          ) : null}

          {shipmentData.events && shipmentData.events.length > 0 ? (
            <ol className="mt-4 space-y-2">
              {shipmentData.events.map((e) => (
                <li key={e.id} className="border-l-2 border-shop-gold/50 pl-4 text-sm">
                  <div className="font-medium">{e.status.replace(/_/g, ' ')}</div>
                  {e.location ? <div className="text-shop-faint">{e.location}</div> : null}
                  {e.remark ? <div className="text-shop-faint">{e.remark}</div> : null}
                  <div className="text-xs text-shop-faint">
                    {new Date(e.occurred_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {invoiceData?.invoice ? (
        <section className="panel panel-pad">
          <h2 className="panel-heading">Invoice</h2>
          <div className="text-sm text-shop-muted">
            Invoice {invoiceData.invoice.invoice_number}
          </div>
          {invoiceData.download_url ? (
            <a href={invoiceData.download_url} target="_blank" rel="noreferrer"
              className="btn btn-gold btn-sm mt-3">
              Download invoice
            </a>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {order.status === 'payment_pending' && order.payment_method === 'prepaid' ? (
          <button
            disabled={retryingPayment}
            onClick={async () => {
              setActionMessage(null); setRetryingPayment(true)
              try { await completeOrderPayment(order, createIntent.mutateAsync, confirmPayment.mutateAsync); setActionMessage('Payment confirmed. Your order is being prepared.') }
              catch (error) { setActionMessage(error instanceof Error && error.message === 'payment_cancelled' ? 'Payment was cancelled. Your order is reserved and you can retry.' : 'Payment could not be completed. Please retry.') }
              finally { setRetryingPayment(false) }
            }}
            className="btn btn-gold"
          >{retryingPayment ? 'Opening payment…' : 'Retry payment'}</button>
        ) : null}
        {cancellable ? (
          <button
            onClick={() => {
              if (confirm('Cancel this order?')) cancel.mutate({ orderId: order.id })
            }}
            className="btn btn-danger"
          >
            Cancel Order
          </button>
        ) : null}
      </div>
      {actionMessage ? <p role="status" className="text-sm font-medium text-shop-good">{actionMessage}</p> : null}
    </main><StoreFooter /></div>
  )
}
