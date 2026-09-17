"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, num, str, when, type Row } from "@/lib/admin/data"
import {
  COMPLAINT_STATUSES,
  RATING_VISIBILITIES,
  RIDE_STATUSES,
  RIDER,
  RIDER_PAGE,
  RIDER_WRITES,
  isLiveRide,
  rideTone,
  riderListQuery,
  rupees,
} from "@/lib/admin/rider"
import { can } from "@/lib/admin/sections"
import { RiderActionDialog, StatusFilter, useRiderMutation } from "./RiderBits"

/**
 * Rides: every ride (filter by status, search) or the live ones. An admin
 * cancel ends the ride for both sides and needs a fresh 2FA code; setting a
 * rating's visibility does not.
 */
export function RiderRides() {
  const { me } = useAdmin()
  const [live, setLive] = useState(false)
  const [status, setStatus] = useState("")
  const [q, setQ] = useState("")
  const [applied, setApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [cancelling, setCancelling] = useState<Row | null>(null)
  const [rating, setRating] = useState<Row | null>(null)
  const url = live ? `${RIDER}/rides/live?limit=200` : `${RIDER}/rides?${riderListQuery({ status, q: applied }, offset)}`
  const list = useAdminList("rider", url)
  const mutation = useRiderMutation({
    onDone: () => {
      setCancelling(null)
      setRating(null)
    },
  })
  const mayCancel = can(me, "rider", RIDER_WRITES["ride.cancel"].permission)
  const mayRate = can(me, "rider", RIDER_WRITES["rating.visibility"].permission)

  const columns: DataColumn<Row>[] = [
    { key: "id", header: "Ride", value: (r) => str(r.id), filterable: true, cell: (r) => <IdText id={r.id} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={rideTone(r.status)} /> },
    { key: "customer", header: "Customer", value: (r) => str(r.customer_user_id), cell: (r) => <IdText id={r.customer_user_id} /> },
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), cell: (r) => (str(r.partner_id) ? <IdText id={r.partner_id} /> : "—") },
    { key: "type", header: "Vehicle", value: (r) => str(r.vehicle_type), cell: (r) => humanise(r.vehicle_type) },
    { key: "route", header: "Route", value: (r) => str(r.pickup_address), cell: (r) => <span className="text-xs">{str(r.pickup_address) ?? "—"} → {str(r.drop_address) ?? "—"}</span> },
    { key: "fare", header: "Est. fare", value: (r) => num(r.estimated_fare), sortable: true, align: "right", cell: (r) => rupees(r.estimated_fare) },
    { key: "requested", header: "Requested", value: (r) => str(r.requested_at), sortable: true, cell: (r) => when(r.requested_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          {mayCancel && isLiveRide(r.status) ? (
            <button type="button" className={buttonDanger} onClick={() => setCancelling(r)} aria-label={`Cancel ride ${str(r.id)}`}>
              Cancel
            </button>
          ) : null}
          {mayRate && r.status === "completed" ? (
            <button type="button" className={buttonSecondary} onClick={() => setRating(r)} aria-label={`Rating of ride ${str(r.id)}`}>
              Rating
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Which rides" className="flex gap-1 rounded-mo-sm border border-mo p-1">
          <button type="button" className={`${buttonSecondary} border-0 ${!live ? "bg-mo-raised" : ""}`} aria-pressed={!live} onClick={() => setLive(false)}>
            All rides
          </button>
          <button type="button" className={`${buttonSecondary} border-0 ${live ? "bg-mo-raised" : ""}`} aria-pressed={live} onClick={() => setLive(true)}>
            Live now
          </button>
        </div>
        {live ? (
          <button type="button" className={buttonSecondary} onClick={list.refetch}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              setApplied(q.trim())
              setOffset(0)
            }}
          >
            <StatusFilter value={status} options={RIDE_STATUSES} onChange={(v) => { setStatus(v); setOffset(0) }} />
            <div className="w-72">
              <Field label="Search">{(id) => <input id={id} type="search" className={inputClass} value={q} placeholder="Ride id, customer or address" onChange={(e) => setQ(e.target.value)} />}</Field>
            </div>
            <button type="submit" className={buttonSecondary}>
              Search
            </button>
          </form>
        )}
      </div>
      <DataTable caption={live ? "Live rides" : "Rides"} rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage={live ? "No rides in progress." : "No rides match."} pageSize={live ? 200 : RIDER_PAGE} />
      {!live ? <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} /> : null}
      <RiderActionDialog
        write={cancelling ? "ride.cancel" : null}
        subject={cancelling ? `ride ${str(cancelling.id)?.slice(0, 8) ?? ""}` : null}
        busy={mutation.isPending}
        onConfirm={(reason) => cancelling && mutation.mutate({ write: "ride.cancel", url: `${RIDER}/rides/${encodeURIComponent(String(cancelling.id))}/cancel`, body: { reason } })}
        onClose={() => setCancelling(null)}
      />
      <ChoiceDialog
        open={rating !== null}
        title="Set the rating's visibility"
        description={rating ? `The customer's rating of ride ${str(rating.id)}. ${RIDER_WRITES["rating.visibility"].explain}` : null}
        choiceLabel="Visibility"
        choices={RATING_VISIBILITIES.map((v) => ({ value: v, hint: v === "hidden" ? "The rating no longer counts towards the partner's score." : v === "flagged" ? "Kept but marked for review." : "Shown as the customer left it." }))}
        confirmLabel="Set visibility"
        busy={mutation.isPending}
        onConfirm={(visibility) => rating && mutation.mutate({ write: "rating.visibility", url: `${RIDER}/rides/${encodeURIComponent(String(rating.id))}/rating/visibility`, body: { visibility } })}
        onClose={() => setRating(null)}
      />
    </>
  )
}

/** Customer complaints about rides. The status moves with a note that stays with the complaint. */
export function RiderComplaints() {
  const [status, setStatus] = useState("open")
  const [offset, setOffset] = useState(0)
  const [updating, setUpdating] = useState<Row | null>(null)
  const list = useAdminList("rider", `${RIDER}/complaints?${riderListQuery({ status }, offset)}`)
  const mutation = useRiderMutation({ onDone: () => setUpdating(null) })

  const columns: DataColumn<Row>[] = [
    { key: "ride", header: "Ride", value: (r) => str(r.ride_id), filterable: true, cell: (r) => <IdText id={r.ride_id} /> },
    { key: "customer", header: "Customer", value: (r) => str(r.customer_id), cell: (r) => <IdText id={r.customer_id} /> },
    { key: "partner", header: "Partner", value: (r) => str(r.partner_id), cell: (r) => (str(r.partner_id) ? <IdText id={r.partner_id} /> : "—") },
    { key: "category", header: "Category", value: (r) => str(r.category), sortable: true, cell: (r) => humanise(r.category) },
    { key: "description", header: "Description", value: (r) => str(r.description) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "open" ? "bad" : r.status === "under_review" ? "warn" : "normal"} /> },
    { key: "note", header: "Resolution", value: (r) => str(r.resolution_note) },
    { key: "filed", header: "Filed", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setUpdating(r)} aria-label={`Update complaint ${str(r.id)}`}>
          Update status
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3">
        <StatusFilter value={status} options={COMPLAINT_STATUSES} onChange={(v) => { setStatus(v); setOffset(0) }} />
      </div>
      <DataTable caption="Complaints" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No complaints with this status." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
      <ChoiceDialog
        open={updating !== null}
        title="Update this complaint"
        description={updating ? `${humanise(updating.category)}: ${str(updating.description) ?? "no description"}.` : null}
        choiceLabel="New status"
        choices={COMPLAINT_STATUSES.filter((s) => s !== str(updating?.status)).map((s) => ({ value: s, destructive: s === "dismissed" }))}
        confirmLabel="Update"
        reasonLabel="Note"
        busy={mutation.isPending}
        onConfirm={(next, note) => updating && mutation.mutate({ write: "complaint.status", url: `${RIDER}/complaints/${encodeURIComponent(String(updating.id))}/update-status`, body: { status: next, note } })}
        onClose={() => setUpdating(null)}
      />
    </>
  )
}
