"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, inputClass } from "@/components/blocks/buttons"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isUuid, when, type Row } from "@/lib/admin/data"
import {
  DECISION_BODIES,
  DOORSTEP_PAGE,
  DOORSTEP_READS,
  PRO_PRICE_STATUSES,
  nextCursor,
  paise,
  priceDelta,
  priceItemLabel,
  priceReviewNotes,
  proTone,
  readProPrice,
  reviewTone,
  unitLabel,
  type ProPriceView,
} from "@/lib/admin/doorstep"
import { CursorPager, DoorstepActionDialog, useDoorstepMutation, useMayWrite } from "./DoorstepBits"

type Pending = { write: "pro_price.approve" | "pro_price.reject"; price: ProPriceView } | null

const STATUS_LABELS: Record<string, string> = { pending: "Waiting for review", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" }

/** A delta against another price, or a dash when there is nothing to compare with. */
function Delta({ proposed, base }: { proposed: number | null; base: number | null }) {
  const d = priceDelta(proposed, base)
  if (!d) return <span className="text-mo-body">—</span>
  return <span className={d.tone === "warn" ? "text-mo-warn" : "text-mo-ink"}>{d.label}</span>
}

/**
 * Prices (doorstep:prices.review): what professionals ask for each service
 * option or add-on. Nothing a professional submits is live until an admin
 * approves it (founder, 4 Oct 2026): a new price waits here, oldest first,
 * beside their current approved price and the city's suggested price (never
 * charged). Approving makes it bookable now and needs a fresh 2FA code;
 * rejecting needs a reason the professional is shown.
 */
export function DoorstepPriceQueue() {
  const [status, setStatus] = useState<string>("pending")
  const [city, setCity] = useState("")
  const [proId, setProId] = useState("")
  const [cursor, setCursor] = useState("")
  const [pending, setPending] = useState<Pending>(null)
  const mayWrite = useMayWrite()
  const mutation = useDoorstepMutation({ onDone: () => setPending(null) })
  const proFilter = isUuid(proId) ? proId : ""
  const list = useAdminList("doorstep", DOORSTEP_READS.proPrices({ status, city, proId: proFilter }, cursor))
  const rows = list.data
  const view = (r: Row) => readProPrice(r)

  const columns: DataColumn<Row>[] = [
    {
      key: "pro",
      header: "Professional",
      value: (r) => view(r).proName,
      sortable: true,
      filterable: true,
      cell: (r) => {
        const v = view(r)
        return (
          <span className="inline-flex flex-col gap-0.5">
            <span>
              {v.proName} <IdText id={v.proId} />
            </span>
            {v.proStatus !== "approved" ? <StatusPill value={v.proStatus} tone={proTone(v.proStatus)} /> : null}
          </span>
        )
      },
    },
    {
      key: "service",
      header: "Service",
      value: (r) => view(r).serviceName,
      sortable: true,
      filterable: true,
      cell: (r) => {
        const v = view(r)
        return (
          <span className="inline-flex flex-col">
            <span>{v.serviceName}</span>
            <span className="text-xs text-mo-body">
              {humanise(v.categorySlug)} · {v.city ?? "—"}
            </span>
          </span>
        )
      },
    },
    { key: "item", header: "Option or add-on", value: (r) => priceItemLabel(view(r)), filterable: true },
    { key: "unit", header: "Unit", value: (r) => view(r).unit, cell: (r) => unitLabel(view(r).unit) },
    { key: "proposed", header: "Proposed", value: (r) => view(r).proposedPaise, sortable: true, align: "right", cell: (r) => <strong className="text-mo-ink">{paise(view(r).proposedPaise)}</strong> },
    { key: "current", header: "Current approved", value: (r) => view(r).currentApprovedPaise, align: "right", cell: (r) => (view(r).currentApprovedPaise === null ? <span className="text-mo-body">None live</span> : paise(view(r).currentApprovedPaise)) },
    { key: "vs_current", header: "vs current", value: () => null, align: "right", cell: (r) => <Delta proposed={view(r).proposedPaise} base={view(r).currentApprovedPaise} /> },
    { key: "suggested", header: "Suggested (city)", value: (r) => view(r).suggestedPaise, align: "right", cell: (r) => paise(view(r).suggestedPaise) },
    { key: "vs_suggested", header: "vs suggested", value: () => null, align: "right", cell: (r) => <Delta proposed={view(r).proposedPaise} base={view(r).suggestedPaise} /> },
    { key: "submitted", header: "Submitted", value: (r) => view(r).submittedAt, sortable: true, cell: (r) => when(view(r).submittedAt) },
    { key: "status", header: "Status", value: (r) => view(r).status, sortable: true, cell: (r) => <StatusPill value={STATUS_LABELS[view(r).status ?? ""] ?? view(r).status} tone={reviewTone(view(r).status)} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => {
        const v = view(r)
        if (v.status === "pending" && v.id) {
          const approve = mayWrite("pro_price.approve")
          const reject = mayWrite("pro_price.reject")
          if (!approve && !reject) return null
          return (
            <span className="inline-flex gap-1">
              {approve ? (
                <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "pro_price.approve", price: v })} aria-label={`Approve price ${v.id}`}>
                  Approve
                </button>
              ) : null}
              {reject ? (
                <button type="button" className={buttonDanger} onClick={() => setPending({ write: "pro_price.reject", price: v })} aria-label={`Reject price ${v.id}`}>
                  Reject
                </button>
              ) : null}
            </span>
          )
        }
        return v.reason ? <span className="text-xs text-mo-body">{v.reason}</span> : null
      },
    },
  ]

  const p = pending?.price ?? null
  const reset = () => setCursor("")

  return (
    <section aria-label="Price review" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Status">
            {(id) => (
              <select id={id} className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); reset() }}>
                {PRO_PRICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="w-32">
          <Field label="City">{(id) => <input id={id} className={inputClass} value={city} placeholder="HYD" maxLength={3} onChange={(e) => { setCity(e.target.value.toUpperCase()); reset() }} />}</Field>
        </div>
        <div className="min-w-[18rem] flex-1">
          <Field label="Professional id (optional)" hint={proId && !proFilter ? <span className="text-mo-bad">Enter a full professional id, or leave it blank.</span> : undefined}>
            {(id) => <input id={id} className={inputClass} value={proId} placeholder="All professionals" onChange={(e) => { setProId(e.target.value.trim()); reset() }} />}
          </Field>
        </div>
      </div>
      <p className="text-xs text-mo-body">Nothing a professional submits is live until an admin approves it. Prices include GST and are per unit. The suggested price is the city&rsquo;s guide and is never charged.</p>
      <DataTable
        caption={status === "pending" ? "Prices waiting for review (oldest first)" : `Prices: ${STATUS_LABELS[status]?.toLowerCase() ?? status}`}
        rows={rows}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage={status === "pending" ? "No prices are waiting for review." : "No prices with this status."}
        pageSize={DOORSTEP_PAGE}
      />
      <CursorPager cursor={cursor} next={nextCursor(list.raw)} onChange={setCursor} />

      <DoorstepActionDialog
        write={pending?.write ?? null}
        subject={p ? `${p.proName}’s price` : null}
        busy={mutation.isPending}
        reasonLabel={pending?.write === "pro_price.approve" ? "Note" : "Reason (the professional is shown it)"}
        onConfirm={(reason) => pending?.price.id && mutation.mutate({ write: pending.write, target: { id: pending.price.id }, body: DECISION_BODIES.price(reason) })}
        onClose={() => setPending(null)}
      >
        {p ? (
          <div className="space-y-3">
            <Details
              items={[
                ["Service", `${p.serviceName} · ${humanise(p.categorySlug)} · ${p.city ?? "—"}`],
                ["Option or add-on", `${priceItemLabel(p)}, ${unitLabel(p.unit)}`],
                ["Proposed (GST incl.)", <strong key="p" className="text-mo-ink">{paise(p.proposedPaise)}</strong>],
                ["Current approved", p.currentApprovedPaise === null ? "None live" : <span key="c">{paise(p.currentApprovedPaise)} (<Delta proposed={p.proposedPaise} base={p.currentApprovedPaise} />)</span>],
                ["Suggested (city)", p.suggestedPaise === null ? "None set" : <span key="s">{paise(p.suggestedPaise)} (<Delta proposed={p.proposedPaise} base={p.suggestedPaise} />)</span>],
                ["Submitted", when(p.submittedAt)],
              ]}
            />
            <ul className="list-disc space-y-1 pl-5 text-sm text-mo-body">
              {priceReviewNotes(p).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </DoorstepActionDialog>
    </section>
  )
}
