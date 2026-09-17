"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdminList } from "@/hooks/useAdminQuery"
import { ACCESS, ACCESS_PAGE, EMPTY_ACCESS_AUDIT, accessAuditProblem, accessAuditQuery, type AccessAuditFilter } from "@/lib/admin/access"
import { adminAppLabel, isAdminAppId } from "@/lib/admin/apps"
import { humanise, str, when, type Row } from "@/lib/admin/data"

const OUTCOME_TONE: Record<string, "good" | "bad" | "warn" | "normal"> = { success: "good", failure: "bad", denied: "bad", pending: "warn", rejected: "warn" }

/** Role grants, revocations and forced logouts: who did it (by id), to whom, why. Offset-paged. */
export function AccessAudit() {
  const [draft, setDraft] = useState<AccessAuditFilter>(EMPTY_ACCESS_AUDIT)
  const [applied, setApplied] = useState<AccessAuditFilter>(EMPTY_ACCESS_AUDIT)
  const [offset, setOffset] = useState(0)
  const page = useAdminList("platform", `${ACCESS}/audit?${accessAuditQuery(applied, offset)}`, { keys: ["items", "entries", "events"] })
  const problem = accessAuditProblem(draft)

  const columns: DataColumn<Row>[] = [
    { key: "when", header: "When", value: (r) => str(r.created_at) ?? str(r.at), sortable: true, cell: (r) => when(r.created_at ?? r.at) },
    { key: "actor", header: "Actor", value: (r) => str(r.actor) ?? str(r.actor_id), cell: (r) => <IdText id={r.actor ?? r.actor_id} /> },
    { key: "action", header: "Action", value: (r) => str(r.action) ?? str(r.operation), sortable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.action) ?? str(r.operation) ?? "—"}</span> },
    { key: "target", header: "Target user", value: (r) => str(r.target) ?? str(r.target_id) ?? str(r.target_user_id), cell: (r) => <IdText id={r.target ?? r.target_id ?? r.target_user_id} /> },
    { key: "role", header: "Role", value: (r) => str(r.role), cell: (r) => (str(r.role) ? humanise(r.role) : "—") },
    { key: "app", header: "Application", value: (r) => str(r.app), cell: (r) => (str(r.app) ? (isAdminAppId(r.app) ? adminAppLabel(r.app) : humanise(r.app)) : "Platform-wide") },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true, cell: (r) => str(r.reason) ?? "—" },
    { key: "outcome", header: "Outcome", value: (r) => str(r.outcome), cell: (r) => (str(r.outcome) ? <StatusPill value={r.outcome} tone={OUTCOME_TONE[String(r.outcome)] ?? "normal"} /> : "—") },
  ]

  const set = (key: keyof AccessAuditFilter) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value })

  return (
    <>
      <form
        className="mb-4 grid gap-3 rounded-mo border border-mo bg-mo-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Access audit filters"
        onSubmit={(e) => {
          e.preventDefault()
          if (problem) return
          setApplied(draft)
          setOffset(0)
        }}
      >
        <Field label="Actor id">{(id) => <input id={id} className={inputClass} value={draft.actor} placeholder="Who made the change" onChange={set("actor")} />}</Field>
        <Field label="Target user id">{(id) => <input id={id} className={inputClass} value={draft.target} placeholder="Whose roles changed" onChange={set("target")} />}</Field>
        <Field label="Action">{(id) => <input id={id} className={inputClass} value={draft.action} placeholder="e.g. role.grant" onChange={set("action")} />}</Field>
        <Field label="From (India time)">{(id) => <input id={id} type="date" className={inputClass} value={draft.from} onChange={set("from")} />}</Field>
        <Field label="To (India time)">{(id) => <input id={id} type="date" className={inputClass} value={draft.to} onChange={set("to")} />}</Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className={buttonPrimary} disabled={problem !== null}>
            Apply filters
          </button>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              setDraft(EMPTY_ACCESS_AUDIT)
              setApplied(EMPTY_ACCESS_AUDIT)
              setOffset(0)
            }}
          >
            Clear
          </button>
          {problem ? (
            <p role="alert" className="text-sm text-mo-bad">
              {problem}
            </p>
          ) : null}
        </div>
      </form>
      <DataTable caption="Access audit" rows={page.data} columns={columns} rowId={(r) => str(r.id) ?? JSON.stringify(r)} loading={page.isLoading} error={page.error} onRetry={page.refetch} emptyMessage="No access changes match these filters." pageSize={ACCESS_PAGE} />
      <OffsetPager offset={offset} limit={ACCESS_PAGE} count={page.data.length} onChange={setOffset} />
    </>
  )
}
