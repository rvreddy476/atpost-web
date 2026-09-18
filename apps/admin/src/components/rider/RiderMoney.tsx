"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { DateRangePicker } from "@/components/blocks/DateRangePicker"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import {
  EMPTY_PAYMENT_FILTER,
  OUTSTANDING_STATUSES,
  REFUND_STATUSES,
  RIDER,
  RIDER_PAGE,
  RIDER_WRITES,
  RIDE_PAYMENT_METHODS,
  RIDE_PAYMENT_STATUSES,
  canRefund,
  checkRefund,
  nextCursor,
  outstandingTone,
  paise,
  paymentTone,
  refundBody,
  refundRemaining,
  refundTone,
  ridePaymentsQuery,
  riderListQuery,
  type RidePaymentFilter,
} from "@/lib/admin/rider"
import { can } from "@/lib/admin/sections"
import { RiderActionDialog, StatusFilter, useRiderMutation } from "./RiderBits"

const SECOND_APPROVER = "This goes to the approvals inbox: a second admin holding rider:payments.settle must approve it before anything happens. You will see “Sent for approval”, not “done”."

type Area = "payments" | "outstanding" | "refunds"

/**
 * Money: the fares customers paid for rides (through payments-service),
 * the cancellation fees they still owe, and refunds. Reading needs
 * rider:payments.read. A refund returns money and a waiver forgives it, so
 * both need rider:payments.settle, a fresh 2FA code AND a second approver:
 * the first admin's confirmation lands in the approvals inbox as a 202.
 */
export function RiderMoney() {
  const [area, setArea] = useState<Area>("payments")
  const areas: { id: Area; label: string }[] = [
    { id: "payments", label: "Ride payments" },
    { id: "outstanding", label: "Outstanding fees" },
    { id: "refunds", label: "Refunds" },
  ]
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Which money" className="inline-flex gap-1 rounded-mo-sm border border-mo p-1">
        {areas.map((a) => (
          <button key={a.id} type="button" className={`${buttonSecondary} border-0 ${area === a.id ? "bg-mo-raised" : ""}`} aria-pressed={area === a.id} onClick={() => setArea(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      {area === "payments" ? <RidePayments /> : area === "outstanding" ? <OutstandingFees /> : <RideRefunds />}
    </div>
  )
}

/** Ride payments, cursor-paged, filtered by status, method and day. A succeeded payment can be refunded in full or in part. */
function RidePayments() {
  const { me } = useAdmin()
  const [draft, setDraft] = useState<RidePaymentFilter>(EMPTY_PAYMENT_FILTER)
  const [filter, setFilter] = useState<RidePaymentFilter>(EMPTY_PAYMENT_FILTER)
  /** The cursors that led to the current page; the last is the one in use. */
  const [cursors, setCursors] = useState<string[]>([""])
  const [refunding, setRefunding] = useState<Row | null>(null)
  const [amount, setAmount] = useState("")
  const cursor = cursors[cursors.length - 1]
  const list = useAdminList("rider", `${RIDER}/ride-payments?${ridePaymentsQuery(filter, cursor)}`)
  const next = nextCursor(list.raw)
  const mutation = useRiderMutation({ onDone: () => setRefunding(null) })
  const maySettle = can(me, "rider", RIDER_WRITES["refund.issue"].permission)
  const remaining = refunding ? refundRemaining(refunding) : 0
  const check = refunding ? checkRefund(amount, remaining) : null

  const apply = (next: RidePaymentFilter) => {
    setFilter(next)
    setCursors([""])
  }

  const columns: DataColumn<Row>[] = [
    { key: "id", header: "Payment", value: (r) => str(r.id), filterable: true, cell: (r) => <IdText id={r.id} /> },
    { key: "ride", header: "Ride", value: (r) => str(r.ride_id), filterable: true, cell: (r) => <IdText id={r.ride_id} /> },
    { key: "customer", header: "Customer", value: (r) => str(r.customer_user_id), cell: (r) => <IdText id={r.customer_user_id} /> },
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), cell: (r) => (str(r.partner_id) ? <IdText id={r.partner_id} /> : "—") },
    { key: "amount", header: "Amount", value: (r) => num(r.amount_paise), sortable: true, align: "right", cell: (r) => <span data-paise={num(r.amount_paise) ?? ""}>{paise(r.amount_paise)}</span> },
    { key: "method", header: "Method", value: (r) => str(r.payment_method), sortable: true, cell: (r) => humanise(r.payment_method) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={paymentTone(r.status)} /> },
    { key: "refunded", header: "Refunded", value: (r) => num(r.refunded_paise), sortable: true, align: "right", cell: (r) => ((num(r.refunded_paise) ?? 0) > 0 ? paise(r.refunded_paise) : "—") },
    { key: "failure", header: "Failure", value: (r) => str(r.failure_reason), cell: (r) => <span className="text-xs">{str(r.failure_reason) ?? "—"}</span> },
    { key: "created", header: "Created", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "settled", header: "Settled", value: (r) => str(r.settled_at), sortable: true, cell: (r) => (str(r.settled_at) ? when(r.settled_at) : "—") },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        maySettle && canRefund(r) ? (
          <button
            type="button"
            className={buttonDanger}
            onClick={() => {
              setRefunding(r)
              setAmount("")
            }}
            aria-label={`Refund ride ${str(r.ride_id)}`}
          >
            Refund
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Filter ride payments"
        onSubmit={(e) => {
          e.preventDefault()
          apply(draft)
        }}
      >
        <StatusFilter value={draft.status} options={RIDE_PAYMENT_STATUSES} onChange={(v) => setDraft({ ...draft, status: v })} />
        <StatusFilter label="Method" value={draft.method} options={RIDE_PAYMENT_METHODS} onChange={(v) => setDraft({ ...draft, method: v })} />
        <DateRangePicker label="Created" value={{ from: draft.from, to: draft.to }} onChange={(range) => setDraft({ ...draft, from: range.from, to: range.to })} maxDays={92} />
        <button type="submit" className={buttonSecondary}>
          Apply
        </button>
      </form>
      <DataTable caption="Ride payments" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No ride payments match." pageSize={200} />
      <div className="mt-2 flex items-center gap-2 text-sm text-mo-body">
        <button type="button" className={buttonSecondary} disabled={cursors.length <= 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Previous
        </button>
        <button type="button" className={buttonSecondary} disabled={!next} onClick={() => setCursors((c) => [...c, next])}>
          Next
        </button>
        <span>Page {cursors.length}</span>
      </div>
      <RiderActionDialog
        write={refunding ? "refund.issue" : null}
        subject={refunding ? (str(refunding.ride_id)?.slice(0, 8) ?? "") : null}
        busy={mutation.isPending}
        canConfirm={check?.ok === true}
        onConfirm={(reason) => {
          if (!refunding || !check?.ok) return
          mutation.mutate({ write: "refund.issue", url: `${RIDER}/rides/${encodeURIComponent(String(refunding.ride_id))}/refund`, body: refundBody(check.amountPaise, reason) })
        }}
        onClose={() => setRefunding(null)}
      >
        {refunding ? (
          <div className="space-y-2">
            <p className="text-sm text-mo-body" data-refund-remaining={remaining}>
              {paise(refunding.amount_paise)} paid by {humanise(refunding.payment_method)}
              {(num(refunding.refunded_paise) ?? 0) > 0 ? `, ${paise(refunding.refunded_paise)} already refunded` : ""}. Up to <strong className="text-mo-ink">{paise(remaining)}</strong> can be returned.
            </p>
            <Field label="Amount (₹)" hint={check && !check.ok ? <span className="text-mo-bad">{check.problem}</span> : `Blank refunds the full ${paise(remaining)}.`}>
              {(id) => <input id={id} type="text" inputMode="decimal" className={inputClass} value={amount} placeholder={paise(remaining).replace("₹", "")} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
            <p className="rounded-mo-sm border border-mo-warn/50 bg-mo-warn/10 p-2 text-xs text-mo-ink">{SECOND_APPROVER}</p>
          </div>
        ) : null}
      </RiderActionDialog>
    </>
  )
}

/** Cancellation fees customers still owe; a pending fee can be waived with a reason (two-person). */
function OutstandingFees() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("pending")
  const [customer, setCustomer] = useState("")
  const [applied, setApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [waiving, setWaiving] = useState<Row | null>(null)
  const list = useAdminList("rider", `${RIDER}/outstanding?${riderListQuery({ status, customer_id: isUuid(applied) ? applied : "" }, offset)}`)
  const mutation = useRiderMutation({ onDone: () => setWaiving(null) })
  const maySettle = can(me, "rider", RIDER_WRITES["outstanding.waive"].permission)

  const columns: DataColumn<Row>[] = [
    { key: "customer", header: "Customer", value: (r) => str(r.customer_user_id), filterable: true, cell: (r) => <IdText id={r.customer_user_id} /> },
    { key: "ride", header: "Ride", value: (r) => str(r.ride_id), filterable: true, cell: (r) => <IdText id={r.ride_id} /> },
    { key: "amount", header: "Owed", value: (r) => num(r.amount_paise), sortable: true, align: "right", cell: (r) => <span data-paise={num(r.amount_paise) ?? ""}>{paise(r.amount_paise)}</span> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), cell: (r) => <span className="text-xs">{str(r.reason) ?? "—"}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={outstandingTone(r.status)} /> },
    { key: "waive_reason", header: "Waived because", value: (r) => str(r.waive_reason), cell: (r) => <span className="text-xs">{str(r.waive_reason) ?? "—"}</span> },
    { key: "created", header: "Charged", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "settled", header: "Settled", value: (r) => str(r.settled_at), sortable: true, cell: (r) => (str(r.settled_at) ? when(r.settled_at) : "—") },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        maySettle && r.status === "pending" ? (
          <button type="button" className={buttonDanger} onClick={() => setWaiving(r)} aria-label={`Waive fee ${str(r.id)}`}>
            Waive
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Filter outstanding fees"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(customer.trim().toLowerCase())
          setOffset(0)
        }}
      >
        <StatusFilter
          value={status}
          options={OUTSTANDING_STATUSES}
          onChange={(v) => {
            setStatus(v)
            setOffset(0)
          }}
        />
        <div className="w-96">
          <Field label="Customer id" hint={customer && !isUuid(customer) ? "Enter the full customer id." : undefined}>
            {(id) => <input id={id} className={inputClass} value={customer} placeholder="Every customer" onChange={(e) => setCustomer(e.target.value)} />}
          </Field>
        </div>
        <button type="submit" className={buttonSecondary}>
          Filter
        </button>
      </form>
      <DataTable caption="Outstanding cancellation fees" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No outstanding fees with this status." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
      <RiderActionDialog
        write={waiving ? "outstanding.waive" : null}
        subject={waiving ? `of ${paise(waiving.amount_paise)}` : null}
        busy={mutation.isPending}
        onConfirm={(reason) => waiving && mutation.mutate({ write: "outstanding.waive", url: `${RIDER}/outstanding/${encodeURIComponent(String(waiving.id))}/waive`, body: { reason } })}
        onClose={() => setWaiving(null)}
      >
        {waiving ? (
          <div className="space-y-2">
            <p className="text-sm text-mo-body">
              Customer <IdText id={waiving.customer_user_id} /> owes <strong className="text-mo-ink">{paise(waiving.amount_paise)}</strong> for ride <IdText id={waiving.ride_id} />: {str(waiving.reason) ?? "no reason recorded"}.
            </p>
            <p className="rounded-mo-sm border border-mo-warn/50 bg-mo-warn/10 p-2 text-xs text-mo-ink">{SECOND_APPROVER}</p>
          </div>
        ) : null}
      </RiderActionDialog>
    </>
  )
}

/** Refunds requested, accepted by payments-service, refunded or failed. */
function RideRefunds() {
  const [status, setStatus] = useState("")
  const [ride, setRide] = useState("")
  const [applied, setApplied] = useState("")
  const list = useAdminList("rider", `${RIDER}/refunds?${riderListQuery({ status, ride_id: isUuid(applied) ? applied : "" }, 0, 200)}`)

  const columns: DataColumn<Row>[] = [
    { key: "id", header: "Refund", value: (r) => str(r.id), cell: (r) => <IdText id={r.id} /> },
    { key: "ride", header: "Ride", value: (r) => str(r.ride_id), filterable: true, cell: (r) => <IdText id={r.ride_id} /> },
    { key: "payment", header: "Payment", value: (r) => str(r.payment_id), cell: (r) => <IdText id={r.payment_id} /> },
    { key: "amount", header: "Amount", value: (r) => num(r.amount_paise), sortable: true, align: "right", cell: (r) => <span data-paise={num(r.amount_paise) ?? ""}>{paise(r.amount_paise)}</span> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), cell: (r) => <span className="text-xs">{str(r.reason) ?? "—"}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={refundTone(r.status)} /> },
    { key: "by", header: "Requested by", value: (r) => str(r.requested_by), cell: (r) => (str(r.requested_by) ? <IdText id={r.requested_by} /> : "—") },
    { key: "created", header: "Requested", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "updated", header: "Updated", value: (r) => str(r.updated_at), sortable: true, cell: (r) => when(r.updated_at) },
  ]

  return (
    <>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Filter refunds"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(ride.trim().toLowerCase())
        }}
      >
        <StatusFilter value={status} options={REFUND_STATUSES} onChange={setStatus} />
        <div className="w-96">
          <Field label="Ride id" hint={ride && !isUuid(ride) ? "Enter the full ride id." : undefined}>
            {(id) => <input id={id} className={inputClass} value={ride} placeholder="Every ride" onChange={(e) => setRide(e.target.value)} />}
          </Field>
        </div>
        <button type="submit" className={buttonSecondary}>
          Filter
        </button>
      </form>
      <DataTable caption="Refunds" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No refunds match." pageSize={200} />
    </>
  )
}
