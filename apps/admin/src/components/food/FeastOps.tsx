"use client"

import { useMemo, useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DateRangePicker } from "@/components/blocks/DateRangePicker"
import { Field, IdText, LookupForm, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { bool, humanise, isRecord, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import { presetRange } from "@/lib/blocks/dateRange"
import { formatPaise, rupeesToPaise } from "@/lib/admin/money"
import { can } from "@/lib/admin/sections"
import { FOOD, FOOD_KEY } from "./FeastApprovals"

const LIMIT = 50

/** Menu items flagged or pending review, and hiding a review by id. */
export function FeastModeration() {
  const { me } = useAdmin()
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [hideId, setHideId] = useState<string | null>(null)
  const list = useAdminList("food", `${FOOD}/moderation/queue?limit=200`, { enabled: can(me, "food", "menu.moderate") })
  const decide = useAdminMutation<{ id: string; status: string; reason: string }>({
    request: ({ id, status, reason }) => ({ method: "post", url: `${FOOD}/moderation/menu-items/${encodeURIComponent(id)}`, body: { status, reason } }),
    invalidate: [FOOD_KEY],
    successMessage: "Menu item moderated",
    errorTitle: "Moderation failed",
    onDone: () => setDeciding(null),
  })
  const hide = useAdminMutation<{ id: string; reason: string }>({
    request: ({ id, reason }) => ({ method: "delete", url: `${FOOD}/item-reviews/${encodeURIComponent(id)}`, body: { reason } }),
    invalidate: [FOOD_KEY],
    successMessage: "Review removed",
    errorTitle: "Removing the review failed",
    onDone: () => setHideId(null),
  })

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Item", value: (r) => str(r.name), sortable: true, filterable: true },
    { key: "restaurant", header: "Restaurant", value: (r) => str(r.restaurant_name), sortable: true, filterable: true },
    { key: "status", header: "Status", value: (r) => str(r.moderation_status), cell: (r) => <StatusPill value={r.moderation_status} tone={r.moderation_status === "flagged" ? "warn" : "normal"} /> },
    { key: "reports", header: "Reports", value: (r) => num(r.open_reports), sortable: true, align: "right" },
    { key: "latest", header: "Latest report", value: (r) => str(r.latest_report_at), sortable: true, cell: (r) => when(r.latest_report_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Moderate ${str(r.name)}`}>
          Moderate
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {can(me, "food", "menu.moderate") ? (
        <section>
          <h3 className="mb-2 font-mo-display text-base font-semibold text-mo-ink">Menu items</h3>
          <DataTable caption="Menu moderation queue" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No menu items need review." />
        </section>
      ) : null}
      {can(me, "food", "reviews.moderate") ? (
        <section>
          <h3 className="mb-2 font-mo-display text-base font-semibold text-mo-ink">Reviews</h3>
          <p className="mb-2 text-xs text-mo-body">There is no admin list of reviews yet. Remove one by its id (from a report or ticket).</p>
          <LookupForm label="Review id" button="Remove review" validate={(v) => (isUuid(v) ? null : "Enter the review's id (a UUID).")} onSubmit={setHideId} />
        </section>
      ) : null}
      <ChoiceDialog
        open={deciding !== null}
        title="Moderate this menu item"
        description={deciding ? `${str(deciding.name)} at ${str(deciding.restaurant_name)}` : null}
        choiceLabel="Decision"
        choices={[{ value: "approved" }, { value: "rejected", destructive: true }, { value: "pending_review" }, { value: "flagged" }]}
        busy={decide.isPending}
        onConfirm={(status, reason) => deciding && decide.mutate({ id: String(deciding.id), status, reason })}
        onClose={() => setDeciding(null)}
      />
      <ConfirmReasonDialog
        open={hideId !== null}
        title="Remove this review?"
        description="The review is deleted for everyone and cannot be restored."
        confirmLabel="Remove"
        destructive
        busy={hide.isPending}
        onConfirm={(reason) => hideId && hide.mutate({ id: hideId, reason })}
        onClose={() => setHideId(null)}
      />
    </div>
  )
}

const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed", "cancelled"]

export function FeastTickets() {
  const [status, setStatus] = useState("open")
  const [acting, setActing] = useState<Row | null>(null)
  const list = useAdminList("food", `${FOOD}/support/tickets?limit=200${status ? `&status=${status}` : ""}`)
  const update = useAdminMutation<{ id: string; status: string; reason: string }>({
    request: ({ id, status: next, reason }) => ({ method: "post", url: `${FOOD}/support/tickets/${encodeURIComponent(id)}/status`, body: { status: next, reason } }),
    invalidate: [FOOD_KEY],
    successMessage: "Ticket updated",
    errorTitle: "Ticket update failed",
    onDone: () => setActing(null),
  })
  const columns: DataColumn<Row>[] = [
    { key: "subject", header: "Subject", value: (r) => str(r.subject), filterable: true, cell: (r) => <div><div className="font-semibold">{str(r.subject)}</div><div className="line-clamp-2 text-xs text-mo-body">{str(r.detail)}</div></div> },
    { key: "category", header: "Category", value: (r) => str(r.category), sortable: true, cell: (r) => humanise(r.category) },
    { key: "order", header: "Order", value: (r) => str(r.order_id), cell: (r) => (str(r.order_id) ? <IdText id={r.order_id} /> : "—") },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} /> },
    { key: "created", header: "Opened", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setActing(r)} aria-label={`Update ticket ${str(r.subject)}`}>
          Update
        </button>
      ),
    },
  ]
  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Status">
          {(id) => (
            <select id={id} className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Support tickets" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No tickets with this status." />
      <ChoiceDialog
        open={acting !== null}
        title="Update this ticket"
        choiceLabel="Status"
        choices={TICKET_STATUSES.filter((s) => s !== str(acting?.status)).map((s) => ({ value: s, destructive: s === "cancelled" }))}
        busy={update.isPending}
        onConfirm={(next, reason) => acting && update.mutate({ id: String(acting.id), status: next, reason })}
        onClose={() => setActing(null)}
      />
    </>
  )
}

interface CouponForm {
  code: string
  title: string
  coupon_type: string
  discount_value: string
  min_order_amount: string
  max_discount_amount: string
}

const EMPTY_COUPON: CouponForm = { code: "", title: "", coupon_type: "FLAT", discount_value: "", min_order_amount: "", max_discount_amount: "" }

const positive = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0

/** Coupons. Numbers here are rupees, as food-service stores coupons. Changing one needs a fresh 2FA code. */
export function FeastCoupons() {
  const list = useAdminList("food", `${FOOD}/coupons`)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<Row | null>(null)
  const [form, setForm] = useState<CouponForm>(EMPTY_COUPON)
  const create = useAdminMutation<{ reason: string }>({
    request: () => ({
      method: "post",
      url: `${FOOD}/coupons`,
      body: {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        coupon_type: form.coupon_type,
        discount_value: Number(form.discount_value),
        min_order_amount: Number(form.min_order_amount),
        max_discount_amount: Number(form.max_discount_amount || form.discount_value),
      },
    }),
    invalidate: [FOOD_KEY],
    successMessage: "Coupon created",
    errorTitle: "Creating the coupon failed",
    onDone: () => {
      setCreating(false)
      setForm(EMPTY_COUPON)
    },
  })
  // PATCH resets any numeric field it is not sent, so every field is sent back as read.
  const toggle = useAdminMutation<{ row: Row; reason: string }>({
    request: ({ row }) => ({
      method: "patch",
      url: `${FOOD}/coupons/${encodeURIComponent(String(row.id))}`,
      body: {
        code: row.code,
        title: row.title,
        coupon_type: row.coupon_type,
        discount_value: row.discount_value,
        min_order_amount: row.min_order_amount,
        max_discount_amount: row.max_discount_amount,
        is_active: !bool(row.is_active),
      },
    }),
    invalidate: [FOOD_KEY],
    successMessage: "Coupon updated",
    errorTitle: "Updating the coupon failed",
    onDone: () => setToggling(null),
  })
  const columns: DataColumn<Row>[] = [
    { key: "code", header: "Code", value: (r) => str(r.code), sortable: true, filterable: true, cell: (r) => <span className="font-mo-mono">{str(r.code)}</span> },
    { key: "title", header: "Title", value: (r) => str(r.title), filterable: true },
    { key: "discount", header: "Discount", value: (r) => num(r.discount_value), cell: (r) => (r.coupon_type === "PERCENTAGE" ? `${num(r.discount_value) ?? "—"}% up to ${formatPaise(rupeesToPaise(r.max_discount_amount))}` : formatPaise(rupeesToPaise(r.discount_value))) },
    { key: "min", header: "Min order", value: (r) => num(r.min_order_amount), align: "right", cell: (r) => formatPaise(rupeesToPaise(r.min_order_amount)) },
    { key: "used", header: "Used", value: (r) => num(r.used_count), sortable: true, align: "right" },
    { key: "ends", header: "Ends", value: (r) => str(r.ends_at), sortable: true, cell: (r) => when(r.ends_at) },
    { key: "active", header: "Active", value: (r) => (bool(r.is_active) ? "yes" : "no"), cell: (r) => <StatusPill value={bool(r.is_active) ? "active" : "inactive"} tone={bool(r.is_active) ? "good" : "normal"} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setToggling(r)} aria-label={`${bool(r.is_active) ? "Deactivate" : "Activate"} ${str(r.code)}`}>
          {bool(r.is_active) ? "Deactivate" : "Activate"}
        </button>
      ),
    },
  ]
  const valid = form.code.trim() !== "" && form.title.trim() !== "" && positive(form.discount_value) && positive(form.min_order_amount) && (form.max_discount_amount === "" || positive(form.max_discount_amount))
  const set = (key: keyof CouponForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button type="button" className={buttonSecondary} onClick={() => setCreating(true)}>
          New coupon
        </button>
      </div>
      <DataTable caption="Coupons" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No coupons." />
      <ConfirmReasonDialog
        open={creating}
        title="Create a coupon"
        description="It runs for 90 days from now. Amounts are in rupees."
        confirmLabel="Create"
        canConfirm={valid}
        busy={create.isPending}
        onConfirm={(reason) => create.mutate({ reason })}
        onClose={() => setCreating(false)}
      >
        <Field label="Code">{(id) => <input id={id} className={inputClass} value={form.code} onChange={set("code")} />}</Field>
        <Field label="Title">{(id) => <input id={id} className={inputClass} value={form.title} onChange={set("title")} />}</Field>
        <Field label="Type">
          {(id) => (
            <select id={id} className={inputClass} value={form.coupon_type} onChange={set("coupon_type")}>
              <option value="FLAT">Flat amount</option>
              <option value="PERCENTAGE">Percentage</option>
            </select>
          )}
        </Field>
        <Field label={form.coupon_type === "PERCENTAGE" ? "Discount (%)" : "Discount (₹)"}>{(id) => <input id={id} className={inputClass} inputMode="decimal" value={form.discount_value} onChange={set("discount_value")} />}</Field>
        <Field label="Minimum order (₹)">{(id) => <input id={id} className={inputClass} inputMode="decimal" value={form.min_order_amount} onChange={set("min_order_amount")} />}</Field>
        <Field label="Maximum discount (₹, optional)">{(id) => <input id={id} className={inputClass} inputMode="decimal" value={form.max_discount_amount} onChange={set("max_discount_amount")} />}</Field>
      </ConfirmReasonDialog>
      <ConfirmReasonDialog
        open={toggling !== null}
        title={toggling && bool(toggling.is_active) ? "Deactivate this coupon?" : "Activate this coupon?"}
        description="Changing a coupon needs a fresh 2FA code."
        confirmLabel={toggling && bool(toggling.is_active) ? "Deactivate" : "Activate"}
        destructive={!!toggling && bool(toggling.is_active)}
        busy={toggle.isPending}
        onConfirm={(reason) => toggling && toggle.mutate({ row: toggling, reason })}
        onClose={() => setToggling(null)}
      />
    </>
  )
}

/** Where Feast delivers. */
export function FeastServiceAreas() {
  const list = useAdminList("food", `${FOOD}/service-areas`)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<Row | null>(null)
  const [form, setForm] = useState({ name: "", city: "", state: "", postal_code: "", radius_km: "8" })
  const create = useAdminMutation<{ reason: string }>({
    request: () => ({ method: "post", url: `${FOOD}/service-areas`, body: { ...form, radius_km: Number(form.radius_km), is_active: true } }),
    invalidate: [FOOD_KEY],
    successMessage: "Service area created",
    errorTitle: "Creating the service area failed",
    onDone: () => setCreating(false),
  })
  // PATCH behaves like a replace: every field goes back as read.
  const toggle = useAdminMutation<{ row: Row; reason: string }>({
    request: ({ row }) => ({
      method: "patch",
      url: `${FOOD}/service-areas/${encodeURIComponent(String(row.id))}`,
      body: {
        name: row.name,
        city: row.city,
        state: row.state,
        country: row.country,
        postal_code: row.postal_code,
        center_latitude: row.center_latitude,
        center_longitude: row.center_longitude,
        radius_km: row.radius_km,
        is_active: !bool(row.is_active),
      },
    }),
    invalidate: [FOOD_KEY],
    successMessage: "Service area updated",
    errorTitle: "Updating the service area failed",
    onDone: () => setToggling(null),
  })
  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Area", value: (r) => str(r.name), sortable: true, filterable: true },
    { key: "city", header: "City", value: (r) => str(r.city), sortable: true, filterable: true },
    { key: "postal", header: "PIN", value: (r) => str(r.postal_code) },
    { key: "radius", header: "Radius", value: (r) => num(r.radius_km), align: "right", cell: (r) => `${num(r.radius_km) ?? "—"} km` },
    { key: "active", header: "Active", value: (r) => (bool(r.is_active) ? "yes" : "no"), cell: (r) => <StatusPill value={bool(r.is_active) ? "active" : "inactive"} tone={bool(r.is_active) ? "good" : "normal"} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setToggling(r)} aria-label={`${bool(r.is_active) ? "Deactivate" : "Activate"} ${str(r.name)}`}>
          {bool(r.is_active) ? "Deactivate" : "Activate"}
        </button>
      ),
    },
  ]
  return (
    <>
      <div className="mb-3 flex justify-end">
        <button type="button" className={buttonSecondary} onClick={() => setCreating(true)}>
          New service area
        </button>
      </div>
      <DataTable caption="Service areas" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No service areas." />
      <ConfirmReasonDialog
        open={creating}
        title="Create a service area"
        confirmLabel="Create"
        canConfirm={form.name.trim() !== "" && form.city.trim() !== "" && positive(form.radius_km)}
        busy={create.isPending}
        onConfirm={(reason) => create.mutate({ reason })}
        onClose={() => setCreating(false)}
      >
        {(["name", "city", "state", "postal_code", "radius_km"] as const).map((key) => (
          <Field key={key} label={key === "radius_km" ? "Radius (km)" : humanise(key)}>
            {(id) => <input id={id} className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
          </Field>
        ))}
      </ConfirmReasonDialog>
      <ConfirmReasonDialog
        open={toggling !== null}
        title={toggling && bool(toggling.is_active) ? "Stop delivering here?" : "Start delivering here?"}
        confirmLabel={toggling && bool(toggling.is_active) ? "Deactivate" : "Activate"}
        destructive={!!toggling && bool(toggling.is_active)}
        busy={toggle.isPending}
        onConfirm={(reason) => toggling && toggle.mutate({ row: toggling, reason })}
        onClose={() => setToggling(null)}
      />
    </>
  )
}

const REPORTS = [
  { id: "restaurant-sla", label: "Restaurant SLA", windowed: true },
  { id: "delivery-sla", label: "Delivery SLA", windowed: true },
  { id: "payment-recon", label: "Payment reconciliation", windowed: true },
  { id: "refunds", label: "Refunds by category", windowed: true },
  { id: "coupon-abuse", label: "Coupon abuse", windowed: true },
  { id: "compliance", label: "FSSAI compliance", windowed: false },
  { id: "orders", label: "Orders by status (all time)", windowed: false },
  { id: "revenue", label: "Revenue (all time)", windowed: false },
  { id: "fraud", label: "Top fraud scores (7 days)", windowed: false },
] as const

const RUPEE_FIELDS = new Set(["gross_amount", "amount", "gmv", "commission", "refunds", "net_revenue"])

function reportCell(key: string, value: unknown): React.ReactNode {
  if (RUPEE_FIELDS.has(key) && typeof value === "number") return formatPaise(rupeesToPaise(value))
  if (typeof value === "string" && /(^|_)(id)$/.test(key)) return <IdText id={value} />
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (isRecord(value) || Array.isArray(value)) return Object.keys(value).map(humanise).join(", ") || "—"
  if (typeof value === "number") return value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
  return value == null || value === "" ? "—" : String(value)
}

/** Feast's operational reports, as tables. Money shown in rupees from integer paise. */
export function FeastReports() {
  const { me } = useAdmin()
  const available = REPORTS.filter((r) => (r.id === "fraud" ? can(me, "food", "fraud.read") : can(me, "food", "reports.read")))
  const [reportId, setReportId] = useState<string>(available[0]?.id ?? "")
  const [range, setRange] = useState(() => presetRange("7d", new Date()))
  const report = available.find((r) => r.id === reportId) ?? available[0]
  const url = !report
    ? ""
    : report.id === "fraud"
      ? `${FOOD}/fraud/top?limit=100`
      : report.windowed
        ? `${FOOD}/reports/${report.id}?from=${encodeURIComponent(`${range.from}T00:00:00Z`)}&to=${encodeURIComponent(`${range.to}T23:59:59Z`)}`
        : `${FOOD}/reports/${report.id}`
  const data = useAdminObject("food", url, { enabled: !!report })
  const rows = useMemo(() => {
    const body = data.data
    if (!body) return []
    const list = Array.isArray(body.rows) ? body.rows : Array.isArray(body.items) ? body.items : [body]
    return list.filter(isRecord).map((row, i) => ({ ...row, __key: String(i) }))
  }, [data.data])
  const columns: DataColumn<Row>[] = useMemo(
    () =>
      Object.keys(rows[0] ?? {})
        .filter((k) => k !== "__key")
        .map((key) => ({
          key,
          header: humanise(key),
          value: (r: Row) => (typeof r[key] === "number" || typeof r[key] === "string" ? (r[key] as number | string) : null),
          sortable: true,
          cell: (r: Row) => reportCell(key, r[key]),
        })),
    [rows],
  )

  if (!report) return <p className="text-sm text-mo-body">No reports are available to you.</p>

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Report">
            {(id) => (
              <select id={id} className={inputClass} value={report.id} onChange={(e) => setReportId(e.target.value)}>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {report.windowed ? <DateRangePicker value={range} onChange={setRange} maxDays={90} /> : null}
      </div>
      <DataTable caption={report.label} rows={rows} columns={columns} rowId={(r) => String(r.__key)} loading={data.isLoading} error={data.error} onRetry={data.refetch} emptyMessage="Nothing in this report." />
    </>
  )
}

/** Feast's own audit log (actor ids only). */
export function FeastAudit() {
  const [offset, setOffset] = useState(0)
  const list = useAdminList("food", `${FOOD}/audit-logs?limit=${LIMIT}&offset=${offset}`)
  const columns: DataColumn<Row>[] = [
    { key: "created", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "actor", header: "Admin", value: (r) => str(r.actor_user_id), cell: (r) => <IdText id={r.actor_user_id} /> },
    { key: "action", header: "Action", value: (r) => str(r.action), sortable: true, filterable: true, cell: (r) => humanise(r.action) },
    { key: "entity", header: "Target", value: (r) => str(r.entity_type), filterable: true, cell: (r) => <span>{humanise(r.entity_type)} <IdText id={r.entity_id} /></span> },
    { key: "change", header: "Change", value: () => null, cell: (r) => (isRecord(r.new_value) ? Object.keys(r.new_value).map(humanise).join(", ") || "—" : "—") },
  ]
  return (
    <>
      <DataTable caption="Feast audit" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No audit rows." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
    </>
  )
}
