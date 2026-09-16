"use client"

import { useState } from "react"
import { TriangleAlert } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { Dialog } from "@/components/blocks/Dialog"
import { Details, ErrorNote, Field, IdText, Loading, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { humanise, isRecord, isUuid, num, readList, readObject, str, when, type Row } from "@/lib/admin/data"
import { formatPaise } from "@/lib/admin/money"
import { PAY, RESOLUTIONS, paymentsApplicationLabel, paymentsQuery, resolveHint, resolveNeedsSecondApprover } from "@/lib/admin/payments"

export const PAY_KEY = adminKey("payments")
const LIMIT = 50

export interface PaymentsSectionProps {
  /** "" for every application, otherwise one application key. */
  application: string
  can: (action: string) => boolean
}

const minor = (r: Row, key = "amount_minor") => (str(r.currency) === null || str(r.currency)?.toUpperCase() === "INR" ? num(r[key]) : null)
const money = (r: Row, key = "amount_minor") => <span className="font-mo-mono">{formatPaise(minor(r, key))}</span>

function useCursor() {
  const [stack, setStack] = useState<string[]>([])
  return {
    current: stack.at(-1) ?? null,
    newer: stack.length > 0 ? () => setStack((s) => s.slice(0, -1)) : null,
    older: (next: string | null) => (next ? () => setStack((s) => [...s, next]) : null),
    reset: () => setStack([]),
  }
}

function Pager({ newer, older }: { newer: (() => void) | null; older: (() => void) | null }) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" className={buttonSecondary} disabled={!newer} onClick={() => newer?.()}>
        Newer rows
      </button>
      <button type="button" className={buttonSecondary} disabled={!older} onClick={() => older?.()}>
        Older rows
      </button>
    </div>
  )
}

const nextOf = (raw: unknown, key: string) => {
  const body = readObject(raw)
  const v = body?.[key]
  return typeof v === "number" ? String(v) : str(v)
}

// ---------------------------------------------------------------------------
// Refunds needing attention
// ---------------------------------------------------------------------------

export function PaymentsRefunds({ application, can }: PaymentsSectionProps) {
  const cursor = useCursor()
  const [openId, setOpenId] = useState<string | null>(null)
  const [resolving, setResolving] = useState<Row | null>(null)
  const readAllowed = can("refunds.read")
  const list = useAdminList("payments", `${PAY}/refunds/needs-attention${paymentsQuery(application, { limit: LIMIT, cursor: cursor.current })}`, { enabled: readAllowed })

  const resolve = useAdminMutation<{ id: string; resolution: string; note: string }>({
    request: ({ id, resolution, note }) => ({ method: "post", url: `${PAY}/refunds/${encodeURIComponent(id)}/resolve${paymentsQuery(application)}`, body: { resolution, note } }),
    invalidate: [PAY_KEY],
    successMessage: "Refund resolved",
    errorTitle: "Resolving the refund failed",
    onDone: () => {
      setResolving(null)
      setOpenId(null)
    },
  })

  if (!readAllowed) return <p className="text-sm text-mo-body">Listing refunds needs the refunds read permission.</p>

  const columns: DataColumn<Row>[] = [
    ...(application ? [] : [{ key: "app", header: "Application", value: (r: Row) => str(r.application_id), sortable: true, cell: (r: Row) => paymentsApplicationLabel(str(r.application_id) ?? "—") }]),
    { key: "ref", header: "Reference", value: (r) => str(r.reference_id), filterable: true, cell: (r) => <span>{humanise(r.reference_type)} <IdText id={r.reference_id} /></span> },
    { key: "amount", header: "Amount", value: (r) => minor(r), sortable: true, align: "right", cell: (r) => money(r) },
    { key: "attempts", header: "Attempts", value: (r) => num(r.attempts), align: "right" },
    { key: "error", header: "Last error", value: (r) => str(r.last_error) ?? str(r.failure_code), filterable: true },
    { key: "created", header: "Requested", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={() => setOpenId(String(r.id))} aria-label={`Open refund ${str(r.id)}`}>
            Open
          </button>
          {can("refund.issue") ? (
            <button type="button" className={buttonSecondary} onClick={() => setResolving(r)} aria-label={`Resolve refund ${str(r.id)}`}>
              Resolve
            </button>
          ) : null}
        </div>
      ),
    },
  ]

  const amount = resolving ? minor(resolving) : null

  return (
    <>
      <DataTable caption="Refunds needing attention" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No refunds need attention." pageSize={LIMIT} />
      <Pager newer={cursor.newer} older={cursor.older(nextOf(list.raw, "next_cursor"))} />
      {openId ? <RefundDetail id={openId} application={application} canResolve={can("refund.issue")} onResolve={setResolving} onClose={() => setOpenId(null)} /> : null}
      <ChoiceDialog
        open={resolving !== null}
        title="Resolve this refund"
        description={
          resolving ? (
            <>
              {formatPaise(amount)} for {humanise(resolving.reference_type)} {str(resolving.reference_id)}. Every resolution needs a fresh 2FA code; refunded manually and written off at ₹5,000.00 or more also wait for a second admin.
            </>
          ) : null
        }
        choiceLabel="Resolution"
        choices={RESOLUTIONS.map((r) => ({
          value: r.value,
          label: r.label,
          destructive: r.destructive,
          hint: (
            <>
              {r.explain} <span data-testid="resolve-hint" data-second-approver={resolveNeedsSecondApprover(r.value, amount)}>{resolveHint(r.value, amount)}</span>
            </>
          ),
        }))}
        confirmLabel="Resolve"
        reasonLabel="Note"
        requireReason
        busy={resolve.isPending}
        onConfirm={(resolution, note) => resolving && resolve.mutate({ id: String(resolving.id), resolution, note })}
        onClose={() => setResolving(null)}
      />
    </>
  )
}

function RefundDetail({ id, application, canResolve, onResolve, onClose }: { id: string; application: string; canResolve: boolean; onResolve: (r: Row) => void; onClose: () => void }) {
  const detail = useAdminObject("payments", `${PAY}/refunds/${encodeURIComponent(id)}${paymentsQuery(application)}`)
  const r = detail.data
  return (
    <section className="mt-6 rounded-mo border border-mo bg-mo-surface p-4" aria-label="Refund detail">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex-1 font-mo-display text-base font-semibold text-mo-ink">Refund {id}</h3>
        {canResolve && r && str(r.status) === "needs_attention" ? (
          <button type="button" className={buttonPrimary} onClick={() => onResolve(r)}>
            Resolve
          </button>
        ) : null}
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
      {detail.isLoading ? (
        <Loading />
      ) : detail.error ? (
        <ErrorNote message={detail.error} onRetry={detail.refetch} />
      ) : r ? (
        <Details
          items={[
            ["Application", paymentsApplicationLabel(str(r.application_id) ?? "—")],
            ["Intent", <IdText key="i" id={r.intent_id} />],
            ["Reference", `${humanise(r.reference_type)} ${str(r.reference_id) ?? ""}`],
            ["Amount", formatPaise(minor(r))],
            ["Status", <StatusPill key="s" value={r.status} tone={r.status === "needs_attention" ? "bad" : "normal"} />],
            ["Provider", `${str(r.provider) ?? "—"} ${str(r.provider_refund_id) ?? ""}`],
            ["Attempts", String(num(r.attempts) ?? "—")],
            ["Failure", str(r.failure_code) ?? "—"],
            ["Last error", str(r.last_error) ?? "—"],
            ["Reason", str(r.reason) ?? "—"],
            ["Resolution", str(r.resolution) ? `${humanise(r.resolution)}: ${str(r.resolution_note) ?? ""}` : "—"],
            ["Requested", when(r.created_at)],
          ]}
        />
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

const INTENT_STATUSES = ["pending", "processing", "succeeded", "failed", "refunded", "partially_refunded", "disputed", "cancelled"]

export function PaymentsIntents({ application }: PaymentsSectionProps) {
  const cursor = useCursor()
  const [draft, setDraft] = useState({ ref_type: "", ref_id: "", provider_ref: "", status: "" })
  const [filters, setFilters] = useState(draft)
  const [openId, setOpenId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const list = useAdminList("payments", `${PAY}/intents${paymentsQuery(application, { ...filters, limit: LIMIT, cursor: cursor.current })}`)

  const columns: DataColumn<Row>[] = [
    ...(application ? [] : [{ key: "app", header: "Application", value: (r: Row) => str(r.application_id), sortable: true, cell: (r: Row) => paymentsApplicationLabel(str(r.application_id) ?? "—") }]),
    { key: "ref", header: "Reference", value: (r) => str(r.reference_id), cell: (r) => <span>{humanise(r.reference_type)} <IdText id={r.reference_id} /></span> },
    { key: "amount", header: "Amount", value: (r) => minor(r), sortable: true, align: "right", cell: (r) => money(r) },
    { key: "method", header: "Method", value: (r) => str(r.method), cell: (r) => humanise(r.method) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "failed" ? "bad" : r.status === "succeeded" ? "good" : "normal"} /> },
    { key: "provider", header: "Provider ref", value: (r) => str(r.provider_payment_id) ?? str(r.provider_order_id), cell: (r) => <span className="font-mo-mono text-xs">{str(r.provider_payment_id) ?? str(r.provider_order_id) ?? "—"}</span> },
    { key: "created", header: "Created", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpenId(String(r.id))} aria-label={`Open intent ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <form
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        role="search"
        aria-label="Search intents"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.ref_id.trim() && !isUuid(draft.ref_id)) {
            setProblem("The reference id must be a full id (a UUID).")
            return
          }
          setProblem(null)
          cursor.reset()
          setFilters({ ref_type: draft.ref_type.trim(), ref_id: draft.ref_id.trim(), provider_ref: draft.provider_ref.trim(), status: draft.status })
        }}
      >
        <Field label="Reference type">{(id) => <input id={id} className={inputClass} value={draft.ref_type} placeholder="food_order" onChange={(e) => setDraft({ ...draft, ref_type: e.target.value })} />}</Field>
        <Field label="Reference id">{(id) => <input id={id} className={inputClass} value={draft.ref_id} onChange={(e) => setDraft({ ...draft, ref_id: e.target.value })} />}</Field>
        <Field label="Provider reference">{(id) => <input id={id} className={inputClass} value={draft.provider_ref} onChange={(e) => setDraft({ ...draft, provider_ref: e.target.value })} />}</Field>
        <Field label="Status">
          {(id) => (
            <select id={id} className={inputClass} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">Any</option>
              {INTENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <button type="submit" className={buttonSecondary}>
          Search
        </button>
        {problem ? (
          <p role="alert" className="text-sm text-mo-bad sm:col-span-2 lg:col-span-5">
            {problem}
          </p>
        ) : null}
      </form>
      <DataTable caption="Payment intents" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No intents match." pageSize={LIMIT} />
      <Pager newer={cursor.newer} older={cursor.older(nextOf(list.raw, "next_cursor"))} />
      {openId ? <IntentDetail id={openId} application={application} onClose={() => setOpenId(null)} /> : null}
    </>
  )
}

function IntentDetail({ id, application, onClose }: { id: string; application: string; onClose: () => void }) {
  const detail = useAdminObject("payments", `${PAY}/intents/${encodeURIComponent(id)}${paymentsQuery(application)}`)
  const intent = detail.data && isRecord(detail.data.intent) ? detail.data.intent : null
  const refunds = readList(detail.data, ["refunds"])
  return (
    <section className="mt-6 rounded-mo border border-mo bg-mo-surface p-4" aria-label="Intent detail">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex-1 font-mo-display text-base font-semibold text-mo-ink">Intent {id}</h3>
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
      {detail.isLoading ? (
        <Loading />
      ) : detail.error ? (
        <ErrorNote message={detail.error} onRetry={detail.refetch} />
      ) : intent ? (
        <>
          <Details
            items={[
              ["Application", paymentsApplicationLabel(str(intent.application_id) ?? "—")],
              ["Reference", `${humanise(intent.reference_type)} ${str(intent.reference_id) ?? ""}`],
              ["Payer", <IdText key="p" id={intent.payer_id} />],
              ["Payee", <IdText key="e" id={intent.payee_id} />],
              ["Amount", formatPaise(minor(intent))],
              ["Refunded", formatPaise(minor(intent, "refunded_amount_minor"))],
              ["Method", humanise(intent.method)],
              ["Status", <StatusPill key="s" value={intent.status} />],
              ["Provider", `${str(intent.provider) ?? "—"} ${str(intent.provider_order_id) ?? ""} ${str(intent.provider_payment_id) ?? ""}`],
              ["Created", when(intent.created_at)],
              ["Updated", when(intent.updated_at)],
            ]}
          />
          <h4 className="mb-2 mt-4 text-sm font-semibold text-mo-ink">Refunds</h4>
          <DataTable
            caption="Refunds on this intent"
            rows={refunds}
            rowId={(r) => String(r.id)}
            emptyMessage="No refunds on this intent."
            columns={[
              { key: "amount", header: "Amount", value: (r) => minor(r), align: "right", cell: (r) => money(r) },
              { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "needs_attention" ? "bad" : "normal"} /> },
              { key: "resolution", header: "Resolution", value: (r) => str(r.resolution), cell: (r) => humanise(r.resolution) },
              { key: "created", header: "Requested", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
            ]}
          />
        </>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export function PaymentsReconciliation({ application }: PaymentsSectionProps) {
  const rec = useAdminObject("payments", `${PAY}/reconciliation${paymentsQuery(application, { limit: LIMIT })}`)
  if (rec.isLoading) return <Loading />
  if (rec.error) return <ErrorNote message={rec.error} onRetry={rec.refetch} />
  const body = rec.data
  const status = body && isRecord(body.status) ? body.status : null
  if (!body || !status) return <ErrorNote message="The reconciliation answer could not be read." onRetry={rec.refetch} />
  const count = (k: string) => num(status[k])?.toLocaleString("en-IN") ?? "unavailable"
  const seconds = (k: string) => {
    const n = num(status[k])
    return n === null ? "unavailable" : n === 0 ? "—" : n < 3600 ? `${Math.round(n / 60)} min` : `${(n / 3600).toFixed(1)} h`
  }
  return (
    <div className="space-y-6">
      {body.reconciler_running === false ? (
        <p role="alert" className="flex items-center gap-2 rounded-mo border border-mo-warn/50 bg-mo-warn/10 p-3 text-sm text-mo-ink">
          <TriangleAlert className="h-4 w-4 text-mo-warn" aria-hidden="true" /> The reconciler is not running on this deployment (no real provider), so stuck intents stay stuck.
        </p>
      ) : null}
      <Details
        items={[
          ["Stuck intents", count("stuck_intents_count")],
          ["Refund required (open)", count("refund_required_open_count")],
          ["Refunds needing attention", count("refunds_needing_attention")],
          ["Refunds retrying after failure", count("refunds_retrying_after_failure")],
          ["Oldest unsettled refund", seconds("oldest_unsettled_refund_seconds")],
          ["Counted as stuck after", seconds("pending_age_seconds")],
        ]}
      />
      <DataTable
        caption="Stuck intents"
        rows={readList(status, ["stuck_intents"])}
        rowId={(r) => String(r.id)}
        emptyMessage="No stuck intents."
        columns={[
          { key: "app", header: "Application", value: (r) => str(r.application_id), cell: (r) => paymentsApplicationLabel(str(r.application_id) ?? "—") },
          { key: "id", header: "Intent", value: (r) => str(r.id), cell: (r) => <IdText id={r.id} /> },
          { key: "amount", header: "Amount", value: (r) => minor(r), align: "right", cell: (r) => money(r) },
          { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone="warn" /> },
          { key: "age", header: "Age", value: (r) => num(r.age_seconds), sortable: true, align: "right", cell: (r) => `${Math.round((num(r.age_seconds) ?? 0) / 60)} min` },
          { key: "stub", header: "Stub", value: (r) => (r.stub_reference === true ? "yes" : "no") },
        ]}
      />
      <DataTable
        caption="Refunds required by the provider"
        rows={readList(status, ["refund_required_open"])}
        rowId={(r) => String(r.id)}
        emptyMessage="No open refund-required alerts."
        columns={[
          { key: "app", header: "Application", value: (r) => str(r.application_id), cell: (r) => paymentsApplicationLabel(str(r.application_id) ?? "—") },
          { key: "intent", header: "Intent", value: (r) => str(r.intent_id), cell: (r) => <IdText id={r.intent_id} /> },
          { key: "amount", header: "Amount", value: (r) => minor(r), align: "right", cell: (r) => money(r) },
          { key: "reason", header: "Reason", value: (r) => str(r.reason) },
          { key: "detected", header: "Detected", value: (r) => str(r.detected_at), cell: (r) => when(r.detected_at) },
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

const METHODS = ["upi", "card"] as const

export function PaymentsApplications({ application, can }: PaymentsSectionProps) {
  const list = useAdminList("payments", `${PAY}/applications${paymentsQuery(application)}`, { enabled: can("applications.read") })
  const [editing, setEditing] = useState<Row | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [merchantName, setMerchantName] = useState("")
  const [methods, setMethods] = useState<string[]>([])

  const save = useAdminMutation<{ key: string; body: Record<string, unknown> }>({
    // The registry route refuses unknown fields, so no reason is sent; admin-service still records the change.
    request: ({ key, body }) => ({ method: "patch", url: `${PAY}/applications/${encodeURIComponent(key)}${paymentsQuery(application)}`, body }),
    invalidate: [PAY_KEY],
    successMessage: "Application updated",
    errorTitle: "Updating the application failed",
    onDone: () => setEditing(null),
  })

  if (!can("applications.read")) return <p className="text-sm text-mo-body">Listing applications needs the applications read permission.</p>

  const open = (r: Row) => {
    setDisplayName(str(r.display_name) ?? "")
    setMerchantName(str(r.merchant_display_name) ?? "")
    setMethods(Array.isArray(r.enabled_methods) ? r.enabled_methods.filter((m): m is string => typeof m === "string") : [])
    setEditing(r)
  }

  const changes = (() => {
    if (!editing) return {}
    const body: Record<string, unknown> = {}
    if (displayName.trim() !== (str(editing.display_name) ?? "")) body.display_name = displayName.trim()
    if (merchantName.trim() !== (str(editing.merchant_display_name) ?? "")) body.merchant_display_name = merchantName.trim()
    const before = Array.isArray(editing.enabled_methods) ? [...editing.enabled_methods].sort().join(",") : ""
    if ([...methods].sort().join(",") !== before) body.enabled_methods = methods
    return body
  })()
  const valid =
    Object.keys(changes).length > 0 &&
    displayName.trim().length >= 1 &&
    displayName.trim().length <= 100 &&
    merchantName.trim().length >= 1 &&
    merchantName.trim().length <= 100 &&
    methods.length > 0

  const columns: DataColumn<Row>[] = [
    { key: "key", header: "Key", value: (r) => str(r.key), sortable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.key)}</span> },
    { key: "name", header: "Display name", value: (r) => str(r.display_name), sortable: true },
    { key: "merchant", header: "Merchant name", value: (r) => str(r.merchant_display_name) },
    { key: "methods", header: "Methods", value: (r) => (Array.isArray(r.enabled_methods) ? r.enabled_methods.join(", ") : null) },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "active" ? "good" : "warn"} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        can("applications.manage") ? (
          <button type="button" className={buttonSecondary} onClick={() => open(r)} aria-label={`Edit application ${str(r.key)}`}>
            Edit
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <DataTable caption="Payments applications" rows={list.data} columns={columns} rowId={(r) => String(r.key)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No applications." />
      <Dialog open={editing !== null} title={`Edit ${str(editing?.key) ?? "application"}`} description="Changes the name customers see and the payment methods offered. Needs a fresh 2FA code." onClose={() => setEditing(null)} dismissible={!save.isPending}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (editing && valid && !save.isPending) save.mutate({ key: String(editing.key), body: changes })
          }}
        >
          <Field label="Display name">{(id) => <input id={id} className={inputClass} maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}</Field>
          <Field label="Merchant display name">{(id) => <input id={id} className={inputClass} maxLength={100} value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />}</Field>
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold text-mo-ink">Payment methods</legend>
            {METHODS.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm text-mo-ink">
                <input type="checkbox" checked={methods.includes(m)} onChange={(e) => setMethods(e.target.checked ? [...methods, m] : methods.filter((x) => x !== m))} />
                {m === "upi" ? "UPI" : "Card"}
              </label>
            ))}
            {methods.length === 0 ? <p className="text-xs text-mo-bad">Keep at least one method.</p> : null}
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={() => setEditing(null)} disabled={save.isPending}>
              Cancel
            </button>
            <button type="submit" className={buttonPrimary} disabled={!valid || save.isPending}>
              {save.isPending ? "Working…" : "Save"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function PaymentsAudit({ application }: PaymentsSectionProps) {
  const [trail, setTrail] = useState<"payments" | "applications">("payments")
  return (
    <div>
      <div className="mb-3 w-64">
        <Field label="Trail">
          {(id) => (
            <select id={id} className={inputClass} value={trail} onChange={(e) => setTrail(e.target.value as "payments" | "applications")}>
              <option value="payments">Payments</option>
              <option value="applications">Application registry</option>
            </select>
          )}
        </Field>
      </div>
      {trail === "payments" ? <PaymentAuditTrail application={application} /> : <ApplicationAuditTrail application={application} />}
    </div>
  )
}

function PaymentAuditTrail({ application }: { application: string }) {
  const cursor = useCursor()
  const list = useAdminList("payments", `${PAY}/audit/payments${paymentsQuery(application, { limit: LIMIT, before_id: cursor.current })}`)
  return (
    <>
      <DataTable
        caption="Payments audit"
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No audit rows."
        pageSize={LIMIT}
        columns={[
          { key: "created", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
          { key: "app", header: "Application", value: (r) => str(r.application_id), cell: (r) => paymentsApplicationLabel(str(r.application_id) ?? "—") },
          { key: "intent", header: "Intent", value: (r) => str(r.intent_id), cell: (r) => <IdText id={r.intent_id} /> },
          { key: "event", header: "Event", value: (r) => str(r.event), filterable: true, cell: (r) => humanise(r.event) },
          { key: "change", header: "Status", value: (r) => str(r.new_status), cell: (r) => `${str(r.old_status) ?? "—"} → ${str(r.new_status) ?? "—"}` },
          { key: "actor", header: "Actor", value: (r) => str(r.actor_id), cell: (r) => <IdText id={r.actor_id} /> },
        ]}
      />
      <Pager newer={cursor.newer} older={cursor.older(nextOf(list.raw, "next_before_id"))} />
    </>
  )
}

function ApplicationAuditTrail({ application }: { application: string }) {
  const cursor = useCursor()
  const list = useAdminList("payments", `${PAY}/audit/applications${paymentsQuery(application, { limit: LIMIT, before_id: cursor.current })}`)
  return (
    <>
      <DataTable
        caption="Application registry audit"
        rows={list.data}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No audit rows."
        pageSize={LIMIT}
        columns={[
          { key: "created", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
          { key: "app", header: "Application", value: (r) => str(r.application_id), cell: (r) => paymentsApplicationLabel(str(r.application_id) ?? "—") },
          { key: "action", header: "Action", value: (r) => str(r.action), cell: (r) => humanise(r.action) },
          { key: "operator", header: "Operator", value: (r) => str(r.operator_id), cell: (r) => <IdText id={r.operator_id} /> },
          { key: "fields", header: "Fields", value: () => null, cell: (r) => (isRecord(r.after) ? Object.keys(r.after).map(humanise).join(", ") || "—" : "—") },
        ]}
      />
      <Pager newer={cursor.newer} older={cursor.older(nextOf(list.raw, "next_before_id"))} />
    </>
  )
}
