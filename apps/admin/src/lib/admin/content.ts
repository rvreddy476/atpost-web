import { checkReason, type ReasonCheck } from "../blocks/confirm"
import { isRecord, num, readObject, str, unwrap, type Row } from "./data"
import type { StatsResult } from "./stats"

/**
 * The Content dashboards' rules (Social, Tube, Q&A, Chat), as plain
 * functions: where each kind of content lives in the URL, which actions are
 * takedowns, the Q&A reason rule, and how merged stats are read.
 *
 * admin-service (handler_content.go, handler_social.go, handler_tube.go,
 * handler_qa.go, handler_chat.go) is the source of truth; the console only
 * mirrors it so an admin is told BEFORE confirming what a click will need.
 */

export const SOCIAL = "/v1/admin/social"
export const TUBE = "/v1/admin/tube"
export const QA = "/v1/admin/qa"
export const CHAT = "/v1/admin/chat"

// ---------------------------------------------------------------------------
// Content kinds: the kind is in the URL
// ---------------------------------------------------------------------------

export type ContentKind = "post" | "reel" | "video"
export type ContentApp = "social" | "tube"

export interface ContentKindDef {
  app: ContentApp
  segment: "posts" | "reels" | "videos"
  label: string
  plural: string
  moderate: string
  remove: string
}

/**
 * post-service narrows every post route by the post's stored kind and by the
 * action: a takedown needs the kind's `.remove`, anything else its
 * `.moderate`. The console states the kind in the URL and admin-service
 * scopes the token to it; a mislabelled URL can never widen what the admin
 * may do, because post-service checks the stored kind again.
 */
export const CONTENT_KINDS: Record<ContentKind, ContentKindDef> = {
  post: { app: "social", segment: "posts", label: "Post", plural: "Posts", moderate: "posts.moderate", remove: "posts.remove" },
  reel: { app: "social", segment: "reels", label: "Reel", plural: "Reels", moderate: "reels.moderate", remove: "reels.remove" },
  video: { app: "tube", segment: "videos", label: "Video", plural: "Videos", moderate: "videos.moderate", remove: "videos.remove" },
}

/** `/v1/admin/social/reels`, `/v1/admin/tube/videos`. */
export function contentBase(kind: ContentKind): string {
  const def = CONTENT_KINDS[kind]
  return `${def.app === "social" ? SOCIAL : TUBE}/${def.segment}`
}

/** `contentPath("reel", "/<id>/moderation")` → `/v1/admin/social/reels/<id>/moderation`. */
export function contentPath(kind: ContentKind, suffix = ""): string {
  return `${contentBase(kind)}${suffix}`
}

// ---------------------------------------------------------------------------
// Takedown versus moderate
// ---------------------------------------------------------------------------

export type ContentDecisionAction = "approve" | "reject" | "needs_changes"
export type ContentReviewStatus = "approved" | "rejected"
export type CommentStatus = "visible" | "hidden" | "removed" | "review"

export const CONTENT_DECISION_ACTIONS: readonly ContentDecisionAction[] = ["approve", "reject", "needs_changes"]
export const CONTENT_REVIEW_STATUSES: readonly ContentReviewStatus[] = ["approved", "rejected"]
export const COMMENT_STATUSES: readonly CommentStatus[] = ["visible", "hidden", "removed", "review"]

/** What admin-service will require for one write, decided from the body. */
export interface ActionRequirement {
  /** Without the app prefix: `reels.remove`, `posts.moderate`, `comments.remove`. */
  permission: string
  stepUp: boolean
  takedown: boolean
}

/** A moderation decision on a post, reel or video: reject is a takedown. */
export function contentDecisionRequirement(kind: ContentKind, action: ContentDecisionAction): ActionRequirement {
  const def = CONTENT_KINDS[kind]
  return action === "reject" ? { permission: def.remove, stepUp: true, takedown: true } : { permission: def.moderate, stepUp: false, takedown: false }
}

/** A flagged post's review status: rejected is a takedown. */
export function contentReviewStatusRequirement(kind: ContentKind, status: ContentReviewStatus): ActionRequirement {
  const def = CONTENT_KINDS[kind]
  return status === "rejected" ? { permission: def.remove, stepUp: true, takedown: true } : { permission: def.moderate, stepUp: false, takedown: false }
}

/** Promoting a staged post to a visibility is never a takedown. */
export function contentVisibilityRequirement(kind: ContentKind): ActionRequirement {
  return { permission: CONTENT_KINDS[kind].moderate, stepUp: false, takedown: false }
}

/** A comment set to hidden or removed is a takedown (`comments.remove` + step-up). */
export function commentStatusRequirement(status: CommentStatus): ActionRequirement {
  return status === "hidden" || status === "removed"
    ? { permission: "comments.remove", stepUp: true, takedown: true }
    : { permission: "comments.moderate", stepUp: false, takedown: false }
}

/** One line for a confirm dialog: what the action needs. */
export function requirementNote(req: ActionRequirement): string {
  return req.takedown ? "This is a takedown: it needs the remove permission and a fresh 2FA code." : "Needs the moderate permission; no 2FA code."
}

// ---------------------------------------------------------------------------
// Q&A: every write carries a reason; merge is step-up
// ---------------------------------------------------------------------------

/** qa-service refuses a reason over this; admin-service refuses first. */
export const QA_MAX_REASON_LENGTH = 2000

/** Blank or over 2000 characters is refused before any call. */
export function checkQaReason(reason: string): ReasonCheck {
  return checkReason(reason, { destructive: false, required: true, max: QA_MAX_REASON_LENGTH })
}

export type QaWrite = "report.resolve" | "report.dismiss" | "question.hide" | "question.lock" | "question.duplicate" | "question.merge" | "answer.hide" | "comment.hide"

export const QA_WRITES: Record<QaWrite, { label: string; permission: string; stepUp: boolean; destructive: boolean; explain: string }> = {
  "report.resolve": { label: "Resolve", permission: "reports.act", stepUp: false, destructive: false, explain: "Closes the report as acted on. Act on the content separately (hide, lock, merge)." },
  "report.dismiss": { label: "Dismiss", permission: "reports.act", stepUp: false, destructive: false, explain: "Closes the report with no action on the content." },
  "question.hide": { label: "Hide question", permission: "questions.moderate", stepUp: false, destructive: true, explain: "The question and its answers disappear from every reader; the author keeps a copy." },
  "question.lock": { label: "Lock question", permission: "questions.moderate", stepUp: false, destructive: true, explain: "No new answers or comments; existing ones stay visible." },
  "question.duplicate": { label: "Mark duplicate", permission: "questions.moderate", stepUp: false, destructive: false, explain: "Points readers to the original question; both stay visible." },
  "question.merge": { label: "Merge into another question", permission: "questions.merge", stepUp: true, destructive: true, explain: "Moves the answers onto the other question and closes this one. This cannot be undone, so it needs a fresh 2FA code." },
  "answer.hide": { label: "Hide answer", permission: "answers.moderate", stepUp: false, destructive: true, explain: "The answer disappears from every reader." },
  "comment.hide": { label: "Hide comment", permission: "comments.moderate", stepUp: false, destructive: true, explain: "The comment disappears from every reader." },
}

export function qaStepUp(write: QaWrite): boolean {
  return QA_WRITES[write].stepUp
}

// ---------------------------------------------------------------------------
// Stats: single-source and merged
// ---------------------------------------------------------------------------

export const UNAVAILABLE = "unavailable"

export interface ContentTile {
  key: string
  label: string
  display: string
  tone: "bad" | "warn" | "normal" | "unknown"
}

export interface ContentMetric {
  key: string
  label: string
  /** "bad" or "warn" when the value is above zero. */
  alert?: "bad" | "warn"
  /** Shown on the overview card. */
  urgent?: boolean
  /** A custom reading; the default is a count under `key`. */
  read?: (body: Row) => string | null
}

export interface StatsPartDef {
  /** The key in a merged answer's `parts`. */
  name: string
  label: string
  /** The product wraps its counts one level down (`{pages: {...}}`). */
  inner?: string
  metrics: readonly ContentMetric[]
}

export interface StatsPartView {
  name: string
  label: string
  status: "loading" | "ok" | "unavailable"
  /** Why the part is unavailable. */
  error: string | null
  tiles: ContentTile[]
  generatedAt: string | null
}

export interface ContentStatsView {
  state: "loading" | "ok" | "partial" | "unavailable"
  message: string | null
  parts: StatsPartView[]
}

const whenTile = (key: string) => (body: Row) => {
  const s = str(body[key])
  if (!s) return "None open"
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? s : new Date(ms).toLocaleString()
}

export const SOCIAL_CONTENT_METRICS: readonly ContentMetric[] = [
  { key: "flagged_posts_pending", label: "Flagged posts pending", alert: "warn", urgent: true },
  { key: "flagged_reels_pending", label: "Flagged reels pending", alert: "warn", urgent: true },
  { key: "open_content_reports", label: "Open content reports", alert: "bad", urgent: true },
  { key: "reel_review_queue_pending", label: "Reel reviews pending", alert: "warn" },
  { key: "staged_posts_awaiting_visibility", label: "Staged posts awaiting visibility" },
  { key: "post_takedowns_last_7_days", label: "Post takedowns, 7 days" },
  { key: "reel_takedowns_last_7_days", label: "Reel takedowns, 7 days" },
  { key: "comment_takedowns_last_7_days", label: "Comment takedowns, 7 days" },
  { key: "posts_created_today", label: "Posts today" },
  { key: "reels_created_today", label: "Reels today" },
  { key: "posts_created_last_7_days", label: "Posts, 7 days" },
  { key: "reels_created_last_7_days", label: "Reels, 7 days" },
]

export const SOCIAL_PAGES_METRICS: readonly ContentMetric[] = [
  { key: "pending_review", label: "Pages to review", alert: "warn", urgent: true },
  { key: "documents_pending", label: "Page documents pending", alert: "warn", urgent: true },
  { key: "approved_7d", label: "Pages approved, 7 days" },
  { key: "rejected_7d", label: "Pages rejected, 7 days" },
  { key: "suspended_7d", label: "Pages suspended, 7 days" },
]

export const SOCIAL_STATS_PARTS: readonly StatsPartDef[] = [
  { name: "content", label: "Posts, reels and comments", metrics: SOCIAL_CONTENT_METRICS },
  { name: "pages", label: "Business pages", inner: "pages", metrics: SOCIAL_PAGES_METRICS },
]

export const TUBE_METRICS: readonly ContentMetric[] = [
  { key: "flagged_videos_pending", label: "Flagged videos pending", alert: "warn", urgent: true },
  { key: "open_video_reports", label: "Open video reports", alert: "bad", urgent: true },
  { key: "staged_videos_awaiting_visibility", label: "Staged videos awaiting visibility", urgent: true },
  { key: "video_takedowns_last_7_days", label: "Video takedowns, 7 days", urgent: true },
  { key: "videos_created_today", label: "Videos today" },
  { key: "videos_created_last_7_days", label: "Videos, 7 days" },
  { key: "channels_created_last_7_days", label: "Channels created, 7 days" },
]

export const TUBE_STATS_PART: StatsPartDef = { name: "tube", label: "Videos", metrics: TUBE_METRICS }

export const QA_METRICS: readonly ContentMetric[] = [
  { key: "open_reports_total", label: "Open reports", alert: "bad", urgent: true },
  {
    key: "open_reports_by_reason",
    label: "Open reports by reason",
    read: (body) => {
      const map = isRecord(body.open_reports_by_reason) ? body.open_reports_by_reason : null
      if (!map) return null
      const entries = Object.entries(map)
        .map(([reason, n]) => [reason, num(n)] as const)
        .filter((e): e is readonly [string, number] => e[1] !== null)
        .sort((a, b) => b[1] - a[1])
      return entries.length === 0 ? "None" : entries.map(([reason, n]) => `${reason.replace(/[_-]+/g, " ")} ${n}`).join(" · ")
    },
  },
  { key: "hidden_questions_last_7_days", label: "Questions hidden, 7 days", urgent: true },
  { key: "hidden_answers_last_7_days", label: "Answers hidden, 7 days", urgent: true },
  { key: "locked_questions", label: "Locked questions", urgent: true },
  { key: "questions_created_today", label: "Questions today" },
  { key: "answers_created_today", label: "Answers today" },
  { key: "questions_created_last_7_days", label: "Questions, 7 days" },
  { key: "answers_created_last_7_days", label: "Answers, 7 days" },
]

export const QA_STATS_PART: StatsPartDef = { name: "qa", label: "Questions and answers", metrics: QA_METRICS }

const chatReportMetrics = (extra: ContentMetric[] = []): ContentMetric[] => [
  { key: "open_reports", label: "Open reports", alert: "bad", urgent: true },
  ...extra,
  { key: "oldest_open_report_at", label: "Oldest open report", read: whenTile("oldest_open_report_at") },
  { key: "reports_decided_7d", label: "Decided, 7 days" },
  { key: "reports_upheld_7d", label: "Upheld, 7 days" },
  { key: "reports_dismissed_7d", label: "Dismissed, 7 days" },
]

export const CHAT_STATS_PARTS: readonly StatsPartDef[] = [
  { name: "channels", label: "Channels", metrics: chatReportMetrics([{ key: "suspended_channels", label: "Suspended channels", alert: "warn", urgent: true }]) },
  { name: "groups", label: "Groups", metrics: chatReportMetrics() },
  { name: "communities", label: "Communities", metrics: chatReportMetrics([{ key: "suspended_communities", label: "Suspended communities", alert: "warn", urgent: true }]) },
]

function readTile(metric: ContentMetric, body: Row | null): ContentTile {
  if (!body) return { key: metric.key, label: metric.label, display: UNAVAILABLE, tone: "unknown" }
  if (metric.read) {
    const display = metric.read(body)
    return display === null ? { key: metric.key, label: metric.label, display: UNAVAILABLE, tone: "unknown" } : { key: metric.key, label: metric.label, display, tone: "normal" }
  }
  const n = num(body[metric.key])
  if (n === null) return { key: metric.key, label: metric.label, display: UNAVAILABLE, tone: "unknown" }
  return { key: metric.key, label: metric.label, display: n.toLocaleString("en-IN"), tone: n > 0 && metric.alert ? metric.alert : "normal" }
}

function partTiles(def: StatsPartDef, body: Row | null, compact: boolean): ContentTile[] {
  const metrics = compact ? def.metrics.filter((m) => m.urgent) : def.metrics
  return metrics.map((m) => readTile(m, body))
}

function partView(def: StatsPartDef, status: StatsPartView["status"], body: Row | null, error: string | null, compact: boolean): StatsPartView {
  return {
    name: def.name,
    label: def.label,
    status,
    error,
    tiles: partTiles(def, body, compact),
    generatedAt: body ? (str(body.generated_at) ?? str(body.as_of)) : null,
  }
}

function innerBody(def: StatsPartDef, stats: unknown): Row | null {
  const body = readObject(stats)
  if (!body) return null
  if (!def.inner) return body
  return isRecord(body[def.inner]) ? (body[def.inner] as Row) : null
}

function overall(parts: StatsPartView[], message: string | null): ContentStatsView {
  const down = parts.filter((p) => p.status === "unavailable")
  if (down.length === 0) return { state: "ok", message: null, parts }
  if (down.length === parts.length) return { state: "unavailable", message: message ?? down[0].error, parts }
  return { state: "partial", message: message ?? `${down.map((p) => p.label).join(", ")} unavailable`, parts }
}

/**
 * A single product's `/stats` (Tube, Q&A): one part, from the `{data: ...}`
 * body. A failed call or a missing field is "unavailable", never 0.
 */
export function singleStatsView(def: StatsPartDef, result: StatsResult, { compact = false } = {}): ContentStatsView {
  if (result.status === "loading") {
    return { state: "loading", message: null, parts: [{ ...partView(def, "loading", null, null, compact), tiles: partTiles(def, null, compact).map((t) => ({ ...t, display: "…" })) }] }
  }
  if (result.status === "error") return overall([partView(def, "unavailable", null, result.message, compact)], result.message)
  const body = innerBody(def, result.raw)
  if (!body) return overall([partView(def, "unavailable", null, "The stats answer could not be read.", compact)], null)
  return overall([partView(def, "ok", body, null, compact)], null)
}

/**
 * A merged answer: `{parts: {<name>: {status, stats, error, source}},
 * complete}`. Each part is read on its own; an unavailable one carries its
 * reason and the rest still render. A 503 (no source answered) makes every
 * part unavailable with that message.
 */
export function mergedStatsView(defs: readonly StatsPartDef[], result: StatsResult, { compact = false } = {}): ContentStatsView {
  if (result.status === "loading") {
    return {
      state: "loading",
      message: null,
      parts: defs.map((def) => ({ ...partView(def, "loading", null, null, compact), tiles: partTiles(def, null, compact).map((t) => ({ ...t, display: "…" })) })),
    }
  }
  if (result.status === "error") return overall(defs.map((def) => partView(def, "unavailable", null, result.message, compact)), result.message)
  const body = unwrap(result.raw)
  const parts = isRecord(body) && isRecord(body.parts) ? body.parts : null
  if (!parts) return overall(defs.map((def) => partView(def, "unavailable", null, "The stats answer could not be read.", compact)), null)
  return overall(
    defs.map((def) => {
      const part = isRecord(parts[def.name]) ? (parts[def.name] as Row) : null
      if (!part) return partView(def, "unavailable", null, "not in the answer", compact)
      if (part.status !== "ok") {
        const upstream = num(part.upstream_status)
        const reason = str(part.error) ?? (upstream !== null ? `answered ${upstream}` : "did not answer")
        const source = str(part.source)
        return partView(def, "unavailable", null, source ? `${source} ${reason}` : reason, compact)
      }
      const stats = innerBody(def, part.stats)
      return stats ? partView(def, "ok", stats, null, compact) : partView(def, "unavailable", null, "malformed stats", compact)
    }),
    null,
  )
}

/** The most urgent tiles across every part, for an overview card. */
export function urgentTiles(view: ContentStatsView, limit = 4): ContentTile[] {
  return view.parts.flatMap((p) => (p.status === "ok" || p.status === "loading" ? p.tiles : [])).slice(0, limit)
}
