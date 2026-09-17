"use client"

import { useReducer, useState } from "react"
import { Eye, EyeOff, Lock, RefreshCw } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useStepUpRead } from "@/hooks/useAdminMutation"
import { useAdminList } from "@/hooks/useAdminQuery"
import { bool, humanise, num, str, when, type Row } from "@/lib/admin/data"
import { adminErrorMessage } from "@/lib/admin/mutation"
import {
  DOCUMENT_STATUSES,
  PAYMENT_STATUSES,
  RIDER,
  RIDER_PAGE,
  RIDER_REVEALS,
  RIDER_WRITES,
  VEHICLE_STATUSES,
  readDocuments,
  reviewTone,
  riderListQuery,
  rupees,
  type RiderWrite,
} from "@/lib/admin/rider"
import { initialReveal, isBlurred, revealReducer } from "@/lib/blocks/reveal"
import { can } from "@/lib/admin/sections"
import { RiderActionDialog, StatusFilter, useRiderMutation } from "./RiderBits"

type Pending = { write: RiderWrite; row: Row } | null

const FileLink = ({ url, label = "Open file" }: { url: unknown; label?: string }) => {
  const href = str(url)
  if (!href || !/^https?:\/\//i.test(href)) return <span>—</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-mo-cyan underline">
      {label}
    </a>
  )
}

/**
 * Documents. The list itself is a KYC reveal: every row carries the
 * document number in the clear, so it stays hidden until the admin asks,
 * the read is audited and needs a fresh 2FA code. Changing the status filter
 * hides it again — a new filter is a new audited read. Verify and reject
 * are step-up too.
 */
export function RiderDocuments() {
  const { me } = useAdmin()
  const read = useStepUpRead()
  const [status, setStatus] = useState("pending")
  const [state, dispatch] = useReducer(revealReducer, true, initialReveal)
  const [rows, setRows] = useState<Row[]>([])
  const [pending, setPending] = useState<Pending>(null)
  const mayReview = can(me, "rider", RIDER_REVEALS.documents.permission)

  const path = RIDER_REVEALS.documents.path(status)

  const reveal = async () => {
    if (state.status === "revealing") return
    dispatch({ type: "request" })
    try {
      const raw = await read(path)
      if (raw === null) {
        dispatch({ type: "resolved", revealed: false })
        return
      }
      setRows(readDocuments(raw))
      dispatch({ type: "resolved", revealed: true })
    } catch (err) {
      dispatch({ type: "failed", error: adminErrorMessage(err, "The documents could not be revealed.") })
    }
  }

  const hide = () => {
    setRows([])
    dispatch({ type: "hide" })
  }

  // After a decision: read again inside the step-up window (no second prompt).
  const refresh = async () => {
    try {
      const raw = await read(path)
      if (raw !== null) setRows(readDocuments(raw))
    } catch {
      /* the stale row stays until the admin hides and reveals again */
    }
  }

  const mutation = useRiderMutation({
    onDone: () => {
      setPending(null)
      void refresh()
    },
  })

  if (!mayReview) return <p className="text-sm text-mo-body">Reviewing documents needs the documents review permission.</p>

  const columns: DataColumn<Row>[] = [
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), filterable: true, cell: (r) => <IdText id={r.partner_id} /> },
    { key: "type", header: "Document", value: (r) => str(r.document_type), sortable: true, cell: (r) => humanise(r.document_type) },
    { key: "number", header: "Number", value: (r) => str(r.document_number), cell: (r) => <span className="font-mo-mono text-xs" data-document-number>{str(r.document_number) ?? "—"}</span> },
    { key: "file", header: "File", value: () => null, cell: (r) => <FileLink url={r.file_url} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
    { key: "expires", header: "Expires", value: (r) => str(r.expires_at), sortable: true, cell: (r) => when(r.expires_at) },
    { key: "uploaded", header: "Uploaded", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        r.status === "pending" ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "document.verify", row: r })} aria-label={`Verify document ${str(r.id)}`}>
              Verify
            </button>
            <button type="button" className={buttonDanger} onClick={() => setPending({ write: "document.reject", row: r })} aria-label={`Reject document ${str(r.id)}`}>
              Reject
            </button>
          </span>
        ) : (
          str(r.rejection_reason)
        ),
    },
  ]

  return (
    <>
      <div className="mb-3">
        <StatusFilter
          value={status}
          options={DOCUMENT_STATUSES}
          onChange={(v) => {
            setStatus(v)
            hide()
          }}
        />
      </div>
      {isBlurred(state) ? (
        <div className="rounded-mo border border-dashed border-mo-strong bg-mo-sunken p-6 text-center" data-blurred="true">
          <Lock className="mx-auto mb-2 h-6 w-6 text-mo-body" aria-hidden="true" />
          <p className="text-sm text-mo-ink">Partner documents</p>
          <p className="mb-3 text-xs text-mo-body">Each row carries the document number in the clear. Revealing the list is recorded in the audit trail and needs a fresh 2FA code.</p>
          <button type="button" className={buttonPrimary} onClick={() => void reveal()} disabled={state.status === "revealing"}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            {state.status === "revealing" ? "Revealing…" : "Reveal documents"}
          </button>
          {state.error ? (
            <p role="alert" className="mt-2 text-xs text-mo-bad">
              {state.error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3" data-blurred="false">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-mo-body">Revealed. This read was recorded in the audit trail.</p>
            <button type="button" className={buttonSecondary} onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </button>
            <button type="button" className={buttonSecondary} onClick={hide}>
              <EyeOff className="h-4 w-4" aria-hidden="true" /> Hide
            </button>
          </div>
          <DataTable caption="Partner documents" rows={rows} columns={columns} rowId={(r) => String(r.id)} emptyMessage={`No ${status ? humanise(status).toLowerCase() : ""} documents.`} pageSize={RIDER_PAGE} />
        </div>
      )}
      <RiderActionDialog
        write={pending?.write ?? null}
        subject={pending ? `this ${humanise(pending.row.document_type).toLowerCase()}` : null}
        busy={mutation.isPending}
        onConfirm={(reason) =>
          pending &&
          mutation.mutate({
            write: pending.write,
            url: `${RIDER}/documents/${encodeURIComponent(String(pending.row.id))}/${pending.write === "document.verify" ? "verify" : "reject"}`,
            body: RIDER_WRITES[pending.write].reason ? { reason } : {},
          })
        }
        onClose={() => setPending(null)}
      />
    </>
  )
}

/** Vehicles awaiting verification. Verify and reject need no 2FA code; reject needs a reason. */
export function RiderVehicles() {
  const [status, setStatus] = useState("pending")
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<Pending>(null)
  const list = useAdminList("rider", `${RIDER}/vehicles?${riderListQuery({ status }, offset)}`)
  const mutation = useRiderMutation({ onDone: () => setPending(null) })

  const columns: DataColumn<Row>[] = [
    { key: "reg", header: "Registration", value: (r) => str(r.registration_number), filterable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.registration_number) ?? "—"}</span> },
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), filterable: true, cell: (r) => <IdText id={r.partner_id} /> },
    { key: "type", header: "Type", value: (r) => str(r.vehicle_type), sortable: true, cell: (r) => humanise(r.vehicle_type) },
    { key: "vehicle", header: "Vehicle", value: (r) => [str(r.brand), str(r.model), str(r.color)].filter(Boolean).join(" ") || null, cell: (r) => [str(r.brand), str(r.model), str(r.color), num(r.manufacture_year)].filter(Boolean).join(" ") || "—" },
    { key: "fuel", header: "Fuel", value: (r) => str(r.fuel_type), cell: (r) => (bool(r.is_ev) ? "EV" : humanise(r.fuel_type)) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
    { key: "added", header: "Added", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        r.status === "pending" ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "vehicle.verify", row: r })} aria-label={`Verify vehicle ${str(r.id)}`}>
              Verify
            </button>
            <button type="button" className={buttonDanger} onClick={() => setPending({ write: "vehicle.reject", row: r })} aria-label={`Reject vehicle ${str(r.id)}`}>
              Reject
            </button>
          </span>
        ) : null,
    },
  ]

  return (
    <>
      <div className="mb-3">
        <StatusFilter value={status} options={VEHICLE_STATUSES} onChange={(v) => { setStatus(v); setOffset(0) }} />
      </div>
      <DataTable caption="Vehicles" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No vehicles with this status." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
      <RiderActionDialog
        write={pending?.write ?? null}
        subject={pending ? `vehicle ${str(pending.row.registration_number) ?? ""}` : null}
        busy={mutation.isPending}
        onConfirm={(reason) =>
          pending &&
          mutation.mutate({
            write: pending.write,
            url: `${RIDER}/vehicles/${encodeURIComponent(String(pending.row.id))}/${pending.write === "vehicle.verify" ? "verify" : "reject"}`,
            body: RIDER_WRITES[pending.write].reason ? { reason } : {},
          })
        }
        onClose={() => setPending(null)}
      />
    </>
  )
}

/**
 * Subscription payments. Verify (payments.settle) confirms the money was
 * received and activates the plan; reject (payments.reject) refuses the
 * proof. Both need a fresh 2FA code. Nothing is paid out, so no two-person.
 */
export function RiderPayments() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("submitted")
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<Pending>(null)
  const list = useAdminList("rider", `${RIDER}/payments?${riderListQuery({ status }, offset)}`)
  const mutation = useRiderMutation({ onDone: () => setPending(null) })
  const mayVerify = can(me, "rider", RIDER_WRITES["payment.verify"].permission)
  const mayReject = can(me, "rider", RIDER_WRITES["payment.reject"].permission)

  const columns: DataColumn<Row>[] = [
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), filterable: true, cell: (r) => <IdText id={r.partner_id} /> },
    { key: "plan", header: "Plan", value: (r) => str(r.plan_id), cell: (r) => <IdText id={r.plan_id} /> },
    { key: "amount", header: "Amount", value: (r) => num(r.amount), sortable: true, align: "right", cell: (r) => rupees(r.amount) },
    { key: "method", header: "Method", value: (r) => str(r.payment_method), cell: (r) => humanise(r.payment_method) },
    { key: "reference", header: "Reference", value: (r) => str(r.payment_reference), filterable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.payment_reference) ?? "—"}</span> },
    { key: "proof", header: "Proof", value: () => null, cell: (r) => <FileLink url={r.payment_proof_url} label="Open proof" /> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
    { key: "created", header: "Submitted", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        r.status === "pending" || r.status === "submitted" ? (
          <span className="inline-flex gap-1">
            {mayVerify ? (
              <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "payment.verify", row: r })} aria-label={`Verify payment ${str(r.id)}`}>
                Verify
              </button>
            ) : null}
            {mayReject ? (
              <button type="button" className={buttonDanger} onClick={() => setPending({ write: "payment.reject", row: r })} aria-label={`Reject payment ${str(r.id)}`}>
                Reject
              </button>
            ) : null}
          </span>
        ) : (
          str(r.rejection_reason)
        ),
    },
  ]

  return (
    <>
      <div className="mb-3">
        <StatusFilter value={status} options={PAYMENT_STATUSES} onChange={(v) => { setStatus(v); setOffset(0) }} />
      </div>
      <DataTable caption="Subscription payments" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No payments with this status." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
      <RiderActionDialog
        write={pending?.write ?? null}
        subject={pending ? `of ${rupees(pending.row.amount)}` : null}
        busy={mutation.isPending}
        onConfirm={(reason) =>
          pending &&
          mutation.mutate({
            write: pending.write,
            url: `${RIDER}/payments/${encodeURIComponent(String(pending.row.id))}/${pending.write === "payment.verify" ? "verify" : "reject"}`,
            body: RIDER_WRITES[pending.write].reason ? { reason } : {},
          })
        }
        onClose={() => setPending(null)}
      />
    </>
  )
}
