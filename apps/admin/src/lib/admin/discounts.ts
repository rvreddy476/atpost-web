import { formatMinor, parseMinor } from "@atpost/form"

/**
 * What the coupon and bank-offer forms share: a percentage typed as text
 * becomes basis points, a rupee amount typed as text becomes integer paise,
 * and a calendar day becomes the start or end of that day in India. None of it
 * goes through a float multiply: `12.35 * 100` is 1234.9999999999998, and a
 * discount rounded the wrong way is a paisa or a basis point someone did not
 * agree to.
 */

/** "10" → 1000, "12.5" → 1250, "0.01" → 1, "100" → 10000. */
const PERCENT = /^(\d{1,3})(?:\.(\d{1,2}))?$/

/**
 * A percentage as typed (a trailing "%" allowed) as whole basis points, or
 * null unless it is above 0 and at most 100 with no more than two decimals.
 * More decimals are refused, never rounded: 12.345% is not a basis point.
 */
export function percentToBps(input: string): number | null {
  const text = input.trim().replace(/\s*%$/, "")
  const match = PERCENT.exec(text)
  if (!match) return null
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"))
  return bps > 0 && bps <= 10_000 ? bps : null
}

/** 1250 → "12.5", 1000 → "10", 1 → "0.01". Integer arithmetic only. */
export function bpsToPercent(bps: number | null | undefined): string {
  if (typeof bps !== "number" || !Number.isSafeInteger(bps) || bps < 0) return ""
  const whole = Math.floor(bps / 100)
  const frac = String(bps % 100).padStart(2, "0").replace(/0+$/, "")
  return frac ? `${whole}.${frac}` : String(whole)
}

/** "12.5% off" for a stored basis-point value. */
export function percentLabel(bps: number | null | undefined): string {
  const text = bpsToPercent(bps)
  return text ? `${text}%` : "—"
}

/**
 * A rupee amount typed by an admin, parsed with @atpost/form's parseMinor:
 * null when blank, undefined when it is not an amount (or is negative), else
 * integer paise. Callers decide whether zero is allowed.
 */
export function readRupees(input: string): number | null | undefined {
  if (input.trim() === "") return null
  const minor = parseMinor(input)
  if (minor === null || minor < 0) return undefined
  return minor
}

/** Paise as the plain "1234.50" a rupee input shows; "" for none. */
export function rupeesText(minor: unknown): string {
  return typeof minor === "number" && Number.isSafeInteger(minor) ? formatMinor(minor) : ""
}

/** A whole number of uses typed by an admin: null blank, undefined anything else but a positive integer. */
export function readCount(input: string): number | null | undefined {
  const text = input.trim()
  if (text === "") return null
  if (!/^\d{1,9}$/.test(text)) return undefined
  const n = Number(text)
  return n >= 1 ? n : undefined
}

export const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** The first and last second of a calendar day in India, as the servers take timestamps. */
export const dayStart = (day: string) => `${day}T00:00:00+05:30`
export const dayEnd = (day: string) => `${day}T23:59:59+05:30`

const IST_OFFSET_MS = 330 * 60_000

/** A stored timestamp as its calendar day in India ("" when absent or unreadable). */
export function istDay(value: unknown): string {
  if (typeof value !== "string" || !value) return ""
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return ""
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Today in India, as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * The validity window from two date inputs. Blank start: from now; blank end:
 * no end. An end before the start is refused, and on a create so is an end
 * that has already passed (it could never be used).
 */
export function checkWindow(
  startsDay: string,
  endsDay: string,
  { labels, today }: { labels: { starts: string; ends: string }; today?: string },
): { problems: string[]; starts_at: string | null; ends_at: string | null } {
  const problems: string[] = []
  const starts = startsDay.trim()
  const ends = endsDay.trim()
  let starts_at: string | null = null
  let ends_at: string | null = null
  if (starts) {
    if (!DAY_ONLY.test(starts)) problems.push(`${labels.starts} must be a date.`)
    else starts_at = dayStart(starts)
  }
  if (ends) {
    if (!DAY_ONLY.test(ends)) problems.push(`${labels.ends} must be a date.`)
    else if (starts && DAY_ONLY.test(starts) && ends < starts) problems.push(`${labels.ends} cannot be before ${labels.starts.toLowerCase()}.`)
    else if (today && ends < today) problems.push(`${labels.ends} is already in the past.`)
    else ends_at = dayEnd(ends)
  }
  return { problems, starts_at, ends_at }
}

/**
 * A PATCH body: only the fields whose value differs from what is stored. A
 * cleared optional field is sent as null, which is how the forms say "no cap"
 * or "no end"; a field the admin did not touch is not sent at all.
 */
export function changedFields(next: Record<string, unknown>, stored: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(next)) {
    const before = stored[key] === undefined ? null : stored[key]
    const after = value === undefined ? null : value
    if (!sameValue(before, after)) out[key] = after
  }
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    const ta = Date.parse(a)
    const tb = Date.parse(b)
    // Two spellings of the same instant ("…+05:30" sent, "…Z" stored) are the same value.
    if (/^\d{4}-\d{2}-\d{2}T/.test(a) && /^\d{4}-\d{2}-\d{2}T/.test(b) && !Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i])
  return a === b
}

/** Labels sorted the way a person reads a menu: ascending, letters before case. */
export function byLabel<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }))
}
