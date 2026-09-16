"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Details, ErrorNote, Field, IdText, Loading, LookupForm, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { humanise, isRecord, isUuid, num, readList, str, when, type Row } from "@/lib/admin/data"
import { formatPaise, parseRupeeInput, refundHint, rupeesToPaise } from "@/lib/admin/money"
import { can } from "@/lib/admin/sections"
import { FOOD, FOOD_KEY } from "./FeastApprovals"

const LIMIT = 50

/** The order total in paise: the paise block when present, else the rupee total converted once. */
export function orderTotalPaise(order: Row): number | null {
  const money = isRecord(order.money) ? order.money : null
  const totals = money && isRecord(money.totals_paise) ? money.totals_paise : null
  const paise = totals ? num(totals.final_amount_paise) : null
  if (paise !== null) return paise
  return isRecord(order.totals) ? rupeesToPaise(order.totals.final_amount) : null
}

/** Feast orders: a paged list, a look-up by id, and the detail with cancel and refund. */
export function FeastOrders() {
  const [offset, setOffset] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useAdminList("food", `${FOOD}/orders?limit=${LIMIT}&offset=${offset}`)

  if (openId) return <OrderDetail id={openId} onBack={() => setOpenId(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "number", header: "Order", value: (r) => str(r.order_number), sortable: true, filterable: true },
    { key: "restaurant", header: "Restaurant", value: (r) => str(r.restaurant_name), sortable: true, filterable: true },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, filterable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "payment", header: "Payment", value: (r) => str(r.payment_status), cell: (r) => `${humanise(r.payment_method)} · ${humanise(r.payment_status)}` },
    { key: "total", header: "Total", value: (r) => orderTotalPaise(r), sortable: true, align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(orderTotalPaise(r))}</span> },
    { key: "placed", header: "Placed", value: (r) => str(r.placed_at), sortable: true, cell: (r) => when(r.placed_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpenId(String(r.id))} aria-label={`Open order ${str(r.order_number) ?? str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <LookupForm label="Order id" button="Open order" validate={(v) => (isUuid(v) ? null : "Enter the order's id (a UUID).")} onSubmit={setOpenId} />
      <p className="mb-2 text-xs text-mo-body">The filters search the rows on this page; the server has no order search yet.</p>
      <DataTable caption="Feast orders" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No orders." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}

function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useAdmin()
  const order = useAdminObject("food", `${FOOD}/orders/${encodeURIComponent(id)}`)
  const [cancelling, setCancelling] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [amount, setAmount] = useState("")

  const cancel = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({ method: "post", url: `${FOOD}/orders/${encodeURIComponent(id)}/cancel`, body: { reason } }),
    invalidate: [FOOD_KEY],
    successMessage: "Order cancelled",
    errorTitle: "Cancelling failed",
    onDone: () => setCancelling(false),
  })
  const refund = useAdminMutation<{ amountPaise: number | null; reason: string }>({
    request: ({ amountPaise, reason }) => ({
      method: "post",
      url: `${FOOD}/orders/${encodeURIComponent(id)}/refund`,
      body: { reason, ...(amountPaise !== null ? { amount_paise: amountPaise } : {}) },
      idempotent: true,
    }),
    invalidate: [FOOD_KEY],
    successMessage: "Refund issued",
    errorTitle: "Refund failed",
    onDone: () => {
      setRefunding(false)
      setAmount("")
    },
  })

  if (order.isLoading) return <Loading what="Loading the order…" />
  if (order.error || !order.data) {
    return (
      <div className="space-y-3">
        <button type="button" className={buttonGhost} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
        </button>
        <ErrorNote message={order.error ?? "The order could not be read."} onRetry={order.refetch} />
      </div>
    )
  }

  const o = order.data
  const total = orderTotalPaise(o)
  const items = readList({ items: o.items })
  const history = readList({ items: o.history })
  const typed = amount.trim() ? parseRupeeInput(amount) : null
  const amountInvalid = amount.trim() !== "" && typed === null
  const hint = refundHint(typed, total)

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
      </button>
      <section className="rounded-mo border border-mo bg-mo-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">Order {str(o.order_number) ?? id}</h3>
          <StatusPill value={o.status} />
        </div>
        <Details
          items={[
            ["Restaurant", str(o.restaurant_name)],
            ["Customer", <IdText key="c" id={o.user_id} />],
            ["Payment", `${humanise(o.payment_method)} · ${humanise(o.payment_status)}`],
            ["Total", formatPaise(total)],
            ["Placed", when(o.placed_at)],
            ["Delivered", when(o.delivered_at)],
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {can(me, "food", "refund.issue") ? (
            <button type="button" className={buttonPrimary} onClick={() => setRefunding(true)}>
              Refund
            </button>
          ) : null}
          {can(me, "food", "orders.cancel") ? (
            <button type="button" className={buttonDanger} onClick={() => setCancelling(true)}>
              Cancel order
            </button>
          ) : null}
        </div>
      </section>

      <DataTable
        caption="Items"
        rows={items}
        columns={[
          { key: "name", header: "Item", value: (r) => str(r.name) },
          { key: "qty", header: "Qty", value: (r) => num(r.quantity), align: "right" },
          { key: "line", header: "Line total", value: (r) => num(r.line_total_paise), align: "right", cell: (r) => formatPaise(num(r.line_total_paise) ?? rupeesToPaise(r.line_total)) },
        ]}
        rowId={(r) => String(r.id)}
        emptyMessage="No items."
      />

      <section aria-label="Status history">
        <h3 className="mb-2 text-sm font-semibold text-mo-ink">Status history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-mo-body">No history.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {history.map((h, i) => (
              <li key={i} className="text-mo-ink">
                {when(h.created_at)} · {str(h.from_status) ? `${humanise(h.from_status)} → ` : ""}
                {humanise(h.to_status)}
                {str(h.reason) ? <span className="text-mo-body"> — {str(h.reason)}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmReasonDialog
        open={cancelling}
        title="Cancel this order?"
        description="The customer and restaurant are told. Cancelling needs a fresh 2FA code."
        confirmLabel="Cancel order"
        destructive
        busy={cancel.isPending}
        onConfirm={(reason) => cancel.mutate({ reason })}
        onClose={() => setCancelling(false)}
      />
      <ConfirmReasonDialog
        open={refunding}
        title="Refund this order"
        description={`Order total ${formatPaise(total)}. Refunds need a fresh 2FA code.`}
        confirmLabel="Refund"
        destructive
        busy={refund.isPending}
        canConfirm={!amountInvalid}
        onConfirm={(reason) => refund.mutate({ amountPaise: typed, reason })}
        onClose={() => setRefunding(false)}
      >
        <Field label="Amount in rupees (leave empty for a full refund)" hint={amountInvalid ? "Enter an amount like 5000 or 249.50." : undefined}>
          {(fid) => <input id={fid} className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <p
          role="note"
          data-testid="refund-hint"
          className={`rounded-mo-sm border p-2 text-xs ${hint.secondApprover === false ? "border-mo text-mo-body" : "border-mo-warn/60 bg-mo-warn/10 text-mo-ink"}`}
        >
          {hint.message}
        </p>
      </ConfirmReasonDialog>
    </div>
  )
}
