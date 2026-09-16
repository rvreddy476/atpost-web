import { str } from "./data"

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
