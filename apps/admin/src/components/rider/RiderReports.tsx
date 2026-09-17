"use client"

import { useMemo, useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, OffsetPager } from "@/components/blocks/bits"
import { buttonPrimary, inputClass } from "@/components/blocks/buttons"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import { EMPTY_REPORT_FILTER, RIDER, RIDER_PAGE, RIDER_REPORTS, reportCell, reportTable, riderAuditQuery, riderReportUrl, type RiderReportFilter } from "@/lib/admin/rider"

/**
 * The nine rider-service reports. Each answers `{rows: [...]}` with its own
 * columns, so the table is built from the keys in the answer; the filters
 * offered are the ones that report takes.
 */
export function RiderReports() {
  const [reportId, setReportId] = useState(RIDER_REPORTS[0].id)
  const [draft, setDraft] = useState<RiderReportFilter>(EMPTY_REPORT_FILTER)
  const [url, setUrl] = useState<string | null>(null)
  const def = RIDER_REPORTS.find((r) => r.id === reportId) ?? RIDER_REPORTS[0]
  const report = useAdminObject("rider", url ?? "", { enabled: url !== null })
  const table = useMemo(() => reportTable(report.raw), [report.raw])
  const columns = useMemo<DataColumn<Row>[]>(
    () =>
      table.columns.map((key) => ({
        key,
        header: humanise(key),
        value: (r) => (typeof r[key] === "number" ? (r[key] as number) : reportCell(r[key])),
        sortable: true,
        align: typeof table.rows[0]?.[key] === "number" ? "right" : "left",
        cell: (r) => reportCell(r[key]),
      })),
    [table],
  )
  const set = (key: keyof RiderReportFilter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [key]: e.target.value })

  return (
    <>
      <form
        className="mb-4 grid gap-3 rounded-mo border border-mo bg-mo-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Report filters"
        onSubmit={(e) => {
          e.preventDefault()
          setUrl(riderReportUrl(def, draft))
        }}
      >
        <Field label="Report" hint={def.explain}>
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={reportId}
              onChange={(e) => {
                setReportId(e.target.value)
                setUrl(null)
              }}
            >
              {RIDER_REPORTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {def.params.includes("window") ? (
          <>
            <Field label="From (India time)">{(id) => <input id={id} type="date" className={inputClass} value={draft.from} onChange={set("from")} />}</Field>
            <Field label="To (India time)">{(id) => <input id={id} type="date" className={inputClass} value={draft.to} onChange={set("to")} />}</Field>
          </>
        ) : null}
        {def.params.includes("by") ? (
          <Field label="Group by">
            {(id) => (
              <select id={id} className={inputClass} value={draft.by} onChange={set("by")}>
                <option value="plan">Plan</option>
                <option value="month">Month</option>
              </select>
            )}
          </Field>
        ) : null}
        {def.params.includes("cohort_month") ? <Field label="Cohort month">{(id) => <input id={id} type="month" className={inputClass} value={draft.cohort_month} onChange={set("cohort_month")} />}</Field> : null}
        {def.params.includes("job") ? <Field label="Job">{(id) => <input id={id} className={inputClass} value={draft.job} placeholder="All jobs" onChange={set("job")} />}</Field> : null}
        {def.params.includes("city") ? <Field label="City">{(id) => <input id={id} className={inputClass} value={draft.city} placeholder="All cities" onChange={set("city")} />}</Field> : null}
        <div className="flex items-end">
          <button type="submit" className={buttonPrimary}>
            Run report
          </button>
        </div>
      </form>
      {url === null ? (
        <p className="text-sm text-mo-body">Choose a report and run it.</p>
      ) : (
        <DataTable caption={def.label} rows={table.rows} columns={columns} rowId={(r) => JSON.stringify(r)} loading={report.isLoading} error={report.error} onRetry={report.refetch} emptyMessage="The report has no rows for these filters." pageSize={RIDER_PAGE} />
      )}
    </>
  )
}

/** rider-service's own admin audit rows (admin ids only), filtered by action, entity, actor and date. */
export function RiderAudit() {
  const [draft, setDraft] = useState({ action: "", targetKind: "", actor: "", since: "" })
  const [applied, setApplied] = useState(draft)
  const [offset, setOffset] = useState(0)
  const list = useAdminList("rider", `${RIDER}/audit-logs?${riderAuditQuery(applied, offset)}`)
  const columns: DataColumn<Row>[] = [
    { key: "when", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "admin", header: "Admin", value: (r) => str(r.admin_user_id), cell: (r) => <IdText id={r.admin_user_id} /> },
    { key: "action", header: "Action", value: (r) => str(r.action), sortable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.action)}</span> },
    { key: "entity", header: "Entity", value: (r) => str(r.entity_type), cell: (r) => (str(r.entity_type) ? <span>{humanise(r.entity_type)} {str(r.entity_id) ? <IdText id={r.entity_id} /> : null}</span> : "—") },
    { key: "request", header: "Request", value: (r) => str(r.request_path), cell: (r) => (str(r.request_path) ? <span className="font-mo-mono text-xs">{str(r.request_method)} {str(r.request_path)}</span> : "—") },
    { key: "status", header: "HTTP", value: (r) => num(r.response_status), align: "right" },
  ]
  return (
    <>
      <form
        className="mb-4 grid gap-3 rounded-mo border border-mo bg-mo-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Audit filters"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(draft)
          setOffset(0)
        }}
      >
        <Field label="Action">{(id) => <input id={id} className={inputClass} value={draft.action} placeholder="e.g. partner.approve" onChange={(e) => setDraft({ ...draft, action: e.target.value })} />}</Field>
        <Field label="Entity kind">{(id) => <input id={id} className={inputClass} value={draft.targetKind} placeholder="e.g. partner" onChange={(e) => setDraft({ ...draft, targetKind: e.target.value })} />}</Field>
        <Field label="Admin id" hint={draft.actor && !isUuid(draft.actor) ? "Enter a full user id to filter." : undefined}>{(id) => <input id={id} className={inputClass} value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} />}</Field>
        <Field label="Since (India time)">{(id) => <input id={id} type="date" className={inputClass} value={draft.since} onChange={(e) => setDraft({ ...draft, since: e.target.value })} />}</Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonPrimary}>
            Apply filters
          </button>
        </div>
      </form>
      <DataTable caption="Mopedu audit" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No audit rows match." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
    </>
  )
}
