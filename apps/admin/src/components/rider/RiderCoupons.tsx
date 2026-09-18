"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import {
  COUPON_DISCOUNT_TYPES,
  EMPTY_COUPON,
  RIDER,
  RIDER_PAGE,
  RIDER_WRITES,
  VEHICLE_TYPES,
  checkCoupon,
  couponInput,
  couponScope,
  couponStatus,
  couponTone,
  couponUsage,
  couponValue,
  paise,
  riderListQuery,
  type CouponInput,
} from "@/lib/admin/rider"
import { can } from "@/lib/admin/sections"
import { Panel, Problems, RiderActionDialog, TextField, useRiderMutation } from "./RiderBits"

function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-mo-ink">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-mo-body">{hint}</span> : null}
      </span>
    </label>
  )
}

function CouponForm({
  mode,
  input,
  onChange,
  problems,
  busy,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update"
  input: CouponInput
  onChange: (next: CouponInput) => void
  problems: string[]
  busy: boolean
  onSubmit: () => void
  onCancel?: () => void
}) {
  const set = (field: keyof CouponInput) => (v: string) => onChange({ ...input, [field]: v })
  const fixed = mode === "update"
  return (
    <form
      className="space-y-3"
      aria-label={mode === "create" ? "Create a coupon" : "Update a coupon"}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Code" value={input.code} onChange={(v) => set("code")(v.toUpperCase())} placeholder="FIRST50" disabled={fixed} hint={fixed ? "A code cannot be changed; create a new coupon instead." : "3–32 letters, digits, _ or -."} />
        <TextField label="Description" value={input.description} onChange={set("description")} placeholder="50% off the first ride" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Discount">
          {(id) => (
            <select id={id} className={inputClass} value={input.discount_type} disabled={fixed} onChange={(e) => onChange({ ...input, discount_type: e.target.value === "percent" ? "percent" : "flat" })}>
              {COUPON_DISCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "flat" ? "Flat amount" : "Percentage"}
                </option>
              ))}
            </select>
          )}
        </Field>
        {input.discount_type === "flat" ? (
          <TextField label="Amount off (₹)" type="number" step="0.01" min="0" value={input.discount_value} onChange={set("discount_value")} />
        ) : (
          <TextField label="Per cent off" type="number" step="0.5" min="0" value={input.percent} onChange={set("percent")} />
        )}
        <TextField label="Maximum discount (₹)" type="number" step="0.01" min="0" value={input.max_discount} onChange={set("max_discount")} hint="Blank or 0: no cap." />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Minimum fare (₹)" type="number" step="0.01" min="0" value={input.min_fare} onChange={set("min_fare")} hint="Blank or 0: any fare." />
        <TextField label="Per-user limit" type="number" step="1" min="0" value={input.per_user_limit} onChange={set("per_user_limit")} hint="0: unlimited." />
        <TextField label="Total limit" type="number" step="1" min="0" value={input.total_limit} onChange={set("total_limit")} hint="0: unlimited." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Starts" type="date" value={input.starts_at} onChange={set("starts_at")} hint="Blank: now." />
        <TextField label="Ends" type="date" value={input.ends_at} onChange={set("ends_at")} hint="Blank: no end." />
      </div>
      {!fixed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="City id" value={input.city_id} onChange={set("city_id")} hint={input.city_id && !isUuid(input.city_id) ? "Enter the full city id, or leave blank for every city." : "Blank: every city."} />
          <div className="space-y-1">
            <span className="block text-sm font-semibold text-mo-ink">Vehicle types</span>
            <div role="group" aria-label="Vehicle types" className="flex flex-wrap gap-1">
              {VEHICLE_TYPES.map((t) => {
                const on = input.vehicle_types.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-mo-sm border px-2 py-1 text-xs font-medium ${on ? "border-mo-ink bg-mo-ink text-mo-bg" : "border-mo-strong text-mo-body hover:bg-mo-raised"}`}
                    onClick={() => onChange({ ...input, vehicle_types: on ? input.vehicle_types.filter((v) => v !== t) : [...input.vehicle_types, t] })}
                  >
                    {humanise(t)}
                  </button>
                )
              })}
            </div>
            <div className="text-xs text-mo-body">None pressed: all vehicles.</div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <Checkbox label="First ride only" checked={input.first_ride_only} onChange={(v) => onChange({ ...input, first_ride_only: v })} hint="Only a customer's first completed ride can use it." />
        <Checkbox label="Active" checked={input.is_active} onChange={(v) => onChange({ ...input, is_active: v })} />
      </div>
      <Problems problems={problems} />
      <div className="flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={busy}>
          {mode === "create" ? "Create coupon" : "Update coupon"}
        </button>
        {onCancel ? (
          <button type="button" className={buttonSecondary} onClick={onCancel}>
            Cancel edit
          </button>
        ) : null}
      </div>
    </form>
  )
}

/** Who used which coupon on which ride, filtered by coupon. */
function CouponRedemptions({ couponId, onCouponId }: { couponId: string; onCouponId: (id: string) => void }) {
  const [draft, setDraft] = useState(couponId)
  const [offset, setOffset] = useState(0)
  const list = useAdminList("rider", `${RIDER}/coupons/redemptions?${riderListQuery({ coupon_id: isUuid(couponId) ? couponId : "" }, offset)}`)

  const columns: DataColumn<Row>[] = [
    { key: "coupon", header: "Coupon", value: (r) => str(r.coupon_id), filterable: true, cell: (r) => <IdText id={r.coupon_id} /> },
    { key: "customer", header: "Customer", value: (r) => str(r.customer_user_id), filterable: true, cell: (r) => <IdText id={r.customer_user_id} /> },
    { key: "ride", header: "Ride", value: (r) => str(r.ride_id), cell: (r) => <IdText id={r.ride_id} /> },
    { key: "discount", header: "Discount", value: (r) => num(r.discount_paise), sortable: true, align: "right", cell: (r) => paise(r.discount_paise) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={r.status === "applied" ? "good" : r.status === "released" ? "normal" : "warn"} /> },
    { key: "when", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]

  return (
    <Panel title="Redemptions" note="Reserved while a quote holds the coupon, applied once the ride completes, released if it does not.">
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Filter redemptions"
        onSubmit={(e) => {
          e.preventDefault()
          onCouponId(draft.trim().toLowerCase())
          setOffset(0)
        }}
      >
        <div className="w-96">
          <Field label="Coupon id" hint={draft && !isUuid(draft) ? "Enter the full coupon id, or leave blank for every coupon." : undefined}>
            {(id) => <input id={id} className={inputClass} value={draft} placeholder="Every coupon" onChange={(e) => setDraft(e.target.value)} />}
          </Field>
        </div>
        <button type="submit" className={buttonSecondary}>
          Filter
        </button>
      </form>
      <DataTable caption="Coupon redemptions" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No redemptions match." pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />
    </Panel>
  )
}

/**
 * Coupons: the codes customers can apply, their limits and use, and who
 * redeemed them. Every write is pricing, so it needs a fresh 2FA code;
 * deactivating asks for a reason the audit row keeps.
 */
export function RiderCoupons() {
  const { me } = useAdmin()
  const [activeOnly, setActiveOnly] = useState(true)
  const [offset, setOffset] = useState(0)
  const [input, setInput] = useState<CouponInput>(EMPTY_COUPON)
  const [problems, setProblems] = useState<string[]>([])
  const [editing, setEditing] = useState<Row | null>(null)
  const [deactivating, setDeactivating] = useState<Row | null>(null)
  const [redemptionsOf, setRedemptionsOf] = useState("")
  const list = useAdminList("rider", `${RIDER}/coupons?${riderListQuery({ active: activeOnly ? "true" : "" }, offset)}`)
  const mutation = useRiderMutation({
    onDone: (write) => {
      if (write === "coupon.create") setInput(EMPTY_COUPON)
      if (write === "coupon.update") setEditing(null)
      if (write === "coupon.deactivate") setDeactivating(null)
    },
  })
  const mayManage = can(me, "rider", RIDER_WRITES["coupon.create"].permission)

  const startEdit = (row: Row) => {
    setEditing(row)
    setInput(couponInput(row))
    setProblems([])
  }
  const stopEdit = () => {
    setEditing(null)
    setInput(EMPTY_COUPON)
    setProblems([])
  }
  const submit = () => {
    if (editing) {
      const check = checkCoupon(input, { partial: true })
      setProblems(check.ok ? [] : check.problems)
      if (check.ok) mutation.mutate({ write: "coupon.update", method: "patch", url: `${RIDER}/coupons/${encodeURIComponent(String(editing.id))}`, body: check.body })
      return
    }
    const check = checkCoupon(input)
    setProblems(check.ok ? [] : check.problems)
    if (check.ok) mutation.mutate({ write: "coupon.create", url: `${RIDER}/coupons`, body: check.body })
  }

  const columns: DataColumn<Row>[] = [
    { key: "code", header: "Code", value: (r) => str(r.code), sortable: true, filterable: true, cell: (r) => <span className="font-mo-mono text-xs font-semibold">{str(r.code)}</span> },
    { key: "value", header: "Discount", value: (r) => couponValue(r), cell: (r) => couponValue(r) },
    { key: "status", header: "Status", value: (r) => couponStatus(r), sortable: true, cell: (r) => <StatusPill value={couponStatus(r)} tone={couponTone(r)} /> },
    { key: "used", header: "Used", value: (r) => num(r.used_count), sortable: true, align: "right", cell: (r) => <span data-usage={couponUsage(r)}>{couponUsage(r)}</span> },
    { key: "per_user", header: "Per user", value: (r) => num(r.per_user_limit), align: "right", cell: (r) => ((num(r.per_user_limit) ?? 0) > 0 ? String(num(r.per_user_limit)) : "∞") },
    { key: "min_fare", header: "Min fare", value: (r) => num(r.min_fare_paise), align: "right", cell: (r) => ((num(r.min_fare_paise) ?? 0) > 0 ? paise(r.min_fare_paise) : "—") },
    { key: "first", header: "First ride", value: (r) => (r.first_ride_only === true ? "yes" : "no"), cell: (r) => (r.first_ride_only === true ? "Only" : "Any") },
    { key: "validity", header: "Valid", value: (r) => str(r.starts_at), sortable: true, cell: (r) => <span className="text-xs">{when(r.starts_at)} → {str(r.ends_at) ? when(r.ends_at) : "no end"}</span> },
    { key: "scope", header: "Scope", value: (r) => couponScope(r), cell: (r) => <span className="text-xs">{couponScope(r)}</span> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={buttonSecondary} onClick={() => setRedemptionsOf(String(r.id))} aria-label={`Redemptions of ${str(r.code)}`}>
            Redemptions
          </button>
          {mayManage ? (
            <button type="button" className={buttonSecondary} onClick={() => startEdit(r)} aria-label={`Edit coupon ${str(r.code)}`}>
              Edit
            </button>
          ) : null}
          {mayManage && r.is_active !== false ? (
            <button type="button" className={buttonDanger} onClick={() => setDeactivating(r)} aria-label={`Deactivate coupon ${str(r.code)}`}>
              Deactivate
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Checkbox
          label="Active coupons only"
          checked={activeOnly}
          onChange={(v) => {
            setActiveOnly(v)
            setOffset(0)
          }}
        />
      </div>
      <DataTable caption="Coupons" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage={activeOnly ? "No active coupons." : "No coupons yet."} pageSize={RIDER_PAGE} />
      <OffsetPager offset={offset} limit={RIDER_PAGE} count={list.data.length} onChange={setOffset} />

      {mayManage ? (
        <Panel
          title={editing ? `Update ${str(editing.code) ?? "coupon"}` : "Create a coupon"}
          note={
            editing ? (
              <>
                <IdText id={editing.id} /> · {RIDER_WRITES["coupon.update"].explain}
              </>
            ) : (
              RIDER_WRITES["coupon.create"].explain
            )
          }
        >
          <CouponForm mode={editing ? "update" : "create"} input={input} onChange={setInput} problems={problems} busy={mutation.isPending} onSubmit={submit} onCancel={editing ? stopEdit : undefined} />
        </Panel>
      ) : null}

      {/* Keyed on the coupon so choosing one from the table resets the filter draft. */}
      <CouponRedemptions key={redemptionsOf} couponId={redemptionsOf} onCouponId={setRedemptionsOf} />

      <RiderActionDialog
        write={deactivating ? "coupon.deactivate" : null}
        subject={deactivating ? (str(deactivating.code) ?? "coupon") : null}
        busy={mutation.isPending}
        onConfirm={(reason) => deactivating && mutation.mutate({ write: "coupon.deactivate", url: `${RIDER}/coupons/${encodeURIComponent(String(deactivating.id))}/deactivate`, body: { reason } })}
        onClose={() => setDeactivating(null)}
      />
    </div>
  )
}
