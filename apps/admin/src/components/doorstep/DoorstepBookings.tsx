"use client"

import { useState } from "react"
import { AlertTriangle, ArrowLeft, UserX } from "lucide-react"
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
  DOORSTEP_WRITES,
  PRO_CHANGE_STATUS_LABELS,
  attentionMessage,
  bookingTone,
  canCancelBooking,
  canRedispatch,
  cancelBody,
  changeDifferenceLabel,
  checkCancelFee,
  checkDoorstepRefund,
  detailRows,
  nextCursor,
  paise,
  parseExcludeIds,
  pendingChangeMessage,
  proChangeTone,
  proUnavailableMessage,
  readAdminBooking,
  readProUnavailable,
  refundBody,
  refundCauseLabel,
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

/**
 * Bookings by status, city and slot date (cursor-paged), and one booking's
 * detail. The list rows (BookingSummary) carry no needs-attention flag and the
 * route takes no filter for it, so flagged bookings are counted on the
 * header's stat tile and shown on the detail.
 */
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
 * One booking: the money, the status timeline, offers and assignments, the
 * customer's changes of professional, payments, refunds, extras and photos.
 * A booking whose professional is gone (pro_unavailable) shows why and by
 * when the customer must pick another or cancel; a dearer pick waiting for
 * payment shows its difference. Ops may cancel before the visit starts, take
 * the job off the professional so the customer picks another (never
 * choosing for them) until the visit begins, and refund what was captured —
 * a refund needs a fresh 2FA code and a second approver.
 */
export function BookingDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const mayWrite = useMayWrite()
  const detail = useAdminObject("doorstep", DOORSTEP_READS.booking(id))
  const [pending, setPending] = useState<Pending>(null)
  const [payment, setPayment] = useState<RefundPayment>("booking")
  const [amount, setAmount] = useState("")
  const [fee, setFee] = useState("")
  const [exclude, setExclude] = useState("")
  const mutation = useDoorstepMutation({ onDone: () => setPending(null) })

  const d = detail.data
  const view = readAdminBooking(d)
  const b = view?.booking ?? null
  const back = (
    <button type="button" className={buttonGhost} onClick={onBack}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All bookings
    </button>
  )
  if (detail.isLoading) return <div className="space-y-3">{back}<p className="text-sm text-mo-body">Loading the booking…</p></div>
  if (!view || !b) {
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
  const cancelRoom = refundRoom(d, "booking")
  const feeCheck = pending === "booking.cancel" ? checkCancelFee(fee, cancelRoom) : null
  const attention = attentionMessage(view)
  const unavailable = readProUnavailable(b)
  const change = view.pendingChange
  const excludeCheck = pending === "booking.redispatch" ? parseExcludeIds(exclude) : null
  const openRedispatch = () => {
    setExclude("")
    setPending("booking.redispatch")
  }
  const openCancel = () => {
    setFee("")
    setPending("booking.cancel")
  }
  const openRefund = () => {
    setAmount("")
    setPayment(refundRoom(d, "booking") > 0 ? "booking" : "extras")
    setPending("booking.refund")
  }

  return (
    <div className="space-y-4">
      {back}
      {attention ? (
        <div role="alert" className="flex items-start gap-3 rounded-mo border border-mo-bad/60 bg-mo-bad/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-mo-bad" aria-hidden="true" />
          <div>
            <p className="font-semibold text-mo-ink">Needs attention</p>
            <p className="text-sm text-mo-ink">{attention}</p>
            <p className="mt-1 text-xs text-mo-body">The booking was not confirmed from this payment. Check the payments and refunds below before cancelling or refunding.</p>
          </div>
        </div>
      ) : null}
      {unavailable ? (
        <div role="status" className="flex items-start gap-3 rounded-mo border border-mo-warn/60 bg-mo-warn/10 p-4" aria-label="Professional unavailable">
          <UserX className="mt-0.5 h-5 w-5 shrink-0 text-mo-warn" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-mo-ink">Professional unavailable: {unavailable.causeLabel}</p>
            <p className="text-sm text-mo-ink">{proUnavailableMessage(unavailable)}</p>
            <p className="text-xs text-mo-body">Customer must choose by {unavailable.deadline ? when(unavailable.deadline) : "—"}.</p>
          </div>
        </div>
      ) : null}
      {change && change.status === "pending_payment" ? (
        <div role="status" className="rounded-mo border border-mo bg-mo-sunken p-4" aria-label="Change of professional waiting for payment">
          <p className="font-semibold text-mo-ink">Change of professional waiting for payment</p>
          <p className="text-sm text-mo-ink">{pendingChangeMessage(change)}</p>
          <div className="mt-2">
            <Details
              items={[
                ["New professional", <span key="np">{change.proFirstName ?? "—"} <IdText id={change.proId} /></span>],
                ["When", change.asap ? "As soon as possible" : `${when(change.slotStart)} – ${when(change.slotEnd)}`],
                ["Total", `${paise(change.previousTotalPaise)} → ${paise(change.newTotalPaise)} (${changeDifferenceLabel(change.differencePaise)})`],
                ["Hold until", when(change.holdExpiresAt)],
                ["Payment", change.paymentStatus ? <StatusPill key="ps" value={change.paymentStatus} tone={change.paymentStatus === "succeeded" ? "good" : change.paymentStatus === "failed" ? "bad" : "warn"} /> : "No payment started"],
              ]}
            />
          </div>
        </div>
      ) : null}
      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Booking detail">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">{str(b.service_name) ?? "Booking"}</h3>
          <StatusPill value={status} tone={bookingTone(status)} />
        </div>
        <Details
          items={[
            ["Booking", <IdText key="b" id={b.id} />],
            ["Customer", <IdText key="c" id={view.customerUserId} />],
            ["Category", humanise(b.category_slug)],
            ["City · zone", <span key="z">{str(b.city_code) ?? "—"} · <IdText id={b.zone_id} /></span>],
            ["Locality", address ? `${str(address.locality) ?? "—"} ${str(address.pincode) ?? ""}`.trim() : null],
            ["Slot", `${when(b.slot_start)} – ${when(b.slot_end)} (${num(b.duration_minutes) ?? "—"} min)`],
            ["Booked for", b.asap === true ? "As soon as possible (same day)" : "A chosen time"],
            ["Woman professional required", b.require_female_pro === true ? "Yes" : "No"],
            ["Professional", pro ? `${str(pro.first_name) ?? "—"} · ${num(pro.jobs_completed) ?? 0} jobs` : "Not assigned"],
            ["Slot reserved for", view.reservedProId ? <IdText key="r" id={view.reservedProId} /> : "No professional reserved"],
            [
              "Not offered to the customer again",
              view.excludedProIds.length > 0 ? (
                <span key="x" className="inline-flex flex-wrap gap-2">
                  {view.excludedProIds.map((x) => (
                    <IdText key={x} id={x} />
                  ))}
                </span>
              ) : (
                "Nobody"
              ),
            ],
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
            <button type="button" className={buttonSecondary} onClick={openRedispatch}>
              {DOORSTEP_WRITES["booking.redispatch"].label}
            </button>
          ) : null}
          {mayWrite("booking.cancel") && canCancelBooking(status) ? (
            <button type="button" className={buttonDanger} onClick={openCancel}>
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
      <DataTable
        caption="Changes of professional (the customer's picks)"
        rows={view.proChanges.map((c, i) => ({ ...c, key: c.id ?? `change-${i}` }))}
        columns={[
          { key: "when", header: "Picked", value: (r) => str(r.createdAt), cell: (r) => when(r.createdAt) },
          { key: "pro", header: "Professional", value: (r) => str(r.proFirstName), cell: (r) => <span>{str(r.proFirstName) ?? "—"} <IdText id={r.proId} /></span> },
          { key: "slot", header: "When", value: (r) => str(r.slotStart), cell: (r) => (r.asap === true ? "As soon as possible" : when(r.slotStart)) },
          { key: "diff", header: "Difference", value: (r) => num(r.differencePaise), align: "right", cell: (r) => changeDifferenceLabel(num(r.differencePaise)) },
          { key: "refund", header: "Refunded", value: (r) => num(r.refundPaise), align: "right", cell: (r) => paise(r.refundPaise) },
          { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={PRO_CHANGE_STATUS_LABELS[str(r.status) ?? ""] ?? r.status} tone={proChangeTone(r.status)} /> },
        ]}
        rowId={(r) => String(r.key)}
        emptyMessage="The customer has not changed professional."
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
            { key: "cause", header: "Cause", value: (r) => str(r.cause), cell: (r) => refundCauseLabel(r.cause) },
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
        canConfirm={
          pending === "booking.refund" ? refundCheck?.ok === true : pending === "booking.cancel" ? feeCheck?.ok === true : pending === "booking.redispatch" ? excludeCheck?.ok === true : true
        }
        onConfirm={(reason) => {
          if (pending === "booking.refund") {
            if (refundCheck?.ok) mutation.mutate({ write: pending, target: { id }, body: refundBody(refundCheck.amountPaise, reason, payment) })
            return
          }
          if (pending === "booking.cancel") {
            if (feeCheck?.ok) mutation.mutate({ write: pending, target: { id }, body: cancelBody(reason, feeCheck.feePaise) })
            return
          }
          if (pending === "booking.redispatch") {
            if (excludeCheck?.ok) mutation.mutate({ write: pending, target: { id }, body: DECISION_BODIES.redispatch(reason, excludeCheck.ids) })
            return
          }
          if (pending) mutation.mutate({ write: pending, target: { id }, body: DECISION_BODIES.reason(reason) })
        }}
        onClose={() => setPending(null)}
      >
        {pending === "booking.redispatch" ? (
          <div className="space-y-3">
            <p className="text-sm text-mo-body">
              The booking moves to &ldquo;professional unavailable&rdquo; and the customer is offered the other approved professionals for the same service and options, with their prices and times. You cannot choose who gets the job.
            </p>
            <Field
              label="Also leave off the customer's list (optional)"
              hint={excludeCheck && !excludeCheck.ok ? <span className="text-mo-bad">{excludeCheck.problem}</span> : "Full professional ids, one per line. The current professional is always left off."}
            >
              {(fid) => <textarea id={fid} rows={3} className={inputClass} value={exclude} onChange={(e) => setExclude(e.target.value)} />}
            </Field>
          </div>
        ) : pending === "booking.refund" ? (
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
          <div className="space-y-3">
            <Field
              label="Fee to keep (₹, optional)"
              hint={feeCheck && !feeCheck.ok ? <span className="text-mo-bad">{feeCheck.problem}</span> : `Blank refunds everything refundable (${paise(cancelRoom)}).`}
            >
              {(fid) => <input id={fid} className={inputClass} inputMode="decimal" value={fee} placeholder="0" onChange={(e) => setFee(e.target.value)} />}
            </Field>
            <p className="text-sm text-mo-body">
              {feeCheck?.ok && feeCheck.feePaise !== null && feeCheck.feePaise > 0
                ? `The customer is refunded ${paise(cancelRoom - feeCheck.feePaise)} and ${paise(feeCheck.feePaise)} is kept as the fee; the professional’s slot is released.`
                : "The customer is refunded in full; the professional’s slot is released."}
            </p>
          </div>
        ) : null}
      </DoorstepActionDialog>
    </div>
  )
}
