"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Details, Field, IdText, OffsetPager, RevealGate, StatusPill } from "@/components/blocks/bits"
import { buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation, useStepUpRead } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { bool, humanise, isRecord, isUuid, num, readObject, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import { DATING } from "./DatingQueues"

const DATING_KEY = adminKey("dating")
const LIMIT = 50

/**
 * Panic incidents. The list never carries a location. The detail view's GPS
 * is behind "Reveal": `GET /panic/:id` is `dating:panic.reveal`, audited, and
 * needs a fresh 2FA code; closing the view or pressing Hide drops it.
 */
export function DatingPanic() {
  const [status, setStatus] = useState("open")
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<Row | null>(null)
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ...(status ? { status } : {}) })
  const list = useAdminList("dating", `${DATING}/panic?${query.toString()}`)

  if (open) return <PanicDetail incident={open} onBack={() => setOpen(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "open" ? "bad" : "normal"} /> },
    { key: "user", header: "Member", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "source", header: "Source", value: (r) => str(r.source), cell: (r) => humanise(r.source) },
    { key: "count", header: "Triggers", value: (r) => num(r.trigger_count), sortable: true, align: "right" },
    { key: "last", header: "Last triggered", value: (r) => str(r.last_triggered_at), sortable: true, cell: (r) => when(r.last_triggered_at) },
    { key: "flags", header: "", value: () => null, cell: (r) => (bool(r.suspected_abuse) ? <StatusPill value="suspected_abuse" tone="warn" /> : null) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpen(r)} aria-label={`Open panic incident ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Status">
          {(id) => (
            <select id={id} className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
              <option value="">All</option>
              {["open", "acknowledged", "resolved"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Panic incidents" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No panic incidents with this status." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}

function PanicDetail({ incident, onBack }: { incident: Row; onBack: () => void }) {
  const { me } = useAdmin()
  const read = useStepUpRead()
  const id = String(incident.id)
  const [status, setStatus] = useState(str(incident.status))
  const [resolving, setResolving] = useState(false)
  const mayAct = can(me, "dating", "panic.act")
  const mayReveal = can(me, "dating", "panic.reveal")

  const write = (suffix: "ack" | "resolve", done: string, failed: string, next: string) =>
    ({
      request: ({ note }: { note: string }) => ({
        method: "post" as const,
        url: `${DATING}/panic/${encodeURIComponent(id)}/${suffix}`,
        body: suffix === "resolve" ? { note } : {},
      }),
      invalidate: [DATING_KEY],
      successMessage: done,
      errorTitle: failed,
      onDone: () => {
        setStatus(next)
        setResolving(false)
      },
    })
  const ack = useAdminMutation(write("ack", "Incident acknowledged", "Acknowledgement failed", "acknowledged"))
  const resolve = useAdminMutation(write("resolve", "Incident resolved", "Resolving failed", "resolved"))

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All incidents
      </button>
      <section className="rounded-mo border border-mo bg-mo-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">Panic incident</h3>
          <StatusPill value={status} tone={status === "open" ? "bad" : "normal"} />
        </div>
        <Details
          items={[
            ["Member", <IdText key="u" id={incident.user_id} />],
            ["Source", humanise(incident.source)],
            ["Meet", str(incident.meet_id) ? <IdText key="m" id={incident.meet_id} /> : null],
            ["Triggers", String(num(incident.trigger_count) ?? "—")],
            ["First triggered", when(incident.first_triggered_at)],
            ["Last triggered", when(incident.last_triggered_at)],
            ["Location recorded", bool(incident.has_location) ? "Yes" : "No"],
          ]}
        />
        {mayAct && status !== "resolved" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {status === "open" ? (
              <button type="button" className={buttonSecondary} disabled={ack.isPending} onClick={() => ack.mutate({ note: "" })}>
                Acknowledge
              </button>
            ) : null}
            <button type="button" className={buttonPrimary} onClick={() => setResolving(true)}>
              Resolve
            </button>
          </div>
        ) : null}
      </section>

      {mayReveal ? (
        <RevealGate<Row>
          title="Location and context"
          note="The member's GPS position at the time of the panic. Revealing it is recorded in the audit trail and needs a fresh 2FA code."
          onReveal={async () => {
            const raw = await read(`${DATING}/panic/${encodeURIComponent(id)}`)
            return raw === null ? null : readObject(raw) ?? {}
          }}
        >
          {(detail) => {
            const lat = num(detail.latitude)
            const lng = num(detail.longitude)
            return (
              <Details
                items={[
                  ["Latitude", lat === null ? "Not recorded" : lat.toFixed(6)],
                  ["Longitude", lng === null ? "Not recorded" : lng.toFixed(6)],
                  ["Context", isRecord(detail.context) ? Object.entries(detail.context).map(([k, v]) => `${humanise(k)}: ${String(v)}`).join(" · ") || "—" : "—"],
                  ["Acknowledged", str(detail.acknowledged_at) ? <span key="a">{when(detail.acknowledged_at)} by <IdText id={detail.acknowledged_by} /></span> : null],
                  ["Resolved", str(detail.resolved_at) ? <span key="r">{when(detail.resolved_at)} by <IdText id={detail.resolved_by} /></span> : null],
                  ["Resolution note", str(detail.resolution_note)],
                ]}
              />
            )
          }}
        </RevealGate>
      ) : (
        <p className="text-sm text-mo-body">Revealing the location needs the panic reveal permission.</p>
      )}

      <ConfirmReasonDialog
        open={resolving}
        title="Resolve this incident?"
        description="Say what was done. The note is kept with the incident."
        confirmLabel="Resolve"
        reasonLabel="Resolution note"
        requireReason
        busy={resolve.isPending}
        onConfirm={(note) => resolve.mutate({ note })}
        onClose={() => setResolving(false)}
      />
    </div>
  )
}

/** Account risk levels from dating's risk engine. */
export function DatingRisk() {
  const [level, setLevel] = useState("admin_review")
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset), ...(level ? { level } : {}) })
  const list = useAdminList("dating", `${DATING}/risk?${query.toString()}`)
  const columns: DataColumn<Row>[] = [
    { key: "user", header: "Member", value: (r) => str(r.user_id), filterable: true, cell: (r) => <IdText id={r.user_id} /> },
    { key: "score", header: "Score", value: (r) => num(r.risk_score), sortable: true, align: "right" },
    { key: "level", header: "Level", value: (r) => str(r.risk_level), sortable: true, cell: (r) => <StatusPill value={r.risk_level} tone={r.risk_level === "suspend" ? "bad" : r.risk_level === "allow" ? "normal" : "warn"} /> },
    { key: "signals", header: "Signals", value: (r) => (isRecord(r.signals) ? Object.keys(r.signals).join(", ") : null), cell: (r) => (isRecord(r.signals) ? Object.keys(r.signals).map(humanise).join(", ") || "—" : "—") },
    { key: "evaluated", header: "Evaluated", value: (r) => str(r.last_evaluated_at), sortable: true, cell: (r) => when(r.last_evaluated_at) },
  ]
  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Level">
          {(id) => (
            <select id={id} className={inputClass} value={level} onChange={(e) => { setLevel(e.target.value); setOffset(0) }}>
              {["admin_review", "suspend", "chat_hold", "hide_from_discovery", "require_recheck", "reduce_reach", "allow"].map((l) => (
                <option key={l} value={l}>
                  {humanise(l)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Account risk" rows={list.data} columns={columns} rowId={(r) => String(r.user_id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No accounts at this risk level." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}

/** Dating's own admin audit rows (actor ids only). */
export function DatingAudit() {
  const [actor, setActor] = useState("")
  const [action, setAction] = useState("")
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) })
  if (isUuid(actor)) query.set("actor", actor.trim())
  if (action.trim()) query.set("action", action.trim())
  const list = useAdminList("dating", `${DATING}/audit?${query.toString()}`)
  const columns: DataColumn<Row>[] = [
    { key: "created", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "actor", header: "Admin", value: (r) => str(r.actor_admin_id), cell: (r) => <IdText id={r.actor_admin_id} /> },
    { key: "action", header: "Action", value: (r) => str(r.action), sortable: true, cell: (r) => humanise(r.action) },
    { key: "target", header: "Target", value: (r) => str(r.target_user_id) ?? str(r.target_resource), cell: (r) => (str(r.target_user_id) ? <IdText id={r.target_user_id} /> : str(r.target_resource) ?? "—") },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true },
  ]
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="w-80">
          <Field label="Admin id" hint={actor && !isUuid(actor) ? "Enter a full user id to filter." : undefined}>
            {(id) => <input id={id} className={inputClass} value={actor} onChange={(e) => { setActor(e.target.value); setOffset(0) }} />}
          </Field>
        </div>
        <div className="w-56">
          <Field label="Action">
            {(id) => <input id={id} className={inputClass} value={action} onChange={(e) => { setAction(e.target.value); setOffset(0) }} />}
          </Field>
        </div>
      </div>
      <DataTable caption="Dating audit" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No audit rows match." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}
