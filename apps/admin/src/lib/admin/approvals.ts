import { adminAppLabel, isAdminAppId } from "./apps"

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
      reason: str(item.reason),
      requestedByMe: !!myUserId && requestedBy === myUserId,
    })
  }
  return out
}

/** Only a pending request raised by someone else can be decided here. */
export function canDecide(item: ApprovalItem): boolean {
  return item.status === "pending" && !item.requestedByMe
}
