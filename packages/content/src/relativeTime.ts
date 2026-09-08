/**
 * "3h", "2d" — the compact age a feed shows.
 *
 * Deliberately not a live-updating component. A timestamp that rewrites itself
 * every second in twenty cards is twenty timers and twenty re-renders for a
 * number nobody is watching change; the feed re-renders often enough on its
 * own that the values stay honest.
 *
 * Beyond a week it becomes a date, because "63d" is not something anyone reads
 * as a time. `Intl` is used rather than a hand-rolled month table so the order
 * of day and month follows the reader's locale instead of the author's.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ""
  const delta = nowMs - t

  // A clock a few seconds ahead of the server is normal and should not produce
  // "in 4 seconds" on a post that was just made.
  if (delta < MINUTE) return "now"
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`

  const date = new Date(t)
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  }).format(date)
}

/** The full timestamp, for the `title` and `dateTime` of a <time>. */
export function absoluteTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ""
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(t))
}

/** "1:23" / "1:02:03" — a video's length, from milliseconds. */
export function formatDuration(ms: number | undefined): string | null {
  if (!ms || ms <= 0) return null
  const total = Math.round(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
