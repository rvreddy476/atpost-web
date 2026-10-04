import { checkReason } from "../blocks/confirm"
import { humanise, isRecord, isUuid, num, readList, readObject, str, type Row } from "./data"
import { formatPaise, parseRupeeInput } from "./money"

/**
 * The Doorstep dashboard's rules, as plain functions: every write's route,
 * permission, step-up and reason; the queues' filters; and the checks the
 * catalogue, pricing and config forms run before anything is sent.
 *
 * The contract is contracts/doorstep/openapi.yaml, the /internal/admin
 * family. admin-service serves each of those routes at the same path under
 * /v1/admin/doorstep with a token scoped to the route's `x-permission`. The
 * step-up and two-person flags below are the console's statement of what a
 * click will need; admin-service's route table is the truth, and a 403
 * STEP_UP_REQUIRED or a 202 approval is handled whatever this table says.
 *
 * Prices are effective-dated: a new price is a new row from a start time,
 * which closes the open row; nothing here edits a price in place.
 */

export const DOORSTEP = "/v1/admin/doorstep"
export const DOORSTEP_PAGE = 50

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type DoorstepWrite =
  | "pro.tax_registration"
  | "pro.approve"
  | "pro.reject"
  | "pro.suspend"
  | "pro.reinstate"
  | "pro.block"
  | "skill.verify"
  | "skill.revoke"
  | "document.approve"
  | "document.reject"
  | "booking.cancel"
  | "booking.redispatch"
  | "booking.refund"
  | "incident.acknowledge"
  | "incident.resolve"
  | "ticket.status"
  | "rating.hide"
  | "category.create"
  | "category.update"
  | "skill.create"
  | "service.create"
  | "service.update"
  | "option.create"
  | "option.update"
  | "addon_group.create"
  | "addon_group.update"
  | "addon.create"
  | "addon.update"
  | "price.create"
  | "rate_card.create"
  | "rate_card.update"
  | "city.create"
  | "city.update"
  | "zone.create"
  | "zone.update"
  | "slot_config.create"
  | "slot_config.update"
  | "cancellation_rule.create"
  | "cancellation_rule.update"
  | "commission_rule.create"
  | "commission_rule.update"
  | "pro_price.approve"
  | "pro_price.reject"

/** What a write acts on: a row id, a city code, and for a skill decision the skill code. */
export interface DoorstepTarget {
  id?: string
  code?: string
  skill?: string
}

export interface DoorstepWriteDef {
  label: string
  /** Without the `doorstep:` prefix: the route's x-permission. */
  permission: string
  method: "post" | "patch"
  path: (t: DoorstepTarget) => string
  /** The route always needs a fresh 2FA code (admin-service `stepUp: true`). */
  stepUp: boolean
  /** Needs one only for some bodies (admin-service decides from the body); see stepUpFor(). */
  stepUpWhen?: (body: Record<string, unknown>) => boolean
  /** Waits for a second approver (the approvals inbox); the console never reports it as done. */
  twoPerson?: boolean
  /**
   * The server REQUIRES an Idempotency-Key (admin-service `idempotent: true`:
   * stored with the approval and replayed). The console sends a key on every
   * write anyway; admin-service forwards it.
   */
  idempotencyRequired?: boolean
  destructive: boolean
  /** A written reason (ten characters or more) is required and sent. */
  reason: boolean
  explain: string
  done: string
}

const enc = encodeURIComponent
const byId = (path: string) => (t: DoorstepTarget) => `${DOORSTEP}${path.replace(":id", enc(t.id ?? ""))}`
const fixed = (path: string) => () => `${DOORSTEP}${path}`
const STEP = " Needs a fresh 2FA code."

export const DOORSTEP_WRITES: Record<DoorstepWrite, DoorstepWriteDef> = {
  "pro.tax_registration": { label: "Record GST registration", permission: "pros.approve", method: "post", path: byId("/professionals/:id/tax-registration"), stepUp: true, destructive: false, reason: true, explain: "Manually verify the active GST registration and its ownership before recording it. Leave the GSTIN blank to remove it. This does not approve the professional, their skills or prices. Changes are refused while they have active bookings." + STEP, done: "Tax registration recorded" },
  "pro.approve": { label: "Approve", permission: "pros.approve", method: "post", path: byId("/professionals/:id/approve"), stepUp: false, destructive: false, reason: false, explain: "The professional can go on duty and be picked by customers. The server refuses while any onboarding step is missing. Their selfie, skills, documents and prices are each decided on their own; approving the professional approves none of them.", done: "Professional approved" },
  "pro.reject": { label: "Reject", permission: "pros.approve", method: "post", path: byId("/professionals/:id/reject"), stepUp: false, destructive: true, reason: true, explain: "The application is refused and the professional role is withdrawn. They are told why.", done: "Professional rejected" },
  "pro.suspend": { label: "Suspend", permission: "pros.suspend", method: "post", path: byId("/professionals/:id/suspend"), stepUp: true, destructive: true, reason: true, explain: "The professional is taken off duty and their future jobs are re-dispatched to others." + STEP, done: "Professional suspended" },
  "pro.reinstate": { label: "Reinstate", permission: "pros.suspend", method: "post", path: byId("/professionals/:id/reinstate"), stepUp: true, destructive: false, reason: true, explain: "Lifts the suspension: the professional is approved again and can go on duty." + STEP, done: "Professional reinstated" },
  "pro.block": { label: "Block", permission: "pros.suspend", method: "post", path: byId("/professionals/:id/block"), stepUp: true, destructive: true, reason: true, explain: "Blocks the professional permanently and withdraws the professional role." + STEP, done: "Professional blocked" },
  "skill.verify": { label: "Verify skill", permission: "pros.approve", method: "post", path: (t) => `${DOORSTEP}/professionals/${enc(t.id ?? "")}/skills/${enc(t.skill ?? "")}/verify`, stepUp: false, destructive: false, reason: false, explain: "You confirm this professional can do the work. Declaring a skill never verifies it. Once verified, customers can pick them for services that need it. A skill that needs a certificate is verified by approving its trade certificate; Verify then answers that a certificate is required.", done: "Skill verified" },
  "skill.revoke": { label: "Revoke skill", permission: "pros.approve", method: "post", path: (t) => `${DOORSTEP}/professionals/${enc(t.id ?? "")}/skills/${enc(t.skill ?? "")}/verify`, stepUp: false, destructive: true, reason: true, explain: "Dispatch stops offering this professional jobs that need the skill.", done: "Skill revoked" },
  "document.approve": { label: "Approve document", permission: "documents.review", method: "post", path: byId("/documents/:id/decide"), stepUp: true, destructive: false, reason: false, explain: "Records that you checked it: nothing a professional uploads is approved without an admin. Approving a selfie passes the face-match step, a trade certificate verifies its skill, and a police clearance certificate makes the background check clear until 12 months after its issue date." + STEP, done: "Document approved" },
  "document.reject": { label: "Reject document", permission: "documents.review", method: "post", path: byId("/documents/:id/decide"), stepUp: true, destructive: true, reason: true, explain: "The professional must upload the document again; they are told why." + STEP, done: "Document rejected" },
  "booking.cancel": { label: "Cancel booking", permission: "bookings.cancel", method: "post", path: byId("/bookings/:id/cancel"), stepUp: true, destructive: true, reason: true, explain: "Cancels the booking for the customer and the professional. The customer is refunded in full unless you keep a fee." + STEP, done: "Booking cancelled" },
  "booking.redispatch": { label: "Offer the customer alternatives", permission: "bookings.redispatch", method: "post", path: byId("/bookings/:id/redispatch"), stepUp: false, destructive: false, reason: true, explain: "Takes the job off the current professional, with no penalty to them. The customer is told and picks another professional (a dearer one is charged the difference, a cheaper one refunded it) or cancels for a full refund. The current professional, and anyone you exclude, are left off their list; ops never assign anyone. With no choice within 30 minutes the booking is cancelled with a full refund.", done: "Customer asked to pick another professional" },
  "booking.refund": { label: "Refund", permission: "refunds.issue", method: "post", path: byId("/bookings/:id/refund"), stepUp: true, twoPerson: true, idempotencyRequired: true, destructive: true, reason: true, explain: "Returns money to the customer's payment method. Needs a fresh 2FA code and a second admin's approval before any money moves.", done: "Refund requested" },
  "incident.acknowledge": { label: "Acknowledge", permission: "incidents.act", method: "post", path: byId("/incidents/:id/acknowledge"), stepUp: false, destructive: false, reason: false, explain: "Records that someone is looking at this incident.", done: "Incident acknowledged" },
  "incident.resolve": { label: "Resolve", permission: "incidents.act", method: "post", path: byId("/incidents/:id/resolve"), stepUp: false, stepUpWhen: (body) => body.lift_suspension === true, destructive: false, reason: true, explain: "Closes the incident with what was done. An automatic suspension stays unless you lift it here; lifting it puts the professional back on the platform and needs a fresh 2FA code.", done: "Incident resolved" },
  "ticket.status": { label: "Move ticket", permission: "tickets.act", method: "post", path: byId("/tickets/:id/status"), stepUp: false, destructive: false, reason: false, explain: "Moves the ticket along; the note is kept with it.", done: "Ticket updated" },
  "rating.hide": { label: "Hide rating", permission: "ratings.moderate", method: "post", path: byId("/ratings/:id/hide"), stepUp: false, destructive: true, reason: true, explain: "The rating is hidden and no longer counts towards the professional's average.", done: "Rating hidden" },
  "category.create": { label: "Create category", permission: "catalogue.write", method: "post", path: fixed("/categories"), stepUp: false, destructive: false, reason: false, explain: "Adds a category. It stays hidden from customers until it is active.", done: "Category created" },
  "category.update": { label: "Update category", permission: "catalogue.write", method: "patch", path: byId("/categories/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes the category or shows or hides it.", done: "Category updated" },
  "skill.create": { label: "Create skill", permission: "catalogue.write", method: "post", path: fixed("/skills"), stepUp: false, destructive: false, reason: false, explain: "Adds a skill services can require and professionals can declare.", done: "Skill created" },
  "service.create": { label: "Create service", permission: "catalogue.write", method: "post", path: fixed("/services"), stepUp: false, destructive: false, reason: false, explain: "Adds a service to a category. It stays hidden until it is active and priced.", done: "Service created" },
  "service.update": { label: "Update service", permission: "catalogue.write", method: "patch", path: byId("/services/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes the service or shows or hides it.", done: "Service updated" },
  "option.create": { label: "Add option", permission: "catalogue.write", method: "post", path: byId("/services/:id/options"), stepUp: false, destructive: false, reason: false, explain: "Adds a priced variant of the service (a size, a count).", done: "Option added" },
  "option.update": { label: "Update option", permission: "catalogue.write", method: "patch", path: byId("/options/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes the option or shows or hides it.", done: "Option updated" },
  "addon_group.create": { label: "Add add-on group", permission: "catalogue.write", method: "post", path: byId("/services/:id/addon-groups"), stepUp: false, destructive: false, reason: false, explain: "Adds a group of add-ons with how many a customer may pick.", done: "Add-on group added" },
  "addon_group.update": { label: "Update add-on group", permission: "catalogue.write", method: "patch", path: byId("/addon-groups/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes the group or shows or hides it.", done: "Add-on group updated" },
  "addon.create": { label: "Add add-on", permission: "catalogue.write", method: "post", path: byId("/addon-groups/:id/addons"), stepUp: false, destructive: false, reason: false, explain: "Adds an add-on to the group. Price it before it is shown.", done: "Add-on added" },
  "addon.update": { label: "Update add-on", permission: "catalogue.write", method: "patch", path: byId("/addons/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes the add-on or shows or hides it.", done: "Add-on updated" },
  "price.create": { label: "Set new price", permission: "catalogue.write", method: "post", path: fixed("/prices"), stepUp: true, destructive: false, reason: false, explain: "Adds a new price row from its start time; the current price ends then. Earlier rows are kept as history and never edited." + STEP, done: "New price set" },
  "rate_card.create": { label: "Create rate-card item", permission: "catalogue.write", method: "post", path: fixed("/rate-cards"), stepUp: true, destructive: false, reason: false, explain: "Adds an extra professionals can propose during a visit, at this price." + STEP, done: "Rate-card item created" },
  "rate_card.update": { label: "Update rate-card item", permission: "catalogue.write", method: "patch", path: byId("/rate-cards/:id"), stepUp: true, destructive: false, reason: false, explain: "Changes what professionals can charge for this extra from now on." + STEP, done: "Rate-card item updated" },
  "city.create": { label: "Create city", permission: "config.write", method: "post", path: fixed("/cities"), stepUp: false, destructive: false, reason: false, explain: "Adds a city. It stays closed to customers until it is active.", done: "City created" },
  "city.update": { label: "Update city", permission: "config.write", method: "patch", path: (t) => `${DOORSTEP}/cities/${enc(t.code ?? "")}`, stepUp: false, destructive: false, reason: false, explain: "Changes the city's settings or opens or closes it.", done: "City updated" },
  "zone.create": { label: "Create zone", permission: "config.write", method: "post", path: fixed("/zones"), stepUp: false, destructive: false, reason: false, explain: "Adds a service zone (a GeoJSON boundary) inside a city.", done: "Zone created" },
  "zone.update": { label: "Update zone", permission: "config.write", method: "patch", path: byId("/zones/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes the zone or switches it on or off.", done: "Zone updated" },
  "slot_config.create": { label: "Create slot config", permission: "config.write", method: "post", path: fixed("/slot-configs"), stepUp: false, destructive: false, reason: false, explain: "Sets the hours and slot steps for a city, or for one category in it.", done: "Slot config created" },
  "slot_config.update": { label: "Update slot config", permission: "config.write", method: "patch", path: byId("/slot-configs/:id"), stepUp: false, destructive: false, reason: false, explain: "Changes which slots customers are offered from now on.", done: "Slot config updated" },
  "cancellation_rule.create": { label: "Create cancellation rule", permission: "config.write", method: "post", path: fixed("/cancellation-rules"), stepUp: true, destructive: false, reason: false, explain: "Changes what customers are charged for cancelling." + STEP, done: "Cancellation rule created" },
  "cancellation_rule.update": { label: "Update cancellation rule", permission: "config.write", method: "patch", path: byId("/cancellation-rules/:id"), stepUp: true, destructive: false, reason: false, explain: "Changes what customers are charged for cancelling." + STEP, done: "Cancellation rule updated" },
  "commission_rule.create": { label: "Create commission rule", permission: "config.write", method: "post", path: fixed("/commission-rules"), stepUp: true, destructive: false, reason: false, explain: "Changes the platform's share of what professionals earn." + STEP, done: "Commission rule created" },
  "commission_rule.update": { label: "Update commission rule", permission: "config.write", method: "patch", path: byId("/commission-rules/:id"), stepUp: true, destructive: false, reason: false, explain: "Changes or ends the platform's share of what professionals earn." + STEP, done: "Commission rule updated" },
  "pro_price.approve": { label: "Approve price", permission: "prices.review", method: "post", path: byId("/pro-prices/:id/approve"), stepUp: true, destructive: false, reason: false, explain: "Customers can book this professional at this price from now; their previous approved price for this item ends now. Bookings already made keep their price." + STEP, done: "Price approved" },
  "pro_price.reject": { label: "Reject price", permission: "prices.review", method: "post", path: byId("/pro-prices/:id/reject"), stepUp: false, destructive: true, reason: true, explain: "The price never goes live. The professional is told why and can submit another; any price already approved for this item stays live.", done: "Price rejected" },
}

/** Does this write ALWAYS need a fresh 2FA code? */
export const doorstepStepUp = (write: DoorstepWrite) => DOORSTEP_WRITES[write].stepUp
/** Does this write, with this body, need a fresh 2FA code? */
export const stepUpFor = (write: DoorstepWrite, body: Record<string, unknown> = {}) => DOORSTEP_WRITES[write].stepUp || DOORSTEP_WRITES[write].stepUpWhen?.(body) === true
export const doorstepTwoPerson = (write: DoorstepWrite) => DOORSTEP_WRITES[write].twoPerson === true

/**
 * GET routes that are step-up reads in admin-service (handler_doorstep.go):
 * the professional detail (document media ids and the payout account, a KYC
 * reveal) and the document queue. The console asks for the 2FA code and
 * reads once more, rather than showing a refusal.
 */
export const DOORSTEP_STEP_UP_READS = {
  taxRegistration: { permission: "pros.approve", path: (id: string) => `${DOORSTEP}/professionals/${enc(id)}/tax-registration` },
  professional: { permission: "pros.read", path: (id: string) => `${DOORSTEP}/professionals/${enc(id)}` },
  documents: { permission: "documents.review", path: (status: string) => `${DOORSTEP}/documents${(DOCUMENT_STATUSES as readonly string[]).includes(status) ? `?status=${status}` : ""}` },
} as const

export interface DoorstepRequest {
  method: "post" | "patch"
  url: string
  body: Record<string, unknown>
  /** Always true: every Doorstep write carries an Idempotency-Key, reused across the step-up retry. */
  idempotent: true
}

/**
 * The request for one write. A write that takes a reason sends it as
 * `reason`; extra fields (an amount, a decision) come in `body`. Every write
 * sends an Idempotency-Key (minted once per action by prepareSend): the
 * refund requires one, and admin-service forwards it on every other route.
 */
export function doorstepRequest(write: DoorstepWrite, target: DoorstepTarget, body: Record<string, unknown> = {}): DoorstepRequest {
  const def = DOORSTEP_WRITES[write]
  return { method: def.method, url: def.path(target), body, idempotent: true }
}

/**
 * Whether the reason typed for a write can be sent: required (ten characters
 * or more) for every write marked `reason`, optional otherwise.
 */
export function doorstepReasonProblem(write: DoorstepWrite, reason: string): string | null {
  const def = DOORSTEP_WRITES[write]
  return checkReason(reason, { destructive: def.destructive, required: def.reason }).message
}

/** The body each decision sends, with the shapes the contract asks for. */
export const DECISION_BODIES = {
  reason: (reason: string) => ({ reason }),
  document: (decision: "approve" | "reject", reason: string) => (decision === "reject" || reason ? { decision, reason } : { decision }),
  skill: (verified: boolean, reason: string) => (reason ? { verified, reason } : { verified }),
  resolve: (resolution: string, liftSuspension: boolean) => ({ resolution, lift_suspension: liftSuspension }),
  ticket: (status: string, note: string) => (note ? { status, note } : { status }),
  /** PriceDecisionInput: the reason is optional to approve, required (ten characters or more) to reject. */
  price: (reason: string) => (reason ? { reason } : {}),
  /** AdminRedispatchInput: a reason, and professionals to EXCLUDE only (strict decoding refuses naming one to assign). */
  redispatch: (reason: string, excludeProIds: readonly string[]) => (excludeProIds.length > 0 ? { reason, exclude_pro_ids: [...excludeProIds] } : { reason }),
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Reads that are reveals. A document image is fetched as bytes for the
 * view-only canvas viewer, behind a fresh 2FA code, with one audit row per
 * view. (The contract gives the console media ids only; admin-service owns
 * the /view route that streams the image.)
 */
export const DOORSTEP_REVEALS = {
  documentView: { permission: "documents.review", path: (documentId: string) => `${DOORSTEP}/documents/${enc(documentId)}/view` },
} as const

/** Until admin-service serves the /view route, it answers 404; that is said plainly, not as "document gone". */
export const DOORSTEP_VIEWER_UNAVAILABLE = "The document viewer is not available yet: the image route has not been switched on. The document's status and dates are still shown here."

/** The sentence for a failed document view: a 404 means the viewer route is not there yet. */
export function doorstepViewErrorMessage(failure: { status: number | null; message: string }): string {
  return failure.status === 404 ? DOORSTEP_VIEWER_UNAVAILABLE : failure.message
}

const query = (pairs: Record<string, string | number | null | undefined>): string => {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(pairs)) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text !== "") q.set(key, text)
  }
  const s = q.toString()
  return s ? `?${s}` : ""
}

const CITY = /^[A-Z]{3}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A city code as the contract takes it (HYD), or "" when it is not one. */
export const cityCode = (text: string) => {
  const code = text.trim().toUpperCase()
  return CITY.test(code) ? code : ""
}

export const DOORSTEP_READS = {
  stats: () => `${DOORSTEP}/stats`,
  professionals: (f: { status?: string; city?: string }, cursor = "") => `${DOORSTEP}/professionals${query({ status: f.status, city: cityCode(f.city ?? ""), cursor })}`,
  bookings: (f: { status?: string; city?: string; date?: string }, cursor = "") =>
    `${DOORSTEP}/bookings${query({ status: f.status, city: cityCode(f.city ?? ""), date: DAY.test(f.date ?? "") ? f.date : "", cursor })}`,
  booking: (id: string) => `${DOORSTEP}/bookings/${enc(id)}`,
  incidents: (status: string) => `${DOORSTEP}/incidents${query({ status })}`,
  tickets: () => `${DOORSTEP}/tickets`,
  ratings: () => `${DOORSTEP}/ratings`,
  settlements: (periodStart: string) => `${DOORSTEP}/settlements${query({ period_start: DAY.test(periodStart) ? periodStart : "" })}`,
  audit: (entity: string, limit = DOORSTEP_PAGE) => `${DOORSTEP}/audit-logs${query({ entity: /^[a-z][a-z0-9_]{0,63}$/.test(entity.trim()) ? entity : "", limit: Math.min(100, Math.max(1, Math.round(limit))) })}`,
  cities: () => `${DOORSTEP}/cities`,
  zones: (city: string) => `${DOORSTEP}/zones${query({ city: cityCode(city) })}`,
  categories: () => `${DOORSTEP}/categories`,
  skills: () => `${DOORSTEP}/skills`,
  services: (categoryId: string) => `${DOORSTEP}/services${query({ category_id: isUuid(categoryId) ? categoryId.trim().toLowerCase() : "" })}`,
  service: (id: string) => `${DOORSTEP}/services/${enc(id)}`,
  prices: (city: string, itemId: string) => `${DOORSTEP}/prices${query({ city: cityCode(city), item_id: isUuid(itemId) ? itemId.trim().toLowerCase() : "" })}`,
  rateCards: (city: string, categoryId: string) => `${DOORSTEP}/rate-cards${query({ city: cityCode(city), category_id: isUuid(categoryId) ? categoryId.trim().toLowerCase() : "" })}`,
  slotConfigs: (city: string) => `${DOORSTEP}/slot-configs${query({ city: cityCode(city) })}`,
  cancellationRules: (city: string) => `${DOORSTEP}/cancellation-rules${query({ city: cityCode(city) })}`,
  commissionRules: (city: string) => `${DOORSTEP}/commission-rules${query({ city: cityCode(city) })}`,
  proPrices: (f: { status?: string; city?: string; proId?: string }, cursor = "") =>
    `${DOORSTEP}/pro-prices${query({
      status: (PRO_PRICE_STATUSES as readonly string[]).includes(f.status ?? "") ? f.status : "",
      city: cityCode(f.city ?? ""),
      pro_id: isUuid(f.proId ?? "") ? (f.proId ?? "").trim().toLowerCase() : "",
      cursor,
    })}`,
} as const

/** The next cursor of a cursor-paged list, or "" at the end. */
export function nextCursor(raw: unknown): string {
  return str(readObject(raw)?.next_cursor) ?? ""
}

// ---------------------------------------------------------------------------
// Vocabulary and tones
// ---------------------------------------------------------------------------

export const PRO_STATUSES = ["draft", "pending_verification", "approved", "suspended", "rejected", "blocked"] as const
export const BOOKING_STATUSES = ["pending_payment", "confirmed", "assigned", "en_route", "arrived", "in_progress", "awaiting_extras_payment", "completed", "cancelled", "expired", "customer_no_show", "pro_no_show", "pro_unavailable"] as const
export const DOCUMENT_STATUSES = ["pending", "approved", "rejected"] as const
export const PRO_PRICE_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const
export const INCIDENT_STATUSES = ["open", "acknowledged", "resolved"] as const
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const
export const FAMILIES = ["HOME_CLEANING", "PEST_CONTROL", "APPLIANCE_REPAIR", "INSTALLATION_REPAIR", "PAINTING", "BEAUTY_SALON"] as const
export const GENDER_RULES = ["any", "female_pros_only", "male_pros_only"] as const
export const EXTRAS_POLICIES = ["rate_card", "catalogue_addons_only"] as const
export const RATE_CARD_UNITS = ["per_item", "per_metre", "per_hour", "per_visit"] as const
export const CANCEL_STAGES = ["unassigned", "assigned", "en_route", "arrived", "in_progress"] as const

export const ONBOARDING_STEP_LABELS: Record<string, string> = {
  profile: "Profile",
  aadhaar_digilocker: "Aadhaar via DigiLocker",
  selfie_face_match: "Selfie face match",
  skills: "Skills",
  service_area: "Service area",
  weekly_hours: "Weekly hours",
  bank: "Bank account",
  police_certificate: "Police clearance certificate",
  agreement: "Agreement",
  pan: "PAN (recommended)",
}

export const DOCUMENT_KIND_LABELS: Record<string, string> = {
  police_certificate: "Police clearance certificate",
  trade_certificate: "Trade certificate",
  selfie: "Selfie",
  aadhaar: "Aadhaar",
  pan: "PAN card",
  other: "Other document",
}

export const documentKindLabel = (kind: unknown) => DOCUMENT_KIND_LABELS[str(kind) ?? ""] ?? "Document"

/** The kind, and for a trade certificate the skill it is for: "Trade certificate (electrician)". */
export function documentLabel(doc: Row): string {
  const skill = str(doc.skill_code)
  return str(doc.kind) === "trade_certificate" && skill ? `${documentKindLabel(doc.kind)} (${skill})` : documentKindLabel(doc.kind)
}
export const stepLabel = (step: string) => ONBOARDING_STEP_LABELS[step] ?? step

export type Tone = "bad" | "warn" | "good" | "normal"

export function proTone(status: unknown): Tone {
  const s = str(status)
  if (s === "blocked" || s === "rejected") return "bad"
  if (s === "suspended" || s === "pending_verification") return "warn"
  if (s === "approved") return "good"
  return "normal"
}

const LIVE_BOOKINGS: readonly string[] = ["confirmed", "assigned", "en_route", "arrived", "in_progress", "awaiting_extras_payment"]
const ENDED_BOOKINGS: readonly string[] = ["completed", "cancelled", "expired", "customer_no_show", "pro_no_show"]

export function bookingTone(status: unknown): Tone {
  const s = str(status) ?? ""
  if (s === "cancelled" || s === "expired" || s.endsWith("no_show") || s === "pro_unavailable") return "bad"
  if (s === "pending_payment" || LIVE_BOOKINGS.includes(s)) return "warn"
  if (s === "completed") return "good"
  return "normal"
}

export function reviewTone(status: unknown): Tone {
  const s = str(status)
  if (s === "rejected" || s === "failed" || s === "revoked" || s === "expired" || s === "withdrawn") return "bad"
  if (s === "pending" || s === "consider") return "warn"
  if (s === "approved" || s === "verified" || s === "passed" || s === "clear") return "good"
  return "normal"
}

export function severityTone(severity: unknown): Tone {
  const s = str(severity)
  if (s === "critical" || s === "high") return "bad"
  if (s === "medium") return "warn"
  return "normal"
}

export function incidentTone(status: unknown): Tone {
  const s = str(status)
  return s === "open" ? "bad" : s === "acknowledged" ? "warn" : "normal"
}

export function ticketTone(status: unknown): Tone {
  const s = str(status)
  return s === "open" ? "warn" : s === "in_progress" ? "normal" : "good"
}

/** Integer paise as ₹; missing or unreadable → "—". */
export const paise = (value: unknown) => formatPaise(num(value))

/** 1500 bps → "15%". */
export function bpsLabel(value: unknown): string {
  const n = num(value)
  return n === null ? "—" : `${(n / 100).toFixed(2).replace(/\.?0+$/, "")}%`
}

// ---------------------------------------------------------------------------
// Professionals and approvals
// ---------------------------------------------------------------------------

/** The decisions a status allows, before permissions: the detail shows each only when the admin holds its permission too. */
export function proWrites(status: unknown): DoorstepWrite[] {
  const s = str(status) ?? ""
  const out: DoorstepWrite[] = []
  if (s === "pending_verification") out.push("pro.approve")
  if (s === "pending_verification" || s === "draft") out.push("pro.reject")
  if (s === "approved") out.push("pro.suspend")
  if (s === "suspended") out.push("pro.reinstate")
  if (s !== "" && s !== "blocked") out.push("pro.block")
  return out
}

export interface Readiness {
  status: string | null
  missing: string[]
  completed: string[]
  recommended: string[]
  canGoOnDuty: boolean
}

const steps = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

/** `readiness` from the professional detail; anything unreadable counts as nothing completed. */
export function readReadiness(detail: Row | null): Readiness {
  const r = detail && isRecord(detail.readiness) ? detail.readiness : null
  return {
    status: r ? str(r.status) : null,
    missing: r ? steps(r.missing_steps) : [],
    completed: r ? steps(r.completed_steps) : [],
    recommended: r ? steps(r.recommended_steps) : [],
    canGoOnDuty: r?.can_go_on_duty === true,
  }
}

/**
 * Why Approve is not offered yet: the required onboarding steps still
 * missing (PAN is only recommended), or a readiness the console could not
 * read. Empty means the server should accept it.
 */
export function approvalBlockers(detail: Row | null): string[] {
  if (!detail || !isRecord(detail.readiness)) return ["The onboarding readiness could not be read."]
  return readReadiness(detail)
    .missing.filter((step) => step !== "pan")
    .map(stepLabel)
}

/** The rows of the detail's arrays, tolerant of a missing key. */
export const detailRows = (detail: Row | null, key: string): Row[] => (detail ? readList({ items: detail[key] }) : [])

/**
 * A police clearance certificate keeps the background check clear for 12
 * months from its issue date (Go's AddDate(0, 12, 0): 29 Feb rolls to 1 Mar).
 * Null when the issue date is missing or not a date.
 */
export function policeClearUntil(issuedOn: unknown): string | null {
  const s = str(issuedOn)
  if (!s || !DAY.test(s)) return null
  const [y, m, d] = s.split("-").map(Number)
  const date = new Date(Date.UTC(y + 1, m - 1, d))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/**
 * What the reviewer must know before approving a document: a police
 * certificate without an issue date, or one already more than 12 months
 * old (approving it would not make the check clear).
 */
export function documentApprovalWarning(doc: Row, today: string): string | null {
  if (str(doc.kind) !== "police_certificate") return null
  const until = policeClearUntil(doc.issued_on)
  if (!until) return "This certificate has no issue date on record; the background check cannot be dated."
  if (until <= today) return `Issued ${str(doc.issued_on)}: more than 12 months ago, so it cannot clear the background check. Reject it and ask for a new one.`
  return null
}

/** The review queue: police certificates first, then the oldest upload first. */
export function sortDocumentQueue(rows: Row[]): Row[] {
  const rank = (r: Row) => (str(r.kind) === "police_certificate" ? 0 : 1)
  return [...rows].sort((a, b) => rank(a) - rank(b) || (str(a.created_at) ?? "").localeCompare(str(b.created_at) ?? ""))
}

// --- Nothing approves itself (founder, 4 Oct 2026) -----------------------------

/** doorstep-service's default SELFIE_MIN_SIMILARITY (0–100); the deployed value may differ, so it is only a guide. */
export const FACE_MATCH_GUIDE = 80

export interface FaceMatchAdvice {
  /** The face match's similarity, 0–100; null when it could not be compared. */
  score: number | null
  /** The check's status: pending (waiting for an admin), passed (an admin approved the selfie), failed, expired. */
  status: string | null
  tone: Tone
  /** What the reviewer is told. Always advice: the admin's own decision approves the selfie. */
  advice: string
}

/**
 * The selfie face match from a professional detail's kyc_checks, as advice
 * for the reviewer. The service never approves a selfie on its score: it
 * writes the check pending (or failed, for an image with no face) and an
 * admin approves or rejects the selfie document; the database refuses a
 * passed check without that admin. Null when the detail has no face match.
 */
export function faceMatchAdvice(detail: Row | null): FaceMatchAdvice | null {
  const check = detailRows(detail, "kyc_checks").find((c) => str(c.kind) === "selfie_face_match")
  if (!check) return null
  const raw = num(check.score)
  const score = raw === null ? null : Math.max(0, Math.min(100, raw))
  const status = str(check.status)
  const shown = score === null ? null : Number.isInteger(score) ? String(score) : score.toFixed(1)
  if (status === "passed") return { score, status, tone: "good", advice: `Approved by an admin${shown === null ? "" : ` (similarity ${shown} of 100)`}.` }
  if (status === "failed") return { score, status, tone: "bad", advice: "The selfie could not be compared (no face found, or an unreadable image). Reject it so the professional takes a new one." }
  if (score === null) return { score, status, tone: "warn", advice: "No similarity score: the comparison was unavailable. Compare the selfie with the DigiLocker photo yourself before deciding." }
  if (score >= FACE_MATCH_GUIDE) {
    return { score, status, tone: "normal", advice: `Similarity ${shown} of 100, at or above the usual threshold (${FACE_MATCH_GUIDE}). This is advice only: look at the selfie and decide.` }
  }
  return { score, status, tone: "warn", advice: `Similarity ${shown} of 100, below the usual threshold (${FACE_MATCH_GUIDE}). Look carefully: approve only if you are sure it is the same person.` }
}

/** The document detail rows a reviewer still has to decide (pending), selfies included. */
export const pendingDocuments = (detail: Row | null): Row[] => detailRows(detail, "documents").filter((d) => str(d.status) === "pending")

/**
 * A professional's skills for review: every declared skill, pending ones
 * first (nothing is verified on declaration), then verified, then revoked.
 */
export function skillsForReview(detail: Row | null): Row[] {
  const rank = (r: Row) => (str(r.status) === "pending" ? 0 : str(r.status) === "verified" ? 1 : 2)
  return [...detailRows(detail, "skills")].sort((a, b) => rank(a) - rank(b) || (str(a.skill_code) ?? "").localeCompare(str(b.skill_code) ?? ""))
}

/** A skill's status as the reviewer reads it. */
export function skillStatusLabel(status: unknown): string {
  const s = str(status)
  if (s === "pending") return "Waiting for an admin"
  if (s === "verified") return "Verified by an admin"
  if (s === "revoked") return "Revoked"
  return humanise(s)
}

// --- Professionals' own prices (B1, doorstep:prices.review) ----------------------

export const UNIT_LABELS: Record<string, string> = { per_job: "per job", per_hour: "per hour", per_month: "per month" }
export const unitLabel = (unit: unknown) => UNIT_LABELS[str(unit) ?? ""] ?? humanise(unit)

export interface ProPriceView {
  id: string | null
  proId: string | null
  proName: string
  proStatus: string | null
  city: string | null
  serviceName: string
  categorySlug: string | null
  itemKind: string | null
  itemName: string
  unit: string | null
  status: string | null
  /** What the professional asks (GST-inclusive paise per unit). */
  proposedPaise: number | null
  /** Their live approved price for the item, from another row; null when they have none. */
  currentApprovedPaise: number | null
  /** The city's suggested price; never charged, null when none is set. */
  suggestedPaise: number | null
  submittedAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  reason: string | null
}

/** One AdminProPrice row, read without trusting its shape. */
export function readProPrice(row: Row): ProPriceView {
  return {
    id: str(row.id),
    proId: str(row.pro_id),
    proName: str(row.pro_display_name) ?? "Professional",
    proStatus: str(row.pro_status),
    city: str(row.city_code),
    serviceName: str(row.service_name) ?? "Service",
    categorySlug: str(row.category_slug),
    itemKind: str(row.item_kind),
    itemName: str(row.item_name) ?? "Item",
    unit: str(row.unit),
    status: str(row.status),
    proposedPaise: num(row.price_paise),
    currentApprovedPaise: num(row.current_approved_paise),
    suggestedPaise: num(row.suggested_price_paise),
    submittedAt: str(row.submitted_at),
    reviewedAt: str(row.reviewed_at),
    reviewedBy: str(row.reviewed_by),
    reason: str(row.reason),
  }
}

/** "Occupied kitchen (add-on)" style item label: options read bare. */
export const priceItemLabel = (v: Pick<ProPriceView, "itemName" | "itemKind">) => (v.itemKind === "addon" ? `${v.itemName} (add-on)` : v.itemName)

/**
 * The proposed price against another (current approved, or suggested):
 * "+₹100.00 (+5.6%)", "−₹50.00 (−3.1%)", "Same". Null when either is missing.
 */
export function priceDelta(proposedPaise: number | null, basePaise: number | null): { paise: number; label: string; tone: Tone } | null {
  if (proposedPaise === null || basePaise === null) return null
  const diff = Math.round(proposedPaise - basePaise)
  if (diff === 0) return { paise: 0, label: "Same", tone: "normal" }
  const sign = diff > 0 ? "+" : "−"
  const pct = basePaise > 0 ? ` (${sign}${(Math.abs(diff) / basePaise * 100).toFixed(1)}%)` : ""
  return { paise: diff, label: `${sign}${formatPaise(Math.abs(diff))}${pct}`, tone: diff > 0 ? "warn" : "normal" }
}

/** What the reviewer should know before deciding: the professional's own status, what stays live meanwhile, a missing suggested price. */
export function priceReviewNotes(v: ProPriceView): string[] {
  const notes: string[] = []
  if (v.proStatus !== "approved") notes.push(`The professional is ${humanise(v.proStatus).toLowerCase()}: the price is only bookable once they are approved.`)
  if (v.currentApprovedPaise === null) notes.push("This is their first price for this item; nothing is live for it until you approve.")
  else notes.push(`Their approved price ${formatPaise(v.currentApprovedPaise)} stays live until you decide.`)
  if (v.suggestedPaise === null) notes.push("The city has no suggested price for this item.")
  return notes
}

/** Today in India (where every Doorstep city is) as YYYY-MM-DD. */
export function indiaToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const isLiveBooking = (status: unknown) => LIVE_BOOKINGS.includes(str(status) ?? "")
export const isEndedBooking = (status: unknown) => ENDED_BOOKINGS.includes(str(status) ?? "")

/** Ops may cancel until the visit starts (no cancel after the start OTP). */
export function canCancelBooking(status: unknown): boolean {
  const s = str(status) ?? ""
  return s !== "" && !isEndedBooking(s) && s !== "in_progress" && s !== "awaiting_extras_payment"
}

/**
 * Ops may take the job off the professional (the customer then picks
 * another) from confirmed, assigned, en route or arrived (doorstep-service
 * adminRedispatchable, B1): never once the visit has started, and not while
 * the booking already waits for the customer's pick.
 */
export function canRedispatch(status: unknown): boolean {
  const s = str(status)
  return s === "confirmed" || s === "assigned" || s === "en_route" || s === "arrived"
}

/**
 * Professionals to leave off the customer's list, typed one per line or
 * comma-separated: full ids only, at most 50 (AdminRedispatchInput). Blank
 * is none; a repeated id is sent once.
 */
export function parseExcludeIds(raw: string): { ok: true; ids: string[] } | { ok: false; problem: string } {
  const parts = raw
    .split(/[\s,]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  const bad = parts.find((p) => !isUuid(p))
  if (bad !== undefined) return { ok: false, problem: `Not a full professional id: ${bad}` }
  const ids = [...new Set(parts)]
  if (ids.length > 50) return { ok: false, problem: "Exclude at most 50 professionals." }
  return { ok: true, ids }
}

// --- B1: the professional is gone; the customer picks another -------------------

export const UNAVAILABLE_CAUSE_LABELS: Record<string, string> = {
  declined: "The professional declined the offer",
  offer_expired: "The offer expired without an answer",
  pro_cancel: "The professional gave the job back",
  not_on_duty: "The professional was not on duty in time",
  pro_no_show: "The professional did not arrive",
  ops_redispatch: "Ops took the job off the professional",
  no_professional: "No professional was available",
}

export const unavailableCauseLabel = (cause: unknown) => {
  const c = str(cause)
  return c ? (UNAVAILABLE_CAUSE_LABELS[c] ?? humanise(c)) : "No cause recorded"
}

export interface ProUnavailableView {
  cause: string | null
  causeLabel: string
  /** When the customer must have picked another professional or cancelled; null when the server sent none. */
  deadline: string | null
  /** Whole minutes left (0 once passed); null without a deadline. */
  minutesLeft: number | null
  overdue: boolean
}

/**
 * The pro_unavailable panel: why the professional is gone and by when the
 * customer must choose. Null for any other status. Past the deadline the
 * server cancels it with a full refund; until its worker runs, the booking
 * still reads pro_unavailable, so the console says the refund is due.
 */
export function readProUnavailable(booking: Row | null, now = new Date()): ProUnavailableView | null {
  if (!booking || str(booking.status) !== "pro_unavailable") return null
  const deadline = str(booking.choice_deadline)
  const ms = deadline ? Date.parse(deadline) : NaN
  const minutesLeft = Number.isNaN(ms) ? null : Math.max(0, Math.ceil((ms - now.getTime()) / 60_000))
  return {
    cause: str(booking.unavailable_cause),
    causeLabel: unavailableCauseLabel(booking.unavailable_cause),
    deadline: Number.isNaN(ms) ? null : deadline,
    minutesLeft,
    overdue: !Number.isNaN(ms) && ms <= now.getTime(),
  }
}

/** The sentence under the cause. */
export function proUnavailableMessage(view: ProUnavailableView): string {
  if (view.deadline === null) return "Waiting for the customer to pick another professional or cancel. No choice deadline was recorded."
  if (view.overdue) return "The customer's time to choose has passed: the booking is cancelled with a full refund."
  return `Waiting for the customer to pick another professional or cancel (${view.minutesLeft} min left). With no choice, the booking is cancelled with a full refund. Nobody is assigned without the customer's choice.`
}

export interface PendingChangeView {
  id: string | null
  status: string | null
  proId: string | null
  proFirstName: string | null
  asap: boolean
  slotStart: string | null
  slotEnd: string | null
  previousTotalPaise: number | null
  newTotalPaise: number | null
  /** New minus previous: above zero is charged to the customer, below zero refunded. */
  differencePaise: number | null
  refundPaise: number | null
  holdExpiresAt: string | null
  paymentStatus: string | null
  createdAt: string | null
}

/** One ProChange (booking.pending_change, or a row of the detail's pro_changes); null when absent. */
export function readProChange(raw: unknown): PendingChangeView | null {
  if (!isRecord(raw)) return null
  const intent = isRecord(raw.payment_intent) ? raw.payment_intent : null
  return {
    id: str(raw.id),
    status: str(raw.status),
    proId: str(raw.pro_id),
    proFirstName: str(raw.pro_first_name),
    asap: raw.asap === true,
    slotStart: str(raw.slot_start),
    slotEnd: str(raw.slot_end),
    previousTotalPaise: num(raw.previous_total_paise),
    newTotalPaise: num(raw.new_total_paise),
    differencePaise: num(raw.difference_paise),
    refundPaise: num(raw.refund_paise),
    holdExpiresAt: str(raw.hold_expires_at),
    paymentStatus: intent ? str(intent.status) : null,
    createdAt: str(raw.created_at),
  }
}

/** "Charge ₹150.00 more", "Refund ₹100.00", "Same price". */
export function changeDifferenceLabel(differencePaise: number | null): string {
  if (differencePaise === null) return "—"
  if (differencePaise > 0) return `Charge ${formatPaise(differencePaise)} more`
  if (differencePaise < 0) return `Refund ${formatPaise(-differencePaise)}`
  return "Same price"
}

/** The sentence for a change waiting for the customer's payment. */
export function pendingChangeMessage(change: PendingChangeView): string {
  const who = change.proFirstName ?? "another professional"
  const diff = change.differencePaise !== null && change.differencePaise > 0 ? `the ${formatPaise(change.differencePaise)} difference` : "the difference"
  return `The customer picked ${who} and owes ${diff}. The change applies only when the signed payment event arrives. If the hold lapses unpaid, the change is abandoned and the customer can still choose until the deadline.`
}

export const PRO_CHANGE_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Waiting for payment",
  applied: "Applied",
  abandoned: "Abandoned",
}

export const proChangeTone = (status: unknown): Tone => {
  const s = str(status)
  return s === "applied" ? "good" : s === "pending_payment" ? "warn" : "normal"
}

export type RefundPayment = "booking" | "extras"

const REF_TYPE: Record<RefundPayment, string> = { booking: "doorstep_booking", extras: "doorstep_extras" }

/**
 * What can still be refunded on one payment kind: captured payments of that
 * kind less the refunds against them that have not failed. Never below zero.
 */
export function refundRoom(detail: Row | null, kind: RefundPayment): number {
  const payments = detailRows(detail, "payments").filter((p) => str(p.reference_type) === REF_TYPE[kind])
  const captured = payments.filter((p) => ["succeeded", "partially_refunded", "refunded"].includes(str(p.status) ?? ""))
  const ids = new Set(captured.map((p) => str(p.payment_id)).filter(Boolean))
  const paid = captured.reduce((sum, p) => sum + (num(p.amount_paise) ?? 0), 0)
  const refunded = detailRows(detail, "refunds")
    .filter((r) => ids.has(str(r.payment_id)) && str(r.status) !== "failed")
    .reduce((sum, r) => sum + (num(r.amount_paise) ?? 0), 0)
  return Math.max(0, Math.round(paid - refunded))
}

/** The refund amount typed (required: the contract takes no "whole remainder"), checked against the room. */
export function checkDoorstepRefund(text: string, roomPaise: number): { ok: true; amountPaise: number } | { ok: false; problem: string } {
  if (roomPaise <= 0) return { ok: false, problem: "Nothing is left to refund on this payment." }
  const amount = parseRupeeInput(text)
  if (amount === null) return { ok: false, problem: "Enter a rupee amount above zero, with at most two decimals." }
  if (amount > roomPaise) return { ok: false, problem: `At most ${formatPaise(roomPaise)} can still be refunded.` }
  return { ok: true, amountPaise: amount }
}

export const refundBody = (amountPaise: number, reason: string, payment: RefundPayment) => ({ amount_paise: amountPaise, reason, payment })

/**
 * The parts of AdminBookingDetail the console shows, read without trusting
 * the shape. The booking's start and end OTPs are dropped here whatever the
 * server sends (the contract says they are always null for admins): no
 * admin screen ever holds an OTP value.
 */
export interface AdminBookingView {
  booking: Row
  customerUserId: string | null
  /** The professional whose calendar holds the slot (dispatch offers to them first); null when none is reserved. */
  reservedProId: string | null
  /** Money did not match (amount, payer, intent or currency) or a refund failed; the booking was never confirmed from it. */
  needsAttention: boolean
  attentionReason: string | null
  /** B1: professionals the customer may not pick again (they let it go, or ops excluded them). */
  excludedProIds: string[]
  /** B1: every change of professional, oldest first. */
  proChanges: PendingChangeView[]
  /** B1: a dearer change waiting for the customer's payment (booking.pending_change). */
  pendingChange: PendingChangeView | null
}

const OTP_KEYS = ["start_otp", "end_otp"] as const

export function readAdminBooking(detail: Row | null): AdminBookingView | null {
  if (!detail || !isRecord(detail.booking)) return null
  const booking: Row = { ...detail.booking }
  for (const key of OTP_KEYS) delete booking[key]
  return {
    booking,
    customerUserId: str(detail.customer_user_id),
    reservedProId: str(detail.reserved_pro_id),
    needsAttention: detail.needs_attention === true,
    attentionReason: str(detail.attention_reason),
    excludedProIds: Array.isArray(detail.excluded_pro_ids) ? detail.excluded_pro_ids.filter((x): x is string => typeof x === "string" && x !== "") : [],
    proChanges: Array.isArray(detail.pro_changes) ? detail.pro_changes.map(readProChange).filter((c): c is PendingChangeView => c !== null) : [],
    pendingChange: readProChange(booking.pending_change),
  }
}

/** The sentence the attention banner shows; null when the booking is not flagged. */
export function attentionMessage(view: Pick<AdminBookingView, "needsAttention" | "attentionReason">): string | null {
  if (!view.needsAttention) return null
  return view.attentionReason ?? "Flagged without a recorded reason. Check the payments and refunds below before acting."
}

/** "admin_cancel" and "admin_<key hash>" are ops causes; the rest read as written. */
export function refundCauseLabel(cause: unknown): string {
  const c = str(cause) ?? ""
  if (c === "admin_cancel") return "Ops cancellation"
  if (/^admin_[0-9a-f]{8,}$/.test(c)) return "Ops refund"
  return humanise(c)
}

/**
 * The optional fee an ops cancel keeps, typed in rupees: blank sends none
 * (the customer is refunded everything refundable), 0 keeps nothing, and a
 * fee may not exceed what was captured and not already refunded (the server
 * caps it there; the console refuses rather than silently capping).
 */
export function checkCancelFee(text: string, roomPaise: number): { ok: true; feePaise: number | null } | { ok: false; problem: string } {
  const fee = rupeesOrZero(text.trim())
  if (fee === null) return { ok: true, feePaise: null }
  if (fee === undefined) return { ok: false, problem: "Enter a rupee amount of zero or more, with at most two decimals, or leave it blank." }
  if (fee > Math.max(0, roomPaise)) {
    return { ok: false, problem: roomPaise > 0 ? `At most ${formatPaise(roomPaise)} (captured and not refunded) can be kept.` : "Nothing captured is left to keep as a fee." }
  }
  return { ok: true, feePaise: fee }
}

/** The ops cancel body: the reason always; fee_paise only when a fee was typed. */
export const cancelBody = (reason: string, feePaise: number | null) => (feePaise === null ? { reason } : { reason, fee_paise: feePaise })

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type FormValues = Record<string, string | boolean>
export type FormCheck = { ok: true; body: Record<string, unknown> } | { ok: false; problems: string[] }

const text = (v: FormValues, k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "")
const flag = (v: FormValues, k: string) => v[k] === true
const done = (problems: string[], body: Record<string, unknown>): FormCheck => (problems.length > 0 ? { ok: false, problems } : { ok: true, body })

/** A whole number within [min, max]; "" → null (not given); otherwise undefined (wrong). */
function whole(raw: string, min: number, max: number): number | null | undefined {
  if (raw === "") return null
  if (!/^-?\d+$/.test(raw)) return undefined
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : undefined
}

/** Rupees that may be zero: "" → null, "0" → 0, "75" → 7500; negative or malformed → undefined. */
function rupeesOrZero(raw: string): number | null | undefined {
  const clean = raw.replace(/[₹,\s]/g, "")
  if (clean === "") return null
  if (/^0+(\.0{1,2})?$/.test(clean)) return 0
  return parseRupeeInput(clean) ?? undefined
}

/**
 * One integer field: required ones must be present; `partial` (an edit)
 * leaves blank ones out. Adds the problem or the value.
 */
function intField(v: FormValues, key: string, label: string, min: number, max: number, body: Record<string, unknown>, problems: string[], required = false) {
  const n = whole(text(v, key), min, max)
  if (n === undefined) problems.push(`${label} must be a whole number from ${min} to ${max}.`)
  else if (n === null) {
    if (required) problems.push(`${label} is required.`)
  } else body[key] = n
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SKILL_CODE = /^[a-z][a-z0-9_]{1,47}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (India time) as RFC 3339; anything else null. */
export function indiaTime(raw: string): string | null {
  const t = raw.trim()
  if (DAY.test(t)) return `${t}T00:00:00+05:30`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return `${t}:00+05:30`
  return null
}

// --- Prices: a new row, never an edit ---------------------------------------

/** The open price row (no end) for one item in one city, or null. */
export function openPriceRow(rows: Row[], city: string, itemId: string): Row | null {
  return rows.find((r) => str(r.city_code) === city && str(r.item_id) === itemId && r.effective_to === null) ?? null
}

/** A price history, newest start first. */
export function priceHistory(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (str(b.effective_from) ?? "").localeCompare(str(a.effective_from) ?? ""))
}

/**
 * A new price row: GST-inclusive rupees above zero, an MRP (if any) not
 * below it, and a start that is neither in the past nor before the open
 * row's start (the server refuses an overlap). Blank start means now.
 */
export function checkPrice(v: FormValues, openRow: Row | null, now = new Date()): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  const city = cityCode(text(v, "city_code"))
  if (!city) problems.push("City must be a three-letter city code, e.g. HYD.")
  else body.city_code = city
  const kind = text(v, "item_kind")
  if (kind !== "option" && kind !== "addon") problems.push("Choose whether this prices an option or an add-on.")
  else body.item_kind = kind
  const item = text(v, "item_id")
  if (!isUuid(item)) problems.push("Item must be the option's or add-on's full id.")
  else body.item_id = item.toLowerCase()
  const price = parseRupeeInput(text(v, "price"))
  if (price === null) problems.push("Price must be a rupee amount above zero (GST included).")
  else body.price_paise = price
  if (text(v, "mrp") !== "") {
    const mrp = parseRupeeInput(text(v, "mrp"))
    if (mrp === null) problems.push("MRP must be a rupee amount above zero, or blank.")
    else if (price !== null && mrp < price) problems.push("MRP cannot be below the price.")
    else body.mrp_paise = mrp
  }
  const fromRaw = text(v, "effective_from")
  if (fromRaw !== "") {
    const from = indiaTime(fromRaw)
    if (!from) problems.push("Start must be a date, or a date and time.")
    else {
      const ms = Date.parse(from)
      if (ms < now.getTime() - 60_000) problems.push("A new price cannot start in the past; leave the start blank for now.")
      const openFrom = openRow ? Date.parse(str(openRow.effective_from) ?? "") : NaN
      if (!Number.isNaN(openFrom) && ms <= openFrom) problems.push("A new price must start after the current price's start.")
      body.effective_from = from
    }
  }
  return done(problems, body)
}

// --- Rate cards ---------------------------------------------------------------

export function checkRateCard(v: FormValues, { partial = false } = {}): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    const city = cityCode(text(v, "city_code"))
    if (!city) problems.push("City must be a three-letter city code, e.g. HYD.")
    else body.city_code = city
    if (!isUuid(text(v, "category_id"))) problems.push("Choose a category.")
    else body.category_id = text(v, "category_id").toLowerCase()
    if (!SKILL_CODE.test(text(v, "code"))) problems.push("Code must be 2–48 lower-case letters, digits or _, starting with a letter.")
    else body.code = text(v, "code")
  }
  if (!partial || text(v, "name")) {
    if (text(v, "name").length < 2) problems.push("The item needs a name.")
    else body.name = text(v, "name")
  }
  if (text(v, "description")) body.description = text(v, "description")
  const unit = text(v, "unit")
  if (unit) {
    if (!(RATE_CARD_UNITS as readonly string[]).includes(unit)) problems.push("Choose a unit.")
    else body.unit = unit
  } else if (!partial) problems.push("Choose a unit.")
  if (!partial || text(v, "price")) {
    const price = parseRupeeInput(text(v, "price"))
    if (price === null) problems.push("Price must be a rupee amount above zero (GST included).")
    else body.price_paise = price
  }
  intField(v, "max_quantity", "Maximum quantity", 1, 100, body, problems)
  if (typeof v.is_part === "boolean") body.is_part = v.is_part
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  if (partial && Object.keys(body).length === 0) problems.push("Change at least one field.")
  return done(problems, body)
}

// --- Catalogue -----------------------------------------------------------------

/**
 * A category. Salon is gendered by the founder's rule: a beauty/salon
 * category is women-only or men-only, never "any", and takes catalogue
 * add-ons only as extras (no rate card).
 */
export function checkCategory(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!SLUG.test(text(v, "slug"))) problems.push("Slug must be lower-case words joined by hyphens, e.g. ac-repair.")
  else body.slug = text(v, "slug")
  if (text(v, "name").length < 2) problems.push("The category needs a name.")
  else body.name = text(v, "name")
  if (text(v, "description")) body.description = text(v, "description")
  const family = text(v, "family")
  if (!(FAMILIES as readonly string[]).includes(family)) problems.push("Choose a family (it decides the GST category).")
  else body.family = family
  const gender = text(v, "gender_rule") || "any"
  if (!(GENDER_RULES as readonly string[]).includes(gender)) problems.push("Choose who may serve it.")
  else body.gender_rule = gender
  const extras = text(v, "extras_policy") || "rate_card"
  if (!(EXTRAS_POLICIES as readonly string[]).includes(extras)) problems.push("Choose an extras policy.")
  else body.extras_policy = extras
  if (family === "BEAUTY_SALON") {
    if (gender === "any") problems.push("A salon category is for women professionals only or men professionals only.")
    if (extras !== "catalogue_addons_only") problems.push("A salon category allows catalogue add-ons only as extras.")
  }
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  body.active = flag(v, "active")
  return done(problems, body)
}

export function checkSkill(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!SKILL_CODE.test(text(v, "code"))) problems.push("Code must be 2–48 lower-case letters, digits or _, starting with a letter.")
  else body.code = text(v, "code")
  if (text(v, "name").length < 2) problems.push("The skill needs a name.")
  else body.name = text(v, "name")
  if (text(v, "description")) body.description = text(v, "description")
  return done(problems, body)
}

const lines = (raw: string) => raw.split("\n").map((l) => l.trim()).filter(Boolean)

/** A service. Crew bookings are off at launch, so a service is always one professional. */
export function checkService(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!isUuid(text(v, "category_id"))) problems.push("Choose a category.")
  else body.category_id = text(v, "category_id").toLowerCase()
  if (!SLUG.test(text(v, "slug"))) problems.push("Slug must be lower-case words joined by hyphens.")
  else body.slug = text(v, "slug")
  if (text(v, "name").length < 2) problems.push("The service needs a name.")
  else body.name = text(v, "name")
  if (text(v, "description")) body.description = text(v, "description")
  intField(v, "duration_minutes", "Duration (minutes)", 15, 720, body, problems, true)
  if (!SKILL_CODE.test(text(v, "required_skill"))) problems.push("Choose the skill a professional needs.")
  else body.required_skill = text(v, "required_skill")
  if (text(v, "inclusions")) body.inclusions = lines(text(v, "inclusions"))
  if (text(v, "exclusions")) body.exclusions = lines(text(v, "exclusions"))
  body.crew_size = 1
  intField(v, "min_before_photos", "Photos before", 0, 10, body, problems)
  intField(v, "min_after_photos", "Photos after", 0, 10, body, problems)
  intField(v, "rework_days", "Rework window (days)", 0, 90, body, problems)
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  body.active = flag(v, "active")
  return done(problems, body)
}

export function checkOption(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (text(v, "name").length < 1) problems.push("The option needs a name.")
  else body.name = text(v, "name")
  if (text(v, "description")) body.description = text(v, "description")
  intField(v, "duration_minutes", "Duration (minutes)", 0, 720, body, problems, true)
  intField(v, "max_quantity", "Maximum quantity", 1, 50, body, problems)
  body.is_default = flag(v, "is_default")
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  body.active = flag(v, "active")
  return done(problems, body)
}

/** An add-on group: at least one pick allowed, the minimum not above the maximum, a required group needs a pick. */
export function checkAddonGroup(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (text(v, "name").length < 1) problems.push("The group needs a name.")
  else body.name = text(v, "name")
  const min = whole(text(v, "min_select") || "0", 0, 50)
  const max = whole(text(v, "max_select"), 1, 50)
  if (min === undefined || min === null) problems.push("Minimum picks must be a whole number from 0 to 50.")
  if (max === undefined || max === null) problems.push("Maximum picks must be a whole number from 1 to 50.")
  if (typeof min === "number" && typeof max === "number") {
    if (min > max) problems.push("Minimum picks cannot be above the maximum.")
    body.min_select = min
    body.max_select = max
  }
  body.is_required = flag(v, "is_required")
  if (flag(v, "is_required") && typeof min === "number" && min < 1) problems.push("A required group needs a minimum of at least one pick.")
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  body.active = flag(v, "active")
  return done(problems, body)
}

export function checkAddon(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (text(v, "name").length < 1) problems.push("The add-on needs a name.")
  else body.name = text(v, "name")
  if (text(v, "description")) body.description = text(v, "description")
  intField(v, "extra_duration_minutes", "Extra minutes", 0, 240, body, problems)
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  body.active = flag(v, "active")
  return done(problems, body)
}

// --- Config ----------------------------------------------------------------------

const CITY_NUMBERS = [
  ["extras_grace_minutes", "Extras grace (minutes)", 0, 240],
  ["max_jobs_per_day", "Max jobs per professional per day", 1, 20],
  ["offer_window_far_minutes", "Offer window, far slots (minutes)", 1, 1440],
  ["offer_window_near_minutes", "Offer window, near slots (minutes)", 1, 240],
  ["offer_far_threshold_minutes", "A slot is far after (minutes)", 1, 10_080],
] as const

/** A city; an edit (`partial`) leaves blank numbers out and cannot change the code. */
export function checkCity(v: FormValues, { partial = false } = {}): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    const code = cityCode(text(v, "code"))
    if (!code) problems.push("Code must be three capital letters, e.g. HYD.")
    else body.code = code
  }
  if (!partial || text(v, "name")) {
    if (text(v, "name").length < 2) problems.push("The city needs a name.")
    else body.name = text(v, "name")
  }
  if (!partial || text(v, "state_code")) {
    if (!/^\d{2}$/.test(text(v, "state_code"))) problems.push("GST state code must be two digits, e.g. 36 for Telangana.")
    else body.state_code = text(v, "state_code")
  }
  if (text(v, "extras_threshold") !== "") {
    const p = parseRupeeInput(text(v, "extras_threshold"))
    if (p === null) problems.push("Extras charged-at-approval threshold must be a rupee amount above zero.")
    else body.extras_charge_now_threshold_paise = p
  }
  for (const [key, label, min, max] of CITY_NUMBERS) intField(v, key, label, min, max, body, problems)
  if (typeof v.active === "boolean") body.active = v.active
  if (partial && Object.keys(body).length === 0) problems.push("Change at least one field.")
  return done(problems, body)
}

/** A GeoJSON Polygon or MultiPolygon, [lng, lat]; the server validates the geometry, this refuses the obviously wrong. */
export function parseBoundary(raw: string): { type: "Polygon" | "MultiPolygon"; coordinates: unknown[] } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const type = parsed.type
  if ((type !== "Polygon" && type !== "MultiPolygon") || !Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0) return null
  return { type, coordinates: parsed.coordinates }
}

export function checkZone(v: FormValues): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  const city = cityCode(text(v, "city_code"))
  if (!city) problems.push("City must be a three-letter city code.")
  else body.city_code = city
  if (text(v, "name").length < 2) problems.push("The zone needs a name.")
  else body.name = text(v, "name")
  if (!SLUG.test(text(v, "slug"))) problems.push("Slug must be lower-case words joined by hyphens.")
  else body.slug = text(v, "slug")
  const boundary = parseBoundary(text(v, "boundary"))
  if (!boundary) problems.push("Boundary must be GeoJSON: {\"type\": \"Polygon\", \"coordinates\": [[[lng, lat], …]]}.")
  else body.boundary = boundary
  intField(v, "travel_buffer_minutes", "Travel buffer (minutes)", 0, 180, body, problems)
  body.active = flag(v, "active")
  return done(problems, body)
}

export function checkSlotConfig(v: FormValues, { partial = false } = {}): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    const city = cityCode(text(v, "city_code"))
    if (!city) problems.push("City must be a three-letter city code.")
    else body.city_code = city
    if (text(v, "category_id")) {
      if (!isUuid(text(v, "category_id"))) problems.push("Category must be a category, or blank for the city default.")
      else body.category_id = text(v, "category_id").toLowerCase()
    }
  }
  const open = text(v, "open_time")
  const close = text(v, "close_time")
  if (!partial || open || close) {
    if (!HHMM.test(open) || !HHMM.test(close)) problems.push("Opening and closing must be times of day (HH:MM).")
    else if (open >= close) problems.push("Closing must be after opening.")
    else {
      body.open_time = open
      body.close_time = close
    }
  }
  intField(v, "slot_step_minutes", "Slot step (minutes)", 5, 240, body, problems)
  intField(v, "min_lead_minutes", "Earliest slot ahead (minutes)", 0, 2880, body, problems)
  intField(v, "horizon_days", "Days ahead shown", 1, 60, body, problems)
  intField(v, "hold_minutes", "Checkout hold (minutes)", 1, 60, body, problems)
  if (typeof v.active === "boolean") body.active = v.active
  if (partial && Object.keys(body).length === 0) problems.push("Change at least one field.")
  return done(problems, body)
}

/** A cancellation rule: the fee may be zero (free); a rule that forbids cancelling charges nothing. */
export function checkCancellationRule(v: FormValues, { partial = false } = {}): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    const city = cityCode(text(v, "city_code"))
    if (!city) problems.push("City must be a three-letter city code.")
    else body.city_code = city
    if (text(v, "category_id")) {
      if (!isUuid(text(v, "category_id"))) problems.push("Category must be a category, or blank for the city default.")
      else body.category_id = text(v, "category_id").toLowerCase()
    }
    const stage = text(v, "stage")
    if (!(CANCEL_STAGES as readonly string[]).includes(stage)) problems.push("Choose the booking stage the rule applies to.")
    else body.stage = stage
  }
  intField(v, "minutes_before_lt", "Less than (minutes before the slot)", 0, 10_080, body, problems)
  const fee = rupeesOrZero(text(v, "fee"))
  if (fee === undefined) problems.push("Fee must be a rupee amount of zero or more.")
  else if (fee === null) {
    if (!partial) problems.push("Fee is required (0 for free).")
  } else body.fee_paise = fee
  if (typeof v.allowed === "boolean") {
    body.allowed = v.allowed
    if (!v.allowed && typeof body.fee_paise === "number" && body.fee_paise > 0) problems.push("A stage where cancelling is not allowed charges no fee.")
  }
  intField(v, "sort_order", "Sort order", 0, 10_000, body, problems)
  if (typeof v.active === "boolean") body.active = v.active
  if (partial && Object.keys(body).length === 0) problems.push("Change at least one field.")
  return done(problems, body)
}

/** "15" or "12.5" per cent → basis points within the contract's 0–5000 (0–50%). */
export function percentToBps(raw: string): number | null {
  const t = raw.trim().replace(/%$/, "")
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const bps = Math.round(Number(t) * 100)
  return bps >= 0 && bps <= 5000 ? bps : null
}

export function checkCommissionRule(v: FormValues, { partial = false } = {}): FormCheck {
  const problems: string[] = []
  const body: Record<string, unknown> = {}
  if (!partial) {
    const city = cityCode(text(v, "city_code"))
    if (!city) problems.push("City must be a three-letter city code.")
    else body.city_code = city
    if (text(v, "category_id")) {
      if (!isUuid(text(v, "category_id"))) problems.push("Category must be a category, or blank for every category.")
      else body.category_id = text(v, "category_id").toLowerCase()
    }
  }
  if (!partial || text(v, "percent")) {
    const bps = percentToBps(text(v, "percent"))
    if (bps === null) problems.push("Commission must be a percentage from 0 to 50.")
    else body.commission_bps = bps
  }
  if (!partial && text(v, "effective_from")) {
    const from = indiaTime(text(v, "effective_from"))
    if (!from) problems.push("Start must be a date.")
    else body.effective_from = from
  }
  if (text(v, "effective_to")) {
    const to = indiaTime(text(v, "effective_to"))
    if (!to) problems.push("End must be a date.")
    else if (body.effective_from && to <= String(body.effective_from)) problems.push("End must be after the start.")
    else body.effective_to = to
  }
  if (typeof v.active === "boolean") body.active = v.active
  if (partial && Object.keys(body).length === 0) problems.push("Change at least one field.")
  return done(problems, body)
}

/** "HYD · AC service" style label for a row's optional category: blank category means the city default. */
export function scopeLabel(row: Row, categoryName: (id: string) => string | null): string {
  const category = str(row.category_id)
  return `${str(row.city_code) ?? "—"} · ${category ? (categoryName(category) ?? category.slice(0, 8)) : "City default"}`
}
