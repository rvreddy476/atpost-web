"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { Details, ErrorNote, Field, IdText, Loading, LookupForm, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import {
  ALWAYS_TWO_PERSON_NOTE,
  DAY_PATTERN,
  MON,
  beforeAfter,
  isPeriodKey,
  parseRupeesAllowZero,
  parseWhole,
} from "@/lib/admin/monetization"
import { formatPaise, parseRupeeInput } from "@/lib/admin/money"
import { can } from "@/lib/admin/sections"
import { NotLaunchedNote, useMonetizationList, useMonetizationObject } from "./MoneyBits"
import { MON_KEY } from "./MonetizationQueues"

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-mo-display text-base font-semibold text-mo-ink">{children}</h3>
}

/** Rates, quality bands, budgets, earnings and settlement. Every change here is two-person. */
export function CreatorFund() {
  const { me } = useAdmin()
  const read = can(me, "monetization", "fund.read")
  return (
    <div className="space-y-10">
      {read || can(me, "monetization", "fund.rates") ? <Rates /> : null}
      {can(me, "monetization", "fund.rates") ? <QualityBands /> : null}
      {read || can(me, "monetization", "fund.budget") ? <Budgets /> : null}
      {read ? <Earnings /> : null}
      {can(me, "monetization", "fund.settle") ? <Settle /> : null}
    </div>
  )
}

function Rates() {
  const { me } = useAdmin()
  const read = can(me, "monetization", "fund.read")
  const list = useMonetizationList(`${MON}/creator-fund/rates`, { enabled: read })
  const [editing, setEditing] = useState<{ before: Row | null } | null>(null)
  const [contentType, setContentType] = useState("")
  const [region, setRegion] = useState("")
  const [rpm, setRpm] = useState("")
  const rpmPaise = parseRupeeInput(rpm)
  const before = editing?.before ? num(editing.before.rpm_paise) : null

  const save = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({
      method: "put",
      url: `${MON}/creator-fund/rates`,
      body: {
        content_type: contentType.trim(),
        region_code: region.trim(),
        rpm_paise: rpmPaise,
        notes: reason,
        ...(before !== null ? { previous_rpm_paise: before } : {}),
      },
    }),
    invalidate: [MON_KEY],
    successMessage: "Rate changed",
    errorTitle: "Changing the rate failed",
    onDone: () => setEditing(null),
  })

  const open = (row: Row | null) => {
    setContentType(row ? (str(row.content_type) ?? "") : "")
    setRegion(row ? (str(row.region_code) ?? "") : "")
    setRpm("")
    setEditing({ before: row })
  }

  const columns: DataColumn<Row>[] = [
    { key: "type", header: "Content type", value: (r) => str(r.content_type), sortable: true, cell: (r) => humanise(r.content_type) },
    { key: "region", header: "Region", value: (r) => str(r.region_code), sortable: true },
    { key: "rpm", header: "Rate per 1,000 views", value: (r) => num(r.rpm_paise), align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(num(r.rpm_paise))}</span> },
    { key: "from", header: "Effective from", value: (r) => str(r.effective_from), sortable: true, cell: (r) => when(r.effective_from) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        can(me, "monetization", "fund.rates") ? (
          <button type="button" className={buttonSecondary} onClick={() => open(r)} aria-label={`Change rate ${str(r.content_type)} ${str(r.region_code) ?? ""}`}>
            Change
          </button>
        ) : null,
    },
  ]

  return (
    <section>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <H>Rates</H>
        </div>
        {can(me, "monetization", "fund.rates") ? (
          <button type="button" className={buttonSecondary} onClick={() => open(null)}>
            New rate
          </button>
        ) : null}
      </div>
      {!read ? null : list.notLaunched ? (
        <NotLaunchedNote />
      ) : (
        <DataTable caption="Creator fund rates" rows={list.data} columns={columns} rowId={(r) => String(r.id ?? `${str(r.content_type)}-${str(r.region_code)}`)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No active rates." />
      )}
      <ConfirmReasonDialog
        open={editing !== null}
        title={editing?.before ? "Change this rate" : "Set a new rate"}
        description={
          <>
            <span data-testid="rate-change">{rpmPaise !== null ? `Rate per 1,000 views: ${beforeAfter(before, rpmPaise)}` : "Enter the new rate."}</span> {ALWAYS_TWO_PERSON_NOTE}
          </>
        }
        confirmLabel="Send for approval"
        requireReason
        reasonLabel="Reason"
        canConfirm={contentType.trim() !== "" && rpmPaise !== null}
        busy={save.isPending}
        onConfirm={(reason) => save.mutate({ reason })}
        onClose={() => setEditing(null)}
      >
        <Field label="Content type">{(id) => <input id={id} className={inputClass} value={contentType} disabled={!!editing?.before} onChange={(e) => setContentType(e.target.value)} />}</Field>
        <Field label="Region code">{(id) => <input id={id} className={inputClass} value={region} disabled={!!editing?.before} onChange={(e) => setRegion(e.target.value)} />}</Field>
        <Field label="New rate in rupees per 1,000 views" hint={before !== null ? `Now ${formatPaise(before)}` : undefined}>
          {(id) => <input id={id} className={inputClass} inputMode="decimal" value={rpm} onChange={(e) => setRpm(e.target.value)} />}
        </Field>
      </ConfirmReasonDialog>
    </section>
  )
}

function QualityBands() {
  const [open, setOpen] = useState(false)
  const [contentType, setContentType] = useState("")
  const [region, setRegion] = useState("")
  const [floor, setFloor] = useState("")
  const [ceiling, setCeiling] = useState("")
  const [pivot, setPivot] = useState("")
  const [confidence, setConfidence] = useState("")
  const [enabled, setEnabled] = useState(true)
  const floorBps = parseWhole(floor)
  const ceilingBps = parseWhole(ceiling)
  const pivotCqs = pivot.trim() === "" ? null : Number(pivot)
  const confidenceN = confidence.trim() === "" ? null : parseWhole(confidence)
  const valid =
    contentType.trim() !== "" &&
    floorBps !== null &&
    ceilingBps !== null &&
    floorBps <= ceilingBps &&
    (pivotCqs === null || Number.isFinite(pivotCqs)) &&
    (confidence.trim() === "" || confidenceN !== null)

  const save = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({
      method: "put",
      url: `${MON}/creator-fund/quality-bands`,
      body: {
        content_type: contentType.trim(),
        region_code: region.trim(),
        floor_bps: floorBps,
        ceiling_bps: ceilingBps,
        ...(pivotCqs !== null ? { pivot_cqs: pivotCqs } : {}),
        ...(confidenceN !== null ? { confidence_impressions: confidenceN } : {}),
        enabled,
        notes: reason,
      },
    }),
    invalidate: [MON_KEY],
    successMessage: "Quality band changed",
    errorTitle: "Changing the quality band failed",
    onDone: () => setOpen(false),
  })

  return (
    <section>
      <H>Quality bands</H>
      <p className="mb-2 text-sm text-mo-body">The console cannot list the current bands yet. A change here is sent for approval with exactly the values below.</p>
      <button type="button" className={buttonSecondary} onClick={() => setOpen(true)}>
        Change a quality band
      </button>
      <ConfirmReasonDialog
        open={open}
        title="Change a quality band"
        description={ALWAYS_TWO_PERSON_NOTE}
        confirmLabel="Send for approval"
        requireReason
        canConfirm={valid}
        busy={save.isPending}
        onConfirm={(reason) => save.mutate({ reason })}
        onClose={() => setOpen(false)}
      >
        <Field label="Content type">{(id) => <input id={id} className={inputClass} value={contentType} onChange={(e) => setContentType(e.target.value)} />}</Field>
        <Field label="Region code">{(id) => <input id={id} className={inputClass} value={region} onChange={(e) => setRegion(e.target.value)} />}</Field>
        <Field label="Floor (basis points)">{(id) => <input id={id} className={inputClass} inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value)} />}</Field>
        <Field label="Ceiling (basis points)" hint="10,000 basis points is 100% of the base rate.">
          {(id) => <input id={id} className={inputClass} inputMode="numeric" value={ceiling} onChange={(e) => setCeiling(e.target.value)} />}
        </Field>
        <Field label="Pivot quality score (optional)">{(id) => <input id={id} className={inputClass} inputMode="decimal" value={pivot} onChange={(e) => setPivot(e.target.value)} />}</Field>
        <Field label="Confidence impressions (optional)">{(id) => <input id={id} className={inputClass} inputMode="numeric" value={confidence} onChange={(e) => setConfidence(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm text-mo-ink">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Band enabled
        </label>
      </ConfirmReasonDialog>
    </section>
  )
}

function Budgets() {
  const { me } = useAdmin()
  const read = can(me, "monetization", "fund.read")
  const list = useMonetizationList(`${MON}/creator-fund/budgets`, { enabled: read, keys: ["budgets"] })
  const cadence = list.raw && typeof list.raw === "object" ? str((list.raw as { data?: { cadence?: unknown } }).data?.cadence) : null
  const [editing, setEditing] = useState<{ before: Row | null } | null>(null)
  const [period, setPeriod] = useState("")
  const [region, setRegion] = useState("")
  const [cap, setCap] = useState("")
  const capPaise = parseRupeesAllowZero(cap)
  const before = editing?.before ? num(editing.before.cap_paise) : null
  const accrued = editing?.before ? num(editing.before.accrued_paise) : null

  const save = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({
      method: "put",
      url: `${MON}/creator-fund/budgets`,
      body: {
        period_key: period.trim(),
        region_code: region.trim(),
        cap_paise: capPaise,
        notes: reason,
        ...(before !== null ? { previous_cap_paise: before } : {}),
      },
    }),
    invalidate: [MON_KEY],
    successMessage: "Budget changed",
    errorTitle: "Changing the budget failed",
    onDone: () => setEditing(null),
  })

  const open = (row: Row | null) => {
    setPeriod(row ? (str(row.period_key) ?? "") : "")
    setRegion(row ? (str(row.region_code) ?? "") : "")
    setCap("")
    setEditing({ before: row })
  }

  const columns: DataColumn<Row>[] = [
    { key: "period", header: "Period", value: (r) => str(r.period_key), sortable: true },
    { key: "region", header: "Region", value: (r) => str(r.region_code) },
    { key: "cap", header: "Cap", value: (r) => num(r.cap_paise), align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(num(r.cap_paise))}</span> },
    { key: "accrued", header: "Accrued", value: (r) => num(r.accrued_paise), align: "right", cell: (r) => <span className="font-mo-mono">{formatPaise(num(r.accrued_paise))}</span> },
    { key: "exhausted", header: "Exhausted", value: (r) => str(r.exhausted_at), cell: (r) => (str(r.exhausted_at) ? <StatusPill value="exhausted" tone="warn" /> : "—") },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        can(me, "monetization", "fund.budget") ? (
          <button type="button" className={buttonSecondary} onClick={() => open(r)} aria-label={`Change budget ${str(r.period_key)}`}>
            Change
          </button>
        ) : null,
    },
  ]

  return (
    <section>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <H>Budgets{cadence ? ` (${humanise(cadence).toLowerCase()} periods)` : ""}</H>
        </div>
        {can(me, "monetization", "fund.budget") ? (
          <button type="button" className={buttonSecondary} onClick={() => open(null)}>
            New budget
          </button>
        ) : null}
      </div>
      {!read ? null : list.notLaunched ? (
        <NotLaunchedNote />
      ) : (
        <DataTable caption="Creator fund budgets" rows={list.data} columns={columns} rowId={(r) => `${str(r.period_key)}-${str(r.region_code)}`} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No budgets set." />
      )}
      <ConfirmReasonDialog
        open={editing !== null}
        title={editing?.before ? "Change this budget" : "Set a budget"}
        description={
          <>
            <span data-testid="budget-change">
              {capPaise !== null ? `Cap for ${period.trim() || "the period"}: ${beforeAfter(before, capPaise)}` : "Enter the cap."}
              {accrued !== null ? ` Already accrued: ${formatPaise(accrued)}.` : ""}
            </span>{" "}
            {ALWAYS_TWO_PERSON_NOTE}
          </>
        }
        confirmLabel="Send for approval"
        requireReason
        canConfirm={isPeriodKey(period) && capPaise !== null}
        busy={save.isPending}
        onConfirm={(reason) => save.mutate({ reason })}
        onClose={() => setEditing(null)}
      >
        <Field label="Period key" hint="2026-09 for a month, 2026-09-H1 or 2026-09-H2 for half-months.">
          {(id) => <input id={id} className={inputClass} value={period} disabled={!!editing?.before} onChange={(e) => setPeriod(e.target.value)} />}
        </Field>
        <Field label="Region code">{(id) => <input id={id} className={inputClass} value={region} disabled={!!editing?.before} onChange={(e) => setRegion(e.target.value)} />}</Field>
        <Field label="Cap in rupees" hint={before !== null ? `Now ${formatPaise(before)}` : undefined}>
          {(id) => <input id={id} className={inputClass} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />}
        </Field>
      </ConfirmReasonDialog>
    </section>
  )
}

function Earnings() {
  const { me } = useAdmin()
  const [id, setId] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)
  const earning = useMonetizationObject(`${MON}/creator-fund/earnings/${encodeURIComponent(id ?? "")}`, { enabled: id !== null })
  const reverse = useAdminMutation<{ reason: string }>({
    request: ({ reason }) => ({ method: "post", url: `${MON}/creator-fund/earnings/${encodeURIComponent(id ?? "")}/reverse`, body: { reason } }),
    invalidate: [MON_KEY],
    successMessage: "Earning reversed",
    errorTitle: "Reversal failed",
    onDone: () => setReversing(false),
  })
  const e = earning.data

  return (
    <section>
      <H>Earning lookup</H>
      <LookupForm label="Earning id" button="Look up" validate={(v) => (isUuid(v) ? null : "Enter a full earning id (a UUID).")} onSubmit={setId} />
      {id === null ? null : earning.notLaunched ? (
        <NotLaunchedNote />
      ) : earning.isLoading ? (
        <Loading />
      ) : earning.error ? (
        <ErrorNote message={earning.error} onRetry={earning.refetch} />
      ) : e ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <Details
            items={[
              ["Creator", <IdText key="c" id={e.creator_id} />],
              ["Day", str(e.day_bucket)?.slice(0, 10) ?? "—"],
              ["Content", `${humanise(e.content_type)} · ${str(e.region_code) ?? "—"}`],
              ["Views", num(e.view_count)?.toLocaleString("en-IN") ?? "—"],
              ["Rate", formatPaise(num(e.rpm_paise))],
              ["Gross", formatPaise(num(e.gross_paise))],
              ["Platform fee", formatPaise(num(e.platform_fee_paise))],
              ["Net", formatPaise(num(e.net_paise))],
              ["Status", <StatusPill key="s" value={e.status} />],
            ]}
          />
          {can(me, "monetization", "fund.reverse") && str(e.status) !== "reversed" ? (
            <button type="button" className={`${buttonDanger} mt-3`} onClick={() => setReversing(true)}>
              Reverse this earning
            </button>
          ) : null}
        </div>
      ) : null}
      <ConfirmReasonDialog
        open={reversing}
        title="Reverse this earning?"
        description={
          e ? (
            <>
              Net {formatPaise(num(e.net_paise))} for {str(e.day_bucket)?.slice(0, 10) ?? "this day"}. If it was already paid, that amount is taken back from the creator&apos;s wallet. {ALWAYS_TWO_PERSON_NOTE}
            </>
          ) : null
        }
        confirmLabel="Send for approval"
        destructive
        busy={reverse.isPending}
        onConfirm={(reason) => reverse.mutate({ reason })}
        onClose={() => setReversing(false)}
      />
    </section>
  )
}

type SettleKind = "day" | "period" | "creator"

function Settle() {
  const [kind, setKind] = useState<SettleKind | null>(null)
  const [day, setDay] = useState("")
  const [period, setPeriod] = useState("")
  const [creator, setCreator] = useState("")
  const periodOk = period.trim() === "" || isPeriodKey(period)

  const settle = useAdminMutation<{ kind: SettleKind; reason: string }>({
    request: ({ kind: k, reason }) => {
      const p = period.trim()
      const query = p ? `?period=${encodeURIComponent(p)}` : ""
      if (k === "day") return { method: "post", url: `${MON}/creator-fund/settle?day=${encodeURIComponent(day)}`, body: { reason } }
      if (k === "period") return { method: "post", url: `${MON}/creator-fund/settle-period${query}`, body: { reason } }
      return { method: "post", url: `${MON}/creator-fund/${encodeURIComponent(creator.trim())}/settle-period${query}`, body: { reason } }
    },
    invalidate: [MON_KEY],
    successMessage: "Settlement run",
    errorTitle: "Settlement failed",
    onDone: () => setKind(null),
  })

  const describe = (k: SettleKind | null) => {
    const p = period.trim() || "the most recently closed period"
    if (k === "day") return `Re-measure ${day} for every eligible creator. This accrues; it moves no money.`
    if (k === "period") return `Pay every creator for ${p}. This moves money into creator wallets.`
    if (k === "creator") return `Pay creator ${creator.trim()} for ${p}. This moves money into their wallet.`
    return ""
  }

  return (
    <section>
      <H>Settle</H>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 rounded-mo border border-mo p-3">
          <Field label="Day to re-measure">{(id) => <input id={id} type="date" className={inputClass} value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
          <button type="button" className={buttonSecondary} disabled={!DAY_PATTERN.test(day)} onClick={() => setKind("day")}>
            Settle day
          </button>
        </div>
        <div className="space-y-2 rounded-mo border border-mo p-3">
          <Field label="Period key (optional)" hint="Empty settles the most recently closed period.">
            {(id) => <input id={id} className={inputClass} value={period} placeholder="2026-09" onChange={(e) => setPeriod(e.target.value)} />}
          </Field>
          <button type="button" className={buttonPrimary} disabled={!periodOk} onClick={() => setKind("period")}>
            Settle period
          </button>
        </div>
        <div className="space-y-2 rounded-mo border border-mo p-3">
          <Field label="One creator's user id">{(id) => <input id={id} className={inputClass} value={creator} onChange={(e) => setCreator(e.target.value)} />}</Field>
          <button type="button" className={buttonSecondary} disabled={!isUuid(creator) || !periodOk} onClick={() => setKind("creator")}>
            Settle this creator
          </button>
        </div>
      </div>
      <ConfirmReasonDialog
        open={kind !== null}
        title={kind === "day" ? "Settle this day?" : kind === "creator" ? "Settle this creator's period?" : "Settle this period?"}
        description={
          <>
            <span data-testid="settle-summary">{describe(kind)}</span> {ALWAYS_TWO_PERSON_NOTE}
          </>
        }
        confirmLabel="Send for approval"
        destructive
        busy={settle.isPending}
        onConfirm={(reason) => kind && settle.mutate({ kind, reason })}
        onClose={() => setKind(null)}
      />
    </section>
  )
}
