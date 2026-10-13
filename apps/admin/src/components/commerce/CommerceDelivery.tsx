"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { PartnerEvidenceButton } from "@/components/blocks/PartnerEvidenceButton"
import { Field, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { bool, humanise, isUuid, num, readList, str, when, type Row } from "@/lib/admin/data"

const BASE = "/v1/admin/commerce/delivery"
const invalidate = [adminKey("commerce")]
const money = (v: unknown) => num(v) === null ? "Not configured" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(v) / 100)
const status: DataColumn<Row> = { key: "status", header: "Status", value: r => str(r.status), filterable: true, cell: r => <StatusPill value={str(r.status) ?? "unknown"} /> }

export function CommerceDeliveryReviews() {
  const list = useAdminList("commerce", `${BASE}/profiles`)
  const [profile, setProfile] = useState<string | null>(null)
  return <section className="space-y-4">
    <header><h2 className="font-mo-display text-xl font-semibold">Delivery partner applications</h2><p className="text-sm text-mo-body">Separate from merchant approval. Review the submitted evidence before approving delivery work.</p></header>
    {profile ? <DeliveryReview profile={profile} close={() => setProfile(null)} /> : <DataTable caption="Commerce Delivery applications" rows={list.data ?? []} columns={[
      { key: "name", header: "Partner", value: r => str(r.full_name), filterable: true },
      { key: "vehicle", header: "Vehicle", value: r => str(r.vehicle_type), cell: r => humanise(r.vehicle_type) }, status,
      { key: "submitted", header: "Submitted", value: r => str(r.submitted_at), cell: r => when(r.submitted_at), sortable: true },
      { key: "review", header: "Review", value: r => str(r.id), cell: r => <button className={buttonSecondary} onClick={() => setProfile(String(r.id))}>Review application</button> },
    ]} rowId={r => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No delivery applications to review." />}
  </section>
}

function DeliveryReview({ profile, close }: { profile: string; close: () => void }) {
  const q = useAdminObject("commerce", `${BASE}/profiles/${profile}`)
  const [action, setAction] = useState<{ document?: string; decision: string; label: string } | null>(null)
  const save = useAdminMutation<string>({ request: note => ({ method: "post", url: `${BASE}/profiles/${profile}/review`, body: { document_id: action?.document, revision: q.data?.revision, decision: action?.decision, note } }), invalidate, successMessage: "Review saved", errorTitle: "Review could not be saved", onDone: () => setAction(null) })
  const p = q.data
  const docs = readList(p?.documents)
  const required = ["selfie", "identity", "bank_proof", ...(p?.vehicle_type === "bicycle" ? [] : ["driving_licence", "vehicle_registration"])]
  const ready = required.every(kind => docs.some(d => d.kind === kind && d.status === "approved"))
  return <div className="space-y-4">
    <button className={buttonSecondary} onClick={close}>Back to applications</button>
    {q.isLoading ? <p role="status">Loading application…</p> : q.error ? <div role="alert">{q.error} <button className={buttonSecondary} onClick={() => q.refetch()}>Retry</button></div> : p ? <>
      <div className="rounded-mo border border-mo bg-mo-surface p-5"><h3 className="text-lg font-semibold">{str(p.full_name)}</h3><p>{humanise(p.vehicle_type)} · <StatusPill value={str(p.status) ?? "unknown"} /></p><p className="mt-2 text-sm text-mo-body">{str(p.review_note)}</p></div>
      <DataTable caption="Submitted documents" rows={docs} rowId={d => String(d.id)} columns={[
        { key: "kind", header: "Document", value: d => str(d.kind), cell: d => humanise(d.kind) }, status,
        { key: "note", header: "Review note", value: d => str(d.review_note) },
        { key: "actions", header: "Review", value: d => str(d.id), cell: d => <div className="flex flex-wrap gap-2"><PartnerEvidenceButton path={`${BASE}/profiles/${profile}/documents/${String(d.id)}/evidence`} title={humanise(d.kind)} /><button className={buttonSecondary} disabled={save.isPending || d.status === "approved"} onClick={() => setAction({ document: String(d.id), decision: "approved", label: `Approve ${humanise(d.kind)}` })}>Approve</button><button className={buttonSecondary} disabled={save.isPending} onClick={() => setAction({ document: String(d.id), decision: "changes_requested", label: `Request correction: ${humanise(d.kind)}` })}>Request correction</button></div> },
      ]} emptyMessage="No documents submitted." />
      <div className="flex flex-wrap gap-3"><button className={buttonPrimary} disabled={!ready || q.isLoading || save.isPending || p.status === "approved"} onClick={() => setAction({ decision: "approved", label: "Approve delivery partner" })}>Approve delivery partner</button><button className={buttonSecondary} disabled={save.isPending} onClick={() => setAction({ decision: "changes_requested", label: "Request application changes" })}>Request changes</button>{p.status === "approved" ? <button className={buttonSecondary} onClick={() => setAction({ decision: "suspended", label: "Suspend delivery partner" })}>Suspend</button> : null}</div>
      {!ready ? <p className="text-sm text-mo-body">Approve the required selfie, identity, bank and applicable vehicle documents first. The introduction video is optional.</p> : null}
    </> : <p>Application unavailable.</p>}
    <ConfirmReasonDialog open={action !== null} title={action?.label ?? "Review"} confirmLabel="Save review" requireReason busy={save.isPending} destructive={action?.decision !== "approved"} maxReasonLength={1000} canConfirm={!!p && !q.isLoading && !q.error} onClose={() => setAction(null)} onConfirm={note => save.mutate(note)} />
  </div>
}

type AreaForm = { name: string; latitude: string; longitude: string; radius: string; payout: string; enabled: boolean }
const emptyArea: AreaForm = { name: "", latitude: "", longitude: "", radius: "", payout: "", enabled: false }
export function deliveryAreaProblem(f: AreaForm): string | null {
  if (f.name.trim().length < 2) return "Enter an area name."
  if (!f.latitude.trim() || !f.longitude.trim() || !Number.isFinite(Number(f.latitude)) || !Number.isFinite(Number(f.longitude)) || Math.abs(Number(f.latitude)) > 90 || Math.abs(Number(f.longitude)) > 180) return "Enter valid area-centre coordinates."
  if (!f.radius.trim() || !Number.isFinite(Number(f.radius)) || Number(f.radius) < 0.1 || Number(f.radius) > 100) return "Radius must be between 0.1 and 100 km."
  if ((f.enabled && !f.payout.trim()) || (f.payout.trim() && (!/^\d+(\.\d{1,2})?$/.test(f.payout) || Number(f.payout) <= 0 || !Number.isSafeInteger(Math.round(Number(f.payout) * 100))))) return "Set a positive partner payout in rupees, with up to two decimal places."
  return null
}

export function CommerceDeliveryCoverage() {
  const q = useAdminList("commerce", `${BASE}/areas`)
  const [editing, setEditing] = useState<Row | null>(null)
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState<Row | null>(null)
  const [f, setF] = useState<AreaForm>(emptyArea)
  const save = useAdminMutation<string>({ request: reason => ({ method: editing ? "put" : "post", url: `${BASE}/areas${editing ? `/${String(editing.id)}` : ""}`, body: { name: f.name.trim(), latitude: Number(f.latitude), longitude: Number(f.longitude), radius_meters: Math.round(Number(f.radius) * 1000), payout_paise: f.payout.trim() ? Math.round(Number(f.payout) * 100) : null, enabled: f.enabled, revision: editing?.revision ?? 0, reason } }), invalidate, successMessage: "Delivery area saved", errorTitle: "Area could not be saved", onDone: () => setOpen(false) })
  const edit = (r: Row | null) => { setEditing(r); setF(r ? { name: String(r.name), latitude: String(r.latitude), longitude: String(r.longitude), radius: String(Number(r.radius_meters) / 1000), payout: num(r.payout_paise) === null ? "" : String(Number(r.payout_paise) / 100), enabled: bool(r.enabled) } : emptyArea); setOpen(true) }
  const problem = deliveryAreaProblem(f)
  return <section className="space-y-4"><header><h2 className="text-xl font-semibold">Local delivery coverage & payouts</h2><p className="text-sm text-mo-body">Only explicitly enabled seller/area combinations use own partners. Customer shipping charges and existing shipments are unchanged. Live dispatch has a separate rollout switch.</p></header><button className={buttonPrimary} onClick={() => edit(null)}>Add delivery area</button>
    <DataTable caption="Delivery areas" rows={q.data ?? []} rowId={r => String(r.id)} loading={q.isLoading} error={q.error} onRetry={q.refetch} columns={[
      { key: "name", header: "Area", value: r => str(r.name), filterable: true },
      { key: "radius", header: "Radius", value: r => num(r.radius_meters), cell: r => `${Number(r.radius_meters) / 1000} km` },
      { key: "payout", header: "Partner payout / delivery", value: r => num(r.payout_paise), cell: r => money(r.payout_paise) },
      { key: "enabled", header: "Status", value: r => bool(r.enabled) ? "Enabled" : "Disabled" },
      { key: "actions", header: "Manage", value: r => str(r.id), cell: r => <div className="flex gap-2"><button className={buttonSecondary} onClick={() => edit(r)}>Edit</button><button className={buttonSecondary} onClick={() => setArea(r)}>Sellers</button></div> },
    ]} emptyMessage="No local delivery areas configured. Existing couriers remain in use." />
    {area ? <DeliveryAreaSellers key={String(area.id)} area={area} close={() => setArea(null)} /> : null}
    <ConfirmReasonDialog open={open} title={editing ? "Edit delivery area" : "Add delivery area"} confirmLabel="Save area" requireReason busy={save.isPending} canConfirm={!problem} onClose={() => setOpen(false)} onConfirm={r => save.mutate(r)}>
      <div className="grid gap-4 sm:grid-cols-2">{([{ key: "name", label: "Area name" }, { key: "latitude", label: "Centre latitude" }, { key: "longitude", label: "Centre longitude" }, { key: "radius", label: "Radius (km)" }, { key: "payout", label: "Partner payout (₹ per delivery)" }] as const).map(({ key, label }) => <Field key={key} label={label}>{id => <input id={id} className={inputClass} value={f[key]} inputMode={key === "name" ? "text" : "decimal"} onChange={e => setF({ ...f, [key]: e.target.value })} />}</Field>)}<label className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={e => setF({ ...f, enabled: e.target.checked })} /> Enable area</label></div><p className="mt-3 text-sm text-mo-body">Payout is snapshotted before a partner accepts. Later changes affect new jobs only.</p>{problem ? <p className="mt-2 text-sm" role="status">{problem}</p> : null}
    </ConfirmReasonDialog>
  </section>
}

function DeliveryAreaSellers({ area, close }: { area: Row; close: () => void }) {
  const q = useAdminList("commerce", `${BASE}/areas/${String(area.id)}/sellers`)
  const [seller, setSeller] = useState("")
  const [change, setChange] = useState<{ id: string; revision: number; enabled: boolean } | null>(null)
  const save = useAdminMutation<string>({ request: reason => ({ method: "put", url: `${BASE}/areas/${String(area.id)}/sellers/${change?.id}`, body: { enabled: change?.enabled, revision: change?.revision, reason } }), invalidate, successMessage: "Seller delivery setting saved", errorTitle: "Seller setting could not be saved", onDone: () => { setChange(null); setSeller("") } })
  return <div className="rounded-mo border border-mo bg-mo-surface p-5 space-y-4"><div className="flex justify-between gap-3"><h3 className="font-semibold">Sellers in {String(area.name)}</h3><button className={buttonSecondary} onClick={close}>Close</button></div><p className="text-sm text-mo-body">Seller pickup location and customer delivery location must both be in coverage. Enable only sellers agreed for local delivery.</p><div className="flex flex-wrap items-end gap-2"><Field label="Seller ID">{id => <input id={id} className={inputClass} value={seller} onChange={e => setSeller(e.target.value)} placeholder="Seller UUID" />}</Field><button className={buttonSecondary} disabled={!isUuid(seller) || q.isLoading || !!q.error || (q.data ?? []).some(r => r.seller_id === seller.trim())} onClick={() => setChange({ id: seller.trim(), revision: 0, enabled: true })}>Enable seller</button></div>
    <DataTable caption="Seller opt-ins" rows={q.data ?? []} rowId={r => String(r.seller_id)} loading={q.isLoading} error={q.error} onRetry={q.refetch} columns={[
      { key: "seller", header: "Seller", value: r => str(r.seller_id), cell: r => <IdText id={r.seller_id} /> },
      { key: "enabled", header: "Status", value: r => bool(r.enabled) ? "Enabled" : "Disabled" },
      { key: "action", header: "Action", value: r => str(r.seller_id), cell: r => <button className={buttonSecondary} onClick={() => setChange({ id: String(r.seller_id), revision: Number(r.revision), enabled: !bool(r.enabled) })}>{bool(r.enabled) ? "Disable" : "Enable"}</button> },
    ]} emptyMessage="No sellers opted in for this area." />
    <ConfirmReasonDialog open={!!change} title={change?.enabled ? "Enable local seller delivery" : "Disable local seller delivery"} confirmLabel="Save setting" requireReason busy={save.isPending} onClose={() => setChange(null)} onConfirm={r => save.mutate(r)} />
  </div>
}

export function CommerceDeliveryJobs() {
  const q = useAdminList("commerce", `${BASE}/jobs`, { refetchInterval: 15000 })
  const tickets = useAdminList("commerce", `${BASE}/support`)
  const [action, setAction] = useState<{ row: Row; kind: "cancel" | "retry" | "resolve" } | null>(null)
  const save = useAdminMutation<string>({ request: reason => ({ method: "post", url: action?.kind === "resolve" ? `${BASE}/support/${String(action.row.id)}/resolve` : `${BASE}/jobs/${String(action?.row.id)}/${action?.kind}`, body: action?.kind === "resolve" ? { note: reason } : { expected_revision: action?.row.revision, reason } }), invalidate, successMessage: "Delivery action saved", errorTitle: "Delivery action could not be saved", onDone: () => setAction(null) })
  return <section className="space-y-5"><header><h2 className="text-xl font-semibold">Delivery operations</h2><p className="text-sm text-mo-body">Latest 100 jobs. Unassigned jobs stay visible until an eligible partner accepts. Pickup and delivery—not assignment—advance shipment tracking.</p></header>
    <DataTable caption="Commerce delivery jobs" rows={q.data ?? []} rowId={r => String(r.id)} loading={q.isLoading} error={q.error} onRetry={q.refetch} columns={[
      { key: "order", header: "Order / shipment", value: r => str(r.order_id), filterable: true, cell: r => <div><IdText id={r.order_id} /><div className="text-xs"><IdText id={r.shipment_id} /></div></div> }, status,
      { key: "route", header: "Pickup → delivery", value: r => str(r.pickup_label), cell: r => <div>{str(r.pickup_label) ?? "Pickup"}<br />{str(r.drop_label) ?? "Delivery"}</div> },
      { key: "partner", header: "Partner", value: r => str(r.partner_user_id), cell: r => str(r.partner_user_id) && r.partner_user_id !== "00000000-0000-0000-0000-000000000000" ? <IdText id={r.partner_user_id} /> : "Unassigned" },
      { key: "payout", header: "Payout", value: r => num(r.payout_paise), cell: r => money(r.payout_paise) },
      { key: "created", header: "Created", value: r => str(r.created_at), cell: r => when(r.created_at), sortable: true },
      { key: "actions", header: "Actions", value: r => str(r.id), cell: r => <div className="flex flex-wrap gap-2">{r.status === "failed" ? <button className={buttonSecondary} onClick={() => setAction({ row: r, kind: "retry" })}>Retry dispatch</button> : null}{["awaiting_ready", "unassigned", "assigned"].includes(String(r.status)) ? <button className={buttonSecondary} onClick={() => setAction({ row: r, kind: "cancel" })}>Cancel</button> : null}</div> },
    ]} emptyMessage="No local delivery jobs yet." />
    <h3 className="text-lg font-semibold">Delivery support</h3><DataTable caption="Delivery support tickets" rows={tickets.data ?? []} rowId={r => String(r.id)} loading={tickets.isLoading} error={tickets.error} onRetry={tickets.refetch} columns={[
      { key: "job", header: "Job", value: r => str(r.job_id), cell: r => <IdText id={r.job_id} /> },
      { key: "reason", header: "Issue", value: r => str(r.reason), filterable: true }, status,
      { key: "created", header: "Created", value: r => str(r.created_at), cell: r => when(r.created_at) },
      { key: "action", header: "Action", value: r => str(r.id), cell: r => r.status === "open" ? <button className={buttonSecondary} onClick={() => setAction({ row: r, kind: "resolve" })}>Resolve</button> : null },
    ]} emptyMessage="No delivery support tickets." />
    <ConfirmReasonDialog open={!!action} title={action?.kind === "resolve" ? "Resolve delivery support" : action?.kind === "retry" ? "Retry delivery dispatch" : "Cancel local delivery"} description={action?.kind === "retry" ? "Only a failed job that has not been picked up can be retried. No second courier will be booked." : action?.kind === "cancel" ? "This cancels local delivery work. It does not refund or cancel the customer's order." : undefined} confirmLabel="Confirm" requireReason destructive={action?.kind === "cancel"} busy={save.isPending} onClose={() => setAction(null)} onConfirm={r => save.mutate(r)} />
  </section>
}

