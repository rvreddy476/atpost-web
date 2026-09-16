"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Details, ErrorNote, Field, IdText, Loading, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { humanise, isRecord, isUuid, readList, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import {
  GRIEVANCE_STATUSES,
  INITIAL_GRIEVANCE_FILTER,
  TRUST,
  grievanceDueState,
  grievanceListUrl,
  grievanceNeedsStepUp,
  nextGrievanceStatuses,
  type DueState,
  type GrievanceFilter,
} from "@/lib/admin/trust"

const LIMIT = 50
const TRUST_KEY = adminKey("trust_safety")

const DUE_TONE: Record<DueState, "bad" | "warn" | "good" | "normal"> = {
  overdue: "bad",
  due_soon: "warn",
  on_time: "good",
  closed: "normal",
  unknown: "normal",
}

function DueCell({ row }: { row: Row }) {
  const state = grievanceDueState(row, Date.now())
  return (
    <span className="flex flex-col gap-0.5">
      <span>{when(row.due_at)}</span>
      {state === "overdue" || state === "due_soon" ? <StatusPill value={state} tone={DUE_TONE[state]} /> : null}
    </span>
  )
}

/** Grievances under the IT Rules' 15-day window. Overdue ones first, by default. */
export function TrustGrievances() {
  const [filter, setFilter] = useState<GrievanceFilter>(INITIAL_GRIEVANCE_FILTER)
  const [offset, setOffset] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useAdminList("trust_safety", grievanceListUrl(filter, offset, LIMIT))

  if (openId) return <GrievanceDetail id={openId} onBack={() => setOpenId(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "subject", header: "Subject", value: (r) => str(r.subject), sortable: true, filterable: true, cell: (r) => humanise(r.subject) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "due", header: "Due", value: (r) => str(r.due_at), sortable: true, cell: (r) => <DueCell row={r} /> },
    { key: "assigned", header: "Officer", value: (r) => str(r.assigned_to), cell: (r) => (str(r.assigned_to) ? <IdText id={r.assigned_to} /> : "Unassigned") },
    { key: "created", header: "Filed", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpenId(String(r.id))} aria-label={`Open grievance ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-mo-ink">
          <input
            type="checkbox"
            className="accent-mo-cyan"
            checked={filter.overdueOnly}
            onChange={(e) => {
              setFilter({ ...filter, overdueOnly: e.target.checked })
              setOffset(0)
            }}
          />
          Overdue only
        </label>
        <div className="w-56">
          <Field label="Status">
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={filter.status}
                disabled={filter.overdueOnly}
                onChange={(e) => {
                  setFilter({ ...filter, status: e.target.value })
                  setOffset(0)
                }}
              >
                <option value="">All</option>
                {GRIEVANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </div>
      <DataTable
        caption="Grievances"
        rows={list.data}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage={filter.overdueOnly ? "No grievances are overdue." : "No grievances."}
        pageSize={LIMIT}
      />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}

function GrievanceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useAdmin()
  const mayAct = can(me, "trust_safety", "grievances.act")
  const history = useAdminObject("trust_safety", `${TRUST}/grievances/${encodeURIComponent(id)}/history`)
  const [closing, setClosing] = useState(false)
  const [handingOver, setHandingOver] = useState(false)
  const [assignee, setAssignee] = useState("")

  const update = useAdminMutation<{ body: Record<string, unknown> }>({
    request: ({ body }) => ({ method: "patch", url: `${TRUST}/grievances/${encodeURIComponent(id)}`, body }),
    invalidate: [TRUST_KEY],
    successMessage: "Grievance updated",
    errorTitle: "Grievance update failed",
    onDone: () => {
      setClosing(false)
      setHandingOver(false)
    },
  })

  if (history.isLoading) return <Loading what="Loading the grievance…" />
  if (history.error) return <ErrorNote message={history.error} onRetry={history.refetch} />
  const found = history.data?.grievance
  const grievance = isRecord(found) ? found : null
  const entries = readList(history.data, ["items"])
  if (!grievance) return <ErrorNote message="The grievance could not be read." onRetry={history.refetch} />

  const next = nextGrievanceStatuses(grievance.status)
  const due = grievanceDueState(grievance, Date.now())

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All grievances
      </button>
      <section className="rounded-mo border border-mo bg-mo-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">{humanise(grievance.subject)}</h3>
          <StatusPill value={grievance.status} />
          {due === "overdue" || due === "due_soon" ? <StatusPill value={due} tone={DUE_TONE[due]} /> : null}
        </div>
        <Details
          items={[
            ["Description", str(grievance.description)],
            ["Complainant", <IdText key="c" id={grievance.complainant_id} />],
            ["About", str(grievance.about_entity_type) ? <span key="a">{humanise(grievance.about_entity_type)} <IdText id={grievance.about_entity_id} /></span> : null],
            ["Due", when(grievance.due_at)],
            ["Officer", str(grievance.assigned_to) ? <IdText key="o" id={grievance.assigned_to} /> : "Unassigned"],
            ["Resolution notes", str(grievance.resolution_notes)],
            ["Filed", when(grievance.created_at)],
          ]}
        />
        {mayAct && next.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {next.includes("acknowledged") ? (
              <button type="button" className={buttonSecondary} disabled={update.isPending} onClick={() => update.mutate({ body: { status: "acknowledged" } })}>
                Acknowledge
              </button>
            ) : null}
            <button type="button" className={buttonPrimary} onClick={() => setClosing(true)}>
              Resolve or reject
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setHandingOver(true)}>
              Hand over
            </button>
          </div>
        ) : null}
      </section>

      <section aria-label="History">
        <h3 className="mb-2 text-sm font-semibold text-mo-ink">History</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-mo-body">No history recorded.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-mo pl-4">
            {entries.map((e) => (
              <li key={String(e.id ?? e.seq)} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-mo-strong bg-mo-surface" aria-hidden="true" />
                <div className="text-mo-ink">
                  {humanise(e.action)}
                  {str(e.new_status) ? ` → ${humanise(e.new_status)}` : ""}
                  {str(e.new_assignee) ? <> · handed to <IdText id={e.new_assignee} /></> : null}
                </div>
                <div className="text-xs text-mo-body">
                  {when(e.created_at)} · {str(e.actor_user_id) ? <IdText id={e.actor_user_id} /> : humanise(e.actor_service ?? e.actor_type)}
                </div>
                {str(e.new_resolution) || str(e.reason) ? <div className="text-xs text-mo-body">“{str(e.new_resolution) ?? str(e.reason)}”</div> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ChoiceDialog
        open={closing}
        title="Close this grievance"
        description="The complainant is told the outcome. Closing needs a fresh 2FA code."
        choiceLabel="Outcome"
        choices={next
          .filter(grievanceNeedsStepUp)
          .map((s) => ({ value: s, destructive: true, hint: "Needs a fresh 2FA code." }))}
        reasonLabel="Resolution notes"
        requireReason
        busy={update.isPending}
        onConfirm={(status, notes) => update.mutate({ body: { status, resolution_notes: notes } })}
        onClose={() => setClosing(false)}
      />
      <ConfirmReasonDialog
        open={handingOver}
        title="Hand over this grievance"
        description="Give it to another grievance officer. The hand-over is kept in the history."
        confirmLabel="Hand over"
        reasonLabel="Note (kept in the admin audit trail)"
        busy={update.isPending}
        canConfirm={isUuid(assignee)}
        onConfirm={() => update.mutate({ body: { assigned_to: assignee.trim() } })}
        onClose={() => setHandingOver(false)}
      >
        <Field label="Officer's user id" hint={assignee && !isUuid(assignee) ? "Enter the officer's user id (a UUID)." : undefined}>
          {(fid) => <input id={fid} className={inputClass} value={assignee} onChange={(e) => setAssignee(e.target.value)} />}
        </Field>
      </ConfirmReasonDialog>
    </div>
  )
}
