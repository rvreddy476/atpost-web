"use client"

import { useState } from "react"
import Link from "next/link"
import { Package } from "lucide-react"
import { SellerShell } from "@/components/sell/SellerShell"
import { OrderStatusPill } from "@/components/sell/StatusPill"
import type { FulfillmentStage } from "@/hooks/useCommerce"
import { useSellerOrderPages, type SellerOrderCardWire } from "@/hooks/useSeller"
import { apiMessage } from "@/lib/listing"
import { inrMinor } from "@/lib/money"
import { FULFILLMENT_STAGES, decodeAddressSnapshot, sellerSubtotalMinor, shortId } from "@/lib/seller"

export default function SellerOrdersPage() {
  return (
    <SellerShell redirectTo="/shop/sell/orders">
      <OrdersList />
    </SellerShell>
  )
}

const EMPTY_COPY: Record<FulfillmentStage, string> = {
  all: "No orders yet. They will appear here the moment a buyer checks out with one of your products.",
  unshipped: "Nothing waiting to ship.",
  in_transit: "Nothing on the road right now.",
  delivered: "Nothing delivered yet.",
  cancelled: "No cancelled orders.",
}

function OrdersList() {
  const [stage, setStage] = useState<FulfillmentStage>("all")
  const q = useSellerOrderPages(stage)
  const orders = q.data?.pages.flatMap((p) => p.orders) ?? []

  return (
    <div>
      <span className="shop-eyebrow">MSeller</span>
      <h1 className="shop-display mt-2 text-3xl sm:text-[38px]">Orders</h1>

      {/* The chips are server-side stages, not a sieve over loaded pages; see
          FULFILLMENT_STAGES. Pressed state is the interactive colour: picking
          a filter is looking, not paying. */}
      <div role="group" aria-label="Filter orders" className="mt-6 flex flex-wrap gap-2">
        {FULFILLMENT_STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={stage === s.id}
            onClick={() => setStage(s.id)}
            className={`btn btn-outline btn-sm ${
              stage === s.id ? "border-shop-interactive bg-shop-interactive/10 text-shop-interactive" : ""
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="cart-state"><span className="cart-loader" />Loading orders…</div>
      ) : q.isError ? (
        <div className="notice notice-error mt-6" role="alert">
          <p>{apiMessage(q.error, "Could not load your orders.")}</p>
          <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => q.refetch()}>
            Try again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="panel panel-pad mt-6 flex flex-col items-center py-14 text-center">
          <div className="empty-vbag-mark"><Package size={30} aria-hidden="true" /></div>
          <p className="max-w-sm text-shop-muted">{EMPTY_COPY[stage]}</p>
        </div>
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {orders.map((card) => (
              <OrderRow key={card.order.id} card={card} />
            ))}
          </ul>
          <div className="mt-6 flex items-center gap-3">
            {q.hasNextPage ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={q.isFetchingNextPage}
                onClick={() => q.fetchNextPage()}
              >
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="text-xs text-shop-faint">That is every order in this view.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function OrderRow({ card }: { card: SellerOrderCardWire }) {
  const { order, items } = card
  const units = items.reduce((n, i) => n + (i.quantity ?? 0), 0)
  // The seller sees the buyer's name only while the plaintext snapshot still
  // carries it (pre-cutover orders). After that the honest handle is the
  // first block of the user id, which is stable and identifies nobody.
  const buyer = decodeAddressSnapshot(card.delivery_address)?.contact_name ?? `Buyer ${shortId(order.customer_user_id)}`

  return (
    <li>
      <Link
        href={`/sell/orders/${order.id}`}
        className="panel flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:border-shop-interactive"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-shop-faint">
            Order {order.order_number}
          </div>
          <div className="mt-1.5 truncate font-semibold">
            {buyer}
            <span className="text-shop-muted"> · {units} {units === 1 ? "item" : "items"}</span>
          </div>
          <div className="mt-1.5 text-sm text-shop-muted">
            {order.created_at ? new Date(order.created_at).toLocaleString() : "Time unknown"}
            <span className="mx-2 text-shop-faint" aria-hidden="true">·</span>
            {/* What this seller is owed for their lines, in paise, never the
                dead rupee column. Gold, because it is money. */}
            <span className="font-semibold text-shop-gold">{inrMinor(sellerSubtotalMinor(card))}</span>
          </div>
        </div>
        <OrderStatusPill status={order.status} />
      </Link>
    </li>
  )
}
