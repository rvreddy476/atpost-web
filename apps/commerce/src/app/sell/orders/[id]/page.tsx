"use client"

import { use } from "react"
import Link from "next/link"
import { SellerShell } from "@/components/sell/SellerShell"
import { ShipForm } from "@/components/sell/ShipForm"
import { OrderStatusPill } from "@/components/sell/StatusPill"
import {
  useOrderShipments,
  usePayoutPreview,
  useSellerOrder,
  useShipOrder,
  type SellerOrderCardWire,
  type SellerOrderItem,
} from "@/hooks/useSeller"
import { apiMessage } from "@/lib/listing"
import { inr, inrMinor } from "@/lib/money"
import {
  addressIsRoutingOnly,
  buildTimeline,
  canBookShipment,
  decodeAddressSnapshot,
  isFenced,
  lineTotalMinor,
  normaliseShipment,
  orderStatusUI,
  orderTotalMinor,
  sellerActionsFor,
  sellerSubtotalMinor,
  shortId,
  variantSummary,
  type SellerShipment,
} from "@/lib/seller"

export default function SellerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <SellerShell redirectTo={`/shop/sell/orders/${id}`}>
      <OrderDetail id={id} />
    </SellerShell>
  )
}

function OrderDetail({ id }: { id: string }) {
  const q = useSellerOrder(id)
  const shipmentsQ = useOrderShipments(id)
  const ship = useShipOrder()
  const card = q.data
  const subtotalMinor = card ? sellerSubtotalMinor(card) : 0
  // Asked in rupees because the preview route speaks rupees; derived from the
  // paise, never summed separately, so the two figures cannot disagree.
  const payout = usePayoutPreview(card ? subtotalMinor / 100 : undefined)

  if (q.isLoading) return <div className="cart-state"><span className="cart-loader" />Loading order…</div>
  if (q.isError || !card) {
    const status = (q.error as { response?: { status?: number } } | undefined)?.response?.status
    const message =
      status === 404
        ? "Order not found."
        : status === 403
          ? "This order has none of your items."
          : apiMessage(q.error, "Could not load this order.")
    return (
      <div>
        <Link href="/sell/orders" className="quiet-link">← Orders</Link>
        <div className="notice notice-error mt-6" role="alert">{message}</div>
      </div>
    )
  }

  const { order, items } = card
  const shipment = normaliseShipment(card.shipment)
  const events = shipmentsQ.data?.find((s) => s.shipment.id === shipment?.id)?.events ?? []
  const timeline = buildTimeline(order, shipment, events)
  const address = decodeAddressSnapshot(card.delivery_address ?? null)
  const shipLive = canBookShipment(order, shipment)
  const actions = sellerActionsFor(order.status)
  const payUI = orderStatusUI(order.payment_status)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sell/orders" className="quiet-link">← Orders</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="shop-display text-3xl sm:text-[38px]">Order {order.order_number}</h1>
          <OrderStatusPill status={order.status} />
        </div>
        <div className="mt-2 text-sm text-shop-muted">
          Placed {order.created_at ? new Date(order.created_at).toLocaleString() : "at an unknown time"}
          <span className="mx-2 text-shop-faint" aria-hidden="true">·</span>
          Payment <span className={payUI.cls}>{payUI.label.toLowerCase()}</span>
          {order.payment_method ? <span className="text-shop-faint"> via {order.payment_method}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel panel-pad lg:col-span-2">
          <h2 className="panel-heading">Your items</h2>
          <div className="divide-y divide-white/10">
            {items.map((item) => <ItemLine key={item.id} item={item} />)}
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel panel-pad">
            <h2 className="panel-heading">Ship to</h2>
            <AddressBlock address={address} buyerId={order.customer_user_id} />
          </section>

          <section className="panel panel-pad">
            <h2 className="panel-heading">Totals</h2>
            <Totals card={card} subtotalMinor={subtotalMinor} payout={payout} />
          </section>
        </div>
      </div>

      <section className="panel panel-pad">
        <h2 className="panel-heading">Fulfilment</h2>
        <Actions
          orderStatus={order.status}
          paymentStatus={order.payment_status}
          shipment={shipment}
          shipLive={shipLive}
          actions={actions}
          pending={ship.isPending}
          serverError={ship.isError ? apiMessage(ship.error, "Could not book the shipment.") : null}
          onShip={(values) => ship.mutate({ orderId: id, values })}
        />
      </section>

      <section className="panel panel-pad">
        <h2 className="panel-heading">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-shop-muted">Nothing recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <div>
                  <span className="font-semibold">{entry.label}</span>
                  {entry.detail ? <span className="text-shop-muted"> · {entry.detail}</span> : null}
                </div>
                <span className="text-xs text-shop-faint">
                  {entry.at ? new Date(entry.at).toLocaleString() : "time not recorded"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ItemLine({ item }: { item: SellerOrderItem }) {
  const variant = variantSummary(item.variant_details)
  return (
    <div className="flex flex-col justify-between gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row">
      <div className="min-w-0">
        <p className="font-medium">{item.product_title}</p>
        <p className="text-sm text-shop-faint">
          {item.sku}
          {variant ? <> · {variant}</> : null}
          {" · "}Qty {item.quantity}
        </p>
      </div>
      <div className="sm:text-right">
        <p className="font-semibold">{inrMinor(lineTotalMinor(item))}</p>
        <p className="text-xs text-shop-faint">{orderStatusUI(item.status).label}</p>
      </div>
    </div>
  )
}

function AddressBlock({ address, buyerId }: { address: ReturnType<typeof decodeAddressSnapshot>; buyerId: string }) {
  if (!address) {
    return (
      <p className="text-sm text-shop-muted">
        The address is sealed for privacy and travels on the courier label. Buyer {shortId(buyerId)}.
      </p>
    )
  }
  const routingOnly = addressIsRoutingOnly(address)
  const cityLine = [address.city, address.state, address.postal_code].filter(Boolean).join(", ")
  return (
    <address className="not-italic text-sm leading-relaxed">
      {address.contact_name ? <div className="font-semibold">{address.contact_name}</div> : null}
      {address.address_line_1 ? <div>{address.address_line_1}</div> : null}
      {address.address_line_2 ? <div>{address.address_line_2}</div> : null}
      {address.landmark ? <div className="text-shop-muted">Near {address.landmark}</div> : null}
      {cityLine ? <div>{cityLine}</div> : null}
      {address.country ? <div>{address.country}</div> : null}
      {address.phone ? <div className="mt-1 text-shop-muted">{address.phone}</div> : null}
      {routingOnly ? (
        <p className="mt-2 text-xs text-shop-faint">
          Name, phone and street are sealed for privacy and travel on the courier label. Buyer {shortId(buyerId)}.
        </p>
      ) : null}
    </address>
  )
}

function Totals({
  card,
  subtotalMinor,
  payout,
}: {
  card: SellerOrderCardWire
  subtotalMinor: number
  payout: ReturnType<typeof usePayoutPreview>
}) {
  const { order } = card
  const shippingMinor = typeof order.shipping_minor === "number" ? order.shipping_minor : Math.round((order.shipping_charges ?? 0) * 100)
  return (
    <dl className="space-y-2 text-sm">
      <Row label="Your items" value={inrMinor(subtotalMinor)} strong />
      <Row label="Shipping (whole order)" value={inrMinor(shippingMinor)} />
      <Row label="Order total (buyer paid)" value={inrMinor(orderTotalMinor(order))} />
      {payout.data ? (
        <>
          <Row label="Commission" value={`− ${inr(payout.data.commission)}`} />
          <Row label="Platform fee" value={`− ${inr(payout.data.platform_fee)}`} />
          <Row label="TDS" value={`− ${inr(payout.data.tds)}`} />
          <div className="border-t border-white/10 pt-2">
            <Row label="Estimated payout" value={inr(payout.data.net_payout)} gold />
          </div>
        </>
      ) : payout.isError ? (
        <p className="pt-1 text-xs text-shop-faint">
          {isFenced(payout.error)
            ? "The payout breakdown is not switched on for this server yet; commission, fees and TDS are settled on delivery."
            : apiMessage(payout.error, "Could not fetch the payout estimate.")}
        </p>
      ) : payout.isLoading ? (
        <p className="pt-1 text-xs text-shop-faint">Working out the payout…</p>
      ) : null}
    </dl>
  )
}

function Row({ label, value, strong, gold }: { label: string; value: string; strong?: boolean; gold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-shop-muted">{label}</dt>
      <dd className={gold ? "font-bold text-shop-gold" : strong ? "font-semibold" : ""}>{value}</dd>
    </div>
  )
}

function Actions({
  orderStatus,
  paymentStatus,
  shipment,
  shipLive,
  actions,
  pending,
  serverError,
  onShip,
}: {
  orderStatus: string
  paymentStatus: string
  shipment: SellerShipment | null
  shipLive: boolean
  actions: ReturnType<typeof sellerActionsFor>
  pending: boolean
  serverError: string | null
  onShip: (values: { courier: string; tracking_number: string }) => void
}) {
  const unwired = actions.filter((a) => a.route === null)

  return (
    <div className="space-y-5">
      {shipment ? (
        <div className="text-sm">
          <p>
            <span className="font-semibold">Shipment booked</span>
            <span className="text-shop-muted"> · {shipment.courier || "courier pending"}</span>
            {shipment.tracking_number ? <span className="font-mono text-shop-muted"> · {shipment.tracking_number}</span> : null}
            <span className="text-shop-muted"> · {orderStatusUI(shipment.status).label.toLowerCase()}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {shipment.tracking_url ? (
              <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="shop-link">Track parcel</a>
            ) : null}
            {shipment.label_url ? (
              <a href={shipment.label_url} target="_blank" rel="noreferrer" className="shop-link">Shipping label</a>
            ) : null}
          </div>
        </div>
      ) : shipLive ? (
        <div>
          <p className="mb-3 text-sm text-shop-muted">
            Enter the courier and tracking number from the label. The platform books the pickup with its courier
            partner and shows the confirmed details here once it has.
          </p>
          <ShipForm pending={pending} serverError={serverError} onSubmit={onShip} />
        </div>
      ) : orderStatus === "confirmed" || orderStatus === "packed" ? (
        <p className="text-sm text-shop-muted">
          Waiting for the payment to be captured before this can ship (payment {paymentStatus.replace(/_/g, " ")}).
        </p>
      ) : (
        <p className="text-sm text-shop-muted">Nothing for you to do on this order right now.</p>
      )}

      {/* The transition table also lets a seller mark packed and cancel from
          here, and the seller should see those steps exist. The platform has
          no route for either yet, so the buttons are present and disabled
          rather than absent: a missing button reads as "you may not", and
          that is not the fact. */}
      {unwired.length > 0 ? (
        <div className="border-t border-white/10 pt-4">
          <div className="flex flex-wrap gap-2">
            {unwired.map((a) => (
              <button
                key={a.kind}
                type="button"
                disabled
                aria-disabled="true"
                title="Not available in MSeller yet"
                className={a.kind === "cancel" ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm"}
              >
                {a.kind === "pack" ? "Mark as packed" : "Cancel order"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-shop-faint">
            {unwired.map((a) => (a.kind === "pack" ? "Mark as packed" : "Cancel")).join(" and ")} are not available in
            MSeller yet. A buyer can still cancel from their side until the parcel ships.
          </p>
        </div>
      ) : null}
    </div>
  )
}
