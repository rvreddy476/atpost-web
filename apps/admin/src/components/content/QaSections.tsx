"use client"

import { useState } from "react"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, LookupForm, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { QA, QA_MAX_REASON_LENGTH, QA_WRITES, type QaWrite } from "@/lib/admin/content"
import { humanise, isUuid, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"

export const QA_KEY = adminKey("qa")
const LIMIT = 50
const validateUuid = (v: string) => (isUuid(v) ? null : "Enter a full id (a UUID).")

/** Every Q&A write: POST <url> {reason, ...}. The reason is checked by the dialog before this runs. */
function useQaWrite(successMessage: string, onDone: () => void) {
  return useAdminMutation<{ url: string; body: Record<string, unknown> }>({
    request: ({ url, body }) => ({ method: "post", url, body }),
    invalidate: [QA_KEY],
    successMessage,
    errorTitle: "Q&A action failed",
    onDone,
  })
}

const reasonNote = `A reason is required on every Q&A action (up to ${QA_MAX_REASON_LENGTH.toLocaleString("en-IN")} characters); it is stored with the action.`

/** Reports on questions, answers and comments, by status. Resolve or dismiss with a reason. */
export function QaReports() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("pending")
  const [offset, setOffset] = useState(0)
  const [viewing, setViewing] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const list = useAdminList("qa", `${QA}/reports?status=${status}&limit=${LIMIT}&offset=${offset}`)
  const detail = useAdminObject("qa", `${QA}/reports/${encodeURIComponent(viewing ?? "")}`, { enabled: viewing !== null })
  const decide = useQaWrite("Report decided", () => setDeciding(null))

  const columns: DataColumn<Row>[] = [
    { key: "target", header: "Target", value: (r) => str(r.target_type), filterable: true, cell: (r) => <span>{humanise(r.target_type)} <IdText id={r.target_id} /></span> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true, cell: (r) => humanise(r.reason) },
    { key: "details", header: "Details", value: (r) => str(r.details) },
    { key: "reporter", header: "Reporter", value: (r) => str(r.reporter_id), cell: (r) => <IdText id={r.reporter_id} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "pending" ? "warn" : "normal"} /> },
    { key: "created", header: "Filed", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={buttonGhost} onClick={() => setViewing(String(r.id))} aria-label={`View report ${str(r.id)}`}>
            View
          </button>
          {can(me, "qa", "reports.act") && r.status === "pending" ? (
            <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide report ${str(r.id)}`}>
              Decide
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
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
              {["pending", "reviewed", "resolved", "dismissed"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Q&A reports" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage={`No ${status} reports.`} pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
      {viewing ? (
        <section aria-label="Report detail" className="mt-4 rounded-mo border border-mo bg-mo-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold text-mo-ink">Report {viewing}</h3>
            <button type="button" className={buttonGhost} onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
          {detail.isLoading ? (
            <p className="text-sm text-mo-body">Loading…</p>
          ) : detail.error ? (
            <p role="alert" className="text-sm text-mo-bad">
              {detail.error}
            </p>
          ) : detail.data ? (
            <Details
              items={[
                ["Target", `${humanise(detail.data.target_type)} ${str(detail.data.target_id) ?? ""}`],
                ["Reason", humanise(detail.data.reason)],
                ["Details", str(detail.data.details) ?? "—"],
                ["Reporter", str(detail.data.reporter_id) ?? "—"],
                ["Status", humanise(detail.data.status)],
                ["Reviewed by", str(detail.data.reviewed_by) ?? "—"],
                ["Resolved", when(detail.data.resolved_at)],
                ["Filed", when(detail.data.created_at)],
              ]}
            />
          ) : null}
        </section>
      ) : null}
      <ChoiceDialog
        open={deciding !== null}
        title="Decide this report"
        description={deciding ? `${humanise(deciding.target_type)} ${str(deciding.target_id)}, reported for ${humanise(deciding.reason).toLowerCase()}. ${reasonNote}` : null}
        choiceLabel="Decision"
        choices={[
          { value: "resolve", label: "Resolve", hint: QA_WRITES["report.resolve"].explain },
          { value: "dismiss", label: "Dismiss", hint: QA_WRITES["report.dismiss"].explain },
        ]}
        requireReason
        maxReasonLength={QA_MAX_REASON_LENGTH}
        busy={decide.isPending}
        onConfirm={(choice, reason) => deciding && decide.mutate({ url: `${QA}/reports/${encodeURIComponent(String(deciding.id))}/${choice}`, body: { reason } })}
        onClose={() => setDeciding(null)}
      />
    </>
  )
}

type QuestionWrite = Extract<QaWrite, `question.${string}`>
const QUESTION_WRITES: QuestionWrite[] = ["question.hide", "question.lock", "question.duplicate", "question.merge"]

/** Hide, lock, mark duplicate or merge a question found by id. Merge needs a fresh 2FA code. */
export function QaQuestions() {
  const { me } = useAdmin()
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [write, setWrite] = useState<QuestionWrite | null>(null)
  const [otherId, setOtherId] = useState("")
  const [reportId, setReportId] = useState("")
  const run = useQaWrite("Question updated", () => {
    setWrite(null)
    setOtherId("")
    setReportId("")
  })
  const allowed = QUESTION_WRITES.filter((w) => can(me, "qa", QA_WRITES[w].permission))
  const def = write ? QA_WRITES[write] : null
  const needsOther = write === "question.duplicate" || write === "question.merge"
  const otherOk = !needsOther || isUuid(otherId)
  const reportOk = reportId.trim() === "" || isUuid(reportId)

  return (
    <section>
      <LookupForm label="Question id" placeholder="00000000-0000-0000-0000-000000000000" button="Select question" validate={validateUuid} onSubmit={setQuestionId} />
      {questionId ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <p className="mb-1 text-sm text-mo-ink">
            Question <span className="font-mo-mono">{questionId}</span>
          </p>
          <p className="mb-3 text-xs text-mo-body">{reasonNote}</p>
          <div className="flex flex-wrap gap-2">
            {allowed.map((w) => (
              <button key={w} type="button" className={QA_WRITES[w].destructive ? buttonDanger : buttonSecondary} onClick={() => setWrite(w)}>
                {QA_WRITES[w].label}
              </button>
            ))}
            {allowed.length === 0 ? <p className="text-sm text-mo-body">Your roles allow no question actions.</p> : null}
          </div>
        </div>
      ) : null}
      <ConfirmReasonDialog
        open={write !== null}
        title={def ? `${def.label}?` : ""}
        description={def ? `${def.explain}${def.stepUp ? " Needs a fresh 2FA code." : ""} ${reasonNote}` : null}
        confirmLabel={def?.label ?? "Confirm"}
        destructive={def?.destructive ?? false}
        requireReason
        maxReasonLength={QA_MAX_REASON_LENGTH}
        canConfirm={otherOk && reportOk}
        busy={run.isPending}
        onConfirm={(reason) => {
          if (!write || !questionId) return
          const body: Record<string, unknown> = { reason }
          if (write === "question.duplicate") body.duplicate_of_id = otherId.trim()
          if (write === "question.merge") body.merge_into_id = otherId.trim()
          if (reportId.trim()) body.report_id = reportId.trim()
          run.mutate({ url: `${QA}/questions/${encodeURIComponent(questionId)}/${write.slice("question.".length)}`, body })
        }}
        onClose={() => setWrite(null)}
      >
        {needsOther ? (
          <Field label={write === "question.merge" ? "Merge into question id" : "Original question id"} hint={otherId && !isUuid(otherId) ? "Enter a full question id (a UUID)." : undefined}>
            {(id) => <input id={id} className={inputClass} value={otherId} onChange={(e) => setOtherId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />}
          </Field>
        ) : null}
        <Field label="Report id (optional)" hint={reportId && !isUuid(reportId) ? "Enter a full report id (a UUID)." : "Links this action to the report it answers."}>
          {(id) => <input id={id} className={inputClass} value={reportId} onChange={(e) => setReportId(e.target.value)} />}
        </Field>
      </ConfirmReasonDialog>
    </section>
  )
}

/** Hide an answer or a comment found by id. */
export function QaHide({ kind }: { kind: "answers" | "comments" }) {
  const write: QaWrite = kind === "answers" ? "answer.hide" : "comment.hide"
  const def = QA_WRITES[write]
  const noun = kind === "answers" ? "Answer" : "Comment"
  const [targetId, setTargetId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [reportId, setReportId] = useState("")
  const run = useQaWrite(`${noun} hidden`, () => {
    setOpen(false)
    setReportId("")
  })

  return (
    <section>
      <LookupForm label={`${noun} id`} placeholder="00000000-0000-0000-0000-000000000000" button={`Select ${noun.toLowerCase()}`} validate={validateUuid} onSubmit={setTargetId} />
      {targetId ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <p className="mb-1 text-sm text-mo-ink">
            {noun} <span className="font-mo-mono">{targetId}</span>
          </p>
          <p className="mb-3 text-xs text-mo-body">{reasonNote}</p>
          <button type="button" className={buttonDanger} onClick={() => setOpen(true)}>
            {def.label}
          </button>
        </div>
      ) : null}
      <ConfirmReasonDialog
        open={open}
        title={`${def.label}?`}
        description={`${def.explain} ${reasonNote}`}
        confirmLabel={def.label}
        destructive
        requireReason
        maxReasonLength={QA_MAX_REASON_LENGTH}
        canConfirm={reportId.trim() === "" || isUuid(reportId)}
        busy={run.isPending}
        onConfirm={(reason) => targetId && run.mutate({ url: `${QA}/${kind}/${encodeURIComponent(targetId)}/hide`, body: { reason, ...(reportId.trim() ? { report_id: reportId.trim() } : {}) } })}
        onClose={() => setOpen(false)}
      >
        <Field label="Report id (optional)" hint="Links this action to the report it answers.">
          {(id) => <input id={id} className={inputClass} value={reportId} onChange={(e) => setReportId(e.target.value)} />}
        </Field>
      </ConfirmReasonDialog>
    </section>
  )
}

/** Moderation actions, newest first, filtered by target, actor or type. */
export function QaActions() {
  const [filters, setFilters] = useState({ target_id: "", actor_id: "", action_type: "" })
  const [applied, setApplied] = useState(filters)
  const [offset, setOffset] = useState(0)
  const query = Object.entries(applied)
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `&${k}=${encodeURIComponent(v.trim())}`)
    .join("")
  const list = useAdminList("qa", `${QA}/actions?limit=${LIMIT}&offset=${offset}${query}`)
  const idProblem = (v: string) => (v.trim() !== "" && !isUuid(v) ? "Enter a full id (a UUID)." : null)

  const columns: DataColumn<Row>[] = [
    { key: "created", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "type", header: "Action", value: (r) => str(r.action_type), filterable: true, cell: (r) => humanise(r.action_type) },
    { key: "target", header: "Target", value: (r) => str(r.target_type), cell: (r) => <span>{humanise(r.target_type)} <IdText id={r.target_id} /></span> },
    { key: "actor", header: "Admin", value: (r) => str(r.actor_id), cell: (r) => <IdText id={r.actor_id} /> },
    { key: "report", header: "Report", value: (r) => str(r.report_id), cell: (r) => (str(r.report_id) ? <IdText id={r.report_id} /> : "—") },
    { key: "reason", header: "Reason", value: (r) => str(r.reason) },
  ]

  return (
    <>
      <form
        className="mb-3 grid gap-2 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (idProblem(filters.target_id) || idProblem(filters.actor_id)) return
          setApplied(filters)
          setOffset(0)
        }}
      >
        <Field label="Target id" hint={idProblem(filters.target_id)}>
          {(id) => <input id={id} className={inputClass} value={filters.target_id} onChange={(e) => setFilters({ ...filters, target_id: e.target.value })} />}
        </Field>
        <Field label="Admin id" hint={idProblem(filters.actor_id)}>
          {(id) => <input id={id} className={inputClass} value={filters.actor_id} onChange={(e) => setFilters({ ...filters, actor_id: e.target.value })} />}
        </Field>
        <Field label="Action type">{(id) => <input id={id} className={inputClass} value={filters.action_type} placeholder="hide_question" onChange={(e) => setFilters({ ...filters, action_type: e.target.value })} />}</Field>
        <div className="flex items-end">
          <button type="submit" className={buttonSecondary}>
            Apply filters
          </button>
        </div>
      </form>
      <DataTable caption="Q&A moderation actions" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No actions recorded." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}
