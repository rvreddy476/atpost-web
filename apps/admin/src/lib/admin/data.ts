/**
 * Reading admin-service answers without trusting their shape.
 *
 * Product bodies arrive as `{data: ...}`, and the list inside varies by
 * service: `{items}`, `{refunds}`, `{tickets}`, `{files}`, `{rows}`, `{jobs}`,
 * `{gaps}`, `{sellers}`, a bare array, or `null` when a Go handler returned an
 * empty slice. These helpers turn all of that into a plain array of records,
 * and anything unreadable into an empty list rather than a crash.
 */

export type Row = Record<string, unknown>

export const isRecord = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** `{data: X}` → X; anything else is returned as it is. */
export function unwrap(raw: unknown): unknown {
  return isRecord(raw) && "data" in raw ? raw.data : raw
}

const LIST_KEYS = ["items", "rows", "refunds", "tickets", "files", "jobs", "gaps", "sellers", "reviews"] as const

/** The array inside an answer, under the first known key that holds one. */
export function readList(raw: unknown, keys: readonly string[] = LIST_KEYS): Row[] {
  const body = unwrap(raw)
  const list = Array.isArray(body)
    ? body
    : isRecord(body)
      ? (keys.map((key) => body[key]).find(Array.isArray) as unknown[] | undefined) ?? []
      : []
  return list.filter(isRecord)
}

/** The object inside an answer, or null. */
export function readObject(raw: unknown): Row | null {
  const body = unwrap(raw)
  return isRecord(body) ? body : null
}

export const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null

export const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

export const bool = (value: unknown): boolean => value === true

/** An ISO time as a local date and time, or an em dash. */
export function when(value: unknown): string {
  const s = str(value)
  if (!s) return "—"
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? s : new Date(ms).toLocaleString()
}

/** The first eight characters of an id, for dense tables; the full id stays in a title attribute. */
export function shortId(value: unknown): string {
  const s = str(value)
  return s ? (s.length > 8 ? `${s.slice(0, 8)}…` : s) : "—"
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: string) => UUID_PATTERN.test(value.trim())

/** "pending_review" → "Pending review". */
export function humanise(value: unknown): string {
  const s = str(value)
  if (!s) return "—"
  const spaced = s.replace(/[_.-]+/g, " ").toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
