"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { humanise, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import { APPEAL_STATUSES, TRUST, appealNeedsStepUp, nextAppealStatuses, nextReportStatuses } from "@/lib/admin/trust"

const LIMIT = 50
const TRUST_KEY = adminKey("trust_safety")

/** Reports, most severe categories first (the server's order). */
export function TrustReports() {
  const { me } = useAdmin()
  const [offset, setOffset] = useState(0)
  const list = useAdminList("trust_safety", `${TRUST}/reports?limit=${LIMIT}&offset=${offset}`)
  const [acting, setActing] = useState<Row | null>(null)
  const mayAct = can(me, "trust_safety", "reports.act")

  const update = useAdminMutation<{ id: string; status: string; notes: string }>({
    request: ({ id, status, notes }) => ({
      method: "patch",
      url: `${TRUST}/reports/${encodeURIComponent(id)}`,
      body: { status, ...(notes ? { resolution_notes: notes } : {}) },
    }),
    invalidate: [TRUST_KEY],
    successMessage: "Report updated",
    errorTitle: "Report update failed",
    onDone: () => setActing(null),
  })

  const columns: DataColumn<Row>[] = [
    { key: "reason", header: "Reason", value: (r) => str(r.reason), sortable: true, filterable: true, cell: (r) => humanise(r.reason) },
    {
      key: "entity",
      header: "Reported item",
      value: (r) => `${str(r.entity_type) ?? ""} ${str(r.entity_id) ?? ""}`,
      filterable: true,
      cell: (r) => (
        <span>
          {humanise(r.entity_type)} <IdText id={r.entity_id} />
        </span>
      ),
    },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, filterable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "created", header: "Reported", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayAct && nextReportStatuses(r.status).length > 0 ? (
          <button type="button" className={buttonSecondary} onClick={() => setActing(r)} aria-label={`Update report ${str(r.id)}`}>
            Update
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <DataTable
        caption="Trust & safety reports"
        rows={list.data}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No reports."
        pageSize={LIMIT}
      />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
      <ChoiceDialog
        open={acting !== null}
        title="Update this report"
        description={acting ? `Currently ${humanise(acting.status)}.` : null}
        choiceLabel="New status"
        choices={nextReportStatuses(acting?.status).map((s) => ({ value: s, destructive: s === "dismissed" }))}
        reasonLabel="Resolution notes"
        busy={update.isPending}
        onConfirm={(status, notes) => acting && update.mutate({ id: String(acting.id), status, notes })}
        onClose={() => setActing(null)}
      />
    </>
  )
}

/** Appeals against enforcement. Overturning one needs a fresh 2FA code. */
export function TrustAppeals() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("open")
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ...(status ? { status } : {}) })
  const list = useAdminList("trust_safety", `${TRUST}/appeals?${query.toString()}`)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const mayAct = can(me, "trust_safety", "appeals.act")

  const decide = useAdminMutation<{ id: string; status: string; note: string }>({
    request: ({ id, status: next, note }) => ({
      method: "patch",
      url: `${TRUST}/appeals/${encodeURIComponent(id)}`,
      body: { status: next, note },
    }),
    invalidate: [TRUST_KEY],
    successMessage: "Appeal decided",
    errorTitle: "Appeal decision failed",
    onDone: () => setDeciding(null),
  })

  const columns: DataColumn<Row>[] = [
    { key: "content", header: "Content", value: (r) => str(r.content_type), filterable: true, cell: (r) => <span>{humanise(r.content_type)} <IdText id={r.content_id} /></span> },
    { key: "action", header: "Action taken", value: (r) => str(r.action_taken), sortable: true, cell: (r) => humanise(r.action_taken) },
    { key: "reason", header: "Appeal", value: (r) => str(r.appeal_reason), filterable: true, cell: (r) => <span className="line-clamp-2">{str(r.appeal_reason) ?? "—"}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "submitted", header: "Submitted", value: (r) => str(r.submitted_at), sortable: true, cell: (r) => when(r.submitted_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayAct && nextAppealStatuses(r.status).length > 0 ? (
          <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide appeal ${str(r.id)}`}>
            Decide
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <div className="mb-3 max-w-xs">
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
              {APPEAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable
        caption="Appeals"
        rows={list.data}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No appeals with this status."
        pageSize={LIMIT}
      />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
      <ChoiceDialog
        open={deciding !== null}
        title="Decide this appeal"
        description={deciding ? <>“{str(deciding.appeal_reason) ?? "No reason given"}”</> : null}
        choiceLabel="Outcome"
        choices={nextAppealStatuses(deciding?.status).map((s) => ({
          value: s,
          destructive: appealNeedsStepUp(s),
          hint: appealNeedsStepUp(s) ? "Overturning reverses the enforcement and needs a fresh 2FA code." : undefined,
        }))}
        reasonLabel="Note"
        busy={decide.isPending}
        onConfirm={(next, note) => deciding && decide.mutate({ id: String(deciding.id), status: next, note })}
        onClose={() => setDeciding(null)}
      />
    </>
  )
}
