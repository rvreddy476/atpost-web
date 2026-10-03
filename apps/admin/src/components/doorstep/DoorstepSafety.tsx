"use client"

import { useState } from "react"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { CheckField } from "@/components/blocks/formFields"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, num, str, when, type Row } from "@/lib/admin/data"
import { DECISION_BODIES, DOORSTEP_PAGE, DOORSTEP_READS, INCIDENT_STATUSES, TICKET_STATUSES, incidentTone, severityTone, ticketTone } from "@/lib/admin/doorstep"
import { DoorstepActionDialog, ValueFilter, useDoorstepMutation, useMayWrite } from "./DoorstepBits"

/** How often the open-incident list re-reads itself while the tab is visible. */
export const INCIDENTS_LIVE_MS = 15_000

/**
 * Incidents: SOS, safety, damage, harassment, theft and unsafe exits. The
 * open list refreshes itself every 15 seconds while the tab is visible. A
 * customer-safety incident auto-suspends the professional; resolving lifts
 * that only when the box is ticked.
 */
export function DoorstepIncidents() {
  const mayWrite = useMayWrite()
  const [status, setStatus] = useState("open")
  const [resolving, setResolving] = useState<Row | null>(null)
  const [lift, setLift] = useState(false)
  const list = useAdminList("doorstep", DOORSTEP_READS.incidents(status), { refetchInterval: status === "open" ? INCIDENTS_LIVE_MS : undefined })
  const mutation = useDoorstepMutation({ onDone: () => setResolving(null) })
  const mayAct = mayWrite("incident.acknowledge")

  const columns: DataColumn<Row>[] = [
    { key: "severity", header: "Severity", value: (r) => str(r.severity), sortable: true, cell: (r) => <StatusPill value={r.severity} tone={severityTone(r.severity)} /> },
    { key: "kind", header: "Kind", value: (r) => str(r.kind), sortable: true, filterable: true, cell: (r) => (str(r.kind) === "sos" ? "SOS" : humanise(r.kind)) },
    { key: "by", header: "Raised by", value: (r) => str(r.raised_by_kind), cell: (r) => humanise(r.raised_by_kind) },
    { key: "booking", header: "Booking", value: (r) => str(r.booking_id), cell: (r) => (str(r.booking_id) ? <IdText id={r.booking_id} /> : "—") },
    { key: "description", header: "Description", value: (r) => str(r.description) },
    { key: "suspended", header: "Pro suspended", value: (r) => (r.pro_auto_suspended === true ? "yes" : "no"), cell: (r) => (r.pro_auto_suspended === true ? <StatusPill value="auto-suspended" tone="warn" /> : "—") },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={incidentTone(r.status)} /> },
    { key: "created", header: "Raised", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayAct && str(r.status) !== "resolved" ? (
          <span className="inline-flex gap-1">
            {str(r.status) === "open" ? (
              <button type="button" className={buttonSecondary} disabled={mutation.isPending} onClick={() => mutation.mutate({ write: "incident.acknowledge", target: { id: String(r.id) } })} aria-label={`Acknowledge incident ${str(r.id)}`}>
                Acknowledge
              </button>
            ) : null}
            <button
              type="button"
              className={buttonPrimary}
              onClick={() => {
                setLift(false)
                setResolving(r)
              }}
              aria-label={`Resolve incident ${str(r.id)}`}
            >
              Resolve
            </button>
          </span>
        ) : null,
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <ValueFilter value={status} options={INCIDENT_STATUSES} onChange={setStatus} />
        {status === "open" ? <p className="text-xs text-mo-body">Live: refreshes every 15 seconds.</p> : null}
      </div>
      <DataTable caption="Incidents" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No incidents with this status." pageSize={DOORSTEP_PAGE} />
      <DoorstepActionDialog
        write={resolving ? "incident.resolve" : null}
        subject="this incident"
        reasonLabel="Resolution"
        busy={mutation.isPending}
        onConfirm={(resolution) => resolving && mutation.mutate({ write: "incident.resolve", target: { id: String(resolving.id) }, body: DECISION_BODIES.resolve(resolution, lift) })}
        onClose={() => setResolving(null)}
      >
        {resolving?.pro_auto_suspended === true ? (
          <CheckField label="Lift the professional's automatic suspension" hint="Only when the incident is cleared; this needs a fresh 2FA code. Otherwise the suspension stays until someone reinstates them." checked={lift} onChange={setLift} />
        ) : null}
      </DoorstepActionDialog>
    </>
  )
}

/** Support tickets from customers and professionals, moved along with a note. */
export function DoorstepTickets() {
  const [moving, setMoving] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.tickets())
  const mutation = useDoorstepMutation({ onDone: () => setMoving(null) })

  const columns: DataColumn<Row>[] = [
    { key: "subject", header: "Subject", value: (r) => str(r.subject), filterable: true },
    { key: "category", header: "Category", value: (r) => str(r.category), sortable: true, cell: (r) => humanise(r.category) },
    { key: "booking", header: "Booking", value: (r) => str(r.booking_id), cell: (r) => (str(r.booking_id) ? <IdText id={r.booking_id} /> : "—") },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, filterable: true, cell: (r) => <StatusPill value={r.status} tone={ticketTone(r.status)} /> },
    { key: "updated", header: "Updated", value: (r) => str(r.updated_at), sortable: true, cell: (r) => when(r.updated_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setMoving(r)} aria-label={`Move ticket ${str(r.id)}`}>
          Move
        </button>
      ),
    },
  ]

  return (
    <>
      <DataTable caption="Tickets" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No tickets." pageSize={DOORSTEP_PAGE} />
      <ChoiceDialog
        open={moving !== null}
        title="Move this ticket?"
        description={moving ? str(moving.subject) : null}
        choiceLabel="New status"
        choices={TICKET_STATUSES.filter((s) => s !== str(moving?.status)).map((s) => ({ value: s, label: humanise(s) }))}
        confirmLabel="Move ticket"
        reasonLabel="Note"
        busy={mutation.isPending}
        onConfirm={(status, note) => moving && mutation.mutate({ write: "ticket.status", target: { id: String(moving.id) }, body: DECISION_BODIES.ticket(status, note) })}
        onClose={() => setMoving(null)}
      />
    </>
  )
}

/** Ratings, low or reported first. Hiding one removes it from the professional's average. */
export function DoorstepRatings() {
  const [hiding, setHiding] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.ratings())
  const mutation = useDoorstepMutation({ onDone: () => setHiding(null) })

  const columns: DataColumn<Row>[] = [
    { key: "stars", header: "Stars", value: (r) => num(r.stars), sortable: true, align: "right" },
    { key: "by", header: "By", value: (r) => str(r.rater_kind), cell: (r) => humanise(r.rater_kind) },
    { key: "comment", header: "Comment", value: (r) => str(r.comment), filterable: true },
    { key: "tags", header: "Tags", value: (r) => (Array.isArray(r.tags) ? r.tags.join(", ") : null) },
    { key: "booking", header: "Booking", value: (r) => str(r.booking_id), cell: (r) => <IdText id={r.booking_id} /> },
    { key: "hidden", header: "Visibility", value: (r) => (r.hidden === true ? "hidden" : "shown"), cell: (r) => <StatusPill value={r.hidden === true ? "hidden" : "shown"} tone={r.hidden === true ? "warn" : "normal"} /> },
    { key: "created", header: "Rated", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        r.hidden !== true ? (
          <button type="button" className={buttonDanger} onClick={() => setHiding(r)} aria-label={`Hide rating ${str(r.id)}`}>
            Hide
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <DataTable caption="Ratings" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No ratings to moderate." pageSize={DOORSTEP_PAGE} />
      <DoorstepActionDialog
        write={hiding ? "rating.hide" : null}
        subject={hiding ? `of ${num(hiding.stars) ?? "?"} stars` : null}
        busy={mutation.isPending}
        onConfirm={(reason) => hiding && mutation.mutate({ write: "rating.hide", target: { id: String(hiding.id) }, body: DECISION_BODIES.reason(reason) })}
        onClose={() => setHiding(null)}
      />
    </>
  )
}
