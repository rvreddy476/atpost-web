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
  rows.push(["Requested by", item.requestedBy ?? "Unknown"])
  if (item.requestedAt) rows.push(["Requested at", new Date(item.requestedAt).toLocaleString()])
  rows.push(["Their reason", item.reason ?? "None given"])
  if (item.expiresAt) rows.push(["Expires", new Date(item.expiresAt).toLocaleString()])
  if (item.requiredPermission) rows.push(["Needs permission", item.requiredPermission])
  return rows
}
