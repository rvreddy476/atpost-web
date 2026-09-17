"use client"

import { useState } from "react"
import { Field } from "@/components/blocks/bits"
import { buttonPrimary, inputClass } from "@/components/blocks/buttons"
import { ComingNext } from "@/components/blocks/PageHeader"
import { humanise, isUuid } from "@/lib/admin/data"
import {
  EMPTY_CITY,
  EMPTY_FARE_RULE,
  EMPTY_ZONE,
  FARE_MONEY_FIELDS,
  FARE_MULTIPLIER_FIELDS,
  RIDER,
  RIDER_WRITES,
  VEHICLE_TYPES,
  checkCity,
  checkFareRule,
  checkZone,
  type CityInput,
  type FareRuleInput,
  type ZoneInput,
} from "@/lib/admin/rider"
import { Problems, useRiderMutation } from "./RiderBits"

const Panel = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <section className="rounded-mo border border-mo bg-mo-surface p-4">
    <h3 className="text-sm font-semibold text-mo-ink">{title}</h3>
    {note ? <p className="mb-3 text-xs text-mo-body">{note}</p> : <div className="mb-3" />}
    {children}
  </section>
)

const Text = ({ label, value, onChange, placeholder, type = "text", hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string }) => (
  <Field label={label} hint={hint}>
    {(id) => <input id={id} type={type} className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
  </Field>
)

const ActiveSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Field label="Active">
    {(id) => (
      <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Leave as is</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )}
  </Field>
)

/**
 * Cities and zones. rider-service has no admin list route for either yet
 * (the public /v1/rider/cities is not proxied), so this tab is the four
 * writes as forms; an update needs the id from the audit trail or the
 * database. None of these need a 2FA code.
 */
export function RiderCities() {
  const [city, setCity] = useState<CityInput>(EMPTY_CITY)
  const [cityProblems, setCityProblems] = useState<string[]>([])
  const [cityUpdate, setCityUpdate] = useState({ id: "", name: "", state: "", is_active: "" })
  const [zone, setZone] = useState<ZoneInput>(EMPTY_ZONE)
  const [zoneProblems, setZoneProblems] = useState<string[]>([])
  const [zoneUpdate, setZoneUpdate] = useState({ id: "", name: "", boundary_wkt: "", is_active: "" })
  const mutation = useRiderMutation({
    onDone: (write) => {
      if (write === "city.create") setCity(EMPTY_CITY)
      if (write === "zone.create") setZone(EMPTY_ZONE)
    },
  })

  const submitCityUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isUuid(cityUpdate.id)) return
    const body: Record<string, unknown> = {}
    if (cityUpdate.name.trim()) body.name = cityUpdate.name.trim()
    if (cityUpdate.state.trim()) body.state = cityUpdate.state.trim()
    if (cityUpdate.is_active) body.is_active = cityUpdate.is_active === "true"
    if (Object.keys(body).length === 0) return
    mutation.mutate({ write: "city.update", method: "patch", url: `${RIDER}/cities/${encodeURIComponent(cityUpdate.id.trim())}`, body })
  }

  const submitZoneUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isUuid(zoneUpdate.id)) return
    const body: Record<string, unknown> = {}
    if (zoneUpdate.name.trim()) body.name = zoneUpdate.name.trim()
    if (zoneUpdate.boundary_wkt.trim()) body.boundary_wkt = zoneUpdate.boundary_wkt.trim()
    if (zoneUpdate.is_active) body.is_active = zoneUpdate.is_active === "true"
    if (Object.keys(body).length === 0) return
    mutation.mutate({ write: "zone.update", method: "patch", url: `${RIDER}/zones/${encodeURIComponent(zoneUpdate.id.trim())}`, body })
  }

  return (
    <div className="space-y-4">
      <ComingNext>rider-service has no admin route that lists cities or zones yet, so this tab is the writes only. To change one, paste its id.</ComingNext>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Create a city" note={RIDER_WRITES["city.create"].explain}>
          <form
            className="space-y-3"
            aria-label="Create a city"
            onSubmit={(e) => {
              e.preventDefault()
              const check = checkCity(city)
              setCityProblems(check.ok ? [] : check.problems)
              if (check.ok) mutation.mutate({ write: "city.create", url: `${RIDER}/cities`, body: check.body })
            }}
          >
            <Text label="Name" value={city.name} onChange={(v) => setCity({ ...city, name: v })} />
            <Text label="State" value={city.state} onChange={(v) => setCity({ ...city, state: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Text label="Country" value={city.country} onChange={(v) => setCity({ ...city, country: v })} placeholder="IN" />
              <Text label="Currency" value={city.currency_code} onChange={(v) => setCity({ ...city, currency_code: v })} placeholder="INR" />
            </div>
            <Problems problems={cityProblems} />
            <button type="submit" className={buttonPrimary} disabled={mutation.isPending}>
              Create city
            </button>
          </form>
        </Panel>
        <Panel title="Update a city" note={RIDER_WRITES["city.update"].explain}>
          <form className="space-y-3" aria-label="Update a city" onSubmit={submitCityUpdate}>
            <Text label="City id" value={cityUpdate.id} onChange={(v) => setCityUpdate({ ...cityUpdate, id: v })} hint={cityUpdate.id && !isUuid(cityUpdate.id) ? "Enter the full city id." : undefined} />
            <Text label="New name" value={cityUpdate.name} onChange={(v) => setCityUpdate({ ...cityUpdate, name: v })} />
            <Text label="New state" value={cityUpdate.state} onChange={(v) => setCityUpdate({ ...cityUpdate, state: v })} />
            <ActiveSelect value={cityUpdate.is_active} onChange={(v) => setCityUpdate({ ...cityUpdate, is_active: v })} />
            <button type="submit" className={buttonPrimary} disabled={mutation.isPending || !isUuid(cityUpdate.id) || !(cityUpdate.name.trim() || cityUpdate.state.trim() || cityUpdate.is_active)}>
              Update city
            </button>
          </form>
        </Panel>
        <Panel title="Create a zone" note={RIDER_WRITES["zone.create"].explain}>
          <form
            className="space-y-3"
            aria-label="Create a zone"
            onSubmit={(e) => {
              e.preventDefault()
              const check = checkZone(zone)
              setZoneProblems(check.ok ? [] : check.problems)
              if (check.ok) mutation.mutate({ write: "zone.create", url: `${RIDER}/zones`, body: check.body })
            }}
          >
            <Text label="City id" value={zone.city_id} onChange={(v) => setZone({ ...zone, city_id: v })} />
            <Text label="Name" value={zone.name} onChange={(v) => setZone({ ...zone, name: v })} />
            <Field label="Boundary (WKT polygon)" hint="POLYGON((lng lat, lng lat, …, lng lat)) — first and last point the same.">
              {(id) => <textarea id={id} rows={3} className={`${inputClass} font-mo-mono text-xs`} value={zone.boundary_wkt} onChange={(e) => setZone({ ...zone, boundary_wkt: e.target.value })} />}
            </Field>
            <Problems problems={zoneProblems} />
            <button type="submit" className={buttonPrimary} disabled={mutation.isPending}>
              Create zone
            </button>
          </form>
        </Panel>
        <Panel title="Update a zone" note={RIDER_WRITES["zone.update"].explain}>
          <form className="space-y-3" aria-label="Update a zone" onSubmit={submitZoneUpdate}>
            <Text label="Zone id" value={zoneUpdate.id} onChange={(v) => setZoneUpdate({ ...zoneUpdate, id: v })} hint={zoneUpdate.id && !isUuid(zoneUpdate.id) ? "Enter the full zone id." : undefined} />
            <Text label="New name" value={zoneUpdate.name} onChange={(v) => setZoneUpdate({ ...zoneUpdate, name: v })} />
            <Field label="New boundary (WKT polygon)">{(id) => <textarea id={id} rows={3} className={`${inputClass} font-mo-mono text-xs`} value={zoneUpdate.boundary_wkt} onChange={(e) => setZoneUpdate({ ...zoneUpdate, boundary_wkt: e.target.value })} />}</Field>
            <ActiveSelect value={zoneUpdate.is_active} onChange={(v) => setZoneUpdate({ ...zoneUpdate, is_active: v })} />
            <button type="submit" className={buttonPrimary} disabled={mutation.isPending || !isUuid(zoneUpdate.id) || !(zoneUpdate.name.trim() || zoneUpdate.boundary_wkt.trim() || zoneUpdate.is_active)}>
              Update zone
            </button>
          </form>
        </Panel>
      </div>
    </div>
  )
}

const fareLabel = (field: string) => humanise(field).replace(/\bkm\b/i, "km").replace(/Per km fare/, "Per km").replace(/Per minute fare/, "Per minute")

/**
 * Fare rules: create one for a city and vehicle type, or update one by id.
 * Both change what every rider is charged and need a fresh 2FA code. There
 * is no list route yet.
 */
export function RiderFares() {
  const [input, setInput] = useState<FareRuleInput>(EMPTY_FARE_RULE)
  const [problems, setProblems] = useState<string[]>([])
  const [updateId, setUpdateId] = useState("")
  const [update, setUpdate] = useState<FareRuleInput>({ ...EMPTY_FARE_RULE, night_multiplier: "", peak_multiplier: "", cancellation_fee: "" })
  const [updateActive, setUpdateActive] = useState("")
  const [updateProblems, setUpdateProblems] = useState<string[]>([])
  const mutation = useRiderMutation({
    onDone: (write) => {
      if (write === "fare_rule.create") setInput(EMPTY_FARE_RULE)
    },
  })

  const set = (target: "create" | "update", field: keyof FareRuleInput) => (v: string) => {
    if (target === "create") setInput((s) => ({ ...s, [field]: v }))
    else setUpdate((s) => ({ ...s, [field]: v }))
  }

  const amounts = (target: "create" | "update", values: FareRuleInput) => (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FARE_MONEY_FIELDS.map((f) => (
          <Text key={f} label={`${fareLabel(f)} (₹)`} type="number" value={values[f]} onChange={set(target, f)} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FARE_MULTIPLIER_FIELDS.map((f) => (
          <Text key={f} label={`${fareLabel(f)} (×)`} type="number" value={values[f]} onChange={set(target, f)} />
        ))}
      </div>
    </>
  )

  return (
    <div className="space-y-4">
      <ComingNext>rider-service has no admin route that lists fare rules yet. Creating or changing one needs a fresh 2FA code; the change applies to every ride priced after it.</ComingNext>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Create a fare rule" note={RIDER_WRITES["fare_rule.create"].explain}>
          <form
            className="space-y-3"
            aria-label="Create a fare rule"
            onSubmit={(e) => {
              e.preventDefault()
              const check = checkFareRule(input)
              setProblems(check.ok ? [] : check.problems)
              if (check.ok) mutation.mutate({ write: "fare_rule.create", url: `${RIDER}/fare-rules`, body: check.body })
            }}
          >
            <Text label="City id" value={input.city_id} onChange={set("create", "city_id")} />
            <Field label="Vehicle type">
              {(id) => (
                <select id={id} className={inputClass} value={input.vehicle_type} onChange={(e) => set("create", "vehicle_type")(e.target.value)}>
                  <option value="">Choose…</option>
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanise(t)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {amounts("create", input)}
            <Problems problems={problems} />
            <button type="submit" className={buttonPrimary} disabled={mutation.isPending}>
              Create fare rule
            </button>
          </form>
        </Panel>
        <Panel title="Update a fare rule" note="Only the fields you fill in change. Needs a fresh 2FA code.">
          <form
            className="space-y-3"
            aria-label="Update a fare rule"
            onSubmit={(e) => {
              e.preventDefault()
              const check = checkFareRule(update, { partial: true })
              const list = check.ok ? [] : [...check.problems]
              if (!isUuid(updateId)) list.unshift("Fare rule id must be a full id.")
              if (check.ok && updateActive) check.body.is_active = updateActive === "true"
              const noChange = check.ok && Object.keys(check.body).length === 0
              setUpdateProblems(noChange ? ["Change at least one field."] : list)
              if (check.ok && list.length === 0 && !noChange) mutation.mutate({ write: "fare_rule.update", method: "patch", url: `${RIDER}/fare-rules/${encodeURIComponent(updateId.trim())}`, body: check.body })
            }}
          >
            <Text label="Fare rule id" value={updateId} onChange={setUpdateId} />
            {amounts("update", update)}
            <ActiveSelect value={updateActive} onChange={setUpdateActive} />
            <Problems problems={updateProblems} />
            <button type="submit" className={buttonPrimary} disabled={mutation.isPending}>
              Update fare rule
            </button>
          </form>
        </Panel>
      </div>
    </div>
  )
}
