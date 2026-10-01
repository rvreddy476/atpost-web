"use client"

import { useState } from "react"
import { Info, ShieldCheck } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Dialog } from "@/components/blocks/Dialog"
import { StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { CheckField, FormPanel, FormProblems, SelectField, TextAreaField, TextField } from "@/components/blocks/formFields"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import {
  DISCOUNT_TYPES,
  EMPTY_OFFER,
  OFFERS,
  OFFER_FUNDERS,
  OFFER_LIST_KEYS,
  OFFER_PAYMENT_METHODS,
  checkOffer,
  deactivateOfferBody,
  offerInput,
  offerRequest,
  offerStatus,
  offerTone,
  offerValue,
  sortOffers,
  type OfferInput,
  type OfferWrite,
} from "@/lib/admin/bankOffers"
import { istDay, istToday } from "@/lib/admin/discounts"
import { num, str, type Row } from "@/lib/admin/data"
import { formatPaise } from "@/lib/admin/money"
import { stepUpWindowOpen } from "@/lib/admin/stepUp"

const OFFERS_KEY = adminKey("payments")

const labelOf = (options: readonly { value: string; label: string }[], value: unknown) => options.find((o) => o.value === value)?.label ?? (typeof value === "string" ? value : "—")

/** Where a bank offer comes from and what entering it here does. Shown above the list. */
export function BankOffersExplainer() {
  return (
    <div role="note" className="mb-6 flex items-start gap-2 rounded-mo border border-mo bg-mo-surface p-4 text-sm text-mo-ink">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-mo-body" aria-hidden="true" />
      <div className="space-y-1">
        <p>
          <strong>Create the offer in the Razorpay dashboard first.</strong> Razorpay gives it an id that starts with <span className="font-mo-mono">offer_</span>. Paste that id here with the same
          terms (discount, cap, minimum, card or UPI, dates).
        </p>
        <p>
          Buyers do not type anything: MStore checkout makes the offer available, and the buyer applies it inside the Razorpay payment sheet when they pay with a card or UPI app it covers. The
          entry here is also what lets a payment that arrives short by the offer&apos;s discount count as paid in full, so its terms must match Razorpay&apos;s.
        </p>
        <p className="text-mo-body">Changing or deactivating an entry here does not change the offer in Razorpay; do that in the Razorpay dashboard as well.</p>
      </div>
    </div>
  )
}

function OfferForm({
  mode,
  input,
  onChange,
  problems,
  busy,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit"
  input: OfferInput
  onChange: (next: OfferInput) => void
  problems: string[]
  busy: boolean
  onSubmit: () => void
  onCancel?: () => void
}) {
  const set =
    <K extends keyof OfferInput>(field: K) =>
    (value: OfferInput[K]) =>
      onChange({ ...input, [field]: value })
  const percentage = input.discount_type === "percentage"
  return (
    <form
      className="space-y-3"
      aria-label={mode === "create" ? "Add a bank offer" : "Edit a bank offer"}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Razorpay offer id"
          value={input.provider_offer_id}
          onChange={(v) => set("provider_offer_id")(v.trim())}
          placeholder="offer_JTUADI4ZWBGWur"
          disabled={mode === "edit"}
          hint={mode === "edit" ? "The id cannot change. For a different Razorpay offer, add a new entry." : "Copy it from the offer in the Razorpay dashboard."}
        />
        <TextField label="Title buyers see" value={input.title} onChange={set("title")} placeholder="10% off with HDFC credit cards" maxLength={120} />
      </div>
      <TextAreaField label="Description" value={input.description} onChange={set("description")} placeholder="Valid on HDFC Bank credit cards. Not valid on EMI." hint="Optional. Shown under the title." />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Paid with" value={input.payment_method} options={OFFER_PAYMENT_METHODS} onChange={set("payment_method")} />
        <SelectField label="Discount" value={input.discount_type} options={DISCOUNT_TYPES} onChange={set("discount_type")} />
        {percentage ? (
          <TextField label="Per cent off" value={input.discount_value} onChange={set("discount_value")} inputMode="decimal" placeholder="10" hint="Above 0 and up to 100, e.g. 10 or 12.5." />
        ) : (
          <TextField label="Amount off (₹)" value={input.discount_value} onChange={set("discount_value")} inputMode="decimal" placeholder="100" />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {percentage ? (
          <TextField label="Maximum discount (₹)" value={input.max_discount} onChange={set("max_discount")} inputMode="decimal" hint="Blank: no cap. Use the cap set in Razorpay." />
        ) : null}
        <TextField label="Minimum payment (₹)" value={input.min_amount} onChange={set("min_amount")} inputMode="decimal" hint="Blank: any amount." />
        <SelectField label="Discount funded by" value={input.funded_by} options={OFFER_FUNDERS} onChange={set("funded_by")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Starts" type="date" value={input.starts_at} onChange={set("starts_at")} hint="Blank: now. Days are Indian time." />
        <TextField label="Ends" type="date" value={input.ends_at} onChange={set("ends_at")} hint="Blank: no end." />
      </div>
      <CheckField label="Active" checked={input.active} onChange={set("active")} hint="Inactive offers are never attached to a checkout." />
      <FormProblems problems={problems} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={buttonPrimary} disabled={busy}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {mode === "create" ? "Add offer" : "Save changes"}
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

/**
 * Money → Bank offers. Lists the registry A to Z by title; a holder of
 * payments:offers.manage adds, edits and deactivates entries. Every write
 * asks for a fresh 2FA code before it is sent.
 */
export function BankOffers() {
  const { me } = useAdmin()
  const list = useAdminList("payments", OFFERS, { keys: [...OFFER_LIST_KEYS] })
  const [input, setInput] = useState<OfferInput>(EMPTY_OFFER)
  const [problems, setProblems] = useState<string[]>([])
  const [editing, setEditing] = useState<Row | null>(null)
  const [deactivating, setDeactivating] = useState<Row | null>(null)

  const write = useAdminMutation<OfferWrite>({
    request: offerRequest,
    invalidate: [OFFERS_KEY],
    successMessage: "Bank offer saved",
    errorTitle: "The bank offer was not saved",
    stepUpFirst: () => stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
    onDone: (_data, w) => {
      if (w.kind === "create") setInput(EMPTY_OFFER)
      if (w.kind === "edit") stopEdit()
      if (w.kind === "deactivate") setDeactivating(null)
    },
  })

  const startEdit = (row: Row) => {
    setEditing(row)
    setInput(offerInput(row))
    setProblems([])
  }
  function stopEdit() {
    setEditing(null)
    setInput(EMPTY_OFFER)
    setProblems([])
  }
  const submit = () => {
    const check = checkOffer(input, editing ? { stored: editing } : { today: istToday() })
    setProblems(check.ok ? [] : check.problems)
    if (!check.ok) return
    if (editing) write.mutate({ kind: "edit", id: String(editing.id), body: check.body })
    else write.mutate({ kind: "create", body: check.body })
  }

  const columns: DataColumn<Row>[] = [
    { key: "title", header: "Offer", value: (r) => str(r.title), sortable: true, filterable: true, cell: (r) => <span className="font-semibold">{str(r.title) ?? "—"}</span> },
    { key: "provider_offer_id", header: "Razorpay id", value: (r) => str(r.provider_offer_id), filterable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.provider_offer_id) ?? "—"}</span> },
    { key: "method", header: "Paid with", value: (r) => labelOf(OFFER_PAYMENT_METHODS, r.payment_method), sortable: true },
    { key: "value", header: "Discount", value: (r) => offerValue(r) },
    { key: "min", header: "Min payment", value: (r) => num(r.min_amount_minor), align: "right", cell: (r) => ((num(r.min_amount_minor) ?? 0) > 0 ? formatPaise(num(r.min_amount_minor)) : "Any") },
    { key: "funded", header: "Funded by", value: (r) => labelOf(OFFER_FUNDERS, r.funded_by), sortable: true },
    { key: "valid", header: "Valid", value: (r) => str(r.starts_at), cell: (r) => <span className="text-xs">{istDay(r.starts_at) || "now"} → {istDay(r.ends_at) || "no end"}</span> },
    { key: "status", header: "Status", value: (r) => offerStatus(r), sortable: true, cell: (r) => <StatusPill value={offerStatus(r)} tone={offerTone(r)} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={buttonSecondary} onClick={() => startEdit(r)} aria-label={`Edit ${str(r.title) ?? "offer"}`}>
            Edit
          </button>
          {r.active !== false ? (
            <button type="button" className={buttonDanger} onClick={() => setDeactivating(r)} aria-label={`Deactivate ${str(r.title) ?? "offer"}`}>
              Deactivate
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <DataTable
        caption="Bank offers"
        rows={sortOffers(list.data)}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No bank offers yet."
        pageSize={50}
      />

      <FormPanel
        title={editing ? `Edit ${str(editing.title) ?? "offer"}` : "Add a bank offer"}
        note={editing ? "Only what you change is sent. The Razorpay id stays the same." : "Paste the id of an offer that already exists in the Razorpay dashboard."}
      >
        <OfferForm mode={editing ? "edit" : "create"} input={input} onChange={setInput} problems={problems} busy={write.isPending} onSubmit={submit} onCancel={editing ? stopEdit : undefined} />
      </FormPanel>

      <Dialog
        open={deactivating !== null}
        title={`Deactivate ${str(deactivating?.title) ?? "this offer"}?`}
        description="Checkouts stop offering it at once. Payments already made with it are not affected. Switch it off in the Razorpay dashboard too. Needs a fresh 2FA code."
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
            onClick={() => deactivating && write.mutate({ kind: "deactivate", id: String(deactivating.id), body: deactivateOfferBody() })}
          >
            Deactivate
          </button>
        </div>
      </Dialog>
    </div>
  )
}
