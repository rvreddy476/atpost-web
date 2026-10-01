"use client"

import { useState } from "react"
import { ShieldCheck, TriangleAlert } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Dialog } from "@/components/blocks/Dialog"
import { IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { CheckField, FormPanel, FormProblems, SelectField, TextAreaField, TextField } from "@/components/blocks/formFields"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { num, str, type Row } from "@/lib/admin/data"
import { istDay, istToday } from "@/lib/admin/discounts"
import { formatPaise } from "@/lib/admin/money"
import { stepUpWindowOpen } from "@/lib/admin/stepUp"
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_LIST_KEYS,
  COUPON_SCOPES,
  EMPTY_STORE_COUPON,
  checkStoreCoupon,
  couponMinOrder,
  couponType,
  couponListUrl,
  couponRequest,
  deactivateCouponBody,
  isPlatformCoupon,
  normaliseCode,
  platformCouponsBanner,
  sortCoupons,
  storeCouponInput,
  storeCouponStatus,
  storeCouponTone,
  storeCouponUsage,
  storeCouponValue,
  type CouponWrite,
  type StoreCouponInput,
} from "@/lib/admin/storeCoupons"

const COUPONS_KEY = adminKey("commerce")

/**
 * The banner while platform coupons are switched off. Rendered from the
 * list answer, so nothing shows until that answer is in.
 */
export function PlatformCouponsBanner({ raw }: { raw: unknown }) {
  if (raw === undefined) return null
  const text = platformCouponsBanner(raw)
  if (!text) return null
  return (
    <p role="note" data-testid="platform-coupons-off" className="mb-6 flex items-start gap-2 rounded-mo border border-mo-warn/50 bg-mo-warn/10 p-3 text-sm text-mo-ink">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-mo-warn" aria-hidden="true" />
      {text}
    </p>
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
  mode: "create" | "edit"
  input: StoreCouponInput
  onChange: (next: StoreCouponInput) => void
  problems: string[]
  busy: boolean
  onSubmit: () => void
  onCancel?: () => void
}) {
  const set =
    <K extends keyof StoreCouponInput>(field: K) =>
    (value: StoreCouponInput[K]) =>
      onChange({ ...input, [field]: value })
  const fixed = mode === "edit"
  const percentage = input.discount_type === "percentage"
  return (
    <form
      className="space-y-3"
      aria-label={mode === "create" ? "Create a platform coupon" : "Edit a platform coupon"}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Code"
          value={input.code}
          onChange={(v) => set("code")(normaliseCode(v))}
          placeholder="DIWALI10"
          disabled={fixed}
          maxLength={20}
          hint={fixed ? "A code cannot change; create a new coupon instead." : "4–20 capital letters and digits."}
        />
        <TextAreaField label="Description" value={input.description} onChange={set("description")} rows={2} placeholder="10% off for the festival" hint="Optional. Buyers see it with the code." />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Discount" value={input.discount_type} options={COUPON_DISCOUNT_TYPES} onChange={set("discount_type")} disabled={fixed} />
        {percentage ? (
          <TextField label="Per cent off" value={input.discount_value} onChange={set("discount_value")} inputMode="decimal" placeholder="10" disabled={fixed} hint={fixed ? undefined : "Above 0 and up to 100, e.g. 10 or 12.5."} />
        ) : (
          <TextField label="Amount off (₹)" value={input.discount_value} onChange={set("discount_value")} inputMode="decimal" placeholder="100" disabled={fixed} />
        )}
        {percentage ? <TextField label="Maximum discount (₹)" value={input.max_discount} onChange={set("max_discount")} inputMode="decimal" hint="Blank: no cap." /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Minimum order (₹)" value={input.min_order} onChange={set("min_order")} inputMode="decimal" hint="Blank: any order." />
        <TextField label="Total uses" value={input.max_uses} onChange={set("max_uses")} inputMode="numeric" hint="Blank: no limit." />
        <TextField label="Uses per buyer" value={input.max_uses_per_user} onChange={set("max_uses_per_user")} inputMode="numeric" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Applies to" value={input.applicable_to} options={COUPON_SCOPES} onChange={set("applicable_to")} disabled={fixed} />
        {input.applicable_to !== "all" ? (
          <TextAreaField label="Ids" value={input.applicable_ids} onChange={set("applicable_ids")} rows={2} disabled={fixed} hint="Full ids, one per line or separated by commas." />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Starts" type="date" value={input.starts_at} onChange={set("starts_at")} hint="Blank: now. Days are Indian time." />
        <TextField label="Expires" type="date" value={input.expires_at} onChange={set("expires_at")} hint="Blank: no end." />
      </div>
      <div className="flex flex-wrap gap-4">
        <CheckField label="Active" checked={input.is_active} onChange={set("is_active")} />
        <CheckField label="Public" checked={input.is_public} onChange={set("is_public")} hint="Shown on product pages and in the bag. Off: a secret code buyers must be given." />
      </div>
      <FormProblems problems={problems} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonPrimary} disabled={busy}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {mode === "create" ? "Create coupon" : "Save changes"}
        </button>
        {onCancel ? (
          <button type="button" className={buttonSecondary} onClick={onCancel} disabled={busy}>
            Cancel edit
          </button>
        ) : null}
        <span className="text-xs text-mo-body">Needs a fresh 2FA code.</span>
      </div>
    </form>
  )
}

function couponColumns(): DataColumn<Row>[] {
  return [
    { key: "code", header: "Code", value: (r) => str(r.code), sortable: true, filterable: true, cell: (r) => <span className="font-mo-mono text-xs font-semibold">{str(r.code) ?? "—"}</span> },
    { key: "value", header: "Discount", value: (r) => storeCouponValue(r), sortable: true },
    { key: "min", header: "Min order", value: (r) => couponMinOrder(r), align: "right", cell: (r) => ((couponMinOrder(r) ?? 0) > 0 ? formatPaise(couponMinOrder(r)) : "Any") },
    { key: "used", header: "Used", value: (r) => num(r.uses_count) ?? num(r.used_count), align: "right", cell: (r) => storeCouponUsage(r) },
    { key: "per_user", header: "Per buyer", value: (r) => num(r.max_uses_per_user), align: "right", cell: (r) => String(num(r.max_uses_per_user) ?? 1) },
    { key: "public", header: "Shown", value: (r) => (r.is_public === false ? "Secret" : "Public"), sortable: true },
    { key: "valid", header: "Valid", value: (r) => str(r.starts_at), cell: (r) => <span className="text-xs">{istDay(r.starts_at) || "now"} → {istDay(r.expires_at) || "no end"}</span> },
    { key: "status", header: "Status", value: (r) => storeCouponStatus(r), sortable: true, cell: (r) => <StatusPill value={storeCouponStatus(r)} tone={storeCouponTone(r)} /> },
  ]
}

/**
 * MStore → Coupons. Platform coupons: list (A to Z by code), create, edit,
 * deactivate, every write after a fresh 2FA code. While commerce reports
 * platform coupons switched off, a banner says buyers cannot use them yet.
 * Below, the coupons sellers run, read-only.
 */
export function StoreCoupons() {
  const { me } = useAdmin()
  const platform = useAdminList("commerce", couponListUrl("platform"), { keys: [...COUPON_LIST_KEYS] })
  const sellers = useAdminList("commerce", couponListUrl("seller"), { keys: [...COUPON_LIST_KEYS] })
  const [input, setInput] = useState<StoreCouponInput>(EMPTY_STORE_COUPON)
  const [problems, setProblems] = useState<string[]>([])
  const [editing, setEditing] = useState<Row | null>(null)
  const [deactivating, setDeactivating] = useState<Row | null>(null)

  const write = useAdminMutation<CouponWrite>({
    request: couponRequest,
    invalidate: [COUPONS_KEY],
    successMessage: "Coupon saved",
    errorTitle: "The coupon was not saved",
    stepUpFirst: () => stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
    onDone: (_data, w) => {
      if (w.kind === "create") setInput(EMPTY_STORE_COUPON)
      if (w.kind === "edit") stopEdit()
      if (w.kind === "deactivate") setDeactivating(null)
    },
  })

  const startEdit = (row: Row) => {
    setEditing(row)
    setInput(storeCouponInput(row))
    setProblems([])
  }
  function stopEdit() {
    setEditing(null)
    setInput(EMPTY_STORE_COUPON)
    setProblems([])
  }
  const submit = () => {
    const check = checkStoreCoupon(input, editing ? { stored: editing } : { today: istToday() })
    setProblems(check.ok ? [] : check.problems)
    if (!check.ok) return
    if (editing) write.mutate({ kind: "edit", id: String(editing.id), body: check.body })
    else write.mutate({ kind: "create", body: check.body })
  }

  const platformColumns: DataColumn<Row>[] = [
    ...couponColumns(),
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          {/* Older free-shipping and buy-x-get-y rows are shown, and can be switched off, but not edited here. */}
          {couponType(r) === "percentage" || couponType(r) === "flat" ? (
            <button type="button" className={buttonSecondary} onClick={() => startEdit(r)} aria-label={`Edit coupon ${str(r.code) ?? ""}`}>
              Edit
            </button>
          ) : null}
          {r.is_active !== false ? (
            <button type="button" className={buttonDanger} onClick={() => setDeactivating(r)} aria-label={`Deactivate coupon ${str(r.code) ?? ""}`}>
              Deactivate
            </button>
          ) : null}
        </span>
      ),
    },
  ]
  const sellerColumns: DataColumn<Row>[] = [
    { key: "seller", header: "Seller", value: (r) => str(r.seller_name) ?? str(r.store_name) ?? str(r.seller_id), sortable: true, filterable: true, cell: (r) => str(r.seller_name) ?? str(r.store_name) ?? <IdText id={r.seller_id} /> },
    ...couponColumns(),
  ]

  return (
    <div className="space-y-8">
      <PlatformCouponsBanner raw={platform.raw} />

      <section aria-labelledby="platform-coupons" className="space-y-4">
        <h2 id="platform-coupons" className="font-mo-display text-lg font-semibold text-mo-ink">
          Platform coupons
        </h2>
        <p className="text-sm text-mo-body">MStore pays for these discounts, not the seller.</p>
        <DataTable
          caption="Platform coupons"
          rows={sortCoupons(platform.data.filter(isPlatformCoupon))}
          columns={platformColumns}
          rowId={(r) => String(r.id)}
          loading={platform.isLoading}
          error={platform.error}
          onRetry={platform.refetch}
          emptyMessage="No platform coupons yet."
          pageSize={50}
        />
        <FormPanel
          title={editing ? `Edit ${str(editing.code) ?? "coupon"}` : "Create a platform coupon"}
          note={editing ? "Description, limits, dates, public and active can change; the code, discount and what it applies to cannot. Only what you change is sent." : undefined}
        >
          <CouponForm mode={editing ? "edit" : "create"} input={input} onChange={setInput} problems={problems} busy={write.isPending} onSubmit={submit} onCancel={editing ? stopEdit : undefined} />
        </FormPanel>
      </section>

      {sellers.isError || sellers.isLoading || sellers.data.length > 0 ? (
        <section aria-labelledby="seller-coupons" className="space-y-4">
          <h2 id="seller-coupons" className="font-mo-display text-lg font-semibold text-mo-ink">
            Seller coupons
          </h2>
          <p className="text-sm text-mo-body">Codes sellers run on their own products, at their own cost. Read-only here; sellers manage them in MSeller.</p>
          <DataTable
            caption="Seller coupons"
            rows={sortCoupons(sellers.data.filter((r) => !isPlatformCoupon(r)))}
            columns={sellerColumns}
            rowId={(r) => String(r.id)}
            loading={sellers.isLoading}
            error={sellers.error}
            onRetry={sellers.refetch}
            emptyMessage="No seller coupons."
            pageSize={50}
          />
        </section>
      ) : null}

      <Dialog
        open={deactivating !== null}
        title={`Deactivate ${str(deactivating?.code) ?? "this coupon"}?`}
        description="The code stops working for new orders at once; orders already placed keep their discount. Needs a fresh 2FA code."
        onClose={() => setDeactivating(null)}
        dismissible={!write.isPending}
      >
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={() => setDeactivating(null)} disabled={write.isPending}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonDanger}
            disabled={write.isPending}
            onClick={() => deactivating && write.mutate({ kind: "deactivate", id: String(deactivating.id), body: deactivateCouponBody() })}
          >
            Deactivate
          </button>
        </div>
      </Dialog>
    </div>
  )
}
