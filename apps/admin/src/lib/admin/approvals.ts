import { adminAppLabel, isAdminAppId } from "./apps"
import { formatPaise } from "./money"

/**
 * `GET /v1/admin/approvals` — two-person actions waiting for a second admin.
 *
 * The contract names the routes but not every field, so this reads the
 * obvious ones leniently and keeps the rest out of the UI rather than guessing.
 */
export interface ApprovalItem {
  id: string
  status: "pending" | "approved" | "rejected" | "expired" | "executed" | string
  app: string | null
  appLabel: string
  operation: string
  summary: string
  requestedBy: string | null
  requestedAt: string | null
  expiresAt: string | null
  reason: string | null
  targetType: string | null
  targetId: string | null
  requiredPermission: string | null
  /** The stored request, as far as the console shows it (see approvalDetails). */
  payload: Record<string, unknown>
  /** True when the server says this admin raised it (they cannot approve it). */
  requestedByMe: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)

export function parseApprovals(raw: unknown, myUserId: string | null): ApprovalItem[] {
  const body = isRecord(raw) ? raw.data : raw
  const list = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : []
  const out: ApprovalItem[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const id = str(item.id)
    if (!id) continue
    const app = str(item.app)
    const operation = str(item.operation) ?? str(item.action) ?? "action"
    const requestedBy = str(item.requested_by) ?? str(item.requester_id)
    out.push({
      id,
      status: str(item.status) ?? "pending",
      app,
      appLabel: app && isAdminAppId(app) ? adminAppLabel(app) : app ?? "Platform",
      operation,
      summary: str(item.summary) ?? str(item.description) ?? operation,
      requestedBy,
      requestedAt: str(item.requested_at) ?? str(item.created_at),
      expiresAt: str(item.expires_at),
      reason: str(item.reason) ?? str(item.requester_reason),
      targetType: str(item.target_type),
      targetId: str(item.target_id),
      requiredPermission: str(item.required_permission),
      payload: isRecord(item.payload) ? item.payload : {},
      requestedByMe: !!myUserId && requestedBy === myUserId,
    })
  }
  return out
}

/** Only a pending request raised by someone else can be decided here. */
export function canDecide(item: ApprovalItem): boolean {
  return item.status === "pending" && !item.requestedByMe
}

/** Payload fields an approver needs to judge the request. Anything else (keys, hashes) stays out. */
const PAYLOAD_FIELDS: Record<string, string> = {
  order_id: "Order",
  refund_id: "Refund request",
  settlement_id: "Settlement",
  remittance_id: "COD remittance",
  payout_batch_id: "Payout batch",
  status: "Decision",
  reference: "Bank reference",
}

/**
 * What the approver sees before deciding: what, on which target, for how
 * much, who asked and why. Amounts are integer paise; a Feast refund with no
 * amount is a full refund.
 */
export function approvalDetails(item: ApprovalItem): [string, string][] {
  const rows: [string, string][] = [
    ["Request", item.summary],
    ["Application", item.appLabel],
    ["Operation", item.operation],
  ]
  if (item.targetType || item.targetId) rows.push(["Target", [item.targetType, item.targetId].filter(Boolean).join(" ")])
  const amount = item.payload.amount_paise
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) rows.push(["Amount", formatPaise(amount)])
  else if (item.operation === "food.order.refund") rows.push(["Amount", "Full refund (whatever remains on the order)"])
  for (const [key, label] of Object.entries(PAYLOAD_FIELDS)) {
    const value = item.payload[key]
    if (typeof value === "string" && value.trim()) rows.push([label, value])
  }
  rows.push(...moneyPayloadRows(item.payload))
  rows.push(["Requested by", item.requestedBy ?? "Unknown"])
  if (item.requestedAt) rows.push(["Requested at", new Date(item.requestedAt).toLocaleString()])
  rows.push(["Their reason", item.reason ?? "None given"])
  if (item.expiresAt) rows.push(["Expires", new Date(item.expiresAt).toLocaleString()])
  if (item.requiredPermission) rows.push(["Needs permission", item.requiredPermission])
  return rows
}

const RESOLUTION_LABELS: Record<string, string> = {
  refunded_manually: "Refunded manually",
  written_off: "Written off",
  test_data: "Test data",
}

const paiseOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)

/**
 * The Money requests: a monetization stored call (`{path, query, body}`) or a
 * payments refund resolve (`{command_id, resolution, application_id}`).
 * "Before" values are what the requester's console showed when they asked,
 * and are labelled so; the server keeps only the requested change.
 */
export function moneyPayloadRows(payload: Record<string, unknown>): [string, string][] {
  const rows: [string, string][] = []
  const body = isRecord(payload.body) ? payload.body : null
  if (typeof payload.query === "string" && payload.query) {
    const query = new URLSearchParams(payload.query)
    const day = query.get("day")
    const period = query.get("period")
    if (day) rows.push(["Day", day])
    if (period) rows.push(["Period", period])
  }
  if (body) {
    const text = (key: string) => str(body[key])
    if (text("content_type")) rows.push(["Content type", text("content_type") as string])
    if (text("region_code")) rows.push(["Region", text("region_code") as string])
    if (text("period_key")) rows.push(["Period", text("period_key") as string])
    const rpm = paiseOrNull(body.rpm_paise)
    if (rpm !== null) {
      const before = paiseOrNull(body.previous_rpm_paise)
      rows.push(["Rate per 1,000 views", before === null ? `New: ${formatPaise(rpm)}` : `${formatPaise(before)} → ${formatPaise(rpm)} (before as the requester saw it)`])
    }
    const cap = paiseOrNull(body.cap_paise)
    if (cap !== null) {
      const before = paiseOrNull(body.previous_cap_paise)
      rows.push(["Budget cap", before === null ? `New: ${formatPaise(cap)}` : `${formatPaise(before)} → ${formatPaise(cap)} (before as the requester saw it)`])
    }
    for (const [key, label] of [
      ["floor_bps", "Floor (basis points)"],
      ["ceiling_bps", "Ceiling (basis points)"],
      ["pivot_cqs", "Pivot quality score"],
      ["confidence_impressions", "Confidence impressions"],
    ] as const) {
      const n = paiseOrNull(body[key])
      if (n !== null) rows.push([label, n.toLocaleString("en-IN")])
    }
    if (typeof body.enabled === "boolean") rows.push(["Band enabled", body.enabled ? "Yes" : "No"])
    if (text("transaction_id")) rows.push(["Transaction", text("transaction_id") as string])
    if (text("dispute_id")) rows.push(["Dispute", text("dispute_id") as string])
  }
  const resolution = str(payload.resolution)
  if (resolution) rows.push(["Resolution", RESOLUTION_LABELS[resolution] ?? resolution])
  if (str(payload.application_id)) rows.push(["Payments application", str(payload.application_id) as string])
  if (str(payload.command_id)) rows.push(["Refund command", str(payload.command_id) as string])
  return rows
}
