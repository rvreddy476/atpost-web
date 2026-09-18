import { isRecord, isUuid, num, readList, readObject, str, type Row } from "./data"
import { formatPaise, parseRupeeInput } from "./money"

/**
 * The Mopedu dashboard's rules, as plain functions: which writes need a
 * fresh 2FA code or a second approver, which reads are reveals, what each
 * queue filters by, and how the pricing, coupon, city and refund forms are
 * checked before anything is sent.
 *
 * admin-service (handler_rider.go) is the source of truth; the console
 * mirrors its table so an admin is told BEFORE confirming what a click will
 * need. Two writes are two-person: a ride refund returns money to the
 * customer and a waiver forgives a cancellation fee owed; both wait in the
 * approvals inbox for a second holder of rider:payments.settle.
 */

export const RIDER = "/v1/admin/rider"

export type RiderWrite =
  | "partner.approve"
  | "partner.reject"
  | "partner.suspend"
  | "partner.block"
  | "document.verify"
  | "document.reject"
  | "vehicle.verify"
  | "vehicle.reject"
  | "payment.verify"
  | "payment.reject"
  | "ride.cancel"
  | "rating.visibility"
  | "complaint.status"
  | "incident.acknowledge"
  | "incident.resolve"
  | "city.create"
  | "city.update"
  | "zone.create"
  | "zone.update"
  | "fare_rule.create"
  | "fare_rule.update"
  | "fare_window.create"
  | "fare_window.update"
  | "fare_window.deactivate"
  | "coupon.create"
  | "coupon.update"
  | "coupon.deactivate"
  | "outstanding.waive"
  | "refund.issue"

export interface RiderWriteDef {
  label: string
  /** Without the `rider:` prefix. */
  permission: string
  stepUp: boolean
  /** Waits for a second holder of the permission (the approvals inbox); the console never reports it as done. */
  twoPerson?: boolean
  destructive: boolean
  /** The body carries a `reason` the audit row keeps. */
  reason: boolean
  explain: string
}

export const RIDER_WRITES: Record<RiderWrite, RiderWriteDef> = {
  "partner.approve": { label: "Approve", permission: "partners.approve", stepUp: false, destructive: false, reason: false, explain: "The partner can go online and take rides once their documents, vehicle and subscription are in order." },
  "partner.reject": { label: "Reject", permission: "partners.approve", stepUp: false, destructive: true, reason: true, explain: "The partner is told why and may apply again." },
  "partner.suspend": { label: "Suspend", permission: "partners.suspend", stepUp: true, destructive: true, reason: true, explain: "The partner is taken offline and cannot accept rides until reinstated. Needs a fresh 2FA code." },
  "partner.block": { label: "Block", permission: "partners.suspend", stepUp: true, destructive: true, reason: true, explain: "The partner is blocked from the platform. Needs a fresh 2FA code." },
  "document.verify": { label: "Verify", permission: "documents.review", stepUp: true, destructive: false, reason: false, explain: "Marks the document as checked. Needs a fresh 2FA code." },
  "document.reject": { label: "Reject", permission: "documents.review", stepUp: true, destructive: true, reason: true, explain: "The partner must upload the document again. Needs a fresh 2FA code." },
  "vehicle.verify": { label: "Verify", permission: "vehicles.review", stepUp: false, destructive: false, reason: false, explain: "The vehicle may be used for rides." },
  "vehicle.reject": { label: "Reject", permission: "vehicles.review", stepUp: false, destructive: true, reason: true, explain: "The vehicle cannot be used; the partner is told why." },
  "payment.verify": { label: "Verify payment", permission: "payments.settle", stepUp: true, destructive: false, reason: false, explain: "Confirms the subscription payment was received and activates the plan. Needs a fresh 2FA code." },
  "payment.reject": { label: "Reject payment", permission: "payments.reject", stepUp: true, destructive: true, reason: true, explain: "The proof is refused and the partner must pay again. Needs a fresh 2FA code." },
  "ride.cancel": { label: "Cancel ride", permission: "rides.cancel", stepUp: true, destructive: true, reason: true, explain: "Ends the ride for both customer and partner. Needs a fresh 2FA code." },
  "rating.visibility": { label: "Set rating visibility", permission: "ratings.moderate", stepUp: false, destructive: false, reason: false, explain: "Hides, flags or shows the customer's rating of this ride." },
  "complaint.status": { label: "Update status", permission: "complaints.act", stepUp: false, destructive: false, reason: false, explain: "Moves the complaint along; the note is kept with it." },
  "incident.acknowledge": { label: "Acknowledge", permission: "incidents.act", stepUp: false, destructive: false, reason: false, explain: "Records that someone is looking at this incident." },
  "incident.resolve": { label: "Resolve", permission: "incidents.act", stepUp: false, destructive: false, reason: false, explain: "Closes the incident with a note of what was done." },
  "city.create": { label: "Create city", permission: "cities.manage", stepUp: false, destructive: false, reason: false, explain: "Adds a city Mopedu can operate in." },
  "city.update": { label: "Update city", permission: "cities.manage", stepUp: false, destructive: false, reason: false, explain: "Changes a city's details or switches it on or off." },
  "zone.create": { label: "Create zone", permission: "cities.manage", stepUp: false, destructive: false, reason: false, explain: "Adds a zone (a boundary polygon) inside a city." },
  "zone.update": { label: "Update zone", permission: "cities.manage", stepUp: false, destructive: false, reason: false, explain: "Changes a zone's name or boundary, or switches it on or off." },
  "fare_rule.create": { label: "Create fare rule", permission: "fares.manage", stepUp: true, destructive: false, reason: false, explain: "Changes what every rider in that city is charged. Needs a fresh 2FA code." },
  "fare_rule.update": { label: "Update fare rule", permission: "fares.manage", stepUp: true, destructive: false, reason: false, explain: "Changes what every rider in that city is charged. Needs a fresh 2FA code." },
  "fare_window.create": { label: "Create fare window", permission: "fares.manage", stepUp: true, destructive: false, reason: false, explain: "Adds a peak window: rides quoted in it are multiplied. Needs a fresh 2FA code." },
  "fare_window.update": { label: "Update fare window", permission: "fares.manage", stepUp: true, destructive: false, reason: false, explain: "Changes when the window applies or by how much. Needs a fresh 2FA code." },
  "fare_window.deactivate": { label: "Deactivate window", permission: "fares.manage", stepUp: true, destructive: true, reason: true, explain: "The window stops applying to new quotes at once. Needs a fresh 2FA code." },
  "coupon.create": { label: "Create coupon", permission: "fares.manage", stepUp: true, destructive: false, reason: false, explain: "Customers can apply the code from the moment it starts. Needs a fresh 2FA code." },
  "coupon.update": { label: "Update coupon", permission: "fares.manage", stepUp: true, destructive: false, reason: false, explain: "Changes the discount, limits or validity of an existing code. Needs a fresh 2FA code." },
  "coupon.deactivate": { label: "Deactivate coupon", permission: "fares.manage", stepUp: true, destructive: true, reason: true, explain: "The code stops working at once; rides already quoted with it keep their discount. Needs a fresh 2FA code." },
  "outstanding.waive": { label: "Waive fee", permission: "payments.settle", stepUp: true, twoPerson: true, destructive: true, reason: true, explain: "Forgives the cancellation fee the customer still owes. Needs a fresh 2FA code and a second admin's approval before it takes effect." },
  "refund.issue": { label: "Refund ride", permission: "payments.settle", stepUp: true, twoPerson: true, destructive: true, reason: true, explain: "Returns the fare (or part of it) to the customer's payment method. Needs a fresh 2FA code and a second admin's approval before any money moves." },
}

export const riderStepUp = (write: RiderWrite) => RIDER_WRITES[write].stepUp
export const riderTwoPerson = (write: RiderWrite) => RIDER_WRITES[write].twoPerson === true

/**
 * Reads that are reveals: the answer carries data an admin must ask for on
 * purpose, the read is audited and needs a fresh 2FA code.
 */
export const RIDER_REVEALS = {
  /** The document list carries document numbers in the clear. */
  documents: { permission: "documents.review", path: (status: string) => `${RIDER}/documents${status ? `?status=${encodeURIComponent(status)}` : ""}` },
  /** An incident's contact alerts carry trusted contacts' phone numbers. */
  incidentAlerts: { permission: "incidents.reveal", path: (incidentId: string) => `${RIDER}/safety/incidents/${encodeURIComponent(incidentId)}/alerts` },
} as const

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export const RIDER_PAGE = 50

export const PARTNER_STATUSES = ["pending_verification", "active", "suspended", "blocked", "rejected"] as const
export const DOCUMENT_STATUSES = ["pending", "verified", "rejected"] as const
export const VEHICLE_STATUSES = ["pending", "verified", "rejected"] as const
export const PAYMENT_STATUSES = ["pending", "submitted", "verified", "rejected"] as const
export const RIDE_STATUSES = ["requested", "searching_partner", "partner_assigned", "partner_arriving", "arrived", "otp_verified", "in_progress", "completed", "cancelled_by_customer", "cancelled_by_partner", "cancelled_by_admin", "cancelled_no_partner"] as const
export const COMPLAINT_STATUSES = ["open", "under_review", "resolved", "dismissed"] as const
export const INCIDENT_STATUSES = ["open", "acknowledged", "resolved"] as const
export const RATING_VISIBILITIES = ["public", "flagged", "hidden"] as const

/** Statuses rider-service counts as live (store/admin_stats.go). */
export const LIVE_RIDE_STATUSES: readonly string[] = ["requested", "searching_partner", "partner_assigned", "partner_arriving", "arrived", "otp_verified", "in_progress"]

export const isLiveRide = (status: unknown) => LIVE_RIDE_STATUSES.includes(String(status))

export type Tone = "bad" | "warn" | "good" | "normal"

export function partnerTone(status: unknown): Tone {
  const s = str(status)
  if (s === "blocked" || s === "rejected") return "bad"
  if (s === "suspended" || s === "pending_verification") return "warn"
  if (s === "active") return "good"
  return "normal"
}

export function reviewTone(status: unknown): Tone {
  const s = str(status)
  if (s === "rejected") return "bad"
  if (s === "pending" || s === "submitted") return "warn"
  if (s === "verified") return "good"
  return "normal"
}

export function rideTone(status: unknown): Tone {
  const s = str(status) ?? ""
  if (s.startsWith("cancelled")) return "bad"
  if (isLiveRide(s)) return "warn"
  if (s === "completed") return "good"
  return "normal"
}

export function severityTone(severity: unknown): Tone {
  const s = str(severity)
  if (s === "critical" || s === "high") return "bad"
  if (s === "medium") return "warn"
  return "normal"
}

/** `?status=&q=&limit=&offset=` for the offset-paged lists; empty filters are left out. */
export function riderListQuery(filters: Record<string, string | number | null | undefined>, offset = 0, limit = RIDER_PAGE): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue
    q.set(key, String(value).trim())
  }
  q.set("limit", String(limit))
  q.set("offset", String(offset))
  return q.toString()
}

/** The audit list: `?action=&target_kind=&actor=&since=`; a non-UUID actor is left out rather than sent wrong. */
export function riderAuditQuery(filter: { action: string; targetKind: string; actor: string; since: string }, offset = 0): string {
  return riderListQuery(
    {
      action: filter.action.trim(),
      target_kind: filter.targetKind.trim(),
      actor: isUuid(filter.actor) ? filter.actor.trim().toLowerCase() : "",
      since: /^\d{4}-\d{2}-\d{2}$/.test(filter.since) ? `${filter.since}T00:00:00+05:30` : "",
    },
    offset,
  )
}

// ---------------------------------------------------------------------------
// Reveals: reading the answers
// ---------------------------------------------------------------------------

/** The revealed document rows; `document_number` is present only because the read was a reveal. */
export function readDocuments(raw: unknown): Row[] {
  return readList(raw, ["items", "documents"])
}

/** `{alerts: [...]}` from the incident alerts reveal. */
export function readAlerts(raw: unknown): Row[] {
  return readList(raw, ["alerts", "items"])
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface FareRuleInput {
  city_id: string
  vehicle_type: string
  base_fare: string
  per_km_fare: string
  per_minute_fare: string
  minimum_fare: string
  platform_fee: string
  night_multiplier: string
  peak_multiplier: string
  cancellation_fee: string
}

export const EMPTY_FARE_RULE: FareRuleInput = {
  city_id: "",
  vehicle_type: "",
  base_fare: "",
  per_km_fare: "",
  per_minute_fare: "",
  minimum_fare: "",
  platform_fee: "",
  night_multiplier: "1",
  peak_multiplier: "1",
  cancellation_fee: "0",
}

export const FARE_MONEY_FIELDS = ["base_fare", "per_km_fare", "per_minute_fare", "minimum_fare", "platform_fee", "cancellation_fee"] as const
export const FARE_MULTIPLIER_FIELDS = ["night_multiplier", "peak_multiplier"] as const

export const VEHICLE_TYPES = ["bike", "auto", "cab_mini", "cab_sedan", "cab_suv"] as const

const money = (value: string): number | null => {
  const n = Number(value.trim())
  return value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/**
 * A new fare rule: every amount is rupees (non-negative), the multipliers
 * are at least 1, and the city is a UUID. Returns the body to send, or the
 * problems to show. For an update (`partial`), blank fields are left out.
 */
export function checkFareRule(input: FareRuleInput, { partial = false } = {}): { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    if (!isUuid(input.city_id)) problems.push("City must be a full city id.")
    else body.city_id = input.city_id.trim().toLowerCase()
    if (!input.vehicle_type.trim()) problems.push("Choose a vehicle type.")
    else body.vehicle_type = input.vehicle_type.trim()
  }
  for (const field of FARE_MONEY_FIELDS) {
    const raw = input[field]
    if (partial && raw.trim() === "") continue
    const n = money(raw)
    if (n === null) problems.push(`${field.replace(/_/g, " ")} must be a rupee amount of zero or more.`)
    else body[field] = n
  }
  for (const field of FARE_MULTIPLIER_FIELDS) {
    const raw = input[field]
    if (partial && raw.trim() === "") continue
    const n = Number(raw.trim())
    if (raw.trim() === "" || !Number.isFinite(n) || n < 1) problems.push(`${field.replace(/_/g, " ")} must be 1 or more.`)
    else body[field] = n
  }
  if (!partial) {
    const min = body.minimum_fare
    const base = body.base_fare
    if (typeof min === "number" && typeof base === "number" && min < base) problems.push("Minimum fare cannot be below the base fare.")
  }
  if (partial && Object.keys(body).length === 0) problems.push("Change at least one field.")
  return problems.length > 0 ? { ok: false, problems } : { ok: true, body }
}

export interface CityInput {
  name: string
  state: string
  country: string
  currency_code: string
}

export const EMPTY_CITY: CityInput = { name: "", state: "", country: "IN", currency_code: "INR" }

export function checkCity(input: CityInput): { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const name = input.name.trim()
  if (name.length < 2) problems.push("The city needs a name.")
  const currency = input.currency_code.trim().toUpperCase()
  if (currency && !/^[A-Z]{3}$/.test(currency)) problems.push("Currency must be a three-letter code.")
  const country = input.country.trim().toUpperCase()
  if (country && !/^[A-Z]{2}$/.test(country)) problems.push("Country must be a two-letter code.")
  if (problems.length > 0) return { ok: false, problems }
  const body: Record<string, unknown> = { name }
  if (input.state.trim()) body.state = input.state.trim()
  if (country) body.country = country
  if (currency) body.currency_code = currency
  return { ok: true, body }
}

export interface ZoneInput {
  city_id: string
  name: string
  boundary_wkt: string
}

export const EMPTY_ZONE: ZoneInput = { city_id: "", name: "", boundary_wkt: "" }

/** A zone boundary is a WKT polygon; the server validates the geometry, this only refuses the obviously wrong. */
export function checkZone(input: ZoneInput): { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] } {
  const problems: string[] = []
  if (!isUuid(input.city_id)) problems.push("City must be a full city id.")
  if (input.name.trim().length < 2) problems.push("The zone needs a name.")
  const wkt = input.boundary_wkt.trim()
  if (!/^POLYGON\s*\(\(/i.test(wkt)) problems.push("The boundary must be a WKT polygon, starting with POLYGON((.")
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, body: { city_id: input.city_id.trim().toLowerCase(), name: input.name.trim(), boundary_wkt: wkt } }
}

// ---------------------------------------------------------------------------
// Pricing: fare windows and surge
// ---------------------------------------------------------------------------

/** Mon=1 … Sun=64, as rider-service stores `days_of_week`. */
export const WEEKDAYS = [
  { bit: 1, short: "Mon", label: "Monday" },
  { bit: 2, short: "Tue", label: "Tuesday" },
  { bit: 4, short: "Wed", label: "Wednesday" },
  { bit: 8, short: "Thu", label: "Thursday" },
  { bit: 16, short: "Fri", label: "Friday" },
  { bit: 32, short: "Sat", label: "Saturday" },
  { bit: 64, short: "Sun", label: "Sunday" },
] as const

export const EVERY_DAY = 127
export const MON_TO_FRI = 31
export const WEEKEND = 96

export const hasWeekday = (mask: number, bit: number) => (mask & bit) !== 0
export const toggleWeekday = (mask: number, bit: number) => (hasWeekday(mask, bit) ? mask & ~bit : mask | bit)

/** The short names set in a bitmask, Monday first: 31 → ["Mon", …, "Fri"]. */
export function weekdaysFromMask(mask: unknown): string[] {
  const n = num(mask)
  if (n === null) return []
  return WEEKDAYS.filter((d) => hasWeekday(n, d.bit)).map((d) => d.short)
}

/** A weekday set as a phrase: "Every day", "Mon–Fri", "Sat–Sun", or the days. */
export function weekdaysLabel(mask: unknown): string {
  const n = num(mask)
  if (n === null) return "—"
  const bits = n & EVERY_DAY
  if (bits === 0) return "No days"
  if (bits === EVERY_DAY) return "Every day"
  if (bits === MON_TO_FRI) return "Mon–Fri"
  if (bits === WEEKEND) return "Sat–Sun"
  return weekdaysFromMask(bits).join(", ")
}

/** 510 → "08:30"; 1440 (end of day) → "24:00"; anything unreadable → "—". */
export function minutesToHHMM(value: unknown): string {
  const n = num(value)
  if (n === null || !Number.isInteger(n) || n < 0 || n > 1440) return "—"
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
}

/** "08:30" → 510, "24:00" → 1440; a malformed or out-of-range time → null. */
export function hhmmToMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

/** "08:00 – 10:00", or "23:00 – 05:00 (next day)" when the window wraps midnight. */
export function windowSpan(start: unknown, end: unknown): string {
  const s = num(start)
  const e = num(end)
  if (s === null || e === null) return "—"
  return `${minutesToHHMM(s)} – ${minutesToHHMM(e)}${e <= s ? " (next day)" : ""}`
}

export const MULTIPLIER_MIN_BPS = 10_000
export const MULTIPLIER_MAX_BPS = 30_000

/** 12500 → "×1.25", 10000 → "×1.0", 15000 → "×1.5". */
export function multiplierLabel(bps: unknown): string {
  const n = num(bps)
  if (n === null) return "—"
  const text = (n / 10_000).toFixed(2)
  return `×${text.endsWith("0") ? text.slice(0, -1) : text}`
}

/** What an admin typed ("1.25", "×1.25") as basis points, within rider-service's ×1.00–×3.00; else null. */
export function multiplierToBps(text: string): number | null {
  const clean = text.trim().replace(/^[×x]/i, "")
  if (clean === "" || !/^\d+(\.\d{1,4})?$/.test(clean)) return null
  const bps = Math.round(Number(clean) * 10_000)
  return bps >= MULTIPLIER_MIN_BPS && bps <= MULTIPLIER_MAX_BPS ? bps : null
}

export interface FareWindowInput {
  city_id: string
  /** "" applies to every vehicle type. */
  vehicle_type: string
  name: string
  days_of_week: number
  /** HH:MM, city-local. */
  start: string
  end: string
  /** "1.25" */
  multiplier: string
  priority: string
  /** YYYY-MM-DD or "" */
  effective_from: string
  effective_to: string
}

export const EMPTY_FARE_WINDOW: FareWindowInput = {
  city_id: "",
  vehicle_type: "",
  name: "",
  days_of_week: MON_TO_FRI,
  start: "08:00",
  end: "10:00",
  multiplier: "1.25",
  priority: "10",
  effective_from: "",
  effective_to: "",
}

/** A stored window as the update form's starting values. */
export function fareWindowInput(row: Row): FareWindowInput {
  const bps = num(row.multiplier_bps)
  return {
    city_id: str(row.city_id) ?? "",
    vehicle_type: str(row.vehicle_type) ?? "",
    name: str(row.name) ?? "",
    days_of_week: num(row.days_of_week) ?? MON_TO_FRI,
    start: minutesToHHMM(row.start_minute).replace("—", ""),
    end: minutesToHHMM(row.end_minute).replace("—", ""),
    multiplier: bps === null ? "" : (bps / 10_000).toFixed(2),
    priority: String(num(row.priority) ?? 0),
    effective_from: (str(row.effective_from) ?? "").slice(0, 10),
    effective_to: (str(row.effective_to) ?? "").slice(0, 10),
  }
}

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/
const dayStart = (day: string) => `${day}T00:00:00+05:30`
const dayEnd = (day: string) => `${day}T23:59:59+05:30`

/**
 * A fare window as rider-service takes it: days as a bitmask, times as
 * city-local minutes (an end at or before the start wraps midnight), the
 * multiplier in basis points. For an update (`partial`) the city is fixed
 * and blank optional fields are left out.
 */
export function checkFareWindow(input: FareWindowInput, { partial = false } = {}): { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    if (!isUuid(input.city_id)) problems.push("City must be a full city id.")
    else body.city_id = input.city_id.trim().toLowerCase()
    if (input.vehicle_type.trim()) body.vehicle_type = input.vehicle_type.trim()
  }
  const name = input.name.trim()
  if (name.length < 2) problems.push("The window needs a name.")
  else body.name = name
  const days = input.days_of_week & EVERY_DAY
  if (days === 0) problems.push("Pick at least one day.")
  else body.days_of_week = days
  const start = hhmmToMinutes(input.start)
  const end = hhmmToMinutes(input.end)
  if (start === null || start >= 1440) problems.push("Start must be a time of day (HH:MM).")
  if (end === null) problems.push("End must be a time of day (HH:MM), or 24:00 for midnight.")
  if (start !== null && end !== null && start === end) problems.push("Start and end cannot be the same minute.")
  if (start !== null && start < 1440 && end !== null && start !== end) {
    body.start_minute = start
    body.end_minute = end
  }
  const bps = multiplierToBps(input.multiplier)
  if (bps === null) problems.push("Multiplier must be between ×1.00 and ×3.00.")
  else body.multiplier_bps = bps
  const priority = Number(input.priority.trim())
  if (input.priority.trim() === "" || !Number.isInteger(priority) || priority < 0) problems.push("Priority must be a whole number of zero or more.")
  else body.priority = priority
  if (input.effective_from.trim()) {
    if (!DAY_ONLY.test(input.effective_from.trim())) problems.push("Effective from must be a date.")
    else body.effective_from = dayStart(input.effective_from.trim())
  }
  if (input.effective_to.trim()) {
    if (!DAY_ONLY.test(input.effective_to.trim())) problems.push("Effective to must be a date.")
    else if (input.effective_from.trim() && input.effective_to.trim() < input.effective_from.trim()) problems.push("Effective to cannot be before effective from.")
    else body.effective_to = dayEnd(input.effective_to.trim())
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, body }
}

/** `GET /fare-windows?city_id=` and `GET /surge?city_id=`; an empty or malformed city sends nothing. */
export function cityScopedUrl(path: "/fare-windows" | "/surge", cityId: string): string | null {
  return isUuid(cityId) ? `${RIDER}${path}?city_id=${encodeURIComponent(cityId.trim().toLowerCase())}` : null
}

/** The surge rows `{vehicle_type, requested, online, demand_bps, cap_bps}`. */
export function readSurge(raw: unknown): Row[] {
  return readList(raw, ["items", "surge"])
}

/** Demand against the cap: "warn" once the cap binds, "good" at ×1.0, otherwise normal. */
export function surgeTone(row: Row): Tone {
  const demand = num(row.demand_bps)
  const cap = num(row.cap_bps)
  if (demand === null) return "normal"
  if (cap !== null && demand >= cap && cap > MULTIPLIER_MIN_BPS) return "warn"
  return demand <= MULTIPLIER_MIN_BPS ? "good" : "normal"
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const COUPON_DISCOUNT_TYPES = ["flat", "percent"] as const
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number]
export const REDEMPTION_STATUSES = ["reserved", "applied", "released"] as const

export interface CouponInput {
  code: string
  description: string
  discount_type: CouponDiscountType
  /** Rupees, for a flat coupon. */
  discount_value: string
  /** Per cent, for a percent coupon. */
  percent: string
  /** Rupees; "" or 0 = no cap. */
  max_discount: string
  min_fare: string
  city_id: string
  vehicle_types: string[]
  first_ride_only: boolean
  per_user_limit: string
  total_limit: string
  /** YYYY-MM-DD or "" */
  starts_at: string
  ends_at: string
  is_active: boolean
}

export const EMPTY_COUPON: CouponInput = {
  code: "",
  description: "",
  discount_type: "flat",
  discount_value: "",
  percent: "",
  max_discount: "",
  min_fare: "",
  city_id: "",
  vehicle_types: [],
  first_ride_only: false,
  per_user_limit: "1",
  total_limit: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
}

/** A stored coupon as the update form's starting values (code, type and scope cannot change). */
export function couponInput(row: Row): CouponInput {
  const type: CouponDiscountType = str(row.discount_type) === "percent" ? "percent" : "flat"
  const bps = num(row.percent_bps)
  const rupees = (value: unknown) => {
    const p = num(value)
    return p === null || p === 0 ? "" : (p / 100).toFixed(2).replace(/\.?0+$/, "")
  }
  return {
    code: str(row.code) ?? "",
    description: str(row.description) ?? "",
    discount_type: type,
    discount_value: rupees(row.discount_value_paise),
    percent: bps === null ? "" : String(bps / 100),
    max_discount: rupees(row.max_discount_paise),
    min_fare: rupees(row.min_fare_paise),
    city_id: str(row.city_id) ?? "",
    vehicle_types: Array.isArray(row.vehicle_types) ? row.vehicle_types.filter((v): v is string => typeof v === "string") : [],
    first_ride_only: row.first_ride_only === true,
    per_user_limit: String(num(row.per_user_limit) ?? 0),
    total_limit: String(num(row.total_limit) ?? 0),
    starts_at: (str(row.starts_at) ?? "").slice(0, 10),
    ends_at: (str(row.ends_at) ?? "").slice(0, 10),
    is_active: row.is_active !== false,
  }
}

/** A rupee field that may be zero: "" → null (not given), "0" → 0, "49.50" → 4950; negative or malformed → undefined. */
function optionalPaise(text: string): number | null | undefined {
  const clean = text.replace(/[₹,\s]/g, "")
  if (clean === "") return null
  if (/^0+(\.0{1,2})?$/.test(clean)) return 0
  return parseRupeeInput(clean) ?? undefined
}

function optionalCount(text: string): number | null | undefined {
  const clean = text.trim()
  if (clean === "") return null
  const n = Number(clean)
  return /^\d+$/.test(clean) && Number.isSafeInteger(n) ? n : undefined
}

export const COUPON_CODE = /^[A-Z0-9_-]{3,32}$/

/**
 * A coupon as rider-service takes it: money in paise, the percentage in
 * basis points, limits as whole numbers (0 = unlimited), validity as
 * timestamps. A flat coupon needs a positive amount; a percent coupon a
 * percentage of at most 100. For an update (`partial`) the code, type and
 * scope are fixed and blank fields are left out.
 */
export function checkCoupon(input: CouponInput, { partial = false } = {}): { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    const code = input.code.trim().toUpperCase()
    if (!COUPON_CODE.test(code)) problems.push("Code must be 3–32 letters, digits, _ or -.")
    else body.code = code
    body.discount_type = input.discount_type
    if (input.city_id.trim()) {
      if (!isUuid(input.city_id)) problems.push("City must be a full city id, or blank for every city.")
      else body.city_id = input.city_id.trim().toLowerCase()
    }
    if (input.vehicle_types.length > 0) body.vehicle_types = input.vehicle_types
  }
  if (input.description.trim()) body.description = input.description.trim()
  if (input.discount_type === "flat") {
    const paise = parseRupeeInput(input.discount_value)
    if (paise === null) {
      if (!partial || input.discount_value.trim() !== "") problems.push("A flat coupon needs a rupee amount above zero.")
    } else body.discount_value_paise = paise
  } else {
    const pct = Number(input.percent.trim())
    if (input.percent.trim() === "" || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
      if (!partial || input.percent.trim() !== "") problems.push("A percent coupon needs a percentage between 0 and 100.")
    } else body.percent_bps = Math.round(pct * 100)
  }
  const maxDiscount = optionalPaise(input.max_discount)
  if (maxDiscount === undefined) problems.push("Maximum discount must be a rupee amount of zero or more.")
  else if (maxDiscount !== null) body.max_discount_paise = maxDiscount
  const minFare = optionalPaise(input.min_fare)
  if (minFare === undefined) problems.push("Minimum fare must be a rupee amount of zero or more.")
  else if (minFare !== null) body.min_fare_paise = minFare
  const perUser = optionalCount(input.per_user_limit)
  if (perUser === undefined) problems.push("Per-user limit must be a whole number (0 = unlimited).")
  else if (perUser !== null) body.per_user_limit = perUser
  const total = optionalCount(input.total_limit)
  if (total === undefined) problems.push("Total limit must be a whole number (0 = unlimited).")
  else if (total !== null) body.total_limit = total
  body.first_ride_only = input.first_ride_only
  if (input.starts_at.trim()) {
    if (!DAY_ONLY.test(input.starts_at.trim())) problems.push("Starts must be a date.")
    else body.starts_at = dayStart(input.starts_at.trim())
  }
  if (input.ends_at.trim()) {
    if (!DAY_ONLY.test(input.ends_at.trim())) problems.push("Ends must be a date.")
    else if (input.starts_at.trim() && input.ends_at.trim() < input.starts_at.trim()) problems.push("Ends cannot be before starts.")
    else body.ends_at = dayEnd(input.ends_at.trim())
  }
  body.is_active = input.is_active
  return problems.length > 0 ? { ok: false, problems } : { ok: true, body }
}

/** "₹50.00 off" or "20% off, up to ₹100.00". */
export function couponValue(row: Row): string {
  if (str(row.discount_type) === "percent") {
    const bps = num(row.percent_bps) ?? 0
    const cap = num(row.max_discount_paise)
    return `${bps / 100}% off${cap ? `, up to ${formatPaise(cap)}` : ""}`
  }
  return `${formatPaise(num(row.discount_value_paise))} off`
}

/** "12 / 100" with a total limit, "12" without one. */
export function couponUsage(row: Row): string {
  const used = num(row.used_count) ?? 0
  const total = num(row.total_limit) ?? 0
  return total > 0 ? `${used.toLocaleString("en-IN")} / ${total.toLocaleString("en-IN")}` : used.toLocaleString("en-IN")
}

/** Where a coupon works: "Every city" / a city id, and the vehicle types or "All vehicles". */
export function couponScope(row: Row): string {
  const city = str(row.city_id)
  const types = Array.isArray(row.vehicle_types) ? row.vehicle_types.filter((v): v is string => typeof v === "string") : []
  return `${city ? `City ${city.slice(0, 8)}` : "Every city"} · ${types.length > 0 ? types.join(", ") : "All vehicles"}`
}

/** Inactive is "bad"; expired or exhausted "warn"; a live coupon "good". */
export function couponTone(row: Row, now = new Date()): Tone {
  if (row.is_active === false) return "bad"
  const ends = str(row.ends_at)
  if (ends && new Date(ends).getTime() < now.getTime()) return "warn"
  const total = num(row.total_limit) ?? 0
  if (total > 0 && (num(row.used_count) ?? 0) >= total) return "warn"
  return "good"
}

export function couponStatus(row: Row, now = new Date()): string {
  const tone = couponTone(row, now)
  if (tone === "bad") return "inactive"
  if (tone === "warn") {
    const ends = str(row.ends_at)
    return ends && new Date(ends).getTime() < now.getTime() ? "expired" : "exhausted"
  }
  return "active"
}

// ---------------------------------------------------------------------------
// Money: ride payments, outstanding fees, refunds
// ---------------------------------------------------------------------------

/** rider_ride_payments.status (migration 004). */
export const RIDE_PAYMENT_STATUSES = ["pending_cash_confirmation", "pending", "confirming", "succeeded", "failed", "refunded", "partially_refunded"] as const
export const RIDE_PAYMENT_METHODS = ["upi", "card", "wallet", "cash"] as const
/** rider_ride_refunds.status. */
export const REFUND_STATUSES = ["requested", "accepted", "refunded", "failed"] as const
/** rider_customer_outstanding.status. */
export const OUTSTANDING_STATUSES = ["pending", "settled", "waived"] as const

export interface RidePaymentFilter {
  status: string
  method: string
  /** YYYY-MM-DD or "" */
  from: string
  to: string
}

export const EMPTY_PAYMENT_FILTER: RidePaymentFilter = { status: "", method: "", from: "", to: "" }

/** `?status=&method=&from=&to=&cursor=`: empty filters and malformed days are left out; the cursor is the server's. */
export function ridePaymentsQuery(filter: RidePaymentFilter, cursor = ""): string {
  const q = new URLSearchParams()
  if (filter.status) q.set("status", filter.status)
  if (filter.method) q.set("method", filter.method)
  if (DAY_ONLY.test(filter.from)) q.set("from", dayStart(filter.from))
  if (DAY_ONLY.test(filter.to)) q.set("to", dayEnd(filter.to))
  if (cursor) q.set("cursor", cursor)
  return q.toString()
}

/** The next cursor from a cursor-paged answer (`{next_cursor}` or `{meta: {next_cursor}}`), or "" at the end. */
export function nextCursor(raw: unknown): string {
  const body = readObject(raw)
  const meta = isRecord(raw) && isRecord(raw.meta) ? raw.meta : null
  return str(body?.next_cursor) ?? str(meta?.next_cursor) ?? ""
}

/** What a payment can still return: amount less what was already refunded, never below zero. */
export function refundRemaining(row: Row): number {
  const amount = num(row.amount_paise) ?? 0
  const refunded = num(row.refunded_paise) ?? 0
  return Math.max(0, Math.round(amount - refunded))
}

/** Only money that was collected and not yet fully returned can be refunded. */
export function canRefund(row: Row): boolean {
  const s = str(row.status)
  return refundRemaining(row) > 0 && (s === "succeeded" || s === "partially_refunded")
}

/**
 * The amount typed into the refund dialog, checked against what remains:
 * blank means the whole remainder (no `amount_paise` is sent); otherwise a
 * positive rupee amount of at most the remainder.
 */
export function checkRefund(text: string, remainingPaise: number): { ok: true; amountPaise: number | null } | { ok: false; problem: string } {
  if (remainingPaise <= 0) return { ok: false, problem: "Nothing is left to refund on this payment." }
  if (text.trim() === "") return { ok: true, amountPaise: null }
  const paise = parseRupeeInput(text)
  if (paise === null) return { ok: false, problem: "Enter a rupee amount above zero, with at most two decimals, or leave it blank for the full amount." }
  if (paise > remainingPaise) return { ok: false, problem: `At most ${formatPaise(remainingPaise)} can still be refunded.` }
  return { ok: true, amountPaise: paise }
}

/** The refund body: `{reason}` for the remainder, `{amount_paise, reason}` for part of it. */
export function refundBody(amountPaise: number | null, reason: string): Record<string, unknown> {
  return amountPaise === null ? { reason } : { amount_paise: amountPaise, reason }
}

/** Integer paise from a product answer, as ₹; missing or unreadable → "—". */
export function paise(value: unknown): string {
  return formatPaise(num(value))
}

export function paymentTone(status: unknown): Tone {
  const s = str(status)
  if (s === "failed") return "bad"
  if (s === "pending" || s === "confirming" || s === "pending_cash_confirmation") return "warn"
  if (s === "succeeded") return "good"
  return "normal"
}

export function refundTone(status: unknown): Tone {
  const s = str(status)
  if (s === "failed") return "bad"
  if (s === "requested" || s === "accepted") return "warn"
  if (s === "refunded") return "good"
  return "normal"
}

export function outstandingTone(status: unknown): Tone {
  const s = str(status)
  if (s === "pending") return "warn"
  if (s === "settled") return "good"
  return "normal"
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type RiderReportParam = "window" | "by" | "cohort_month" | "job" | "city"

export interface RiderReportDef {
  id: string
  label: string
  path: string
  explain: string
  params: readonly RiderReportParam[]
}

/** The nine rider-service reports, each `{rows: [...]}` (or an object of counts). */
export const RIDER_REPORTS: readonly RiderReportDef[] = [
  { id: "matching-health", label: "Matching health", path: "/reports/matching-health", explain: "Offer acceptance, time to match and rides that found no partner, per day.", params: ["window"] },
  { id: "partner-quality", label: "Partner quality", path: "/reports/partner-quality", explain: "Ratings, cancellation and acceptance rates per partner.", params: ["window"] },
  { id: "supply-demand", label: "Supply and demand", path: "/reports/supply-demand", explain: "Online partners against ride requests, per hour.", params: ["window"] },
  { id: "safety", label: "Safety", path: "/reports/safety", explain: "Incidents by kind and severity, and how quickly they were handled.", params: ["window"] },
  { id: "compliance", label: "Partner compliance", path: "/reports/compliance", explain: "Partners with expired or missing documents, by city.", params: ["city"] },
  { id: "revenue", label: "Revenue", path: "/reports/revenue", explain: "Verified subscription payments, grouped by plan or by month.", params: ["by"] },
  { id: "cohort-retention", label: "Partner cohort retention", path: "/reports/cohort-retention", explain: "How many partners who joined in a month are still riding.", params: ["cohort_month"] },
  { id: "customer-cohort", label: "Customer cohort", path: "/reports/customer-cohort", explain: "How many customers who first rode in a month came back.", params: ["cohort_month"] },
  { id: "cron-runs", label: "Cron runs", path: "/reports/cron-runs", explain: "The scheduled jobs' recent runs and failures.", params: ["job"] },
]

export interface RiderReportFilter {
  from: string
  to: string
  by: string
  cohort_month: string
  job: string
  city: string
}

export const EMPTY_REPORT_FILTER: RiderReportFilter = { from: "", to: "", by: "plan", cohort_month: "", job: "", city: "" }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The report URL; a filter the report does not take, or that is malformed, is left out. */
export function riderReportUrl(def: RiderReportDef, filter: RiderReportFilter): string {
  const q = new URLSearchParams()
  if (def.params.includes("window")) {
    if (DAY.test(filter.from)) q.set("from", `${filter.from}T00:00:00+05:30`)
    if (DAY.test(filter.to)) q.set("to", `${filter.to}T23:59:59+05:30`)
  }
  if (def.params.includes("by") && (filter.by === "plan" || filter.by === "month")) q.set("by", filter.by)
  if (def.params.includes("cohort_month") && /^\d{4}-\d{2}$/.test(filter.cohort_month)) q.set("cohort_month", filter.cohort_month)
  if (def.params.includes("job") && filter.job.trim()) q.set("job", filter.job.trim())
  if (def.params.includes("city") && filter.city.trim()) q.set("city", filter.city.trim())
  const qs = q.toString()
  return `${RIDER}${def.path}${qs ? `?${qs}` : ""}`
}

/**
 * A report answer as rows and their columns: `{rows: [...]}` or a bare
 * array become the rows; an object of counts becomes one row. The columns
 * are every key seen, in first-seen order.
 */
export function reportTable(raw: unknown): { columns: string[]; rows: Row[] } {
  let rows = readList(raw, ["rows", "items", "data"])
  if (rows.length === 0) {
    const body = readObject(raw)
    if (body && !Array.isArray(body.rows) && !Array.isArray(body.items) && Object.keys(body).length > 0) rows = [body]
  }
  const columns: string[] = []
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key)
  return { columns, rows }
}

/** A report cell as text: numbers as-is, nested objects flattened, nulls as an em dash. */
export function reportCell(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toFixed(2)
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(reportCell).join(", ")
  if (isRecord(value)) return Object.entries(value).map(([k, v]) => `${k}: ${reportCell(v)}`).join(" · ")
  return String(value)
}

/** What the toast says once each write is done. */
export const RIDER_DONE: Record<RiderWrite, string> = {
  "partner.approve": "Partner approved",
  "partner.reject": "Partner rejected",
  "partner.suspend": "Partner suspended",
  "partner.block": "Partner blocked",
  "document.verify": "Document verified",
  "document.reject": "Document rejected",
  "vehicle.verify": "Vehicle verified",
  "vehicle.reject": "Vehicle rejected",
  "payment.verify": "Payment verified",
  "payment.reject": "Payment rejected",
  "ride.cancel": "Ride cancelled",
  "rating.visibility": "Rating visibility updated",
  "complaint.status": "Complaint updated",
  "incident.acknowledge": "Incident acknowledged",
  "incident.resolve": "Incident resolved",
  "city.create": "City created",
  "city.update": "City updated",
  "zone.create": "Zone created",
  "zone.update": "Zone updated",
  "fare_rule.create": "Fare rule created",
  "fare_rule.update": "Fare rule updated",
  "fare_window.create": "Fare window created",
  "fare_window.update": "Fare window updated",
  "fare_window.deactivate": "Fare window deactivated",
  "coupon.create": "Coupon created",
  "coupon.update": "Coupon updated",
  "coupon.deactivate": "Coupon deactivated",
  "outstanding.waive": "Fee waived",
  "refund.issue": "Refund issued",
}

/** A phone number with only its last four digits: lists are not reveals. */
export function maskPhone(value: unknown): string {
  const s = str(value)
  if (!s) return "—"
  const digits = s.replace(/\D/g, "")
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••"
}

/** Rupees as rider-service stores them (float), shown as ₹. */
export function rupees(value: unknown): string {
  const n = num(value)
  return n === null ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
