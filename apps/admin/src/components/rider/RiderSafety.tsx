"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, IdText, OffsetPager, RevealGate, StatusPill } from "@/components/blocks/bits"
import { buttonGhost, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useStepUpRead } from "@/hooks/useAdminMutation"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isRecord, str, when, type Row } from "@/lib/admin/data"
import { INCIDENT_STATUSES, RIDER, RIDER_PAGE, RIDER_REVEALS, RIDER_WRITES, readAlerts, riderListQuery, severityTone } from "@/lib/admin/rider"
import { can } from "@/lib/admin/sections"
import { RiderActionDialog, StatusFilter, useRiderMutation } from "./RiderBits"

/**
 * Safety incidents (SOS, route anomalies, no-shows, long idles). The list
 * carries no phone numbers. An incident's contact alerts — who was told,
 * on which number — are behind Reveal: `rider:incidents.reveal`, audited,
 * and needs a fresh 2FA code.
 */
export function RiderIncidents() {
  const [status, setStatus] = useState("open")
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<Row | null>(null)
  const list = useAdminList("rider", `${RIDER}/safety-incidents?${riderListQuery({ status }, offset)}`)

  if (open) return <IncidentDetail incident={open} onBack={() => setOpen(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "severity", header: "Severity", value: (r) => str(r.severity), sortable: true, cell: (r) => <StatusPill value={r.severity} tone={severityTone(r.severity)} /> },
    { key: "kind", header: "Kind", value: (r) => str(r.kind), sortable: true, filterable: true, cell: (r) => humanise(r.kind) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "open" ? "bad" : r.status === "acknowledged" ? "warn" : "normal"} /> },
    { key: "ride", header: "Ride", value: (r) => str(r.ride_id), cell: (r) => (str(r.ride_id) ? <IdText id={r.ride_id} /> : "—") },
    { key: "customer", header: "Customer", value: (r) => str(r.customer_id), cell: (r) => (str(r.customer_id) ? <IdText id={r.customer_id} /> : "—") },
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), cell: (r) => (str(r.partner_id) ? <IdText id={r.partner_id} /> : "—") },
    { key: "created", header: "Raised", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpen(r)} aria-label={`Open incident ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3">
        <StatusFilter value={status} options={INCIDENT_STATUSES} onChange={(v) => { setStatus(v); setOffset(0) }} />
      </div>
      <DataTable caption="Safety incidents" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No incidents with this status." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
    </>
  )
}

function IncidentDetail({ incident, onBack }: { incident: Row; onBack: () => void }) {
  const { me } = useAdmin()
  const read = useStepUpRead()
  const id = String(incident.id)
  const [status, setStatus] = useState(str(incident.status))
  const [resolving, setResolving] = useState(false)
  const mayAct = can(me, "rider", RIDER_WRITES["incident.acknowledge"].permission)
  const mayReveal = can(me, "rider", RIDER_REVEALS.incidentAlerts.permission)
  const mutation = useRiderMutation({
    onDone: (write) => {
      setStatus(write === "incident.resolve" ? "resolved" : "acknowledged")
      setResolving(false)
    },
  })
  const metadata = isRecord(incident.metadata) ? incident.metadata : null

  const alertColumns: DataColumn<Row>[] = [
    { key: "name", header: "Contact", value: (r) => str(r.contact_name), cell: (r) => str(r.contact_name) ?? "—" },
    { key: "phone", header: "Phone", value: (r) => str(r.contact_phone), cell: (r) => <span className="font-mo-mono text-xs" data-contact-phone>{str(r.contact_phone) ?? "—"}</span> },
    { key: "channel", header: "Channel", value: (r) => str(r.channel), cell: (r) => humanise(r.channel) },
    { key: "result", header: "Result", value: (r) => str(r.result), cell: (r) => <StatusPill value={r.result} tone={r.result === "sent" || r.result === "delivered" ? "good" : r.result === "failed" ? "bad" : "normal"} /> },
    { key: "error", header: "Error", value: (r) => str(r.error) },
    { key: "sent", header: "Sent", value: (r) => str(r.sent_at), cell: (r) => when(r.sent_at) },
  ]

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All incidents
      </button>
      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Incident detail">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">{humanise(incident.kind)}</h3>
          <StatusPill value={incident.severity} tone={severityTone(incident.severity)} />
          <StatusPill value={status} tone={status === "open" ? "bad" : status === "acknowledged" ? "warn" : "normal"} />
        </div>
        <Details
          items={[
            ["Incident", <IdText key="i" id={incident.id} />],
            ["Ride", str(incident.ride_id) ? <IdText key="r" id={incident.ride_id} /> : null],
            ["Customer", str(incident.customer_id) ? <IdText key="c" id={incident.customer_id} /> : null],
            ["Partner", str(incident.partner_id) ? <IdText key="p" id={incident.partner_id} /> : null],
            ["Details", metadata ? Object.entries(metadata).map(([k, v]) => `${humanise(k)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") || "—" : "—"],
            ["Raised", when(incident.created_at)],
            ["Acknowledged", str(incident.acknowledged_at) ? <span key="a">{when(incident.acknowledged_at)} by <IdText id={incident.acknowledged_by} /></span> : null],
            ["Resolved", str(incident.resolved_at) ? <span key="d">{when(incident.resolved_at)} by <IdText id={incident.resolved_by} /></span> : null],
          ]}
        />
        {mayAct && status !== "resolved" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {status === "open" ? (
              <button type="button" className={buttonSecondary} disabled={mutation.isPending} onClick={() => mutation.mutate({ write: "incident.acknowledge", url: `${RIDER}/safety-incidents/${encodeURIComponent(id)}/acknowledge` })}>
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
        <RevealGate<Row[]>
          title="Contact alerts"
          note="Who was alerted about this incident, on which phone number. Revealing the numbers is recorded in the audit trail and needs a fresh 2FA code."
          onReveal={async () => {
            const raw = await read(RIDER_REVEALS.incidentAlerts.path(id))
            return raw === null ? null : readAlerts(raw)
          }}
        >
          {(alerts) => <DataTable caption="Contact alerts" rows={alerts} columns={alertColumns} rowId={(r) => String(r.id)} emptyMessage="No contact was alerted for this incident." />}
        </RevealGate>
      ) : (
        <p className="text-sm text-mo-body">Revealing the contact alerts needs the incidents reveal permission.</p>
      )}

      <RiderActionDialog
        write={resolving ? "incident.resolve" : null}
        subject="this incident"
        busy={mutation.isPending}
        onConfirm={(note) => mutation.mutate({ write: "incident.resolve", url: `${RIDER}/safety-incidents/${encodeURIComponent(id)}/resolve`, body: { note } })}
        onClose={() => setResolving(false)}
      />
    </div>
  )
}
