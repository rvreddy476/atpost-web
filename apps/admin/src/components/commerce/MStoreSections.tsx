"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { bool, humanise, isUuid, num, readObject, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"

export const COMMERCE = "/v1/admin/commerce"
const COMMERCE_KEY = adminKey("commerce")

interface BannerForm {
  title: string
  subtitle: string
  image_media_id: string
  target_type: string
  target_id: string
  position: string
  active: boolean
  starts_at: string
  ends_at: string
}

const EMPTY_BANNER: BannerForm = { title: "", subtitle: "", image_media_id: "", target_type: "category", target_id: "", position: "0", active: true, starts_at: "", ends_at: "" }

/** "2026-09-16T10:00" (datetime-local) → RFC 3339 in the admin's zone, or undefined. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined)
const toLocal = (iso: unknown) => {
  const s = str(iso)
  if (!s) return ""
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function bannerProblem(f: BannerForm): string | null {
  if (!f.title.trim()) return "A title is required."
  if (f.target_type !== "search" && !isUuid(f.target_id)) return "A category or product target needs its id (a UUID)."
  if (f.target_type === "search" && !f.target_id.trim()) return "A search target needs the search text."
  if (f.image_media_id && !isUuid(f.image_media_id)) return "The image media id must be a UUID."
  if (!/^\d+$/.test(f.position.trim())) return "Position is a whole number."
  if (f.starts_at && f.ends_at && f.ends_at <= f.starts_at) return "The end must be after the start."
  return null
}

/** Home-page banners. */
export function MStoreBanners() {
  const list = useAdminList("commerce", `${COMMERCE}/banners`)
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [form, setForm] = useState<BannerForm>(EMPTY_BANNER)

  const save = useAdminMutation<{ id: string | null; reason: string }>({
    request: ({ id }) => ({
      method: id ? "put" : "post",
      url: id ? `${COMMERCE}/banners/${encodeURIComponent(id)}` : `${COMMERCE}/banners`,
      body: {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || undefined,
        image_media_id: form.image_media_id.trim() || undefined,
        target_type: form.target_type,
        target_id: form.target_id.trim(),
        position: Number(form.position),
        active: form.active,
        starts_at: toIso(form.starts_at),
        ends_at: toIso(form.ends_at),
      },
    }),
    invalidate: [COMMERCE_KEY],
    successMessage: "Banner saved",
    errorTitle: "Saving the banner failed",
    onDone: () => setEditing(null),
  })
  const remove = useAdminMutation<{ id: string; reason: string }>({
    request: ({ id, reason }) => ({ method: "delete", url: `${COMMERCE}/banners/${encodeURIComponent(id)}`, body: { reason } }),
    invalidate: [COMMERCE_KEY],
    successMessage: "Banner deleted",
    errorTitle: "Deleting the banner failed",
    onDone: () => setDeleting(null),
  })

  const open = (row: Row | null) => {
    setForm(
      row
        ? {
            title: str(row.title) ?? "",
            subtitle: str(row.subtitle) ?? "",
            image_media_id: str(row.image_media_id) ?? "",
            target_type: str(row.target_type) ?? "category",
            target_id: str(row.target_id) ?? "",
            position: String(num(row.position) ?? 0),
            active: bool(row.active),
            starts_at: toLocal(row.starts_at),
            ends_at: toLocal(row.ends_at),
          }
        : EMPTY_BANNER,
    )
    setEditing({ id: row ? String(row.id) : null })
  }

  const columns: DataColumn<Row>[] = [
    { key: "position", header: "Position", value: (r) => num(r.position), sortable: true, align: "right" },
    { key: "title", header: "Title", value: (r) => str(r.title), filterable: true, cell: (r) => <div><div className="font-semibold">{str(r.title)}</div><div className="text-xs text-mo-body">{str(r.subtitle)}</div></div> },
    { key: "target", header: "Target", value: (r) => str(r.target_type), cell: (r) => <span>{humanise(r.target_type)} {r.target_type === "search" ? `“${str(r.target_id)}”` : <IdText id={r.target_id} />}</span> },
    { key: "window", header: "Runs", value: (r) => str(r.starts_at), cell: (r) => `${when(r.starts_at)} → ${when(r.ends_at)}` },
    { key: "active", header: "Active", value: (r) => (bool(r.active) ? "yes" : "no"), cell: (r) => <StatusPill value={bool(r.active) ? "active" : "inactive"} tone={bool(r.active) ? "good" : "normal"} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={() => open(r)} aria-label={`Edit banner ${str(r.title)}`}>
            Edit
          </button>
          <button type="button" className={buttonDanger} onClick={() => setDeleting(r)} aria-label={`Delete banner ${str(r.title)}`}>
            Delete
          </button>
        </div>
      ),
    },
  ]
  const problem = bannerProblem(form)
  const set = (key: keyof BannerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button type="button" className={buttonPrimary} onClick={() => open(null)}>
          New banner
        </button>
      </div>
      <DataTable caption="Banners" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No banners." />
      <ConfirmReasonDialog
        open={editing !== null}
        title={editing?.id ? "Edit banner" : "New banner"}
        confirmLabel="Save"
        canConfirm={problem === null}
        busy={save.isPending}
        onConfirm={(reason) => editing && save.mutate({ id: editing.id, reason })}
        onClose={() => setEditing(null)}
      >
        <Field label="Title">{(id) => <input id={id} className={inputClass} value={form.title} onChange={set("title")} />}</Field>
        <Field label="Subtitle (optional)">{(id) => <input id={id} className={inputClass} value={form.subtitle} onChange={set("subtitle")} />}</Field>
        <Field label="Image media id (optional)">{(id) => <input id={id} className={inputClass} value={form.image_media_id} onChange={set("image_media_id")} />}</Field>
        <Field label="Target">
          {(id) => (
            <select id={id} className={inputClass} value={form.target_type} onChange={set("target_type")}>
              <option value="category">Category</option>
              <option value="product">Product</option>
              <option value="search">Search</option>
            </select>
          )}
        </Field>
        <Field label={form.target_type === "search" ? "Search text" : "Target id"}>{(id) => <input id={id} className={inputClass} value={form.target_id} onChange={set("target_id")} />}</Field>
        <Field label="Position">{(id) => <input id={id} className={inputClass} inputMode="numeric" value={form.position} onChange={set("position")} />}</Field>
        <Field label="Starts (optional)">{(id) => <input id={id} type="datetime-local" className={inputClass} value={form.starts_at} onChange={set("starts_at")} />}</Field>
        <Field label="Ends (optional)">{(id) => <input id={id} type="datetime-local" className={inputClass} value={form.ends_at} onChange={set("ends_at")} />}</Field>
        <label className="flex items-center gap-2 text-sm text-mo-ink">
          <input type="checkbox" className="accent-mo-cyan" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        {problem ? <p className="text-xs text-mo-body">{problem}</p> : null}
      </ConfirmReasonDialog>
      <ConfirmReasonDialog
        open={deleting !== null}
        title="Delete this banner?"
        description={deleting ? str(deleting.title) : null}
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={(reason) => deleting && remove.mutate({ id: String(deleting.id), reason })}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}

/** Background jobs that exhausted their retries. Payloads are shown by key only. */
export function MStoreDeadLetters() {
  const list = useAdminList("commerce", `${COMMERCE}/jobs/dead-letter?limit=200`, { keys: ["jobs"] })
  const columns: DataColumn<Row>[] = [
    { key: "id", header: "Job", value: (r) => num(r.id), sortable: true, align: "right" },
    { key: "kind", header: "Kind", value: (r) => str(r.kind), sortable: true, filterable: true, cell: (r) => humanise(r.kind) },
    { key: "attempts", header: "Attempts", value: (r) => num(r.attempts), sortable: true, align: "right" },
    { key: "error", header: "Last error", value: (r) => str(r.last_error), filterable: true, cell: (r) => <span className="line-clamp-2 font-mo-mono text-xs">{str(r.last_error) ?? "—"}</span> },
    { key: "dead", header: "Dead-lettered", value: (r) => str(r.dead_letter_at), sortable: true, cell: (r) => when(r.dead_letter_at) },
  ]
  return <DataTable caption="Dead-letter jobs" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No dead-letter jobs." />
}

/** Live products missing what their category's schema now requires. */
export function MStoreCompliance() {
  const { me } = useAdmin()
  const [offset, setOffset] = useState(0)
  const [sweeping, setSweeping] = useState(false)
  const [lastSweep, setLastSweep] = useState<Row | null>(null)
  const list = useAdminList("commerce", `${COMMERCE}/compliance-gaps?limit=50&offset=${offset}`, { keys: ["gaps"], enabled: can(me, "commerce", "compliance.read") })
  const total = num(readObject(list.raw)?.total)
  const sweep = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({ method: "post", url: `${COMMERCE}/compliance-gaps/sweep`, body: { reason } }),
    invalidate: [COMMERCE_KEY],
    successMessage: "Compliance sweep finished",
    errorTitle: "Compliance sweep failed",
    onDone: (data) => {
      setSweeping(false)
      setLastSweep(readObject(data))
    },
  })
  const columns: DataColumn<Row>[] = [
    { key: "product", header: "Product", value: (r) => str(r.product_title), filterable: true, cell: (r) => str(r.product_title) ?? <IdText id={r.product_id} /> },
    { key: "store", header: "Seller", value: (r) => str(r.store_name), filterable: true, cell: (r) => str(r.store_name) ?? <IdText id={r.seller_id} /> },
    { key: "label", header: "Missing", value: (r) => str(r.label), sortable: true },
    { key: "reason", header: "Why", value: (r) => str(r.reason), cell: (r) => humanise(r.reason) },
    { key: "detected", header: "Detected", value: (r) => str(r.detected_at), sortable: true, cell: (r) => when(r.detected_at) },
  ]
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-mo-body">{total !== null ? `${total} open gaps.` : null}</p>
        {can(me, "commerce", "compliance.sweep") ? (
          <button type="button" className={buttonPrimary} onClick={() => setSweeping(true)}>
            Run sweep
          </button>
        ) : null}
      </div>
      {lastSweep ? (
        <p role="status" className="mb-3 text-sm text-mo-ink">
          Checked {num(lastSweep.definitions_checked) ?? "—"} definitions: {num(lastSweep.gaps_opened) ?? "—"} gaps opened, {num(lastSweep.gaps_resolved) ?? "—"} resolved.
        </p>
      ) : null}
      {can(me, "commerce", "compliance.read") ? (
        <>
          <DataTable caption="Compliance gaps" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No open compliance gaps." pageSize={50} />
          <OffsetPager offset={offset} limit={50} count={list.data.length} onChange={setOffset} />
        </>
      ) : null}
      <ConfirmReasonDialog
        open={sweeping}
        title="Run the compliance sweep?"
        description="Checks every live product against the current schema, opening and closing gaps."
        confirmLabel="Run sweep"
        busy={sweep.isPending}
        onConfirm={(reason) => sweep.mutate({ reason })}
        onClose={() => setSweeping(false)}
      />
    </>
  )
}

/**
 * Settling a COD remittance: always two-person, with step-up. admin-service
 * has no list of remittances awaiting settlement yet, so the id is entered
 * from the courier statement.
 */
export function MStoreCodSettle() {
  const [remittanceId, setRemittanceId] = useState("")
  const [batchId, setBatchId] = useState("")
  const [confirming, setConfirming] = useState(false)
  const settle = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({
      method: "post",
      url: `${COMMERCE}/cod-remittances/${encodeURIComponent(remittanceId.trim())}/settle`,
      body: { reason, ...(batchId.trim() ? { payout_batch_id: batchId.trim() } : {}) },
    }),
    invalidate: [COMMERCE_KEY],
    successMessage: "COD remittance settled",
    errorTitle: "Settling failed",
    onDone: () => {
      setConfirming(false)
      setRemittanceId("")
      setBatchId("")
    },
  })
  const valid = isUuid(remittanceId) && (batchId.trim() === "" || isUuid(batchId))
  return (
    <section className="max-w-xl space-y-3">
      <p className="text-sm text-mo-body">
        A second admin must approve every settlement before it happens. There is no console list of remittances awaiting settlement yet; use the id from the courier statement.
      </p>
      <Field label="Remittance id" hint={remittanceId && !isUuid(remittanceId) ? "A UUID." : undefined}>
        {(id) => <input id={id} className={inputClass} value={remittanceId} onChange={(e) => setRemittanceId(e.target.value)} />}
      </Field>
      <Field label="Payout batch id (optional)" hint={batchId && !isUuid(batchId) ? "A UUID." : undefined}>
        {(id) => <input id={id} className={inputClass} value={batchId} onChange={(e) => setBatchId(e.target.value)} />}
      </Field>
      <button type="button" className={buttonPrimary} disabled={!valid} onClick={() => setConfirming(true)}>
        Settle remittance
      </button>
      <ConfirmReasonDialog
        open={confirming}
        title="Settle this COD remittance?"
        description="It goes to a second admin for approval and needs a fresh 2FA code."
        confirmLabel="Send for approval"
        destructive
        busy={settle.isPending}
        onConfirm={(reason) => settle.mutate({ reason })}
        onClose={() => setConfirming(false)}
      />
    </section>
  )
}
