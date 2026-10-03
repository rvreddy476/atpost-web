"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, inputClass } from "@/components/blocks/buttons"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isRecord, num, str, when, type Row } from "@/lib/admin/data"
import { DOORSTEP_PAGE, DOORSTEP_READS, paise } from "@/lib/admin/doorstep"

/**
 * Money: settlements as doorstep-service computes them per professional and
 * period. Read only: payouts are off (like Feast), so nothing here pays
 * anyone. Refunds are issued from a booking's detail.
 */
export function DoorstepMoney() {
  const [periodStart, setPeriodStart] = useState("")
  const list = useAdminList("doorstep", DOORSTEP_READS.settlements(periodStart))
  const columns: DataColumn<Row>[] = [
    { key: "pro", header: "Professional", value: (r) => str(r.pro_id), filterable: true, cell: (r) => <IdText id={r.pro_id} /> },
    { key: "period", header: "Period", value: (r) => str(r.period_start), sortable: true, cell: (r) => `${str(r.period_start) ?? "—"} – ${str(r.period_end) ?? "—"}` },
    { key: "gross", header: "Gross", value: (r) => num(r.gross_paise), sortable: true, align: "right", cell: (r) => paise(r.gross_paise) },
    { key: "commission", header: "Commission", value: (r) => num(r.commission_paise), align: "right", cell: (r) => paise(r.commission_paise) },
    { key: "tax", header: "Tax", value: (r) => num(r.tax_paise), align: "right", cell: (r) => paise(r.tax_paise) },
    { key: "net", header: "Net to professional", value: (r) => num(r.net_paise), sortable: true, align: "right", cell: (r) => paise(r.net_paise) },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={str(r.status) === "paid" ? "good" : "normal"} /> },
  ]
  const total = list.data.reduce((sum, r) => sum + (num(r.net_paise) ?? 0), 0)
  return (
    <div className="space-y-3">
      <p className="rounded-mo border border-mo bg-mo-sunken p-3 text-sm text-mo-body">Payouts are off. Settlements are computed only; no money leaves the platform from here.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Period starting">{(id) => <input id={id} type="date" className={inputClass} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />}</Field>
        </div>
        {list.data.length > 0 ? <p className="text-sm text-mo-body">Net across these rows: <strong className="text-mo-ink">{paise(total)}</strong></p> : null}
      </div>
      <DataTable caption="Settlements" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No settlements computed for this period." pageSize={DOORSTEP_PAGE} />
    </div>
  )
}

/** doorstep-service's own audit trail of every admin write, newest first, by entity. */
export function DoorstepAudit() {
  const [draft, setDraft] = useState("")
  const [entity, setEntity] = useState("")
  const list = useAdminList("doorstep", DOORSTEP_READS.audit(entity, 100))
  const columns: DataColumn<Row>[] = [
    { key: "when", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "admin", header: "Admin", value: (r) => str(r.actor_user_id), cell: (r) => <IdText id={r.actor_user_id} /> },
    { key: "action", header: "Action", value: (r) => str(r.action), sortable: true, filterable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.action)}</span> },
    { key: "permission", header: "Permission", value: (r) => str(r.permission), cell: (r) => <span className="font-mo-mono text-xs">{str(r.permission)}</span> },
    { key: "entity", header: "Entity", value: (r) => str(r.entity), cell: (r) => <span>{humanise(r.entity)} {str(r.entity_id) ? <IdText id={r.entity_id} /> : null}</span> },
    {
      key: "details",
      header: "Details",
      value: (r) => (isRecord(r.details) ? JSON.stringify(r.details) : null),
      cell: (r) => (isRecord(r.details) ? <span className="font-mo-mono text-xs">{Object.entries(r.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</span> : "—"),
    },
  ]
  return (
    <>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Audit filters"
        onSubmit={(e) => {
          e.preventDefault()
          setEntity(draft.trim())
        }}
      >
        <div className="w-64">
          <Field label="Entity" hint="e.g. city_price, professional, booking">{(id) => <input id={id} className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} />}</Field>
        </div>
        <button type="submit" className={buttonPrimary}>
          Apply
        </button>
      </form>
      <DataTable caption="Doorstep audit" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No audit rows match." pageSize={DOORSTEP_PAGE} />
    </>
  )
}
