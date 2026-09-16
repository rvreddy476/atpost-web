/**
 * Date ranges as `YYYY-MM-DD` strings in the admin's local calendar, which is
 * what `<input type="date">` speaks. Inclusive on both ends.
 */
export interface DateRange {
  from: string
  to: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function toDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isDay(value: string): boolean {
  if (!DAY.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  return toDay(new Date(y, m - 1, d + delta))
}

export const DATE_PRESETS = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
] as const

export type DatePresetId = (typeof DATE_PRESETS)[number]["id"]

export function presetRange(id: DatePresetId, today: Date): DateRange {
  const preset = DATE_PRESETS.find((p) => p.id === id) ?? DATE_PRESETS[0]
  const to = toDay(today)
  return { from: addDays(to, -(preset.days - 1)), to }
}

/** Which preset (if any) the range equals, for highlighting the chip. */
export function matchPreset(range: DateRange, today: Date): DatePresetId | null {
  for (const preset of DATE_PRESETS) {
    const r = presetRange(preset.id, today)
    if (r.from === range.from && r.to === range.to) return preset.id
  }
  return null
}

/**
 * A range as the admin typed it, made valid: invalid days are rejected,
 * reversed ends are swapped, and `maxDays` caps the span from `to` backwards.
 */
export function normaliseRange(range: DateRange, maxDays?: number): DateRange | null {
  if (!isDay(range.from) || !isDay(range.to)) return null
  let { from, to } = range
  if (from > to) [from, to] = [to, from]
  if (maxDays && maxDays > 0) {
    const earliest = addDays(to, -(maxDays - 1))
    if (from < earliest) from = earliest
  }
  return { from, to }
}

export function rangeDays(range: DateRange): number {
  const [fy, fm, fd] = range.from.split("-").map(Number)
  const [ty, tm, td] = range.to.split("-").map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1
}
