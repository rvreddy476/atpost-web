"use client"

import { useState } from "react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, StatusPill } from "@/components/blocks/bits"
import { buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { FormPanel } from "@/components/blocks/formFields"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isRecord, num, str, when, type Row } from "@/lib/admin/data"
import {
  CANCEL_STAGES,
  DOORSTEP_PAGE,
  DOORSTEP_READS,
  bpsLabel,
  checkCancellationRule,
  checkCity,
  checkCommissionRule,
  checkSlotConfig,
  checkZone,
  paise,
  scopeLabel,
} from "@/lib/admin/doorstep"
import { ActiveToggle, AreaSwitch, EditDialog, ReadOnlyNote, SpecForm, useMayWrite } from "./DoorstepBits"
import { useCategories } from "./DoorstepCatalogue"

type Area = "cities" | "zones" | "slots" | "cancellation" | "commission"

const AREAS: readonly { id: Area; label: string }[] = [
  { id: "cities", label: "Cities" },
  { id: "zones", label: "Zones" },
  { id: "slots", label: "Slot configs" },
  { id: "cancellation", label: "Cancellation rules" },
  { id: "commission", label: "Commission rules" },
]

const active = (r: Row) => <StatusPill value={r.active === true ? "active" : "inactive"} tone={r.active === true ? "good" : "normal"} />
const rupeesText = (p: unknown) => (num(p) === null ? "" : ((num(p) ?? 0) / 100).toFixed(2))

/**
 * Config: cities, service zones, slot configurations, cancellation fees and
 * commission. The lists need catalogue.read; every change config.write. The
 * fee and commission writes change money, so they need a fresh 2FA code.
 */
export function DoorstepConfig() {
  const [area, setArea] = useState<Area>("cities")
  const [city, setCity] = useState("HYD")
  const mayWrite = useMayWrite()
  return (
    <div>
      <AreaSwitch value={area} areas={AREAS} onChange={setArea} label="Config area" />
      <ReadOnlyNote show={!mayWrite("city.create")}>Read only: changing the configuration needs the config write permission.</ReadOnlyNote>
      {area !== "cities" ? (
        <div className="mb-3 w-32">
          <Field label="City">{(id) => <input id={id} className={inputClass} value={city} maxLength={3} onChange={(e) => setCity(e.target.value.toUpperCase())} />}</Field>
        </div>
      ) : null}
      {area === "cities" ? <Cities /> : area === "zones" ? <Zones city={city} /> : area === "slots" ? <SlotConfigs city={city} /> : area === "cancellation" ? <CancellationRules city={city} /> : <CommissionRules city={city} />}
    </div>
  )
}

const CITY_FIELDS = [
  { key: "name", label: "Name" },
  { key: "state_code", label: "GST state code", placeholder: "36" },
  { key: "extras_threshold", label: "Charge extras at approval above, ₹", hint: "Default ₹3,000." },
  { key: "extras_grace_minutes", label: "Extras grace (minutes)" },
  { key: "max_jobs_per_day", label: "Max jobs per professional a day" },
  { key: "offer_window_far_minutes", label: "Offer window, far slots (min)" },
  { key: "offer_window_near_minutes", label: "Offer window, near slots (min)" },
  { key: "offer_far_threshold_minutes", label: "A slot is far after (min)" },
] as const

function Cities() {
  const mayWrite = useMayWrite()
  const [editing, setEditing] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.cities())
  const columns: DataColumn<Row>[] = [
    { key: "code", header: "City", value: (r) => str(r.code), sortable: true, cell: (r) => <span>{str(r.name)} <span className="font-mo-mono text-xs text-mo-body">{str(r.code)}</span></span> },
    { key: "state", header: "GST state", value: (r) => str(r.state_code) },
    { key: "threshold", header: "Extras charged at approval above", value: (r) => num(r.extras_charge_now_threshold_paise), align: "right", cell: (r) => paise(r.extras_charge_now_threshold_paise) },
    { key: "grace", header: "Grace (min)", value: (r) => num(r.extras_grace_minutes), align: "right" },
    { key: "jobs", header: "Max jobs/day", value: (r) => num(r.max_jobs_per_day), align: "right" },
    { key: "offer", header: "Offer window far / near (min)", value: (r) => `${num(r.offer_window_far_minutes) ?? "—"} / ${num(r.offer_window_near_minutes) ?? "—"}` },
    { key: "active", header: "Open", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayWrite("city.update") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonSecondary} onClick={() => setEditing(r)} aria-label={`Edit ${str(r.name)}`}>
              Edit
            </button>
            <ActiveToggle write="city.update" target={{ code: String(r.code) }} active={r.active === true} label={str(r.name) ?? "city"} />
          </span>
        ) : null,
    },
  ]
  return (
    <div className="space-y-4">
      <DataTable caption="Cities" rows={list.data} columns={columns} rowId={(r) => String(r.code)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No cities yet." />
      {mayWrite("city.create") ? (
        <FormPanel title="New city" note="Created closed; open it once zones, slots, prices and professionals are ready.">
          <SpecForm
            write="city.create"
            target={{}}
            fields={[{ key: "code", label: "Code", placeholder: "HYD" }, ...CITY_FIELDS]}
            initial={{ code: "", name: "", state_code: "", extras_threshold: "", extras_grace_minutes: "", max_jobs_per_day: "", offer_window_far_minutes: "", offer_window_near_minutes: "", offer_far_threshold_minutes: "", active: false }}
            check={(v) => checkCity(v)}
          />
        </FormPanel>
      ) : null}
      <EditDialog open={editing !== null} title={editing ? `Edit ${str(editing.name) ?? "city"}` : "Edit city"} onClose={() => setEditing(null)}>
        {editing ? (
          <SpecForm
            write="city.update"
            target={{ code: String(editing.code) }}
            fields={CITY_FIELDS}
            initial={{
              name: str(editing.name) ?? "",
              state_code: str(editing.state_code) ?? "",
              extras_threshold: rupeesText(editing.extras_charge_now_threshold_paise),
              extras_grace_minutes: String(num(editing.extras_grace_minutes) ?? ""),
              max_jobs_per_day: String(num(editing.max_jobs_per_day) ?? ""),
              offer_window_far_minutes: String(num(editing.offer_window_far_minutes) ?? ""),
              offer_window_near_minutes: String(num(editing.offer_window_near_minutes) ?? ""),
              offer_far_threshold_minutes: String(num(editing.offer_far_threshold_minutes) ?? ""),
            }}
            check={(v) => checkCity(v, { partial: true })}
            resetOnDone={false}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </EditDialog>
    </div>
  )
}

function Zones({ city }: { city: string }) {
  const mayWrite = useMayWrite()
  const list = useAdminList("doorstep", DOORSTEP_READS.zones(city))
  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Zone", value: (r) => str(r.name), sortable: true, filterable: true, cell: (r) => <span>{str(r.name)} <span className="text-xs text-mo-body">{str(r.slug)}</span></span> },
    { key: "city", header: "City", value: (r) => str(r.city_code) },
    { key: "buffer", header: "Travel buffer (min)", value: (r) => num(r.travel_buffer_minutes), align: "right" },
    { key: "shape", header: "Boundary", value: (r) => (isRecord(r.boundary) ? str(r.boundary.type) : null) },
    { key: "updated", header: "Updated", value: (r) => str(r.updated_at), cell: (r) => when(r.updated_at) },
    { key: "active", header: "Served", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    { key: "toggle", header: "", value: () => null, align: "right", cell: (r) => <ActiveToggle write="zone.update" target={{ id: String(r.id) }} active={r.active === true} label={str(r.name) ?? "zone"} /> },
  ]
  return (
    <div className="space-y-4">
      <DataTable caption="Zones" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No zones in this city." pageSize={DOORSTEP_PAGE} />
      {mayWrite("zone.create") ? (
        <FormPanel title="New zone" note="Paste the boundary as GeoJSON (Polygon or MultiPolygon, [longitude, latitude]). The service checks the geometry.">
          <SpecForm
            write="zone.create"
            target={{}}
            fields={[
              { key: "city_code", label: "City" },
              { key: "name", label: "Name" },
              { key: "slug", label: "Slug" },
              { key: "travel_buffer_minutes", label: "Travel buffer (min, default 30)" },
              { key: "boundary", label: "Boundary (GeoJSON)", kind: "textarea", placeholder: "{\"type\": \"Polygon\", \"coordinates\": [[[78.38, 17.44], …]]}" },
              { key: "active", label: "Served now", kind: "check" },
            ]}
            initial={{ city_code: city, name: "", slug: "", travel_buffer_minutes: "", boundary: "", active: true }}
            check={checkZone}
          />
        </FormPanel>
      ) : null}
    </div>
  )
}

function SlotConfigs({ city }: { city: string }) {
  const mayWrite = useMayWrite()
  const categories = useCategories()
  const [editing, setEditing] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.slotConfigs(city))
  const columns: DataColumn<Row>[] = [
    { key: "scope", header: "Applies to", value: (r) => scopeLabel(r, categories.name) },
    { key: "hours", header: "Hours", value: (r) => `${str(r.open_time) ?? "—"}–${str(r.close_time) ?? "—"}` },
    { key: "step", header: "Step (min)", value: (r) => num(r.slot_step_minutes), align: "right" },
    { key: "lead", header: "Earliest ahead (min)", value: (r) => num(r.min_lead_minutes), align: "right" },
    { key: "horizon", header: "Days shown", value: (r) => num(r.horizon_days), align: "right" },
    { key: "hold", header: "Hold (min)", value: (r) => num(r.hold_minutes), align: "right" },
    { key: "active", header: "In use", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayWrite("slot_config.update") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonSecondary} onClick={() => setEditing(r)}>
              Edit
            </button>
            <ActiveToggle write="slot_config.update" target={{ id: String(r.id) }} active={r.active === true} label="slot config" />
          </span>
        ) : null,
    },
  ]
  const fields = [
    { key: "open_time", label: "Opens (HH:MM)", placeholder: "08:00" },
    { key: "close_time", label: "Closes (HH:MM)", placeholder: "20:00" },
    { key: "slot_step_minutes", label: "Slot step (min, default 30)" },
    { key: "min_lead_minutes", label: "Earliest slot ahead (min, default 120)" },
    { key: "horizon_days", label: "Days ahead shown (default 7)" },
    { key: "hold_minutes", label: "Checkout hold (min, default 10)" },
  ] as const
  return (
    <div className="space-y-4">
      <DataTable caption="Slot configs" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No slot configs in this city." />
      {mayWrite("slot_config.create") ? (
        <FormPanel title="New slot config" note="Slots shown to customers come from professionals' calendars; this only sets the hours and steps they are cut from.">
          <SpecForm
            write="slot_config.create"
            target={{}}
            fields={[{ key: "city_code", label: "City" }, { key: "category_id", label: "Category", kind: "select", options: [{ value: "", label: "City default" }, ...categories.options] }, ...fields, { key: "active", label: "In use", kind: "check" }]}
            initial={{ city_code: city, category_id: "", open_time: "08:00", close_time: "20:00", slot_step_minutes: "", min_lead_minutes: "", horizon_days: "", hold_minutes: "", active: true }}
            check={(v) => checkSlotConfig(v)}
          />
        </FormPanel>
      ) : null}
      <EditDialog open={editing !== null} title="Edit slot config" onClose={() => setEditing(null)}>
        {editing ? (
          <SpecForm
            write="slot_config.update"
            target={{ id: String(editing.id) }}
            fields={fields}
            initial={{
              open_time: str(editing.open_time) ?? "",
              close_time: str(editing.close_time) ?? "",
              slot_step_minutes: String(num(editing.slot_step_minutes) ?? ""),
              min_lead_minutes: String(num(editing.min_lead_minutes) ?? ""),
              horizon_days: String(num(editing.horizon_days) ?? ""),
              hold_minutes: String(num(editing.hold_minutes) ?? ""),
            }}
            check={(v) => checkSlotConfig(v, { partial: true })}
            resetOnDone={false}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </EditDialog>
    </div>
  )
}

function CancellationRules({ city }: { city: string }) {
  const mayWrite = useMayWrite()
  const categories = useCategories()
  const [editing, setEditing] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.cancellationRules(city))
  const columns: DataColumn<Row>[] = [
    { key: "scope", header: "Applies to", value: (r) => scopeLabel(r, categories.name) },
    { key: "stage", header: "Stage", value: (r) => str(r.stage), sortable: true, cell: (r) => humanise(r.stage) },
    { key: "window", header: "When", value: (r) => (num(r.minutes_before_lt) === null ? "Any time" : `< ${num(r.minutes_before_lt)} min before`) },
    { key: "fee", header: "Fee", value: (r) => num(r.fee_paise), align: "right", cell: (r) => (r.allowed === false ? "Not allowed" : num(r.fee_paise) === 0 ? "Free" : paise(r.fee_paise)) },
    { key: "order", header: "Order", value: (r) => num(r.sort_order), sortable: true, align: "right" },
    { key: "active", header: "In use", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayWrite("cancellation_rule.update") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonSecondary} onClick={() => setEditing(r)}>
              Edit
            </button>
            <ActiveToggle write="cancellation_rule.update" target={{ id: String(r.id) }} active={r.active === true} label="cancellation rule" />
          </span>
        ) : null,
    },
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-mo-body">The first active rule decides: category rules before the city default, then by order; a rule matches its stage when its minute limit is blank or above the minutes left before the slot.</p>
      <DataTable caption="Cancellation rules" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No cancellation rules in this city." />
      {mayWrite("cancellation_rule.create") ? (
        <FormPanel title="New cancellation rule">
          <SpecForm
            write="cancellation_rule.create"
            target={{}}
            fields={[
              { key: "city_code", label: "City" },
              { key: "category_id", label: "Category", kind: "select", options: [{ value: "", label: "City default" }, ...categories.options] },
              { key: "stage", label: "Stage", kind: "select", options: CANCEL_STAGES.map((s) => ({ value: s, label: humanise(s) })) },
              { key: "minutes_before_lt", label: "Less than N minutes before the slot (blank = any)" },
              { key: "fee", label: "Fee, ₹ (0 = free)" },
              { key: "sort_order", label: "Order" },
              { key: "allowed", label: "Cancelling is allowed at this stage", kind: "check" },
              { key: "active", label: "In use", kind: "check" },
            ]}
            initial={{ city_code: city, category_id: "", stage: "assigned", minutes_before_lt: "", fee: "", sort_order: "", allowed: true, active: true }}
            check={(v) => checkCancellationRule(v)}
          />
        </FormPanel>
      ) : null}
      <EditDialog open={editing !== null} title="Edit cancellation rule" onClose={() => setEditing(null)}>
        {editing ? (
          <SpecForm
            write="cancellation_rule.update"
            target={{ id: String(editing.id) }}
            fields={[
              { key: "minutes_before_lt", label: "Less than N minutes before the slot" },
              { key: "fee", label: "Fee, ₹ (0 = free)" },
              { key: "sort_order", label: "Order" },
              { key: "allowed", label: "Cancelling is allowed at this stage", kind: "check" },
            ]}
            initial={{ minutes_before_lt: String(num(editing.minutes_before_lt) ?? ""), fee: rupeesText(editing.fee_paise), sort_order: String(num(editing.sort_order) ?? ""), allowed: editing.allowed !== false }}
            check={(v) => checkCancellationRule(v, { partial: true })}
            resetOnDone={false}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </EditDialog>
    </div>
  )
}

function CommissionRules({ city }: { city: string }) {
  const mayWrite = useMayWrite()
  const categories = useCategories()
  const [ending, setEnding] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.commissionRules(city))
  const columns: DataColumn<Row>[] = [
    { key: "scope", header: "Applies to", value: (r) => scopeLabel(r, categories.name) },
    { key: "bps", header: "Commission", value: (r) => num(r.commission_bps), sortable: true, align: "right", cell: (r) => bpsLabel(r.commission_bps) },
    { key: "from", header: "From", value: (r) => str(r.effective_from), sortable: true, cell: (r) => when(r.effective_from) },
    { key: "to", header: "To", value: (r) => str(r.effective_to), cell: (r) => (str(r.effective_to) ? when(r.effective_to) : "Open") },
    { key: "active", header: "In use", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayWrite("commission_rule.update") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonSecondary} onClick={() => setEnding(r)}>
              Change or end
            </button>
            <ActiveToggle write="commission_rule.update" target={{ id: String(r.id) }} active={r.active === true} label="commission rule" />
          </span>
        ) : null,
    },
  ]
  return (
    <div className="space-y-4">
      <DataTable caption="Commission rules" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No commission rules in this city." />
      {mayWrite("commission_rule.create") ? (
        <FormPanel title="New commission rule" note="The platform's share of each job, 0–50%. Settlements are computed with it; payouts are off.">
          <SpecForm
            write="commission_rule.create"
            target={{}}
            fields={[
              { key: "city_code", label: "City" },
              { key: "category_id", label: "Category", kind: "select", options: [{ value: "", label: "Every category" }, ...categories.options] },
              { key: "percent", label: "Commission, %", placeholder: "15" },
              { key: "effective_from", label: "From (blank = now)", kind: "date" },
              { key: "effective_to", label: "To (optional)", kind: "date" },
              { key: "active", label: "In use", kind: "check" },
            ]}
            initial={{ city_code: city, category_id: "", percent: "", effective_from: "", effective_to: "", active: true }}
            check={(v) => checkCommissionRule(v)}
          />
        </FormPanel>
      ) : null}
      <EditDialog open={ending !== null} title="Change or end a commission rule" onClose={() => setEnding(null)}>
        {ending ? (
          <SpecForm
            write="commission_rule.update"
            target={{ id: String(ending.id) }}
            fields={[
              { key: "percent", label: "Commission, % (blank = unchanged)" },
              { key: "effective_to", label: "Ends on", kind: "date" },
            ]}
            initial={{ percent: "", effective_to: "" }}
            check={(v) => checkCommissionRule(v, { partial: true })}
            resetOnDone={false}
            onDone={() => setEnding(null)}
          />
        ) : null}
      </EditDialog>
    </div>
  )
}
