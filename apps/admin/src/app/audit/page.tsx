"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/blocks/PageHeader"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { useAdminList } from "@/hooks/useAdminQuery"
import { ADMIN_APPS, adminAppLabel, isAdminAppId } from "@/lib/admin/apps"
import {
  AUDIT_OUTCOMES,
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTER,
  auditFilterProblem,
  auditQueryString,
  currentCursor,
  firstAuditPage,
  nextAuditPage,
  previousAuditPage,
  type AuditFilter,
} from "@/lib/admin/audit"
import { humanise, num, readObject, str, when, type Row } from "@/lib/admin/data"
import type { AdminMe } from "@/lib/admin/me"

/** The apps this admin may filter by: every app with `*:audit.read`, else those with `<app>:audit.read`. */
function auditableApps(me: AdminMe): string[] {
  const all = [...me.platform, ...Object.values(me.apps).flatMap((p) => p ?? [])]
  if (all.some((p) => p === "*" || p === "*:audit.read")) return ADMIN_APPS.map((a) => a.id)
  return ADMIN_APPS.map((a) => a.id).filter((id) => all.includes(`${id}:audit.read`))
}

const OUTCOME_TONE: Record<string, "good" | "bad" | "warn" | "normal"> = { success: "good", failure: "bad", denied: "bad", pending: "warn", rejected: "warn" }

/**
 * The unified admin trail from admin-service: every admin request, who made
 * it (as a user id — no names or emails), on which application, and how it
 * ended. Newest first, paged by cursor.
 */
export default function AuditPage() {
  const { nav, me } = useAdmin()
  const [draft, setDraft] = useState<AuditFilter>(EMPTY_AUDIT_FILTER)
  const [applied, setApplied] = useState<AuditFilter>(EMPTY_AUDIT_FILTER)
  const [paging, setPaging] = useState(firstAuditPage)
  const allowed = nav.console.some((link) => link.id === "audit")
  const url = `/v1/admin/audit?${auditQueryString(applied, currentCursor(paging))}`
  const page = useAdminList("platform", url, { enabled: allowed, keys: ["items"] })
  if (!allowed) return <NoAccessToApp />

  const apps = auditableApps(me)
  const problem = auditFilterProblem(draft)
  const nextCursor = str(readObject(page.raw)?.next_cursor)
  const pageNumber = paging.cursors.length

  const columns: DataColumn<Row>[] = [
    { key: "when", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
    { key: "app", header: "Application", value: (r) => str(r.app), cell: (r) => (isAdminAppId(r.app) ? adminAppLabel(r.app) : humanise(r.app)) },
    { key: "operation", header: "Operation", value: (r) => str(r.operation), cell: (r) => <span className="font-mo-mono text-xs">{str(r.operation)}</span> },
    { key: "actor", header: "Actor", value: (r) => str(r.actor), cell: (r) => <IdText id={r.actor} /> },
    { key: "target", header: "Target", value: (r) => str(r.target_id), cell: (r) => (str(r.target_type) ? <span>{humanise(r.target_type)} <IdText id={r.target_id} /></span> : "—") },
    { key: "outcome", header: "Outcome", value: (r) => str(r.outcome), cell: (r) => (str(r.outcome) ? <StatusPill value={r.outcome} tone={OUTCOME_TONE[String(r.outcome)] ?? "normal"} /> : "—") },
    { key: "status", header: "HTTP", value: (r) => num(r.status_code), align: "right" },
    { key: "request", header: "Request", value: (r) => str(r.request_id), cell: (r) => <IdText id={r.request_id} /> },
  ]

  const set = (key: keyof AuditFilter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft({ ...draft, [key]: e.target.value })

  return (
    <div>
      <PageHeader eyebrow="Console" title="Audit" description="Every admin action: who (by user id), what, on which application, and how it ended." />
      <form
        className="mb-4 grid gap-3 rounded-mo border border-mo bg-mo-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Audit filters"
        onSubmit={(e) => {
          e.preventDefault()
          if (problem) return
          setApplied(draft)
          setPaging(firstAuditPage())
        }}
      >
        <Field label="Application">
          {(id) => (
            <select id={id} className={inputClass} value={draft.app} onChange={set("app")}>
              <option value="">All I can audit</option>
              {apps.map((app) => (
                <option key={app} value={app}>
                  {isAdminAppId(app) ? adminAppLabel(app) : app}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Actor id">{(id) => <input id={id} className={inputClass} value={draft.actor} onChange={set("actor")} placeholder="User id" />}</Field>
        <Field label="Operation">{(id) => <input id={id} className={inputClass} value={draft.operation} onChange={set("operation")} placeholder="e.g. food.order.cancel" />}</Field>
        <Field label="Outcome">
          {(id) => (
            <select id={id} className={inputClass} value={draft.outcome} onChange={set("outcome")}>
              <option value="">Any</option>
              {AUDIT_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {humanise(o)}
                </option>
              ))}
            </select>
          )}
        </Field>
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
              setDraft(EMPTY_AUDIT_FILTER)
              setApplied(EMPTY_AUDIT_FILTER)
              setPaging(firstAuditPage())
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

      <DataTable
        caption="Audit trail"
        rows={page.data}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={page.isLoading}
        error={page.error}
        onRetry={page.refetch}
        emptyMessage="No audit rows match these filters."
        pageSize={AUDIT_PAGE_SIZE}
      />
      <div className="mt-3 flex items-center justify-end gap-2 text-sm text-mo-body">
        <span>Page {pageNumber}</span>
        <button type="button" className={buttonSecondary} aria-label="Newer rows" disabled={pageNumber === 1 || page.isLoading} onClick={() => setPaging(previousAuditPage(paging))}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Newer
        </button>
        <button type="button" className={buttonSecondary} aria-label="Older rows" disabled={!nextCursor || page.isLoading} onClick={() => setPaging(nextAuditPage(paging, nextCursor))}>
          Older <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
