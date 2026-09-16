"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, LookupForm, OffsetPager, StatusPill, StepUpPrompt } from "@/components/blocks/bits"
import { inputClass } from "@/components/blocks/buttons"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import { TRUST } from "@/lib/admin/trust"

const uuidOnly = (v: string) => (isUuid(v) ? null : "Enter a user or media id (a UUID).")

/** A user's strikes, looked up by user id. */
export function TrustStrikes() {
  const [userId, setUserId] = useState<string | null>(null)
  const list = useAdminList("trust_safety", `${TRUST}/strikes/${encodeURIComponent(userId ?? "")}`, { enabled: !!userId })
  const columns: DataColumn<Row>[] = [
    { key: "severity", header: "Severity", value: (r) => str(r.severity), sortable: true, cell: (r) => <StatusPill value={r.severity} tone={r.severity === "severe_strike" ? "bad" : r.severity === "strike" ? "warn" : "normal"} /> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true },
    { key: "content", header: "Content", value: (r) => str(r.content_id), cell: (r) => (str(r.content_type) ? <span>{humanise(r.content_type)} <IdText id={r.content_id} /></span> : "—") },
    { key: "created", header: "Given", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "expires", header: "Expires", value: (r) => str(r.expires_at), sortable: true, cell: (r) => when(r.expires_at) },
  ]
  return (
    <>
      <LookupForm label="User id" placeholder="00000000-0000-0000-0000-000000000000" validate={uuidOnly} onSubmit={setUserId} />
      {userId ? (
        <DataTable
          caption="Strikes"
          rows={list.data}
          columns={columns}
          rowId={(r) => String(r.id)}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          emptyMessage="This user has no strikes."
        />
      ) : (
        <p className="text-sm text-mo-body">Look a user up by their id to see their strikes.</p>
      )}
    </>
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
