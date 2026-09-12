'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, History, Package } from 'lucide-react'
import { useOrders } from '@/hooks/useCommerce'
import { StoreHeader } from '@/components/StoreHeader'
import { StoreFooter } from '@/components/StoreFooter'

/**
 * Status colour. Each state gets a tint of its own hue so the pill reads at a
 * glance without turning into a solid block that competes with the one gold
 * action on the row.
 *
 * Every value is now a token. `text-sky-300` and `text-orange-300` used to sit
 * in this map — two colours from Tailwind's stock palette that belong to no
 * theme, so they would have survived the re-skin unchanged and been the only
 * two hues on the page that nobody had measured. They map onto what they
 * always meant: an order in motion is the interactive colour, and a return
 * waiting on someone is a pending state.
 *
 * `confirmed` keeps gold because confirmation is the moment the money is
 * taken. `packed` does not: a parcel being wrapped is progress, not payment.
 */
const statusColor: Record<string, string> = {
  payment_pending: 'text-shop-warn',
  confirmed: 'text-shop-gold',
  packed: 'text-shop-interactive',
  shipped: 'text-shop-interactive',
  delivered: 'text-shop-good',
  cancelled: 'text-shop-bad',
  return_requested: 'text-shop-warn',
}

/** The states "purchase history" means: the order is over, one way or the other. */
const HISTORY_STATES = new Set(['delivered', 'cancelled', 'returned', 'refunded'])

/**
 * One list, two names. `?history=true` is the profile menu's "Purchase
 * history": the same orders, narrowed to the ones that are finished, under
 * the heading the phone uses. Reading the flag from the URL is the only
 * reason this is split from the page below and wrapped in Suspense.
 */
function OrdersContent() {
  const params = useSearchParams()
  const history = params.get('history') === 'true'
  const { data: orders, isLoading } = useOrders()
  const shown = history ? (orders ?? []).filter((o) => HISTORY_STATES.has(o.status)) : orders ?? []

  if (isLoading) return <><StoreHeader /><div className="cart-state"><span className="cart-loader" />Loading your orders…</div></>

  return (
    <div className="flex min-h-screen flex-col">
      <StoreHeader />
      <main className="shop-page-narrow flex-1">
        <span className="shop-eyebrow">Your account</span>
        <h1 className="shop-display mt-3 text-3xl sm:text-[40px]">{history ? 'Purchase history' : 'Your orders'}</h1>
        {history ? (
          <p className="mt-2 text-sm text-shop-muted">
            Orders that have been delivered, cancelled or returned. <Link href="/orders" className="shop-link">All orders</Link>
          </p>
        ) : null}

        {shown.length === 0 ? (
          <div className="panel panel-pad mt-8 flex flex-col items-center py-16 text-center">
            <div className="empty-vbag-mark">{history ? <History size={30} aria-hidden="true" /> : <Package size={30} aria-hidden="true" />}</div>
            <p className="text-shop-muted">
              {history ? 'Nothing finished yet. Delivered orders will appear here.' : 'Nothing ordered yet. Your purchases will appear here.'}
            </p>
            <Link href="/" className="btn btn-gold mt-7">Start shopping <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {shown.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="panel flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:border-shop-interactive"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-shop-faint">
                    Order {o.order_number}
                  </div>
                  <div className="mt-1.5 truncate font-semibold">
                    {o.first_product_title ?? 'Order'}
                    {o.item_count > 1 ? <span className="text-shop-muted"> +{o.item_count - 1} more</span> : null}
                  </div>
                  <div className="mt-1.5 text-sm text-shop-muted">
                    {new Date(o.created_at).toLocaleDateString()}
                    <span className="mx-2 text-shop-faint" aria-hidden="true">·</span>
                    <span className="font-semibold text-shop-gold">{o.currency} {o.final_amount.toFixed(2)}</span>
                  </div>
                </div>
                <span className={`status-pill ${statusColor[o.status] ?? 'text-shop-muted'}`}>
                  {o.status.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<><StoreHeader /><div className="cart-state"><span className="cart-loader" />Loading your orders…</div></>}>
      <OrdersContent />
    </Suspense>
  )
}
