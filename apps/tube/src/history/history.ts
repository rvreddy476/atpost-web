/**
 * Watch history, reduced to what a list can draw from it.
 *
 * Pure: no React, no network, no DOM. The same discipline as ../tube/video.ts
 * and ../watch/progress.ts, and for the same reason: "Watched to 12:34 of
 * 45:00" and "this row belongs under Yesterday" are decisions that fail
 * silently when they are wrong, and a browser is the most expensive place to
 * find out. ./history.test.ts is the table.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WIRE, AS AGREED WITH POST-SERVICE ON 2026-09-12
 *
 *   GET /v1/videos/history?limit&cursor
 *   {data:[{user_id, post_id, position_ms, duration_ms, percent_watched,
 *           completed, last_watched_at, updated_at, post:{…PostDetail}}],
 *    meta:{next_cursor?}}
 *
 * Newest first, completed rows included. The endpoint is being built while
 * this file is written, so it is the contract rather than a wire read, and
 * the parser below is tolerant in the two places a first payload most often
 * differs from its contract: a row whose `post` is missing (the post was
 * deleted after it was watched, or the join has not caught up) is DROPPED
 * rather than drawn as a card with no title, and a `meta` that is absent
 * entirely means the last page, exactly as feed-service already does.
 *
 * ── A history row is a progress row with a post attached ──────────────────
 * `position_ms`, `duration_ms`, `percent_watched` and `completed` are the
 * same four numbers `GET /v1/videos/{id}/progress` answers (the
 * `WatchProgress` type in ../watch/api.ts), and `DELETE /v1/videos/{id}/
 * progress` is what "Remove" calls. So removing a video from history also
 * resets its resume point: they are one row. The settings page says so
 * beside its own Clear control, because somebody who removes a video to tidy
 * the list and then finds it starting from zero has been surprised by a fact
 * that was knowable.
 */

import type { FeedItem } from "@atpost/types/feed"

export interface HistoryRow {
  post: FeedItem
  positionMs: number
  durationMs: number
  completed: boolean
  /** RFC3339. When this viewer last watched it. */
  lastWatchedAt: string
}

export interface HistoryPage {
  rows: HistoryRow[]
  nextCursor: string | null
}

/* ── Parsing ──────────────────────────────────────────────────────────────── */

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * One history row, or null when it cannot be drawn.
 *
 * A row is only as good as its post: the card needs an id to link to and a
 * title to show, and a history entry for a video that no longer exists has
 * nothing to offer but a blank tile with a Remove button. Null, and the page
 * shows the rows it can. `last_watched_at` falls back to `updated_at`
 * because the table has one column under two names (../watch/api.ts records
 * the rename), and a row from before the alias would otherwise land in no
 * day group at all.
 */
export function parseHistoryItem(raw: unknown): HistoryRow | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const post = row.post
  if (!post || typeof post !== "object") return null
  if (typeof (post as { id?: unknown }).id !== "string") return null
  const when = row.last_watched_at ?? row.updated_at
  return {
    post: post as FeedItem,
    positionMs: Math.max(0, asNumber(row.position_ms)),
    durationMs: Math.max(0, asNumber(row.duration_ms)),
    completed: row.completed === true,
    lastWatchedAt: typeof when === "string" ? when : "",
  }
}

/** A whole page. Rows that cannot be drawn are dropped; a missing `meta` is the end. */
export function parseHistoryPage(body: unknown): HistoryPage {
  const envelope = (body ?? {}) as { data?: unknown; meta?: { next_cursor?: unknown } }
  const data = Array.isArray(envelope.data) ? envelope.data : []
  const rows = data.map(parseHistoryItem).filter((row): row is HistoryRow => row !== null)
  const cursor = envelope.meta?.next_cursor
  return {
    rows,
    nextCursor: typeof cursor === "string" && cursor.length > 0 ? cursor : null,
  }
}

/* ── The resume line ──────────────────────────────────────────────────────── */

/**
 * "12:34" or "1:02:03", never null and never negative.
 *
 * Not `formatDuration` from @momentum/content, which answers null for zero
 * because a video of no length has no length to print. A POSITION of zero is
 * a real place, the start, and "Watched to 0:00" is the honest sentence for
 * a row whose save landed before the first second played.
 */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes)
  const ss = String(seconds).padStart(2, "0")
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * The line under a card that says how far somebody got.
 *
 * Three shapes, and the order they are decided in is the point:
 *
 *   · completed → "Watched". The server's own 90% rule (or the client's
 *     "it ended") has already decided this, and "Watched to 44:58 of 45:00"
 *     is true but reads as an invitation to go back for two seconds.
 *   · no duration → "Watched to 12:34". The server reads its duration from
 *     `video_metadata` and a row saved before the transcode finished can
 *     carry zero; "of 0:00" would be a claim that the video is empty.
 *   · otherwise → "Watched to 12:34 of 45:00".
 */
export function resumeLine(row: Pick<HistoryRow, "positionMs" | "durationMs" | "completed">): string {
  if (row.completed) return "Watched"
  if (row.durationMs <= 0) return `Watched to ${clock(row.positionMs)}`
  return `Watched to ${clock(row.positionMs)} of ${clock(row.durationMs)}`
}

/**
 * How much of the bar to fill, 0 to 1.
 *
 * Completed is a full bar whatever the numbers say, for the reason the line
 * says "Watched": the two must agree. Without a duration there is nothing to
 * divide by, and an empty bar under "Watched to 12:34" is the honest
 * drawing rather than a guess.
 */
export function progressFraction(
  row: Pick<HistoryRow, "positionMs" | "durationMs" | "completed">
): number {
  if (row.completed) return 1
  if (row.durationMs <= 0) return 0
  return Math.min(1, Math.max(0, row.positionMs / row.durationMs))
}

/* ── Day groups ───────────────────────────────────────────────────────────── */

export interface HistoryDay {
  label: string
  rows: HistoryRow[]
}

/** The start of the LOCAL day a moment falls in, as a number for comparing. */
function localDayStart(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * "Today", "Yesterday", or the date.
 *
 * Calendar days in the viewer's OWN time zone, not 24-hour windows from now:
 * something watched at 23:50 last night is "Yesterday" at 00:10 this morning,
 * which is what the word means to the person reading it. A window would call
 * it Today for another 23 hours. `now` is a parameter so the grouping can be
 * asserted against a fixed clock.
 *
 * An unparseable timestamp lands under "Earlier" rather than throwing or
 * under a date that is not true; the parser above already tolerates a row
 * with none.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return "Earlier"
  const days = Math.round((localDayStart(now) - localDayStart(at)) / DAY_MS)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(at)
}

/**
 * Rows under their day, in the order they arrived.
 *
 * The server sends newest first, so the groups come out newest first too,
 * and this does NOT re-sort: a list that reorders what the server ordered
 * has two opinions about "newest", and a second page appended under the
 * first must not shuffle the rows already on screen. Groups are keyed by
 * label, so a second page that continues Yesterday joins the existing
 * Yesterday rather than opening a second one.
 */
export function groupByDay(rows: readonly HistoryRow[], now: Date = new Date()): HistoryDay[] {
  const out: HistoryDay[] = []
  const byLabel = new Map<string, HistoryDay>()
  for (const row of rows) {
    const label = dayLabel(row.lastWatchedAt, now)
    let group = byLabel.get(label)
    if (!group) {
      group = { label, rows: [] }
      byLabel.set(label, group)
      out.push(group)
    }
    group.rows.push(row)
  }
  return out
}
