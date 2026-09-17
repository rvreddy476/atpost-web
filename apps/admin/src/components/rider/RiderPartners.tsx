"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { bool, humanise, num, str, when, type Row } from "@/lib/admin/data"
import { PARTNER_STATUSES, RIDER, RIDER_PAGE, RIDER_WRITES, maskPhone, partnerTone, riderListQuery, type RiderWrite } from "@/lib/admin/rider"
import { can } from "@/lib/admin/sections"
import { RiderActionDialog, StatusFilter, useRiderMutation } from "./RiderBits"

type PartnerWrite = "partner.approve" | "partner.reject" | "partner.suspend" | "partner.block"

/**
 * Partners: the list (filter by status, search by name or phone), one
 * partner's detail, and the decisions. Approve and reject are one
 * permission; suspend and block another, and those two need a fresh 2FA
 * code. Phone numbers are masked in the list; the detail view shows them.
 */
export function RiderPartners() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("pending_verification")
  const [q, setQ] = useState("")
  const [applied, setApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<Row | null>(null)
  const list = useAdminList("rider", `${RIDER}/partners?${riderListQuery({ status, q: applied }, offset)}`)
  const mayRead = can(me, "rider", "partners.read")

  if (open) return <PartnerDetail partner={open} onBack={() => setOpen(null)} />
  if (!mayRead) return <p className="text-sm text-mo-body">Listing partners needs the partners read permission.</p>

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Partner", value: (r) => str(r.full_name), sortable: true, cell: (r) => <span>{str(r.full_name) ?? "—"} <IdText id={r.id} /></span> },
    { key: "phone", header: "Phone", value: (r) => maskPhone(r.phone) },
    { key: "type", header: "Type", value: (r) => str(r.partner_type), cell: (r) => humanise(r.partner_type) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={partnerTone(r.status)} /> },
    { key: "kyc", header: "KYC", value: (r) => str(r.kyc_status), cell: (r) => humanise(r.kyc_status) },
    { key: "bank", header: "Bank", value: (r) => str(r.bank_status), cell: (r) => humanise(r.bank_status) },
    { key: "rating", header: "Rating", value: (r) => num(r.rating), sortable: true, align: "right", cell: (r) => (num(r.rating) ?? 0).toFixed(1) },
    { key: "rides", header: "Rides", value: (r) => num(r.total_rides_completed), sortable: true, align: "right" },
    { key: "online", header: "Online", value: (r) => (bool(r.is_online) ? "yes" : "no"), cell: (r) => (bool(r.is_online) ? <StatusPill value="online" tone="good" /> : "—") },
    { key: "joined", header: "Joined", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpen(r)} aria-label={`Open partner ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(q.trim())
          setOffset(0)
        }}
      >
        <StatusFilter value={status} options={PARTNER_STATUSES} onChange={(v) => { setStatus(v); setOffset(0) }} />
        <div className="w-72">
          <Field label="Search">{(id) => <input id={id} type="search" className={inputClass} value={q} placeholder="Name or phone" onChange={(e) => setQ(e.target.value)} />}</Field>
        </div>
        <button type="submit" className={buttonSecondary}>
          Search
        </button>
      </form>
      <DataTable caption="Partners" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No partners match." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
    </>
  )
}

function PartnerDetail({ partner, onBack }: { partner: Row; onBack: () => void }) {
  const { me } = useAdmin()
  const id = String(partner.id)
  const detail = useAdminObject("rider", `${RIDER}/partners/${encodeURIComponent(id)}`)
  const [pending, setPending] = useState<PartnerWrite | null>(null)
  const mutation = useRiderMutation({ onDone: () => setPending(null) })
  const p = detail.data ?? partner
  const status = str(p.status)
  const mayDecide = can(me, "rider", RIDER_WRITES["partner.approve"].permission)
  const maySuspend = can(me, "rider", RIDER_WRITES["partner.suspend"].permission)

  const suffix: Record<PartnerWrite, string> = { "partner.approve": "approve", "partner.reject": "reject", "partner.suspend": "suspend", "partner.block": "block" }
  const run = (write: PartnerWrite, reason: string) =>
    mutation.mutate({ write, url: `${RIDER}/partners/${encodeURIComponent(id)}/${suffix[write]}`, body: RIDER_WRITES[write].reason ? { reason } : {} })

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All partners
      </button>
      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Partner detail">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">{str(p.full_name) ?? "Partner"}</h3>
          <StatusPill value={status} tone={partnerTone(status)} />
        </div>
        {detail.error ? (
          <p role="alert" className="mb-3 text-sm text-mo-bad">
            {detail.error}
          </p>
        ) : null}
        <Details
          items={[
            ["Partner id", <IdText key="id" id={p.id} />],
            ["User", <IdText key="u" id={p.user_id} />],
            ["Type", humanise(p.partner_type)],
            ["Phone", str(p.phone)],
            ["Email", str(p.email)],
            ["City", str(p.city_id) ? <IdText key="c" id={p.city_id} /> : null],
            ["KYC", humanise(p.kyc_status)],
            ["Bank", humanise(p.bank_status)],
            ["Rating", (num(p.rating) ?? 0).toFixed(2)],
            ["Rides completed / cancelled", `${num(p.total_rides_completed) ?? 0} / ${num(p.total_rides_cancelled) ?? 0}`],
            ["Acceptance / cancellation rate", `${((num(p.acceptance_rate) ?? 0) * 100).toFixed(0)}% / ${((num(p.cancellation_rate) ?? 0) * 100).toFixed(0)}%`],
            ["Fraud score", (num(p.fraud_score) ?? 0).toFixed(2)],
            ["Online", bool(p.is_online) ? "Yes" : "No"],
            ["Approved", when(p.approved_at)],
            ["Joined", when(p.created_at)],
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {mayDecide && status === "pending_verification" ? (
            <>
              <button type="button" className={buttonPrimary} onClick={() => setPending("partner.approve")}>
                Approve
              </button>
              <button type="button" className={buttonDanger} onClick={() => setPending("partner.reject")}>
                Reject
              </button>
            </>
          ) : null}
          {maySuspend && status === "active" ? (
            <button type="button" className={buttonDanger} onClick={() => setPending("partner.suspend")}>
              Suspend
            </button>
          ) : null}
          {maySuspend && status !== "blocked" ? (
            <button type="button" className={buttonDanger} onClick={() => setPending("partner.block")}>
              Block
            </button>
          ) : null}
        </div>
        {!mayDecide && !maySuspend ? <p className="mt-3 text-xs text-mo-body">Deciding on a partner needs the approve or suspend permission.</p> : null}
      </section>
      <RiderActionDialog write={pending as RiderWrite | null} subject={str(p.full_name)} busy={mutation.isPending} onConfirm={(reason) => pending && run(pending, reason)} onClose={() => setPending(null)} />
    </div>
  )
}
