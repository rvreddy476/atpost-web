import { isUuid, str } from "./data"
import { newIdempotencyKey } from "./mutation"

/**
 * Trust & safety rules the screens show before the server applies them.
 * trust-safety-service decides; these only choose defaults and hints.
 */
export const TRUST = "/v1/admin/trust"

// --- grievances (IT Rules: 15-day resolution window, `due_at`) ---

export interface GrievanceFilter {
  /** On by default: the officer's first job is what is already late. */
  overdueOnly: boolean
  /** Ignored while overdueOnly is on (the server refuses both together). */
  status: string
}

export const INITIAL_GRIEVANCE_FILTER: GrievanceFilter = { overdueOnly: true, status: "" }

export const GRIEVANCE_STATUSES = ["open", "acknowledged", "resolved", "rejected"] as const

export function grievanceListUrl(filter: GrievanceFilter, offset = 0, limit = 50): string {
  const q = new URLSearchParams()
  if (filter.overdueOnly) q.set("overdue", "true")
  else if (filter.status) q.set("status", filter.status)
  q.set("limit", String(limit))
  q.set("offset", String(offset))
  return `${TRUST}/grievances?${q.toString()}`
}

const DAY = 24 * 60 * 60 * 1000

export type DueState = "overdue" | "due_soon" | "on_time" | "closed" | "unknown"

/** Overdue past `due_at`; due soon within 48 hours; closed once resolved or rejected. */
export function grievanceDueState(grievance: { status?: unknown; due_at?: unknown }, now: number): DueState {
  const status = str(grievance.status)
  if (status === "resolved" || status === "rejected") return "closed"
  const due = str(grievance.due_at)
  const ms = due ? Date.parse(due) : NaN
  if (Number.isNaN(ms)) return "unknown"
  if (ms < now) return "overdue"
  if (ms - now <= 2 * DAY) return "due_soon"
  return "on_time"
}

/** Closing a grievance (resolved or rejected) needs a fresh step-up. */
export const grievanceNeedsStepUp = (status: string) => status === "resolved" || status === "rejected"

/** What a grievance may move to from its current status. */
export function nextGrievanceStatuses(status: unknown): string[] {
  switch (str(status)) {
    case "open":
      return ["acknowledged", "resolved", "rejected"]
    case "acknowledged":
      return ["resolved", "rejected"]
    default:
      return []
  }
}

// --- appeals ---

export const APPEAL_STATUSES = ["open", "under_review", "upheld", "overturned"] as const

/** Overturning an appeal reverses an enforcement: it needs a fresh step-up. */
export const appealNeedsStepUp = (status: string) => status === "overturned"

export function nextAppealStatuses(status: unknown): string[] {
  switch (str(status)) {
    case "open":
      return ["under_review", "upheld", "overturned"]
    case "under_review":
      return ["upheld", "overturned"]
    default:
      return []
  }
}

// --- reports ---

export function nextReportStatuses(status: unknown): string[] {
  switch (str(status)) {
    case "open":
      return ["reviewing"]
    case "reviewing":
      return ["resolved", "dismissed"]
    case "resolved":
      return ["dismissed"]
    default:
      return []
  }
}

// --- strikes ---
//
// trust-safety issues and voids strikes on admin-service token routes
// (POST /strikes, POST /strikes/:userId/void); admin-service checks
// trust_safety:strikes.manage and a fresh step-up, and forwards the body.
// GET /strikes/:userId lists ACTIVE strikes only, so a voided or expired row
// is seen here only when the server starts returning them; the presentation
// handles all three states regardless.

export const STRIKE_SEVERITIES = ["warning", "strike", "severe_strike"] as const
export type StrikeSeverity = (typeof STRIKE_SEVERITIES)[number]

/** trust-safety's limit on idempotency_key (a UUID is 36). */
export const MAX_STRIKE_IDEMPOTENCY_KEY = 200

export const strikesUrl = (userId: string) => `${TRUST}/strikes/${encodeURIComponent(userId)}`
export const strikeIssueUrl = () => `${TRUST}/strikes`
export const strikeVoidUrl = (userId: string) => `${TRUST}/strikes/${encodeURIComponent(userId)}/void`

export interface IssueStrikeForm {
  userId: string
  severity: string
  reason: string
  /** Optional: the content the strike is for (a UUID) and what kind it is. */
  contentId: string
  contentType: string
}

export const emptyIssueStrike = (userId: string): IssueStrikeForm => ({ userId, severity: "strike", reason: "", contentId: "", contentType: "" })

const isSeverity = (value: string): value is StrikeSeverity => (STRIKE_SEVERITIES as readonly string[]).includes(value)

/**
 * Why the form cannot be sent yet, or null. The reason is the confirm
 * dialog's (destructive: at least ten characters), so it is not judged here.
 */
export function checkIssueStrike(form: IssueStrikeForm): string | null {
  if (!isUuid(form.userId)) return "Enter the user's id (a UUID)."
  if (!isSeverity(form.severity.trim().toLowerCase())) return "Choose a severity."
  const contentId = form.contentId.trim()
  if (contentId && !isUuid(contentId)) return "The content id must be a UUID, or left empty."
  if (form.contentType.trim().length > 64) return "Keep the content type under 64 characters."
  return null
}

/** The fields trust-safety receives, without the key; empty optionals are left out, never sent as "". */
function issueStrikeFields(form: IssueStrikeForm): Record<string, string> {
  const fields: Record<string, string> = {
    user_id: form.userId.trim(),
    severity: form.severity.trim().toLowerCase(),
    reason: form.reason.trim(),
  }
  const contentId = form.contentId.trim()
  const contentType = form.contentType.trim()
  if (contentId) fields.content_id = contentId
  if (contentType) fields.content_type = contentType
  return fields
}

/** The POST /strikes body. */
export function issueStrikeBody(form: IssueStrikeForm, idempotencyKey: string): Record<string, string> {
  return { ...issueStrikeFields(form), idempotency_key: idempotencyKey }
}

/**
 * One click, one key. The key is minted for the first send of a form and
 * reused for every retry of the SAME form (the step-up retry, or "Issue
 * strike" pressed again after a network error), so trust-safety answers 200
 * with the original strike instead of issuing a second one. A changed form
 * is a new action and gets a new key.
 */
export interface IssueStrikeAttempt {
  key: string
  fingerprint: string
}

export function issueStrikeAttempt(
  form: IssueStrikeForm,
  previous: IssueStrikeAttempt | null,
  makeKey: () => string = newIdempotencyKey,
): IssueStrikeAttempt {
  const fingerprint = JSON.stringify(issueStrikeFields(form))
  if (previous && previous.fingerprint === fingerprint) return previous
  return { key: makeKey(), fingerprint }
}

/** The POST /strikes/:userId/void body. */
export function voidStrikeBody(strikeId: string, reason: string): { strike_id: string; reason: string } {
  return { strike_id: strikeId.trim(), reason: reason.trim() }
}

export type StrikeState = "active" | "expired" | "voided"

/** Voided wins over expired; expired once `expires_at` has passed; active otherwise (an unreadable expiry counts as active). */
export function strikeState(strike: { voided_at?: unknown; expires_at?: unknown }, now: number): StrikeState {
  if (str(strike.voided_at)) return "voided"
  const expires = str(strike.expires_at)
  const ms = expires ? Date.parse(expires) : NaN
  if (!Number.isNaN(ms) && ms <= now) return "expired"
  return "active"
}

/** Only a strike that still counts can be voided; a voided one is a no-op the server answers 200 to. */
export const canVoidStrike = (strike: { voided_at?: unknown; expires_at?: unknown }) => !str(strike.voided_at)

export type StrikeTone = "bad" | "warn" | "good" | "normal"

export const STRIKE_STATE_TONE: Record<StrikeState, StrikeTone> = { active: "good", expired: "normal", voided: "normal" }

export function severityTone(severity: unknown): StrikeTone {
  switch (str(severity)) {
    case "severe_strike":
      return "bad"
    case "strike":
      return "warn"
    default:
      return "normal"
  }
}
