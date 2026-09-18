"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isUuid, num, str, when, type Row } from "@/lib/admin/data"
import {
  EMPTY_FARE_WINDOW,
  EVERY_DAY,
  MON_TO_FRI,
  RIDER,
  RIDER_WRITES,
  VEHICLE_TYPES,
  WEEKDAYS,
  WEEKEND,
  checkFareWindow,
  cityScopedUrl,
  fareWindowInput,
  hasWeekday,
  multiplierLabel,
  readSurge,
  surgeTone,
  toggleWeekday,
  windowSpan,
  type FareWindowInput,
} from "@/lib/admin/rider"
import { can } from "@/lib/admin/sections"
import { Panel, Problems, RiderActionDialog, TextField, useRiderMutation } from "./RiderBits"

/** The seven weekday chips; a set day is pressed. Mon–Fri, Sat–Sun and Every day are shortcuts. */
export function WeekdayChips({ value, onChange }: { value: number; onChange: (mask: number) => void }) {
  return (
    <div role="group" aria-label="Days of the week" className="flex flex-wrap items-center gap-1">
      {WEEKDAYS.map((d) => {
        const on = hasWeekday(value, d.bit)
        return (
          <button
            key={d.bit}
            type="button"
            aria-pressed={on}
            aria-label={d.label}
            className={`rounded-mo-sm border px-2 py-1 text-xs font-medium ${on ? "border-mo-ink bg-mo-ink text-mo-bg" : "border-mo-strong text-mo-body hover:bg-mo-raised"}`}
            onClick={() => onChange(toggleWeekday(value, d.bit))}
          >
            {d.short}
          </button>
        )
      })}
      <span className="mx-1 text-mo-body">·</span>
      <button type="button" className={buttonGhost} onClick={() => onChange(MON_TO_FRI)}>
        Mon–Fri
      </button>
      <button type="button" className={buttonGhost} onClick={() => onChange(WEEKEND)}>
        Sat–Sun
      </button>
      <button type="button" className={buttonGhost} onClick={() => onChange(EVERY_DAY)}>
        Every day
      </button>
    </div>
  )
}

/** The days a stored window applies, as small read-only chips. */
function WeekdayRow({ mask }: { mask: unknown }) {
  const n = num(mask) ?? 0
  return (
    <span className="inline-flex gap-0.5" aria-label={WEEKDAYS.filter((d) => hasWeekday(n, d.bit)).map((d) => d.label).join(", ") || "No days"}>
      {WEEKDAYS.map((d) => (
        <span key={d.bit} aria-hidden="true" className={`rounded-sm px-1 text-[10px] ${hasWeekday(n, d.bit) ? "bg-mo-ink text-mo-bg" : "text-mo-body/50"}`}>
          {d.short[0]}
        </span>
      ))}
    </span>
  )
}

function WindowForm({
  mode,
  input,
  onChange,
  problems,
  busy,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update"
  input: FareWindowInput
  onChange: (next: FareWindowInput) => void
  problems: string[]
  busy: boolean
  onSubmit: () => void
  onCancel?: () => void
}) {
  const set = (field: keyof FareWindowInput) => (v: string) => onChange({ ...input, [field]: v })
  return (
    <form
      className="space-y-3"
      aria-label={mode === "create" ? "Create a fare window" : "Update a fare window"}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {mode === "create" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="City id" value={input.city_id} onChange={set("city_id")} hint={input.city_id && !isUuid(input.city_id) ? "Enter the full city id." : undefined} />
          <Field label="Vehicle type">
            {(id) => (
              <select id={id} className={inputClass} value={input.vehicle_type} onChange={(e) => set("vehicle_type")(e.target.value)}>
                <option value="">Every vehicle type</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanise(t)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      ) : null}
      <TextField label="Name" value={input.name} onChange={set("name")} placeholder="Morning peak" />
      <div className="space-y-1">
        <span className="block text-sm font-semibold text-mo-ink">Days</span>
        <WeekdayChips value={input.days_of_week} onChange={(mask) => onChange({ ...input, days_of_week: mask })} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField label="Start (HH:MM)" type="time" value={input.start} onChange={set("start")} />
        <TextField label="End (HH:MM)" type="time" value={input.end} onChange={set("end")} hint="An end before the start runs past midnight." />
        <TextField label="Multiplier (×)" type="number" step="0.05" min="1" value={input.multiplier} onChange={set("multiplier")} hint={multiplierLabel(Math.round(Number(input.multiplier || "0") * 10_000))} />
        <TextField label="Priority" type="number" step="1" min="0" value={input.priority} onChange={set("priority")} hint="Higher wins when windows overlap." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Effective from" type="date" value={input.effective_from} onChange={set("effective_from")} />
        <TextField label="Effective to" type="date" value={input.effective_to} onChange={set("effective_to")} hint="Blank: no end." />
      </div>
      <Problems problems={problems} />
      <div className="flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={busy}>
          {mode === "create" ? "Create fare window" : "Update fare window"}
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

/** Live demand per vehicle type in the chosen city: requests against online partners, and the surge it produces under the cap. */
function SurgePanel({ cityId }: { cityId: string }) {
  const url = cityScopedUrl("/surge", cityId)
  const list = useAdminList("rider", url ?? "", { enabled: url !== null, keys: ["items", "surge"] })
  const rows = url ? readSurge(list.raw) : []
  return (
    <Panel
      title="Surge now"
      note="Demand is requests against online partners over the last few minutes; the multiplier never exceeds the city's cap."
      actions={
        url ? (
          <button type="button" className={buttonSecondary} onClick={list.refetch}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
        ) : null
      }
    >
      {!url ? (
        <p className="text-sm text-mo-body">Choose a city to see its surge.</p>
      ) : list.error ? (
        <p className="text-sm text-mo-bad">{list.error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-mo-body">{list.isLoading ? "Loading…" : "No vehicle types are reporting demand."}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Surge by vehicle type">
          {rows.map((r) => (
            <li key={str(r.vehicle_type) ?? ""} data-surge={str(r.vehicle_type) ?? ""} className="rounded-mo-sm border border-mo p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-mo-ink">{humanise(r.vehicle_type)}</span>
                <StatusPill value={multiplierLabel(r.demand_bps)} tone={surgeTone(r)} />
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-1 text-xs text-mo-body">
                <dt>Requested</dt>
                <dt>Online</dt>
                <dt>Cap</dt>
                <dd className="font-mo-mono text-mo-ink">{num(r.requested) ?? "—"}</dd>
                <dd className="font-mo-mono text-mo-ink">{num(r.online) ?? "—"}</dd>
                <dd className="font-mo-mono text-mo-ink">{multiplierLabel(r.cap_bps)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * Pricing: a city's fare windows (peak multipliers by weekday and local
 * time) and its live surge. Creating, changing or deactivating a window
 * changes what riders are quoted and needs a fresh 2FA code, like a fare
 * rule; deactivating asks for a reason the audit row keeps.
 */
export function RiderPricing() {
  const { me } = useAdmin()
  const [cityDraft, setCityDraft] = useState("")
  const [cityId, setCityId] = useState("")
  const [input, setInput] = useState<FareWindowInput>(EMPTY_FARE_WINDOW)
  const [problems, setProblems] = useState<string[]>([])
  const [editing, setEditing] = useState<Row | null>(null)
  const [deactivating, setDeactivating] = useState<Row | null>(null)
  const url = cityScopedUrl("/fare-windows", cityId)
  const list = useAdminList("rider", url ?? "", { enabled: url !== null })
  const mutation = useRiderMutation({
    onDone: (write) => {
      if (write === "fare_window.create") setInput({ ...EMPTY_FARE_WINDOW, city_id: cityId })
      if (write === "fare_window.update") setEditing(null)
      if (write === "fare_window.deactivate") setDeactivating(null)
    },
  })
  const mayManage = can(me, "rider", RIDER_WRITES["fare_window.create"].permission)

  const startEdit = (row: Row) => {
    setEditing(row)
    setInput(fareWindowInput(row))
    setProblems([])
  }
  const stopEdit = () => {
    setEditing(null)
    setInput({ ...EMPTY_FARE_WINDOW, city_id: cityId })
    setProblems([])
  }
  const submit = () => {
    if (editing) {
      const check = checkFareWindow(input, { partial: true })
      setProblems(check.ok ? [] : check.problems)
      if (check.ok) mutation.mutate({ write: "fare_window.update", method: "patch", url: `${RIDER}/fare-windows/${encodeURIComponent(String(editing.id))}`, body: check.body })
      return
    }
    const check = checkFareWindow(input)
    setProblems(check.ok ? [] : check.problems)
    if (check.ok) mutation.mutate({ write: "fare_window.create", url: `${RIDER}/fare-windows`, body: check.body })
  }

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Window", value: (r) => str(r.name), sortable: true, filterable: true },
    { key: "vehicle", header: "Vehicle", value: (r) => str(r.vehicle_type), sortable: true, cell: (r) => (str(r.vehicle_type) ? humanise(r.vehicle_type) : "All") },
    { key: "days", header: "Days", value: (r) => num(r.days_of_week), cell: (r) => <WeekdayRow mask={r.days_of_week} /> },
    { key: "time", header: "Local time", value: (r) => num(r.start_minute), sortable: true, cell: (r) => <span className="font-mo-mono text-xs">{windowSpan(r.start_minute, r.end_minute)}</span> },
    { key: "multiplier", header: "Multiplier", value: (r) => num(r.multiplier_bps), sortable: true, align: "right", cell: (r) => <span data-multiplier={num(r.multiplier_bps) ?? ""}>{multiplierLabel(r.multiplier_bps)}</span> },
    { key: "priority", header: "Priority", value: (r) => num(r.priority), sortable: true, align: "right" },
    { key: "active", header: "Active", value: (r) => (r.is_active === false ? "no" : "yes"), sortable: true, cell: (r) => <StatusPill value={r.is_active === false ? "inactive" : "active"} tone={r.is_active === false ? "bad" : "good"} /> },
    { key: "effective", header: "Effective", value: (r) => str(r.effective_from), sortable: true, cell: (r) => <span className="text-xs">{when(r.effective_from)}{str(r.effective_to) ? ` → ${when(r.effective_to)}` : ""}</span> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayManage ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonSecondary} onClick={() => startEdit(r)} aria-label={`Edit window ${str(r.name) ?? str(r.id)}`}>
              Edit
            </button>
            {r.is_active !== false ? (
              <button type="button" className={buttonDanger} onClick={() => setDeactivating(r)} aria-label={`Deactivate window ${str(r.name) ?? str(r.id)}`}>
                Deactivate
              </button>
            ) : null}
          </span>
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        aria-label="Choose a city"
        onSubmit={(e) => {
          e.preventDefault()
          const next = cityDraft.trim().toLowerCase()
          setCityId(next)
          if (!editing) setInput((s) => ({ ...s, city_id: next }))
        }}
      >
        <div className="w-96">
          <Field label="City id" hint={cityDraft && !isUuid(cityDraft) ? "Enter the full city id." : "Fare windows and surge are per city."}>
            {(id) => <input id={id} className={inputClass} value={cityDraft} placeholder="00000000-0000-4000-8000-000000000000" onChange={(e) => setCityDraft(e.target.value)} />}
          </Field>
        </div>
        <button type="submit" className={buttonSecondary} disabled={!isUuid(cityDraft)}>
          Show city
        </button>
      </form>

      <SurgePanel cityId={cityId} />

      <DataTable
        caption="Fare windows"
        rows={url ? list.data : []}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={url !== null && list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage={url ? "No fare windows in this city." : "Choose a city to list its fare windows."}
        pageSize={100}
      />

      {mayManage ? (
        <Panel
          title={editing ? `Update ${str(editing.name) ?? "window"}` : "Create a fare window"}
          note={
            editing ? (
              <>
                <IdText id={editing.id} /> · {RIDER_WRITES["fare_window.update"].explain}
              </>
            ) : (
              RIDER_WRITES["fare_window.create"].explain
            )
          }
        >
          <WindowForm mode={editing ? "update" : "create"} input={input} onChange={setInput} problems={problems} busy={mutation.isPending} onSubmit={submit} onCancel={editing ? stopEdit : undefined} />
        </Panel>
      ) : null}

      <RiderActionDialog
        write={deactivating ? "fare_window.deactivate" : null}
        subject={deactivating ? (str(deactivating.name) ?? "window") : null}
        busy={mutation.isPending}
        onConfirm={(reason) => deactivating && mutation.mutate({ write: "fare_window.deactivate", url: `${RIDER}/fare-windows/${encodeURIComponent(String(deactivating.id))}/deactivate`, body: { reason } })}
        onClose={() => setDeactivating(null)}
      />
    </div>
  )
}
