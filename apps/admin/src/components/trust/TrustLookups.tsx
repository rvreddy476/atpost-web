"use client"

import { useEffect, useRef, useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Field, IdText, LookupForm, OffsetPager, StatusPill, StepUpPrompt } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { StrikeOriginCell, StrikeSeverityCell, StrikeStateCell } from "@/components/trust/StrikeCells"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import {
  STRIKE_SEVERITIES,
  TRUST,
  canVoidStrike,
  checkIssueStrike,
  emptyIssueStrike,
  issueStrikeAttempt,
  issueStrikeBody,
  strikeIssueUrl,
  strikeVoidUrl,
  strikesUrl,
  voidStrikeBody,
  type IssueStrikeAttempt,
  type IssueStrikeForm,
} from "@/lib/admin/trust"

const uuidOnly = (v: string) => (isUuid(v) ? null : "Enter a user or media id (a UUID).")
const TRUST_KEY = adminKey("trust_safety")

/**
 * A user's strikes, looked up by user id. Issuing and voiding need
 * trust_safety:strikes.manage and a fresh 2FA code: admin-service answers
 * STEP_UP_REQUIRED, the mutation hook opens the OTP prompt and sends the same
 * request once more.
 */
export function TrustStrikes() {
  const { me } = useAdmin()
  const mayManage = can(me, "trust_safety", "strikes.manage")
  const [userId, setUserId] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [voiding, setVoiding] = useState<Row | null>(null)
  const list = useAdminList("trust_safety", strikesUrl(userId ?? ""), { enabled: !!userId })
  const now = Date.now()
  const columns: DataColumn<Row>[] = [
    { key: "severity", header: "Severity", value: (r) => str(r.severity), sortable: true, cell: (r) => <StrikeSeverityCell severity={r.severity} /> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true },
    { key: "content", header: "Content", value: (r) => str(r.content_id), cell: (r) => (str(r.content_id) ? <span>{str(r.content_type) ? `${humanise(r.content_type)} ` : ""}<IdText id={r.content_id} /></span> : "—") },
    { key: "origin", header: "Case / policy", value: (r) => str(r.case_id), cell: (r) => <StrikeOriginCell strike={r} /> },
    { key: "created", header: "Issued", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "state", header: "State", value: (r) => str(r.expires_at), sortable: true, cell: (r) => <StrikeStateCell strike={r} now={now} /> },
  ]
  if (mayManage) {
    columns.push({
      key: "void",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        canVoidStrike(r) ? (
          <button type="button" className={buttonDanger} onClick={() => setVoiding(r)} aria-label={`Void strike ${str(r.id)}`}>
            Void
          </button>
        ) : null,
    })
  }
  return (
    <>
      <LookupForm label="User id" placeholder="00000000-0000-0000-0000-000000000000" validate={uuidOnly} onSubmit={setUserId} />
      {userId ? (
        <>
          {mayManage ? (
            <div className="mb-3 flex justify-end">
              <button type="button" className={buttonPrimary} onClick={() => setIssuing(true)}>
                Issue strike
              </button>
            </div>
          ) : null}
          <DataTable
            caption="Strikes"
            rows={list.data}
            columns={columns}
            rowId={(r) => String(r.id)}
            loading={list.isLoading}
            error={list.error}
            onRetry={list.refetch}
            emptyMessage="This user has no active strikes."
          />
          <p className="mt-2 text-xs text-mo-body">Only strikes that still count are listed; voided and expired strikes stay on record.</p>
          <IssueStrikeDialog open={issuing} userId={userId} onClose={() => setIssuing(false)} />
          <VoidStrikeDialog userId={userId} strike={voiding} onClose={() => setVoiding(null)} />
        </>
      ) : (
        <p className="text-sm text-mo-body">Look a user up by their id to see their strikes.</p>
      )}
    </>
  )
}

/**
 * Issue a strike. One click mints one idempotency_key, kept across the
 * step-up retry and across "Issue strike" pressed again for the same form, so
 * a retried click can never issue twice (trust-safety replays it as 200).
 */
function IssueStrikeDialog({ open, userId, onClose }: { open: boolean; userId: string; onClose: () => void }) {
  const [form, setForm] = useState<IssueStrikeForm>(() => emptyIssueStrike(userId))
  const attempt = useRef<IssueStrikeAttempt | null>(null)
  useEffect(() => {
    if (open) {
      setForm(emptyIssueStrike(userId))
      attempt.current = null
    }
  }, [open, userId])

  const issue = useAdminMutation<{ form: IssueStrikeForm }>({
    request: ({ form: sent }) => {
      attempt.current = issueStrikeAttempt(sent, attempt.current)
      return { method: "post", url: strikeIssueUrl(), body: issueStrikeBody(sent, attempt.current.key) }
    },
    invalidate: [TRUST_KEY],
    successMessage: "Strike issued",
    errorTitle: "Strike not issued",
    onDone: () => {
      attempt.current = null
      onClose()
    },
  })

  const problem = checkIssueStrike(form)
  return (
    <ConfirmReasonDialog
      open={open}
      title="Issue a strike"
      description={
        <>
          For user <IdText id={userId} />. The user is told, and the strike counts against their standing until it expires or is voided. Issuing needs a fresh 2FA code.
        </>
      }
      confirmLabel="Issue strike"
      destructive
      busy={issue.isPending}
      canConfirm={!problem}
      onConfirm={(reason) => issue.mutate({ form: { ...form, reason } })}
      onClose={onClose}
    >
      <Field label="Severity" hint="Warnings never block; three strikes or one severe strike in 90 days suspend.">
        {(id) => (
          <select id={id} className={inputClass} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            {STRIKE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Content id (optional)" hint={form.contentId && problem ? problem : undefined}>
        {(id) => <input id={id} className={inputClass} value={form.contentId} placeholder="The post, comment or video the strike is for" onChange={(e) => setForm({ ...form, contentId: e.target.value })} />}
      </Field>
      <Field label="Content type (optional)">
        {(id) => <input id={id} className={inputClass} value={form.contentType} placeholder="post, comment, reel, video…" onChange={(e) => setForm({ ...form, contentType: e.target.value })} />}
      </Field>
    </ConfirmReasonDialog>
  )
}

/** Void a strike: it stays on record with the reason, and stops counting. */
function VoidStrikeDialog({ userId, strike, onClose }: { userId: string; strike: Row | null; onClose: () => void }) {
  const voidStrike = useAdminMutation<{ strikeId: string; reason: string }>({
    request: ({ strikeId, reason }) => ({ method: "post", url: strikeVoidUrl(userId), body: voidStrikeBody(strikeId, reason) }),
    invalidate: [TRUST_KEY],
    successMessage: "Strike voided",
    errorTitle: "Strike not voided",
    onDone: onClose,
  })
  return (
    <ConfirmReasonDialog
      open={!!strike}
      title="Void this strike"
      description={
        strike ? (
          <>
            {humanise(strike.severity)} issued {when(strike.created_at)}: “{str(strike.reason)}”. The strike stays on record with your reason and no longer counts. Voiding needs a fresh 2FA code.
          </>
        ) : null
      }
      confirmLabel="Void strike"
      destructive
      busy={voidStrike.isPending}
      onConfirm={(reason) => {
        if (strike) voidStrike.mutate({ strikeId: String(strike.id), reason })
      }}
      onClose={onClose}
    />
  )
}

/** Verification requests. Reading them shows submitted documents' details, so it needs a fresh 2FA code. */
export function TrustVerification() {
  const stepUp = useStepUp()
  const [status, setStatus] = useState("pending")
  const [offset, setOffset] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const query = new URLSearchParams({ limit: "50", offset: String(offset), ...(status ? { status } : {}) })
  const list = useAdminList("trust_safety", `${TRUST}/verification-requests?${query.toString()}`, { enabled: confirmed })

  if (!confirmed || list.needsStepUp) {
    return (
      <StepUpPrompt
        message="Verification requests include what people submitted to prove who they are. Viewing them is audited and needs a fresh 2FA code."
        onConfirm={async () => {
          if (await stepUp()) {
            setConfirmed(true)
            list.refetch()
          }
        }}
      />
    )
  }

  const columns: DataColumn<Row>[] = [
    { key: "user", header: "User", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "type", header: "Type", value: (r) => str(r.type), sortable: true, cell: (r) => humanise(r.type) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "docs", header: "Submitted", value: (r) => (r.submitted_docs ? Object.keys(r.submitted_docs as object).join(", ") : null), cell: (r) => (r.submitted_docs && typeof r.submitted_docs === "object" ? Object.keys(r.submitted_docs).map(humanise).join(", ") || "—" : "—") },
    { key: "created", header: "Requested", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]
  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Status">
          {(id) => (
            <select id={id} className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
              <option value="">All</option>
              {["pending", "approved", "rejected", "more_info_needed"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable
        caption="Verification requests"
        rows={list.data}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No verification requests with this status."
      />
      <OffsetPager offset={offset} limit={50} count={list.data.length} onChange={setOffset} />
      <p className="mt-2 text-xs text-mo-body">Deciding a request is not available from the console yet.</p>
    </>
  )
}

/** The automated labels on one media asset. */
export function TrustMediaLabels() {
  const [mediaId, setMediaId] = useState<string | null>(null)
  const list = useAdminList("trust_safety", `${TRUST}/media-labels/${encodeURIComponent(mediaId ?? "")}`, { enabled: !!mediaId })
  const columns: DataColumn<Row>[] = [
    { key: "label", header: "Label", value: (r) => str(r.label_type), sortable: true, cell: (r) => humanise(r.label_type) },
    { key: "confidence", header: "Confidence", value: (r) => num(r.confidence), sortable: true, align: "right", cell: (r) => { const c = num(r.confidence); return c === null ? "—" : `${Math.round(c <= 1 ? c * 100 : c)}%` } },
    { key: "source", header: "Source", value: (r) => str(r.source), cell: (r) => humanise(r.source) },
    { key: "labeled", header: "Labelled", value: (r) => str(r.labeled_at), sortable: true, cell: (r) => when(r.labeled_at) },
  ]
  return (
    <>
      <LookupForm label="Media id" validate={uuidOnly} onSubmit={setMediaId} />
      {mediaId ? (
        <DataTable caption="Media labels" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No labels on this media." />
      ) : (
        <p className="text-sm text-mo-body">Look up a media asset by its id.</p>
      )}
    </>
  )
}

/** Keyword filters for a scope (the platform list by default). */
export function TrustKeywordFilters() {
  const [scope, setScope] = useState("platform")
  const list = useAdminList("trust_safety", `${TRUST}/keyword-filters?scope=${encodeURIComponent(scope)}`)
  const columns: DataColumn<Row>[] = [
    { key: "keyword", header: "Keyword", value: (r) => str(r.keyword), sortable: true, filterable: true },
    { key: "action", header: "Action", value: (r) => str(r.action), sortable: true, cell: (r) => humanise(r.action) },
    { key: "scope", header: "Scope", value: (r) => str(r.scope), cell: (r) => <span>{humanise(r.scope)} {str(r.scope_id) ? <IdText id={r.scope_id} /> : null}</span> },
    { key: "added", header: "Added by", value: (r) => str(r.added_by), cell: (r) => <IdText id={r.added_by} /> },
    { key: "created", header: "Added", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]
  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Scope">
          {(id) => (
            <select id={id} className={inputClass} value={scope} onChange={(e) => setScope(e.target.value)}>
              {["platform", "group", "channel", "user"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Keyword filters" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No keyword filters in this scope." />
    </>
  )
}
