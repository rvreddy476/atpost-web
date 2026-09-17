import { isRecord, isUuid, num, readList, readObject, str, type Row } from "./data"

/**
 * The Mopedu dashboard's rules, as plain functions: which writes need a
 * fresh 2FA code, which reads are reveals, what each queue filters by, and
 * how the fare-rule and city forms are checked before anything is sent.
 *
 * admin-service (handler_rider.go) is the source of truth; the console
 * mirrors its table so an admin is told BEFORE confirming what a click will
 * need. Nothing in Mopedu is two-person: subscription payments are verified,
 * not paid out, so no money leaves.
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

export interface RiderWriteDef {
  label: string
  /** Without the `rider:` prefix. */
  permission: string
  stepUp: boolean
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
}

export const riderStepUp = (write: RiderWrite) => RIDER_WRITES[write].stepUp

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
