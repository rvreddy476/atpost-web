import { isUuid } from "./data"

/**
 * `GET /v1/admin/audit` filters, as the console holds them, and the query
 * string admin-service accepts:
 *
 *   ?app=food&actor=<uuid>&operation=food.order.cancel&outcome=denied
 *   &from=<RFC 3339>&to=<RFC 3339>&limit=50&cursor=<next_cursor>
 *
 * Dates are whole days in India time (where every app runs): `from` is the
 * start of the first day, `to` the start of the day after the last, so a
 * one-day range covers that whole day.
 */
export const AUDIT_OUTCOMES = ["success", "failure", "denied", "pending", "rejected"] as const

export interface AuditFilter {
  app: string
  actor: string
  operation: string
  outcome: string
  /** YYYY-MM-DD, or "" for no bound. */
  from: string
  to: string
}

export const EMPTY_AUDIT_FILTER: AuditFilter = { app: "", actor: "", operation: "", outcome: "", from: "", to: "" }

export const AUDIT_PAGE_SIZE = 50

const DAY = /^\d{4}-\d{2}-\d{2}$/
const IST = "+05:30"

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** A problem to show next to the filters, or null when they can be sent. */
export function auditFilterProblem(filter: AuditFilter): string | null {
  if (filter.actor.trim() && !isUuid(filter.actor)) return "Actor must be a full user id."
  if (filter.from && !DAY.test(filter.from)) return "The start date is not a date."
  if (filter.to && !DAY.test(filter.to)) return "The end date is not a date."
  if (filter.from && filter.to && filter.from > filter.to) return "The start date is after the end date."
  if (filter.operation.length > 120) return "Operation is too long."
  if (filter.outcome && !(AUDIT_OUTCOMES as readonly string[]).includes(filter.outcome)) return "Unknown outcome."
  return null
}

/** The query string (without "?"); filters that cannot be sent are left out rather than sent wrong. */
export function auditQueryString(filter: AuditFilter, cursor: string | null = null, limit = AUDIT_PAGE_SIZE): string {
  const q = new URLSearchParams()
  if (/^[a-z][a-z0-9_]{0,39}$/.test(filter.app)) q.set("app", filter.app)
  if (isUuid(filter.actor)) q.set("actor", filter.actor.trim().toLowerCase())
  const operation = filter.operation.trim()
  if (operation && operation.length <= 120) q.set("operation", operation)
  if ((AUDIT_OUTCOMES as readonly string[]).includes(filter.outcome)) q.set("outcome", filter.outcome)
  if (DAY.test(filter.from)) q.set("from", `${filter.from}T00:00:00${IST}`)
  if (DAY.test(filter.to)) q.set("to", `${nextDay(filter.to)}T00:00:00${IST}`)
  q.set("limit", String(limit))
  if (cursor) q.set("cursor", cursor)
  return q.toString()
}

/**
 * Keyset paging: the cursors of the pages already seen, so "Previous" can go
 * back. `cursors[i]` fetched page i (null for the first).
 */
export interface AuditPaging {
  cursors: (string | null)[]
}

export const firstAuditPage = (): AuditPaging => ({ cursors: [null] })

export const currentCursor = (p: AuditPaging) => p.cursors[p.cursors.length - 1]

export function nextAuditPage(p: AuditPaging, nextCursor: string | null | undefined): AuditPaging {
  return nextCursor ? { cursors: [...p.cursors, nextCursor] } : p
}

export function previousAuditPage(p: AuditPaging): AuditPaging {
  return p.cursors.length > 1 ? { cursors: p.cursors.slice(0, -1) } : p
}
