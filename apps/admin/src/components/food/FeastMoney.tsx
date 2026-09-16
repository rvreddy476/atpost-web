"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation, useStepUpRead } from "@/hooks/useAdminMutation"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, num, readObject, str, when, type Row } from "@/lib/admin/data"
import { formatPaise, refundHint, rupeesToPaise } from "@/lib/admin/money"
import { adminErrorMessage } from "@/lib/admin/mutation"
import { can } from "@/lib/admin/sections"
import { FOOD, FOOD_KEY } from "./FeastApprovals"

const LIMIT = 50
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Refund requests raised by support. Approving ₹5,000 or more goes to a second approver. */
export function FeastRefunds() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("requested")
  const [deciding, setDeciding] = useState<Row | null>(null)
  const list = useAdminList("food", `${FOOD}/refunds?limit=200${status ? `&status=${status}` : ""}`, { enabled: can(me, "food", "refunds.read") })

  const decide = useAdminMutation<{ id: string; status: string; reason: string }>({
    request: ({ id, status: next, reason }) => ({ method: "post", url: `${FOOD}/refunds/${encodeURIComponent(id)}/decide`, body: { status: next, reason } }),
    invalidate: [FOOD_KEY],
    successMessage: "Refund request decided",
    errorTitle: "Refund decision failed",
    onDone: () => setDeciding(null),
  })

  if (!can(me, "food", "refunds.read")) {
    return <p className="text-sm text-mo-body">Issue a refund from an order&apos;s detail in Orders. Listing refund requests needs the refunds read permission.</p>
  }

  const columns: DataColumn<Row>[] = [
    { key: "order", header: "Order", value: (r) => str(r.order_id), filterable: true, cell: (r) => <IdText id={r.order_id} /> },
    { key: "amount", header: "Amount", value: (r) => rupeesToPaise(r.amount), sortable: true, align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(rupeesToPaise(r.amount))}</span> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "created", header: "Requested", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        str(r.status) === "requested" && can(me, "food", "refund.issue") ? (
          <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide refund ${str(r.id)}`}>
            Decide
          </button>
        ) : null,
    },
  ]

  const hint = deciding ? refundHint(rupeesToPaise(deciding.amount)) : null

  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Status">
          {(id) => (
            <select id={id} className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {["requested", "approved", "rejected", "processed"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Refund requests" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No refund requests with this status." />
      <ChoiceDialog
        open={deciding !== null}
        title="Decide this refund request"
        description={
          hint ? (
            <>
              {formatPaise(rupeesToPaise(deciding?.amount))} requested. Deciding needs a fresh 2FA code.{" "}
              <span data-testid="refund-hint">Approving: {hint.message}</span>
            </>
          ) : null
        }
        choiceLabel="Decision"
        choices={[
          { value: "approved", label: "Approve", hint: hint?.secondApprover !== false ? "This approval goes to a second admin." : undefined },
          { value: "rejected", label: "Reject", destructive: true },
        ]}
        busy={decide.isPending}
        onConfirm={(next, reason) => deciding && decide.mutate({ id: String(deciding.id), status: next, reason })}
        onClose={() => setDeciding(null)}
      />
    </>
  )
}

/** Settlements: generate for a period, list what is owed, mark paid (two-person), and settlement files. */
export function FeastSettlements() {
  const { me } = useAdmin()
  return (
    <div className="space-y-8">
      {can(me, "food", "settlement.generate") ? <GenerateSettlements /> : null}
      {can(me, "food", "settlement.read") || can(me, "food", "settlement.mark_paid") ? (
        <>
          <SettlementList kind="restaurants" />
          <SettlementList kind="delivery-partners" />
        </>
      ) : null}
      {can(me, "food", "settlement.read") || can(me, "food", "settlement.generate") ? <SettlementFiles /> : null}
    </div>
  )
}

function GenerateSettlements() {
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [confirming, setConfirming] = useState(false)
  const valid = DATE.test(start) && DATE.test(end) && start <= end
  const generate = useAdminMutation<{ reason: string }>({
    request: () => ({ method: "post", url: `${FOOD}/settlements/generate`, body: { period_start: start, period_end: end }, idempotent: true }),
    invalidate: [FOOD_KEY],
    successMessage: (data) => {
      const body = readObject(data)
      const r = Array.isArray(body?.restaurant_settlements) ? body.restaurant_settlements.length : 0
      const d = Array.isArray(body?.delivery_settlements) ? body.delivery_settlements.length : 0
      return `Generated ${r} restaurant and ${d} rider settlements`
    },
    errorTitle: "Generating settlements failed",
    onDone: () => setConfirming(false),
  })
  return (
    <section>
      <h3 className="mb-2 font-mo-display text-base font-semibold text-mo-ink">Generate settlements</h3>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period start">{(id) => <input id={id} type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Period end">{(id) => <input id={id} type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        <button type="button" className={buttonPrimary} disabled={!valid} onClick={() => setConfirming(true)}>
          Generate
        </button>
      </div>
      <ConfirmReasonDialog
        open={confirming}
        title="Generate settlements?"
        description={`For ${start} to ${end}. This computes what every restaurant and rider is owed, and needs a fresh 2FA code.`}
        confirmLabel="Generate"
        destructive
        busy={generate.isPending}
        onConfirm={(reason) => generate.mutate({ reason })}
        onClose={() => setConfirming(false)}
      />
    </section>
  )
}

function SettlementList({ kind }: { kind: "restaurants" | "delivery-partners" }) {
  const { me } = useAdmin()
  const [offset, setOffset] = useState(0)
  const [paying, setPaying] = useState<Row | null>(null)
  const [reference, setReference] = useState("")
  const restaurants = kind === "restaurants"
  const list = useAdminList("food", `${FOOD}/settlements/${kind}?limit=${LIMIT}&offset=${offset}`, { enabled: can(me, "food", "settlement.read") })
  const markPaid = useAdminMutation<{ id: string; reason: string }>({
    request: ({ id, reason }) => ({ method: "post", url: `${FOOD}/settlements/${kind}/${encodeURIComponent(id)}/mark-paid`, body: { reference: reference.trim(), reason } }),
    invalidate: [FOOD_KEY],
    successMessage: "Settlement marked paid",
    errorTitle: "Marking paid failed",
    onDone: () => {
      setPaying(null)
      setReference("")
    },
  })
  const payout = (r: Row) => num(r.payout_paise) ?? rupeesToPaise(r.payout_amount)

  const columns: DataColumn<Row>[] = [
    {
      key: "who",
      header: restaurants ? "Restaurant" : "Rider",
      value: (r) => str(restaurants ? r.restaurant_name : r.delivery_partner_name),
      sortable: true,
      filterable: true,
    },
    { key: "period", header: "Period", value: (r) => str(r.period_start), sortable: true, cell: (r) => `${str(r.period_start) ?? "—"} → ${str(r.period_end) ?? "—"}` },
    { key: "payout", header: "Payout", value: (r) => payout(r), sortable: true, align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(payout(r))}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, filterable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "PAID" ? "good" : r.status === "FAILED" ? "bad" : "normal"} /> },
    { key: "ref", header: "Reference", value: (r) => str(r.paid_reference) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        can(me, "food", "settlement.mark_paid") && str(r.status) !== "PAID" ? (
          <button type="button" className={buttonSecondary} onClick={() => setPaying(r)} aria-label={`Mark settlement ${str(r.id)} paid`}>
            Mark paid
          </button>
        ) : null,
    },
  ]

  return (
    <section>
      <h3 className="mb-2 font-mo-display text-base font-semibold text-mo-ink">{restaurants ? "Restaurant settlements" : "Rider settlements"}</h3>
      {can(me, "food", "settlement.read") ? (
        <>
          <DataTable caption={restaurants ? "Restaurant settlements" : "Rider settlements"} rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No settlements." pageSize={LIMIT} />
          <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
        </>
      ) : (
        <p className="text-sm text-mo-body">Listing settlements needs the settlement read permission.</p>
      )}
      <ConfirmReasonDialog
        open={paying !== null}
        title="Mark this settlement paid?"
        description={
          paying ? `${formatPaise(payout(paying))}. Marking paid always goes to a second admin for approval, and needs a fresh 2FA code.` : null
        }
        confirmLabel="Send for approval"
        destructive
        canConfirm={reference.trim().length > 0}
        busy={markPaid.isPending}
        onConfirm={(reason) => paying && markPaid.mutate({ id: String(paying.id), reason })}
        onClose={() => setPaying(null)}
      >
        <Field label="Bank reference (UTR)">{(id) => <input id={id} className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
      </ConfirmReasonDialog>
    </section>
  )
}

function SettlementFiles() {
  const { me } = useAdmin()
  const read = useStepUpRead()
  const [creating, setCreating] = useState(false)
  const [fileKind, setFileKind] = useState("restaurant")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [link, setLink] = useState<{ id: string; url: string } | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const list = useAdminList("food", `${FOOD}/settlements/files?limit=${LIMIT}`, { enabled: can(me, "food", "settlement.read") })
  const create = useAdminMutation<{ reason: string }>({
    request: () => ({ method: "post", url: `${FOOD}/settlements/files`, body: { kind: fileKind, period_start: start, period_end: end } }),
    invalidate: [FOOD_KEY],
    successMessage: "Settlement file created",
    errorTitle: "Creating the file failed",
    onDone: () => setCreating(false),
  })

  /** 200 {data:{download_url}}: opened in a new tab, never fetched through the console. */
  const download = async (id: string) => {
    setDownloadError(null)
    try {
      const raw = await read(`${FOOD}/settlements/files/${encodeURIComponent(id)}/download`)
      if (raw === null) return
      const url = str(readObject(raw)?.download_url)
      if (!url || !/^https:\/\//i.test(url)) {
        setDownloadError("The server did not return a download link.")
        return
      }
      setLink({ id, url })
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      setDownloadError(adminErrorMessage(err, "The download link could not be fetched."))
    }
  }

  const columns: DataColumn<Row>[] = [
    { key: "kind", header: "Kind", value: (r) => str(r.kind), cell: (r) => humanise(r.kind) },
    { key: "period", header: "Period", value: (r) => str(r.period_start), sortable: true, cell: (r) => `${str(r.period_start) ?? "—"} → ${str(r.period_end) ?? "—"}` },
    { key: "rows", header: "Rows", value: (r) => num(r.row_count), align: "right" },
    { key: "total", header: "Total", value: (r) => rupeesToPaise(r.total_amount), align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(rupeesToPaise(r.total_amount))}</span> },
    { key: "generated", header: "Generated", value: (r) => str(r.generated_at), sortable: true, cell: (r) => when(r.generated_at) },
    {
      key: "download",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => void download(String(r.id))} aria-label={`Download settlement file ${str(r.id)}`}>
          <Download className="h-4 w-4" aria-hidden="true" /> Download
        </button>
      ),
    },
  ]

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 font-mo-display text-base font-semibold text-mo-ink">Settlement files</h3>
        {can(me, "food", "settlement.generate") ? (
          <button type="button" className={buttonSecondary} onClick={() => setCreating(true)}>
            New file
          </button>
        ) : null}
      </div>
      {downloadError ? <p role="alert" className="mb-2 text-sm text-mo-bad">{downloadError}</p> : null}
      {link ? (
        <p className="mb-2 text-sm text-mo-body">
          The download opened in a new tab. If it did not,{" "}
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-mo-cyan underline">
            open the file
          </a>
          . The link expires shortly.
        </p>
      ) : null}
      {can(me, "food", "settlement.read") ? (
        <DataTable caption="Settlement files" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No settlement files." />
      ) : null}
      <ConfirmReasonDialog
        open={creating}
        title="Create a settlement file"
        description="The bank upload file for a period. Needs a fresh 2FA code."
        confirmLabel="Create"
        canConfirm={DATE.test(start) && DATE.test(end) && start <= end}
        busy={create.isPending}
        onConfirm={(reason) => create.mutate({ reason })}
        onClose={() => setCreating(false)}
      >
        <Field label="Kind">
          {(id) => (
            <select id={id} className={inputClass} value={fileKind} onChange={(e) => setFileKind(e.target.value)}>
              <option value="restaurant">Restaurants</option>
              <option value="delivery">Riders</option>
            </select>
          )}
        </Field>
        <Field label="Period start">{(id) => <input id={id} type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Period end">{(id) => <input id={id} type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </ConfirmReasonDialog>
    </section>
  )
}
