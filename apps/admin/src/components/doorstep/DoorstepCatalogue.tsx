"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonGhost, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { FormPanel } from "@/components/blocks/formFields"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { humanise, isRecord, isUuid, num, readList, str, when, type Row } from "@/lib/admin/data"
import {
  DOORSTEP_PAGE,
  DOORSTEP_READS,
  EXTRAS_POLICIES,
  FAMILIES,
  GENDER_RULES,
  RATE_CARD_UNITS,
  checkAddon,
  checkAddonGroup,
  checkCategory,
  checkOption,
  checkPrice,
  checkRateCard,
  checkService,
  checkSkill,
  cityCode,
  openPriceRow,
  paise,
  priceHistory,
} from "@/lib/admin/doorstep"
import { ActiveToggle, AreaSwitch, EditDialog, ReadOnlyNote, SpecForm, useMayWrite, type FieldSpec } from "./DoorstepBits"

type Area = "categories" | "skills" | "services" | "prices" | "rate-cards"

const AREAS: readonly { id: Area; label: string }[] = [
  { id: "categories", label: "Categories" },
  { id: "services", label: "Services" },
  { id: "prices", label: "Prices" },
  { id: "rate-cards", label: "Rate cards" },
  { id: "skills", label: "Skills" },
]

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanise(v) }))
const active = (r: Row) => <StatusPill value={r.active === true ? "active" : "inactive"} tone={r.active === true ? "good" : "normal"} />

/**
 * The catalogue: categories, services with their options and add-ons,
 * effective-dated city prices, extras rate cards and skills. Everyone with
 * catalogue.read sees it; the forms and toggles need catalogue.write.
 */
export function DoorstepCatalogue() {
  const [area, setArea] = useState<Area>("categories")
  const mayWrite = useMayWrite()
  return (
    <div>
      <AreaSwitch value={area} areas={AREAS} onChange={setArea} label="Catalogue area" />
      <ReadOnlyNote show={!mayWrite("category.create")}>Read only: changing the catalogue needs the catalogue write permission.</ReadOnlyNote>
      {area === "categories" ? <Categories /> : area === "services" ? <Services /> : area === "prices" ? <Prices /> : area === "rate-cards" ? <RateCards /> : <Skills />}
    </div>
  )
}

/** The categories list, shared by the forms that pick a category. */
export function useCategories() {
  const list = useAdminList("doorstep", DOORSTEP_READS.categories())
  const name = (id: string) => str(list.data.find((c) => str(c.id) === id)?.name)
  const options = list.data.map((c) => ({ value: String(c.id), label: str(c.name) ?? String(c.id) }))
  return { list, name, options }
}

function Categories() {
  const mayWrite = useMayWrite()
  const { list } = useCategories()
  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Category", value: (r) => str(r.name), sortable: true, filterable: true, cell: (r) => <span>{str(r.name)} <span className="text-xs text-mo-body">{str(r.slug)}</span></span> },
    { key: "family", header: "Family (GST)", value: (r) => str(r.family), sortable: true, cell: (r) => humanise(r.family) },
    { key: "gender", header: "Who may serve", value: (r) => str(r.gender_rule), cell: (r) => humanise(r.gender_rule) },
    { key: "extras", header: "Extras", value: (r) => str(r.extras_policy), cell: (r) => humanise(r.extras_policy) },
    { key: "sort", header: "Order", value: (r) => num(r.sort_order), sortable: true, align: "right" },
    { key: "active", header: "Shown", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    { key: "toggle", header: "", value: () => null, align: "right", cell: (r) => <ActiveToggle write="category.update" target={{ id: String(r.id) }} active={r.active === true} label={str(r.name) ?? "category"} /> },
  ]
  const fields: FieldSpec[] = [
    { key: "name", label: "Name" },
    { key: "slug", label: "Slug", placeholder: "ac-repair" },
    { key: "family", label: "Family (decides GST)", kind: "select", options: [{ value: "", label: "Choose…" }, ...opts(FAMILIES)] },
    { key: "gender_rule", label: "Who may serve", kind: "select", options: opts(GENDER_RULES), hint: "Salon: women-only or men-only." },
    { key: "extras_policy", label: "Extras", kind: "select", options: opts(EXTRAS_POLICIES), hint: "Salon: catalogue add-ons only." },
    { key: "sort_order", label: "Order" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "active", label: "Show to customers now", kind: "check" },
  ]
  return (
    <div className="space-y-4">
      <DataTable caption="Categories" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No categories yet." pageSize={DOORSTEP_PAGE} />
      {mayWrite("category.create") ? (
        <FormPanel title="New category">
          <SpecForm write="category.create" target={{}} fields={fields} initial={{ name: "", slug: "", family: "", gender_rule: "any", extras_policy: "rate_card", sort_order: "", description: "", active: false }} check={checkCategory} />
        </FormPanel>
      ) : null}
    </div>
  )
}

function Skills() {
  const mayWrite = useMayWrite()
  const list = useAdminList("doorstep", DOORSTEP_READS.skills())
  return (
    <div className="space-y-4">
      <DataTable
        caption="Skills"
        rows={list.data}
        columns={[
          { key: "code", header: "Code", value: (r) => str(r.code), sortable: true, filterable: true, cell: (r) => <span className="font-mo-mono text-xs">{str(r.code)}</span> },
          { key: "name", header: "Name", value: (r) => str(r.name), sortable: true },
          { key: "description", header: "Description", value: (r) => str(r.description) },
        ]}
        rowId={(r) => String(r.code)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No skills yet."
        pageSize={DOORSTEP_PAGE}
      />
      {mayWrite("skill.create") ? (
        <FormPanel title="New skill">
          <SpecForm
            write="skill.create"
            target={{}}
            fields={[
              { key: "code", label: "Code", placeholder: "ac_service" },
              { key: "name", label: "Name" },
              { key: "description", label: "Description", kind: "textarea" },
            ]}
            initial={{ code: "", name: "", description: "" }}
            check={checkSkill}
          />
        </FormPanel>
      ) : null}
    </div>
  )
}

function Services() {
  const mayWrite = useMayWrite()
  const categories = useCategories()
  const skills = useAdminList("doorstep", DOORSTEP_READS.skills())
  const [category, setCategory] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.services(category))

  if (open) return <ServiceTree id={open} onBack={() => setOpen(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Service", value: (r) => str(r.name), sortable: true, filterable: true },
    { key: "category", header: "Category", value: (r) => categories.name(String(r.category_id)) },
    { key: "duration", header: "Minutes", value: (r) => num(r.duration_minutes), sortable: true, align: "right" },
    { key: "skill", header: "Skill", value: (r) => str(r.required_skill), cell: (r) => <span className="font-mo-mono text-xs">{str(r.required_skill)}</span> },
    { key: "photos", header: "Photos before / after", value: (r) => `${num(r.min_before_photos) ?? 0} / ${num(r.min_after_photos) ?? 0}` },
    { key: "rework", header: "Rework days", value: (r) => num(r.rework_days), align: "right" },
    { key: "active", header: "Shown", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          <ActiveToggle write="service.update" target={{ id: String(r.id) }} active={r.active === true} label={str(r.name) ?? "service"} />
          <button type="button" className={buttonSecondary} onClick={() => setOpen(String(r.id))} aria-label={`Open service ${str(r.name)}`}>
            Options and add-ons
          </button>
        </span>
      ),
    },
  ]

  const skillOptions = [{ value: "", label: "Choose…" }, ...skills.data.map((s) => ({ value: String(s.code), label: `${str(s.name) ?? ""} (${str(s.code)})` }))]
  return (
    <div className="space-y-4">
      <div className="w-72">
        <Field label="Category">
          {(id) => (
            <select id={id} className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Every category</option>
              {categories.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Services" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No services in this category." pageSize={DOORSTEP_PAGE} />
      {mayWrite("service.create") ? (
        <FormPanel title="New service" note="One professional per job at launch (crew bookings are off).">
          <SpecForm
            write="service.create"
            target={{}}
            fields={[
              { key: "category_id", label: "Category", kind: "select", options: [{ value: "", label: "Choose…" }, ...categories.options] },
              { key: "name", label: "Name" },
              { key: "slug", label: "Slug" },
              { key: "duration_minutes", label: "Duration (minutes)" },
              { key: "required_skill", label: "Skill needed", kind: "select", options: skillOptions },
              { key: "min_before_photos", label: "Photos before (default 2)" },
              { key: "min_after_photos", label: "Photos after (default 2)" },
              { key: "rework_days", label: "Rework window, days (default 7)" },
              { key: "sort_order", label: "Order" },
              { key: "description", label: "Description", kind: "textarea" },
              { key: "inclusions", label: "Included (one per line)", kind: "textarea" },
              { key: "exclusions", label: "Not included (one per line)", kind: "textarea" },
              { key: "active", label: "Show to customers now", kind: "check" },
            ]}
            initial={{ category_id: category, name: "", slug: "", duration_minutes: "", required_skill: "", min_before_photos: "", min_after_photos: "", rework_days: "", sort_order: "", description: "", inclusions: "", exclusions: "", active: false }}
            check={checkService}
          />
        </FormPanel>
      ) : null}
    </div>
  )
}

/** One service: its options and add-on groups, each priced per city from the Prices panel. */
function ServiceTree({ id, onBack }: { id: string; onBack: () => void }) {
  const mayWrite = useMayWrite()
  const tree = useAdminObject("doorstep", DOORSTEP_READS.service(id))
  const [pricing, setPricing] = useState<{ kind: "option" | "addon"; id: string; name: string } | null>(null)
  const service = tree.data && isRecord(tree.data.service) ? tree.data.service : null
  const options = tree.data ? readList({ items: tree.data.options }) : []
  const groups = tree.data ? readList({ items: tree.data.addon_groups }) : []

  const priceButton = (kind: "option" | "addon", r: Row) => (
    <button type="button" className={buttonSecondary} onClick={() => setPricing({ kind, id: String(r.id), name: str(r.name) ?? "" })} aria-label={`Prices for ${str(r.name)}`}>
      Prices
    </button>
  )

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All services
      </button>
      <h3 className="font-mo-display text-lg font-semibold text-mo-ink">{str(service?.name) ?? (tree.isLoading ? "Loading…" : "Service")}</h3>
      {tree.error ? <p role="alert" className="text-sm text-mo-bad">{tree.error}</p> : null}
      <DataTable
        caption="Options"
        rows={options}
        columns={[
          { key: "name", header: "Option", value: (r) => str(r.name) },
          { key: "duration", header: "Minutes", value: (r) => num(r.duration_minutes), align: "right" },
          { key: "max", header: "Max qty", value: (r) => num(r.max_quantity), align: "right" },
          { key: "default", header: "Default", value: (r) => (r.is_default === true ? "Yes" : "") },
          { key: "active", header: "Shown", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
          { key: "actions", header: "", value: () => null, align: "right", cell: (r) => <span className="inline-flex gap-1">{priceButton("option", r)}<ActiveToggle write="option.update" target={{ id: String(r.id) }} active={r.active === true} label={str(r.name) ?? "option"} /></span> },
        ]}
        rowId={(r) => String(r.id)}
        emptyMessage="No options yet: a service needs at least one priced option."
      />
      {groups.map((g) => (
        <section key={String(g.id)} className="space-y-2 rounded-mo border border-mo p-3" aria-label={`Add-on group ${str(g.name)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="flex-1 text-sm font-semibold text-mo-ink">
              {str(g.name)} <span className="text-xs font-normal text-mo-body">pick {num(g.min_select) ?? 0}–{num(g.max_select) ?? 1}{g.is_required === true ? ", required" : ""}</span>
            </h4>
            {active(g)}
            <ActiveToggle write="addon_group.update" target={{ id: String(g.id) }} active={g.active === true} label={str(g.name) ?? "group"} />
          </div>
          <DataTable
            caption={`${str(g.name) ?? "Group"} add-ons`}
            rows={readList({ items: g.addons })}
            columns={[
              { key: "name", header: "Add-on", value: (r) => str(r.name) },
              { key: "extra", header: "Extra minutes", value: (r) => num(r.extra_duration_minutes), align: "right" },
              { key: "active", header: "Shown", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
              { key: "actions", header: "", value: () => null, align: "right", cell: (r) => <span className="inline-flex gap-1">{priceButton("addon", r)}<ActiveToggle write="addon.update" target={{ id: String(r.id) }} active={r.active === true} label={str(r.name) ?? "add-on"} /></span> },
            ]}
            rowId={(r) => String(r.id)}
            emptyMessage="No add-ons in this group."
          />
          {mayWrite("addon.create") ? (
            <details>
              <summary className="cursor-pointer text-sm text-mo-ink">Add an add-on to this group</summary>
              <div className="mt-2">
                <SpecForm
                  write="addon.create"
                  target={{ id: String(g.id) }}
                  fields={[
                    { key: "name", label: "Name" },
                    { key: "extra_duration_minutes", label: "Extra minutes" },
                    { key: "sort_order", label: "Order" },
                    { key: "description", label: "Description", kind: "textarea" },
                    { key: "active", label: "Shown", kind: "check" },
                  ]}
                  initial={{ name: "", extra_duration_minutes: "", sort_order: "", description: "", active: true }}
                  check={checkAddon}
                />
              </div>
            </details>
          ) : null}
        </section>
      ))}
      {mayWrite("option.create") ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <FormPanel title="New option">
            <SpecForm
              write="option.create"
              target={{ id }}
              fields={[
                { key: "name", label: "Name" },
                { key: "duration_minutes", label: "Duration (minutes)" },
                { key: "max_quantity", label: "Max quantity" },
                { key: "sort_order", label: "Order" },
                { key: "is_default", label: "Default choice", kind: "check" },
                { key: "active", label: "Shown", kind: "check" },
              ]}
              initial={{ name: "", duration_minutes: "", max_quantity: "", sort_order: "", is_default: false, active: true }}
              check={checkOption}
            />
          </FormPanel>
          <FormPanel title="New add-on group">
            <SpecForm
              write="addon_group.create"
              target={{ id }}
              fields={[
                { key: "name", label: "Name" },
                { key: "min_select", label: "Minimum picks" },
                { key: "max_select", label: "Maximum picks" },
                { key: "sort_order", label: "Order" },
                { key: "is_required", label: "Required", kind: "check" },
                { key: "active", label: "Shown", kind: "check" },
              ]}
              initial={{ name: "", min_select: "0", max_select: "1", sort_order: "", is_required: false, active: true }}
              check={checkAddonGroup}
            />
          </FormPanel>
        </div>
      ) : null}
      <EditDialog open={pricing !== null} title={pricing ? `Prices · ${pricing.name}` : "Prices"} onClose={() => setPricing(null)}>
        {pricing ? <PricePanel itemKind={pricing.kind} itemId={pricing.id} /> : null}
      </EditDialog>
    </div>
  )
}

/** The Prices area: pick a city and an item (an option or add-on id) to see its history and set a new price. */
function Prices() {
  const [kind, setKind] = useState<"option" | "addon">("option")
  const [item, setItem] = useState("")
  return (
    <div className="space-y-4">
      <p className="text-sm text-mo-body">Prices are GST-inclusive and effective-dated. A change is a new row from its start; the current row ends then. Rows are never edited, so every past quote can be traced to the price it used.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="Item kind">
            {(id) => (
              <select id={id} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value === "addon" ? "addon" : "option")}>
                <option value="option">Option</option>
                <option value="addon">Add-on</option>
              </select>
            )}
          </Field>
        </div>
        <div className="min-w-[20rem] flex-1">
          <Field label="Item id" hint="Open a service's options and add-ons to price them from there.">{(id) => <input id={id} className={inputClass} value={item} onChange={(e) => setItem(e.target.value.trim())} />}</Field>
        </div>
      </div>
      {isUuid(item) ? <PricePanel itemKind={kind} itemId={item.toLowerCase()} /> : null}
    </div>
  )
}

/** One item's price history in one city, newest first, and the form for its next row. */
export function PricePanel({ itemKind, itemId }: { itemKind: "option" | "addon"; itemId: string }) {
  const mayWrite = useMayWrite()
  const [city, setCity] = useState("HYD")
  const code = cityCode(city)
  const list = useAdminList("doorstep", DOORSTEP_READS.prices(code, itemId), { enabled: code !== "" })
  const rows = priceHistory(list.data.filter((r) => str(r.item_id) === itemId))
  const open = openPriceRow(rows, code, itemId)

  return (
    <div className="space-y-3">
      <div className="w-32">
        <Field label="City">{(id) => <input id={id} className={inputClass} value={city} maxLength={3} onChange={(e) => setCity(e.target.value.toUpperCase())} />}</Field>
      </div>
      <DataTable
        caption="Price history"
        rows={rows}
        columns={[
          { key: "price", header: "Price (GST incl.)", value: (r) => num(r.price_paise), align: "right", cell: (r) => paise(r.price_paise) },
          { key: "mrp", header: "MRP", value: (r) => num(r.mrp_paise), align: "right", cell: (r) => (num(r.mrp_paise) === null ? "—" : paise(r.mrp_paise)) },
          { key: "from", header: "From", value: (r) => str(r.effective_from), cell: (r) => when(r.effective_from) },
          { key: "to", header: "To", value: (r) => str(r.effective_to), cell: (r) => (r.effective_to === null ? <StatusPill value="current" tone="good" /> : when(r.effective_to)) },
          { key: "by", header: "Set by", value: (r) => str(r.created_by), cell: (r) => (str(r.created_by) ? <IdText id={r.created_by} /> : "—") },
        ]}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage={code ? "No price in this city yet: the item cannot be booked here." : "Enter a city code."}
      />
      {mayWrite("price.create") && code ? (
        <FormPanel title="New price row" note={open ? `The current price, ${paise(open.price_paise)} from ${when(open.effective_from)}, ends when this one starts.` : "The first price for this item in this city."}>
          <SpecForm
            key={`${code}-${itemId}-${str(open?.id) ?? "none"}`}
            write="price.create"
            target={{}}
            fields={[
              { key: "price", label: "Price, ₹ (GST included)" },
              { key: "mrp", label: "MRP, ₹ (optional)" },
              { key: "effective_from", label: "Starts (India time; blank = now)", kind: "datetime" },
            ]}
            initial={{ city_code: code, item_kind: itemKind, item_id: itemId, price: "", mrp: "", effective_from: "" }}
            check={(v) => checkPrice(v, open)}
          />
        </FormPanel>
      ) : null}
    </div>
  )
}

function RateCards() {
  const mayWrite = useMayWrite()
  const categories = useCategories()
  const [city, setCity] = useState("HYD")
  const [category, setCategory] = useState("")
  const [editing, setEditing] = useState<Row | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.rateCards(city, category))

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Extra", value: (r) => str(r.name), sortable: true, filterable: true, cell: (r) => <span>{str(r.name)} <span className="font-mo-mono text-xs text-mo-body">{str(r.code)}</span></span> },
    { key: "category", header: "Category", value: (r) => categories.name(String(r.category_id)) },
    { key: "unit", header: "Unit", value: (r) => str(r.unit), cell: (r) => humanise(r.unit) },
    { key: "price", header: "Price (GST incl.)", value: (r) => num(r.price_paise), sortable: true, align: "right", cell: (r) => paise(r.price_paise) },
    { key: "max", header: "Max qty", value: (r) => num(r.max_quantity), align: "right" },
    { key: "part", header: "Part", value: (r) => (r.is_part === true ? "Spare part" : "Labour") },
    { key: "active", header: "Offered", value: (r) => (r.active === true ? "yes" : "no"), cell: active },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayWrite("rate_card.update") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonSecondary} onClick={() => setEditing(r)} aria-label={`Edit ${str(r.name)}`}>
              Edit
            </button>
            <ActiveToggle write="rate_card.update" target={{ id: String(r.id) }} active={r.active === true} label={str(r.name) ?? "item"} />
          </span>
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="City">{(id) => <input id={id} className={inputClass} value={city} maxLength={3} onChange={(e) => setCity(e.target.value.toUpperCase())} />}</Field>
        </div>
        <div className="w-72">
          <Field label="Category">
            {(id) => (
              <select id={id} className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Every category</option>
                {categories.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </div>
      <DataTable caption="Rate card" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No rate-card items here." pageSize={DOORSTEP_PAGE} />
      {mayWrite("rate_card.create") ? (
        <FormPanel title="New rate-card item" note="Extras a professional can propose during a visit; the customer approves each one in the app.">
          <SpecForm
            write="rate_card.create"
            target={{}}
            fields={[
              { key: "city_code", label: "City" },
              { key: "category_id", label: "Category", kind: "select", options: [{ value: "", label: "Choose…" }, ...categories.options] },
              { key: "code", label: "Code", placeholder: "gas_refill" },
              { key: "name", label: "Name" },
              { key: "unit", label: "Unit", kind: "select", options: opts(RATE_CARD_UNITS) },
              { key: "price", label: "Price, ₹ (GST included)" },
              { key: "max_quantity", label: "Max quantity (default 10)" },
              { key: "sort_order", label: "Order" },
              { key: "description", label: "Description", kind: "textarea" },
              { key: "is_part", label: "A spare part (goods), not labour", kind: "check" },
            ]}
            initial={{ city_code: city, category_id: category, code: "", name: "", unit: "per_item", price: "", max_quantity: "", sort_order: "", description: "", is_part: false }}
            check={(v) => checkRateCard(v)}
          />
        </FormPanel>
      ) : null}
      <EditDialog open={editing !== null} title={editing ? `Edit ${str(editing.name) ?? "item"}` : "Edit"} onClose={() => setEditing(null)}>
        {editing ? (
          <SpecForm
            write="rate_card.update"
            target={{ id: String(editing.id) }}
            fields={[
              { key: "name", label: "Name" },
              { key: "unit", label: "Unit", kind: "select", options: opts(RATE_CARD_UNITS) },
              { key: "price", label: "Price, ₹ (GST included)" },
              { key: "max_quantity", label: "Max quantity" },
              { key: "sort_order", label: "Order" },
              { key: "description", label: "Description", kind: "textarea" },
              { key: "is_part", label: "A spare part (goods), not labour", kind: "check" },
            ]}
            initial={{
              name: str(editing.name) ?? "",
              unit: str(editing.unit) ?? "per_item",
              price: num(editing.price_paise) === null ? "" : ((num(editing.price_paise) ?? 0) / 100).toFixed(2),
              max_quantity: String(num(editing.max_quantity) ?? ""),
              sort_order: String(num(editing.sort_order) ?? ""),
              description: str(editing.description) ?? "",
              is_part: editing.is_part === true,
            }}
            check={(v) => checkRateCard(v, { partial: true })}
            resetOnDone={false}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </EditDialog>
    </div>
  )
}
