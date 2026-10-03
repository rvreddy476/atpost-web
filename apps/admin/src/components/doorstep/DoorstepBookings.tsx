"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, LookupForm, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { humanise, isRecord, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import {
  BOOKING_STATUSES,
  DECISION_BODIES,
  DOORSTEP_PAGE,
  DOORSTEP_READS,
  bookingTone,
  canCancelBooking,
  canRedispatch,
  checkDoorstepRefund,
  detailRows,
  nextCursor,
  paise,
  refundBody,
  refundRoom,
  type RefundPayment,
  type Tone,
} from "@/lib/admin/doorstep"
import { REFUND_SECOND_APPROVER_NOTE } from "@/lib/admin/money"
import { CursorPager, DoorstepActionDialog, ValueFilter, useDoorstepMutation, useMayWrite } from "./DoorstepBits"

const extraTone = (status: unknown): Tone => {
  const s = str(status)
  return s === "approved" || s === "billed" ? "good" : s === "proposed" ? "warn" : "normal"
}

/** Bookings by status, city and slot date (cursor-paged), and one booking's detail. */
export function DoorstepBookings() {
  const [status, setStatus] = useState("")
  const [city, setCity] = useState("")
  const [date, setDate] = useState("")
  const [cursor, setCursor] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.bookings({ status, city, date }, cursor))

  if (open) return <BookingDetail id={open} onBack={() => setOpen(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "id", header: "Booking", value: (r) => str(r.id), cell: (r) => <IdText id={r.id} /> },
    { key: "service", header: "Service", value: (r) => str(r.service_name), sortable: true, filterable: true },
    { key: "category", header: "Category", value: (r) => str(r.category_slug), sortable: true, cell: (r) => humanise(r.category_slug) },
    { key: "slot", header: "Slot", value: (r) => str(r.slot_start), sortable: true, cell: (r) => when(r.slot_start) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={bookingTone(r.status)} /> },
    { key: "total", header: "Total", value: (r) => num(r.total_paise), sortable: true, align: "right", cell: (r) => paise(r.total_paise) },
    { key: "created", header: "Booked", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpen(String(r.id))} aria-label={`Open booking ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  const reset = () => setCursor("")
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <ValueFilter value={status} options={BOOKING_STATUSES} onChange={(v) => { setStatus(v); reset() }} />
        <div className="w-32">
          <Field label="City">{(id) => <input id={id} className={inputClass} value={city} placeholder="HYD" maxLength={3} onChange={(e) => { setCity(e.target.value.toUpperCase()); reset() }} />}</Field>
        </div>
        <div className="w-44">
          <Field label="Slot date (India)">{(id) => <input id={id} type="date" className={inputClass} value={date} onChange={(e) => { setDate(e.target.value); reset() }} />}</Field>
        </div>
        <div className="min-w-[18rem] flex-1">
          <LookupForm label="Open by id" placeholder="Booking id" button="Open" validate={(v) => (isUuid(v) ? null : "Enter a full booking id.")} onSubmit={(v) => setOpen(v.toLowerCase())} />
        </div>
      </div>
      <DataTable caption="Bookings" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No bookings match." pageSize={DOORSTEP_PAGE} />
      <CursorPager cursor={cursor} next={nextCursor(list.raw)} onChange={setCursor} />
    </>
  )
}

type Pending = "booking.cancel" | "booking.redispatch" | "booking.refund" | null

/**
 * One booking: the money, the status timeline, offers and assignments,
 * payments, refunds, extras and photos. Ops may cancel before the visit
 * starts, re-run dispatch (never hand-picking a professional) while it has
 * not begun, and refund what was captured — a refund needs a fresh 2FA code
 * and a second approver.
 */
export function BookingDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const mayWrite = useMayWrite()
  const detail = useAdminObject("doorstep", DOORSTEP_READS.booking(id))
  const [pending, setPending] = useState<Pending>(null)
  const [payment, setPayment] = useState<RefundPayment>("booking")
  const [amount, setAmount] = useState("")
  const mutation = useDoorstepMutation({ onDone: () => setPending(null) })

  const d = detail.data
  const b = d && isRecord(d.booking) ? d.booking : null
  const back = (
    <button type="button" className={buttonGhost} onClick={onBack}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All bookings
    </button>
  )
  if (detail.isLoading) return <div className="space-y-3">{back}<p className="text-sm text-mo-body">Loading the booking…</p></div>
  if (!b) {
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="text-sm text-mo-bad">
          {detail.error ?? "This booking could not be read."}
        </p>
      </div>
    )
  }

  const status = str(b.status)
  const address = isRecord(b.address) ? b.address : null
  const pro = isRecord(b.professional) ? b.professional : null
  const room = refundRoom(d, payment)
  const refundCheck = pending === "booking.refund" ? checkDoorstepRefund(amount, room) : null
  const openRefund = () => {
    setAmount("")
    setPayment(refundRoom(d, "booking") > 0 ? "booking" : "extras")
    setPending("booking.refund")
  }

  return (
    <div className="space-y-4">
      {back}
      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Booking detail">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">{str(b.service_name) ?? "Booking"}</h3>
          <StatusPill value={status} tone={bookingTone(status)} />
        </div>
        <Details
          items={[
            ["Booking", <IdText key="b" id={b.id} />],
            ["Customer", <IdText key="c" id={d?.customer_user_id} />],
            ["Category", humanise(b.category_slug)],
            ["City · zone", <span key="z">{str(b.city_code) ?? "—"} · <IdText id={b.zone_id} /></span>],
            ["Locality", address ? `${str(address.locality) ?? "—"} ${str(address.pincode) ?? ""}`.trim() : null],
            ["Slot", `${when(b.slot_start)} – ${when(b.slot_end)} (${num(b.duration_minutes) ?? "—"} min)`],
            ["Woman professional required", b.require_female_pro === true ? "Yes" : "No"],
            ["Professional", pro ? `${str(pro.first_name) ?? "—"} · ${num(pro.jobs_completed) ?? 0} jobs` : "Not assigned"],
            ["Total (GST incl.)", `${paise(b.total_paise)} (taxable ${paise(b.taxable_paise)} + tax ${paise(b.tax_paise)})`],
            ["Paid / refunded", `${paise(b.paid_paise)} / ${paise(b.refunded_paise)}`],
            ["Extras / outstanding", `${paise(b.extras_total_paise)} / ${paise(b.outstanding_paise)}`],
            ["Cancellation fee", paise(b.cancellation_fee_paise)],
            ["Rework of", str(b.parent_booking_id) ? <IdText key="p" id={b.parent_booking_id} /> : null],
            ["Booked", when(b.created_at)],
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {mayWrite("booking.redispatch") && canRedispatch(status) ? (
            <button type="button" className={buttonSecondary} onClick={() => setPending("booking.redispatch")}>
              Re-run dispatch
            </button>
          ) : null}
          {mayWrite("booking.cancel") && canCancelBooking(status) ? (
            <button type="button" className={buttonDanger} onClick={() => setPending("booking.cancel")}>
              Cancel booking
            </button>
          ) : null}
          {mayWrite("booking.refund") && (refundRoom(d, "booking") > 0 || refundRoom(d, "extras") > 0) ? (
            <button type="button" className={buttonDanger} onClick={openRefund}>
              Refund
            </button>
          ) : null}
        </div>
      </section>

      <DataTable
        caption="Timeline"
        rows={detailRows(d, "history")}
        columns={[
          { key: "when", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
          { key: "from", header: "From", value: (r) => str(r.from_status), cell: (r) => humanise(r.from_status) },
          { key: "to", header: "To", value: (r) => str(r.to_status), cell: (r) => <StatusPill value={r.to_status} tone={bookingTone(r.to_status)} /> },
          { key: "actor", header: "By", value: (r) => str(r.actor_kind), cell: (r) => humanise(r.actor_kind) },
          { key: "reason", header: "Reason", value: (r) => str(r.reason) },
        ]}
        rowId={(r) => `${str(r.created_at)}-${str(r.to_status)}`}
        emptyMessage="No status changes recorded."
      />
      <DataTable
        caption="Offers and assignments"
        rows={detailRows(d, "assignments")}
        columns={[
          { key: "pro", header: "Professional", value: (r) => str(r.pro_id), cell: (r) => <IdText id={r.pro_id} /> },
          { key: "role", header: "Role", value: (r) => str(r.role), cell: (r) => humanise(r.role) },
          { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={str(r.status) === "accepted" || str(r.status) === "completed" ? "good" : str(r.status) === "offered" ? "warn" : "normal"} /> },
          { key: "offered", header: "Offered", value: (r) => str(r.offered_at), cell: (r) => when(r.offered_at) },
          { key: "expires", header: "Offer expires", value: (r) => str(r.offer_expires_at), cell: (r) => when(r.offer_expires_at) },
          { key: "responded", header: "Responded", value: (r) => str(r.responded_at), cell: (r) => when(r.responded_at) },
        ]}
        rowId={(r) => String(r.id)}
        emptyMessage="No offers yet."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DataTable
          caption="Payments"
          rows={detailRows(d, "payments")}
          columns={[
            { key: "ref", header: "For", value: (r) => str(r.reference_type), cell: (r) => (str(r.reference_type) === "doorstep_extras" ? "Extras" : "Booking") },
            { key: "amount", header: "Amount", value: (r) => num(r.amount_paise), align: "right", cell: (r) => paise(r.amount_paise) },
            { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={str(r.status) === "succeeded" ? "good" : str(r.status) === "failed" ? "bad" : "warn"} /> },
            { key: "id", header: "Payment", value: (r) => str(r.payment_id), cell: (r) => <IdText id={r.payment_id} /> },
          ]}
          rowId={(r) => String(r.payment_id)}
          emptyMessage="No payments."
        />
        <DataTable
          caption="Refunds"
          rows={detailRows(d, "refunds")}
          columns={[
            { key: "cause", header: "Cause", value: (r) => str(r.cause), cell: (r) => humanise(r.cause) },
            { key: "amount", header: "Amount", value: (r) => num(r.amount_paise), align: "right", cell: (r) => paise(r.amount_paise) },
            { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={str(r.status) === "succeeded" ? "good" : str(r.status) === "failed" ? "bad" : "warn"} /> },
            { key: "when", header: "Requested", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
          ]}
          rowId={(r) => String(r.id)}
          emptyMessage="No refunds."
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DataTable
          caption="Extras"
          rows={detailRows(d, "extras")}
          columns={[
            { key: "name", header: "Extra", value: (r) => str(r.name) },
            { key: "kind", header: "From", value: (r) => str(r.kind), cell: (r) => humanise(r.kind) },
            { key: "qty", header: "Qty", value: (r) => num(r.quantity), align: "right" },
            { key: "total", header: "Total", value: (r) => num(r.total_paise), align: "right", cell: (r) => paise(r.total_paise) },
            { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={extraTone(r.status)} /> },
          ]}
          rowId={(r) => String(r.id)}
          emptyMessage="No extras proposed."
        />
        <DataTable
          caption="Photos"
          rows={detailRows(d, "photos")}
          columns={[
            { key: "phase", header: "Phase", value: (r) => str(r.phase), cell: (r) => humanise(r.phase) },
            { key: "media", header: "Media", value: (r) => str(r.media_id), cell: (r) => <IdText id={r.media_id} /> },
            { key: "when", header: "Taken", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
          ]}
          rowId={(r) => String(r.id)}
          emptyMessage="No photos yet."
        />
      </div>

      <DoorstepActionDialog
        write={pending}
        subject={pending === "booking.refund" ? null : "this booking"}
        busy={mutation.isPending}
        canConfirm={pending !== "booking.refund" || refundCheck?.ok === true}
        onConfirm={(reason) => {
          if (pending === "booking.refund") {
            if (refundCheck?.ok) mutation.mutate({ write: pending, target: { id }, body: refundBody(refundCheck.amountPaise, reason, payment) })
            return
          }
          if (pending) mutation.mutate({ write: pending, target: { id }, body: DECISION_BODIES.reason(reason) })
        }}
        onClose={() => setPending(null)}
      >
        {pending === "booking.refund" ? (
          <div className="space-y-3">
            <Field label="Payment">
              {(fid) => (
                <select id={fid} className={inputClass} value={payment} onChange={(e) => setPayment(e.target.value === "extras" ? "extras" : "booking")}>
                  <option value="booking">Booking ({paise(refundRoom(d, "booking"))} refundable)</option>
                  <option value="extras">Extras ({paise(refundRoom(d, "extras"))} refundable)</option>
                </select>
              )}
            </Field>
            <Field label="Amount (₹)" hint={refundCheck && !refundCheck.ok && amount ? <span className="text-mo-bad">{refundCheck.problem}</span> : `Up to ${paise(room)}.`}>
              {(fid) => <input id={fid} className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
            <p className="text-xs text-mo-body">{REFUND_SECOND_APPROVER_NOTE}</p>
          </div>
        ) : pending === "booking.cancel" ? (
          <p className="text-sm text-mo-body">The customer is refunded in full; the professional&rsquo;s slot is released.</p>
        ) : null}
      </DoorstepActionDialog>
    </div>
  )
}
