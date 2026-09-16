"use client"

import { useState } from "react"
import { Check, X } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { bool, humanise, num, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"

export const DATING = "/v1/admin/dating"
const DATING_KEY = adminKey("dating")
const LIMIT = 50

export const REPORT_ACTIONS = ["dismiss", "warn", "review", "restrict"] as const
export const ENFORCEMENT_ACTIONS = ["suspend", "reinstate"] as const
const REPORT_STATUSES = ["submitted", "under_review", "investigating", "resolved", "dismissed"]

/**
 * Dating reports. Moderating the report (dismiss, warn, review, restrict) is
 * `dating:reports.act`; suspending or reinstating the person is enforcement —
 * `dating:users.ban`, a required reason and a fresh 2FA code — on its own route.
 */
export function DatingReports() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("submitted")
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ...(status ? { status } : {}) })
  const list = useAdminList("dating", `${DATING}/reports?${query.toString()}`)
  const [acting, setActing] = useState<Row | null>(null)
  const [enforcing, setEnforcing] = useState<Row | null>(null)
  const mayAct = can(me, "dating", "reports.act")
  const mayEnforce = can(me, "dating", "users.ban")

  const mutation = (route: "action" | "enforce", done: string, failed: string, close: () => void) =>
    ({
      request: ({ id, action, target, reason }: { id: string; action: string; target: string | null; reason: string }) => ({
        method: "post" as const,
        url: `${DATING}/reports/${encodeURIComponent(id)}/${route}`,
        body: { action, reason, ...(target ? { target_user_id: target } : {}) },
      }),
      invalidate: [DATING_KEY],
      successMessage: done,
      errorTitle: failed,
      onDone: close,
    })
  const act = useAdminMutation(mutation("action", "Report actioned", "Report action failed", () => setActing(null)))
  const enforce = useAdminMutation(mutation("enforce", "Enforcement applied", "Enforcement failed", () => setEnforcing(null)))

  const columns: DataColumn<Row>[] = [
    { key: "category", header: "Category", value: (r) => str(r.category), sortable: true, filterable: true, cell: (r) => humanise(r.category) },
    {
      key: "reason",
      header: "Reason",
      value: (r) => `${str(r.reason) ?? ""} ${str(r.details) ?? ""}`,
      filterable: true,
      cell: (r) => (
        <div>
          <div>{humanise(r.reason)}</div>
          {str(r.details) ? <div className="line-clamp-2 text-xs text-mo-body">{str(r.details)}</div> : null}
        </div>
      ),
    },
    { key: "target", header: "Reported profile", value: (r) => str(r.target_id), cell: (r) => <IdText id={r.target_id} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "created", header: "Reported", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {mayAct ? (
            <button type="button" className={buttonSecondary} onClick={() => setActing(r)} aria-label={`Act on report ${str(r.id)}`}>
              Act
            </button>
          ) : null}
          {mayEnforce ? (
            <button type="button" className={buttonDanger} onClick={() => setEnforcing(r)} aria-label={`Enforce on report ${str(r.id)}`}>
              Enforce
            </button>
          ) : null}
        </div>
      ),
    },
  ]

  const target = (r: Row | null) => (r ? str(r.target_id) : null)

  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Status">
          {(id) => (
            <select id={id} className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
              <option value="">All</option>
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Dating reports" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No reports with this status." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />

      <ChoiceDialog
        open={acting !== null}
        title="Act on this report"
        description={acting ? `${humanise(acting.category)} · ${humanise(acting.reason)}` : null}
        choiceLabel="Action"
        choices={REPORT_ACTIONS.map((a) => ({ value: a, destructive: a === "restrict" }))}
        busy={act.isPending}
        onConfirm={(action, reason) => acting && act.mutate({ id: String(acting.id), action, target: target(acting), reason })}
        onClose={() => setActing(null)}
      />
      <ChoiceDialog
        open={enforcing !== null}
        title="Suspend or reinstate this profile"
        description="Enforcement against a person. It is recorded with your reason and needs a fresh 2FA code."
        choiceLabel="Enforcement"
        choices={ENFORCEMENT_ACTIONS.map((a) => ({ value: a, destructive: true }))}
        confirmLabel="Apply"
        requireReason
        busy={enforce.isPending}
        onConfirm={(action, reason) => enforcing && enforce.mutate({ id: String(enforcing.id), action, target: target(enforcing), reason })}
        onClose={() => setEnforcing(null)}
      />
    </>
  )
}

/** Profile photos waiting for moderation. */
export function DatingPhotos() {
  const list = useAdminList("dating", `${DATING}/photos/pending?limit=100`)
  const [rejecting, setRejecting] = useState<Row | null>(null)
  const decide = useAdminMutation<{ id: string; status: "approved" | "rejected"; reason: string }>({
    request: ({ id, status, reason }) => ({ method: "post", url: `${DATING}/photos/${encodeURIComponent(id)}/decision`, body: { status, reason } }),
    invalidate: [DATING_KEY],
    successMessage: "Photo decision saved",
    errorTitle: "Photo decision failed",
    onDone: () => setRejecting(null),
  })

  const columns: DataColumn<Row>[] = [
    { key: "user", header: "Profile", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "media", header: "Media", value: (r) => str(r.media_id), cell: (r) => <IdText id={r.media_id} /> },
    { key: "primary", header: "Primary", value: (r) => (bool(r.is_primary) ? "yes" : "no") },
    { key: "status", header: "Status", value: (r) => str(r.moderation_status), cell: (r) => <StatusPill value={r.moderation_status} /> },
    { key: "created", header: "Uploaded", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonPrimary} disabled={decide.isPending} onClick={() => decide.mutate({ id: String(r.id), status: "approved", reason: "" })} aria-label={`Approve photo ${str(r.id)}`}>
            <Check className="h-4 w-4" aria-hidden="true" /> Approve
          </button>
          <button type="button" className={buttonDanger} onClick={() => setRejecting(r)} aria-label={`Reject photo ${str(r.id)}`}>
            <X className="h-4 w-4" aria-hidden="true" /> Reject
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <p className="mb-3 text-xs text-mo-body">The console lists media ids only; photo previews need a media route admin-service does not expose yet.</p>
      <DataTable caption="Photos pending review" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No photos are waiting for review." />
      <ConfirmReasonDialog
        open={rejecting !== null}
        title="Reject this photo?"
        description="The member is told their photo was not approved."
        confirmLabel="Reject"
        destructive
        busy={decide.isPending}
        onConfirm={(reason) => rejecting && decide.mutate({ id: String(rejecting.id), status: "rejected", reason })}
        onClose={() => setRejecting(null)}
      />
    </>
  )
}

/** Selfie verifications the automated check could not settle (the 80–90 band). */
export function DatingSelfies() {
  const list = useAdminList("dating", `${DATING}/selfies/pending?limit=100`)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const decide = useAdminMutation<{ userId: string; decision: string; reason: string }>({
    request: ({ userId, decision, reason }) => ({ method: "post", url: `${DATING}/selfies/${encodeURIComponent(userId)}/decision`, body: { decision, reason } }),
    invalidate: [DATING_KEY],
    successMessage: "Selfie decided",
    errorTitle: "Selfie decision failed",
    onDone: () => setDeciding(null),
  })

  const columns: DataColumn<Row>[] = [
    { key: "user", header: "Profile", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "similarity", header: "Similarity", value: (r) => num(r.similarity), sortable: true, align: "right", cell: (r) => { const s = num(r.similarity); return s === null ? "—" : `${(s <= 1 ? s * 100 : s).toFixed(1)}%` } },
    { key: "blinks", header: "Blinks", value: (r) => num(r.blinks_detected), align: "right" },
    { key: "reason", header: "Check said", value: (r) => str(r.reason), cell: (r) => humanise(r.reason) },
    { key: "status", header: "Profile status", value: (r) => str(r.profile_status), cell: (r) => <StatusPill value={r.profile_status} /> },
    { key: "submitted", header: "Submitted", value: (r) => str(r.submitted_at), sortable: true, cell: (r) => when(r.submitted_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide selfie for ${str(r.user_id)}`}>
          Decide
        </button>
      ),
    },
  ]

  return (
    <>
      <DataTable caption="Selfies in review" rows={list.data} columns={columns} rowId={(r) => String(r.user_id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No selfies are waiting for review." />
      <ChoiceDialog
        open={deciding !== null}
        title="Decide this selfie verification"
        description="Approving activates the profile; rejecting fails the verification."
        choiceLabel="Decision"
        choices={[{ value: "approve" }, { value: "reject", destructive: true }]}
        busy={decide.isPending}
        onConfirm={(decision, reason) => deciding && decide.mutate({ userId: String(deciding.user_id), decision, reason })}
        onClose={() => setDeciding(null)}
      />
    </>
  )
}
