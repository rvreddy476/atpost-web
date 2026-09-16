"use client"

import { useState } from "react"
import { PowerOff } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey } from "@/hooks/useAdminQuery"
import { humanise, isRecord, num, str, when, type Row } from "@/lib/admin/data"
import { MON } from "@/lib/admin/monetization"
import { formatPaise } from "@/lib/admin/money"
import { can } from "@/lib/admin/sections"
import { NotLaunchedNote, useMonetizationList } from "./MoneyBits"

export const MON_KEY = adminKey("monetization")
const LIMIT = 50

/** Fraud reviews waiting for a decision. Every decision needs a fresh 2FA code. */
export function FraudReviews() {
  const { me } = useAdmin()
  const [offset, setOffset] = useState(0)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const list = useMonetizationList(`${MON}/fraud-reviews?limit=${LIMIT}&offset=${offset}`)
  const decide = useAdminMutation<{ id: string; status: string; reason: string }>({
    request: ({ id, status, reason }) => ({ method: "patch", url: `${MON}/fraud-reviews/${encodeURIComponent(id)}`, body: { status, notes: reason } }),
    invalidate: [MON_KEY],
    successMessage: "Fraud review decided",
    errorTitle: "Fraud decision failed",
    onDone: () => setDeciding(null),
  })
  if (list.notLaunched) return <NotLaunchedNote />

  const columns: DataColumn<Row>[] = [
    { key: "creator", header: "Creator", value: (r) => str(r.creator_id), filterable: true, cell: (r) => <IdText id={r.creator_id} /> },
    { key: "type", header: "Type", value: (r) => str(r.review_type), sortable: true, cell: (r) => humanise(r.review_type) },
    { key: "risk", header: "Risk score", value: (r) => num(r.risk_score), sortable: true, align: "right" },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "investigating" ? "warn" : "normal"} /> },
    { key: "created", header: "Opened", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide fraud review ${str(r.id)}`}>
          Decide
        </button>
      ),
    },
  ]

  return (
    <>
      <DataTable caption="Fraud reviews" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No fraud reviews waiting." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
      {can(me, "monetization", "fraud.review") ? (
        <ChoiceDialog
          open={deciding !== null}
          title="Decide this fraud review"
          description={deciding ? `Creator ${str(deciding.creator_id)}, risk score ${num(deciding.risk_score) ?? "—"}. Deciding needs a fresh 2FA code.` : null}
          choiceLabel="Decision"
          choices={[
            { value: "investigating", label: "Investigating", hint: "Keeps the review open while you look into it." },
            { value: "cleared", label: "Cleared", hint: "No fraud found; the creator's earnings are not held by this review." },
            { value: "action_taken", label: "Action taken", hint: "Fraud confirmed. Freeze the wallet or suspend the creator separately.", destructive: true },
          ]}
          reasonLabel="Notes"
          requireReason
          busy={decide.isPending}
          onConfirm={(status, reason) => deciding && decide.mutate({ id: String(deciding.id), status, reason })}
          onClose={() => setDeciding(null)}
        />
      ) : null}
    </>
  )
}

/** Open and investigating disputes. Acting needs a fresh 2FA code. */
export function Disputes() {
  const { me } = useAdmin()
  const [offset, setOffset] = useState(0)
  const [acting, setActing] = useState<Row | null>(null)
  const list = useMonetizationList(`${MON}/disputes?limit=${LIMIT}&offset=${offset}`, { enabled: can(me, "monetization", "disputes.read") })
  const act = useAdminMutation<{ id: string; status: string; reason: string }>({
    request: ({ id, status, reason }) => ({
      method: "patch",
      url: `${MON}/disputes/${encodeURIComponent(id)}`,
      body: { status, resolution_notes: reason, reason },
    }),
    invalidate: [MON_KEY],
    successMessage: "Dispute updated",
    errorTitle: "Dispute action failed",
    onDone: () => setActing(null),
  })

  if (!can(me, "monetization", "disputes.read")) {
    return <p className="text-sm text-mo-body">Listing disputes needs the disputes read permission.</p>
  }
  if (list.notLaunched) return <NotLaunchedNote />

  const columns: DataColumn<Row>[] = [
    { key: "user", header: "User", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "txn", header: "Transaction", value: (r) => str(r.transaction_id), filterable: true, cell: (r) => <IdText id={r.transaction_id} /> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true, cell: (r) => humanise(r.reason) },
    { key: "desc", header: "Description", value: (r) => str(r.description) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "open" ? "warn" : "normal"} /> },
    { key: "created", header: "Opened", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        can(me, "monetization", "disputes.act") ? (
          <button type="button" className={buttonSecondary} onClick={() => setActing(r)} aria-label={`Act on dispute ${str(r.id)}`}>
            Act
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <DataTable caption="Disputes" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No open disputes." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
      <ChoiceDialog
        open={acting !== null}
        title="Act on this dispute"
        description={acting ? `Transaction ${str(acting.transaction_id)}. Needs a fresh 2FA code.` : null}
        choiceLabel="Outcome"
        choices={[
          { value: "investigating", label: "Investigating", hint: "Keeps the dispute open." },
          { value: "resolved_refund", label: "Resolved: refund", hint: "Closes the dispute in the user's favour. It moves no money: issue the refund from Refunds." },
          { value: "resolved_denied", label: "Resolved: denied", hint: "Closes the dispute with no refund.", destructive: true },
        ]}
        reasonLabel="Resolution notes"
        requireReason
        busy={act.isPending}
        onConfirm={(status, reason) => acting && act.mutate({ id: String(acting.id), status, reason })}
        onClose={() => setActing(null)}
      />
    </>
  )
}

/** Read-only. Payouts are switched off: nothing here approves or sends money. */
export function PayoutRequests() {
  const [status, setStatus] = useState("")
  const [offset, setOffset] = useState(0)
  const list = useMonetizationList(`${MON}/payout-requests?limit=${LIMIT}&offset=${offset}${status ? `&status=${status}` : ""}`)

  const columns: DataColumn<Row>[] = [
    { key: "user", header: "User", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "amount", header: "Amount", value: (r) => num(r.amount_paise), sortable: true, align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(num(r.amount_paise))}</span> },
    { key: "tds", header: "TDS", value: (r) => num(r.tds_paise), align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(num(r.tds_paise))}</span> },
    { key: "net", header: "Net", value: (r) => num(r.net_paise), align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(num(r.net_paise))}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "requested", header: "Requested", value: (r) => str(r.requested_at), sortable: true, cell: (r) => when(r.requested_at) },
  ]

  return (
    <>
      <p role="note" className="mb-4 flex items-center gap-2 rounded-mo border border-mo bg-mo-surface p-3 text-sm text-mo-ink">
        <PowerOff className="h-4 w-4 text-mo-body" aria-hidden="true" />
        Payouts are switched off. This queue is read-only: nothing here approves, submits or releases a payout.
      </p>
      {list.notLaunched ? (
        <NotLaunchedNote />
      ) : (
        <>
          <div className="mb-3 w-56">
            <Field label="Status">
              {(id) => (
                <select
                  id={id}
                  className={inputClass}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setOffset(0)
                  }}
                >
                  <option value="">All</option>
                  {["pending", "processing", "completed", "failed", "cancelled"].map((s) => (
                    <option key={s} value={s}>
                      {humanise(s)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <DataTable caption="Payout requests" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No payout requests." pageSize={LIMIT} />
          <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
        </>
      )}
    </>
  )
}

/** Monetization's own audit trail, newest first, paged by `before`. */
export function MonetizationAudit() {
  const [cursors, setCursors] = useState<string[]>([])
  const before = cursors.at(-1)
  const list = useMonetizationList(`${MON}/audit-logs?limit=${LIMIT}${before ? `&before=${encodeURIComponent(before)}` : ""}`)
  const meta = isRecord(list.raw) && isRecord(list.raw.meta) ? list.raw.meta : null
  const next = meta ? str(meta.next_cursor) : null
  if (list.notLaunched) return <NotLaunchedNote />

  const columns: DataColumn<Row>[] = [
    { key: "created", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "actor", header: "Admin", value: (r) => str(r.performer_id), cell: (r) => <IdText id={r.performer_id} /> },
    { key: "table", header: "Record", value: (r) => str(r.table_name), filterable: true, cell: (r) => humanise(r.table_name) },
    { key: "op", header: "Operation", value: (r) => str(r.operation), filterable: true, cell: (r) => humanise(r.operation) },
    { key: "change", header: "Fields", value: () => null, cell: (r) => (isRecord(r.new_data) ? Object.keys(r.new_data).map(humanise).join(", ") || "—" : "—") },
  ]

  return (
    <>
      <DataTable caption="Monetization audit" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No audit rows." pageSize={LIMIT} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={buttonSecondary} disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Newer rows
        </button>
        <button type="button" className={buttonSecondary} disabled={!next} onClick={() => next && setCursors((c) => [...c, next])}>
          Older rows
        </button>
      </div>
    </>
  )
}
