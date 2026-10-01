import { MIN_REASON_LENGTH, checkReason } from "@/lib/blocks/confirm"
import { humanise, isRecord, isUuid, num, str, type Row } from "./data"
import { hasPermission, type AdminMe } from "./me"

/**
 * Live (live-service-v2), through admin-service's BFF. The BFF routes mirror
 * live-service's internal admin routes one for one:
 *
 *   GET    /v1/admin/live/streams?status=all          live:streams.read
 *   POST   /v1/admin/live/streams/:id/stop {reason}   live:streams.stop   (step-up)
 *   GET    /v1/admin/live/reports?status=open         live:reports.read
 *   POST   /v1/admin/live/reports/:id/resolve         live:reports.act    (step-up)
 *          {action: dismiss|remove_message|ban_user, reason}
 *   POST   /v1/admin/live/users/:userId/live-ban      live:users.ban      (step-up)
 *   DELETE /v1/admin/live/users/:userId/live-ban      live:users.ban      (step-up)
 *   GET    /v1/admin/live/bans                        live:users.ban
 *
 * The last one, the list of platform-wide live bans, is NOT in the pinned
 * contract (section 1 has the ban and unban writes only); the console asks
 * for it at that path and shows the error state until it exists.
 *
 * Every write here asks for a fresh 2FA code before it is sent and carries a
 * written reason, which live-service stores in its append-only audit row.
 */

export const LIVE = "/v1/admin/live"
export const LIVE_STREAMS = `${LIVE}/streams?status=all`
export const LIVE_REPORTS = `${LIVE}/reports?status=open`
export const LIVE_BANS = `${LIVE}/bans`

/** The "live now" list re-reads itself this often. */
export const LIVE_REFRESH_MS = 15_000

/** Actions without the `live:` prefix; hasPermission adds it. */
export const LIVE_PERMISSIONS = {
  streamsRead: "streams.read",
  streamsStop: "streams.stop",
  reportsRead: "reports.read",
  reportsAct: "reports.act",
  chatModerate: "chat.moderate",
  usersBan: "users.ban",
} as const

export interface LiveAbilities {
  /** The page itself, and the "live now" list. */
  page: boolean
  stop: boolean
  /** The open reports list. */
  reports: boolean
  /** The Resolve button (Dismiss is always one of its choices). */
  resolve: boolean
  /** Resolve → Remove message also needs chat moderation. */
  removeMessage: boolean
  /** Resolve → Ban user, and the live bans list with ban and unban. */
  ban: boolean
}

/**
 * What this admin may see and do here. A write is offered only with its own
 * permission; Remove message and Ban user from a report need the report
 * permission AND the one for that effect, so a moderator without
 * live:users.ban never sees a ban button anywhere on the page.
 */
export function liveAbilities(me: AdminMe): LiveAbilities {
  const has = (action: string) => hasPermission(me, "live", action)
  const page = has(LIVE_PERMISSIONS.streamsRead)
  const reports = page && has(LIVE_PERMISSIONS.reportsRead)
  const resolve = reports && has(LIVE_PERMISSIONS.reportsAct)
  return {
    page,
    stop: page && has(LIVE_PERMISSIONS.streamsStop),
    reports,
    resolve,
    removeMessage: resolve && has(LIVE_PERMISSIONS.chatModerate),
    ban: page && has(LIVE_PERMISSIONS.usersBan),
  }
}

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

/** What "live now" lists: on its way up, on air, or briefly lost. */
export const ACTIVE_STATUSES = ["live", "reconnecting", "starting"] as const

const STATUS_LABELS: Record<string, string> = {
  ended: "Ended",
  failed: "Failed",
  live: "Live",
  reconnecting: "Reconnecting",
  scheduled: "Scheduled",
  starting: "Starting",
}

export function liveStatusLabel(status: unknown): string {
  const s = str(status)?.toLowerCase()
  return (s && STATUS_LABELS[s]) || humanise(status)
}

export type LiveTone = "good" | "warn" | "bad" | "normal"

/** Live: good; reconnecting: warn; failed: bad; starting and the rest: plain. */
export function liveStatusTone(status: unknown): LiveTone {
  switch (str(status)?.toLowerCase()) {
    case "live":
      return "good"
    case "reconnecting":
      return "warn"
    case "failed":
      return "bad"
    default:
      return "normal"
  }
}

const nested = (row: Row, key: string): Row | null => (isRecord(row[key]) ? (row[key] as Row) : null)

/** The host as the BFF names them: a handle or display name when it sends one, the user id always. */
export function streamHost(row: Row): { name: string | null; id: string | null } {
  const host = nested(row, "host")
  const name =
    str(row.host_username) ??
    str(row.host_name) ??
    str(row.host_display_name) ??
    str(row.creator_username) ??
    (host ? (str(host.username) ?? str(host.display_name) ?? str(host.name)) : null)
  const id = str(row.host_user_id) ?? str(row.host_id) ?? str(row.creator_user_id) ?? (host ? (str(host.user_id) ?? str(host.id)) : null)
  return { name, id }
}

/** Current viewers, host excluded (live-service counts them that way). */
export const viewerCount = (row: Row): number | null => num(row.viewer_count)

/** When it went live; a stream still starting has only its status time. */
export const streamStartedAt = (row: Row): string | null => str(row.started_at) ?? str(row.status_changed_at)

const byText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" })

/** Only the active streams, A to Z by title, then by host. */
export function activeStreams(rows: Row[]): Row[] {
  const active: readonly string[] = ACTIVE_STATUSES
  return rows
    .filter((row) => active.includes(str(row.status)?.toLowerCase() ?? ""))
    .sort((a, b) => byText(str(a.title) ?? "", str(b.title) ?? "") || byText(streamHost(a).name ?? streamHost(a).id ?? "", streamHost(b).name ?? streamHost(b).id ?? ""))
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** live-service's report reasons, A to Z by label. */
export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate" },
  { value: "nudity", label: "Nudity" },
  { value: "other", label: "Other" },
  { value: "scam", label: "Scam" },
  { value: "spam", label: "Spam" },
  { value: "violence", label: "Violence" },
] as const

export function reportReasonLabel(reason: unknown): string {
  const s = str(reason)?.toLowerCase()
  return REPORT_REASONS.find((r) => r.value === s)?.label ?? humanise(reason)
}

export function reportReporter(row: Row): { name: string | null; id: string | null } {
  const reporter = nested(row, "reporter")
  return {
    name: str(row.reporter_username) ?? str(row.reporter_name) ?? (reporter ? (str(reporter.username) ?? str(reporter.display_name)) : null),
    id: str(row.reporter_user_id) ?? str(row.reporter_id) ?? (reporter ? (str(reporter.user_id) ?? str(reporter.id)) : null),
  }
}

/** The reported chat message, when the report is about one. */
export function reportMessage(row: Row): { id: string | null; text: string | null } {
  const message = nested(row, "message")
  return {
    id: str(row.message_id) ?? (message ? str(message.id) : null),
    text: str(row.message_text) ?? str(row.target_message_text) ?? (message ? str(message.text) : null),
  }
}

export function reportStream(row: Row): { id: string | null; title: string | null } {
  const stream = nested(row, "stream")
  return {
    id: str(row.stream_id) ?? (stream ? str(stream.id) : null),
    title: str(row.stream_title) ?? (stream ? str(stream.title) : null),
  }
}

/** A to Z by reason, the oldest report first within a reason. */
export function sortReports(rows: Row[]): Row[] {
  const at = (row: Row) => Date.parse(str(row.created_at) ?? "") || 0
  return [...rows].sort((a, b) => byText(reportReasonLabel(a.reason), reportReasonLabel(b.reason)) || at(a) - at(b))
}

export type ResolveAction = "ban_user" | "dismiss" | "remove_message"

export interface ResolveChoice {
  value: ResolveAction
  label: string
  destructive: boolean
  hint: string
}

/**
 * The outcomes this admin may pick for this report, A to Z. Remove message
 * appears only for a report about a message, and only with chat moderation;
 * Ban user only with live:users.ban.
 */
export function resolveChoices(can: LiveAbilities, report: Row): ResolveChoice[] {
  if (!can.resolve) return []
  const choices: ResolveChoice[] = []
  if (can.ban) choices.push({ value: "ban_user", label: "Ban user", destructive: true, hint: "Bans the reported user from live everywhere: no going live, no live chat." })
  choices.push({ value: "dismiss", label: "Dismiss", destructive: false, hint: "Closes the report with no action against anyone." })
  if (can.removeMessage && reportMessage(report).id) {
    choices.push({ value: "remove_message", label: "Remove message", destructive: true, hint: "Hides the message for everyone in the stream." })
  }
  return choices
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

export const BAN_LIST_KEYS = ["bans", "items", "rows"] as const

export function banUser(row: Row): { name: string | null; id: string | null } {
  return { name: str(row.username) ?? str(row.display_name), id: str(row.user_id) ?? str(row.id) }
}

/** A to Z by the banned person's name, then id. */
export function sortBans(rows: Row[]): Row[] {
  const key = (row: Row) => banUser(row).name ?? banUser(row).id ?? ""
  return [...rows].sort((a, b) => byText(key(a), key(b)))
}

export const banUserIdProblem = (userId: string): string | null => (isUuid(userId) ? null : "Enter the person's full user id (a UUID).")

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type LiveWrite =
  | { kind: "stop"; streamId: string; reason: string }
  | { kind: "resolve"; reportId: string; action: ResolveAction; reason: string }
  | { kind: "ban" | "unban"; userId: string; reason: string }

export interface LiveRequest {
  method: "post" | "delete"
  url: string
  body: Record<string, unknown>
}

const RESOLVE_ACTIONS: readonly ResolveAction[] = ["ban_user", "dismiss", "remove_message"]

/**
 * One write as the BFF takes it. Every write needs a reason of at least
 * MIN_REASON_LENGTH characters: the dialogs refuse to confirm without one, and
 * this refuses to build the request, so nothing reaches the server unexplained.
 */
export function liveRequest(write: LiveWrite): LiveRequest {
  const reason = write.reason.trim()
  const check = checkReason(reason, { destructive: true })
  if (!check.ok) throw new Error(check.message ?? `A reason of at least ${MIN_REASON_LENGTH} characters is required.`)
  const id = (value: string) => encodeURIComponent(value)
  switch (write.kind) {
    case "stop":
      return { method: "post", url: `${LIVE}/streams/${id(write.streamId)}/stop`, body: { reason } }
    case "resolve":
      if (!RESOLVE_ACTIONS.includes(write.action)) throw new Error(`Unknown resolve action: ${String(write.action)}`)
      return { method: "post", url: `${LIVE}/reports/${id(write.reportId)}/resolve`, body: { action: write.action, reason } }
    case "ban":
      return { method: "post", url: `${LIVE}/users/${id(write.userId)}/live-ban`, body: { reason } }
    case "unban":
      return { method: "delete", url: `${LIVE}/users/${id(write.userId)}/live-ban`, body: { reason } }
  }
}
