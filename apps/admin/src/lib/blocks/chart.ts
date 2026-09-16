/**
 * Turns dashboard rows into uPlot's aligned-array shape:
 *
 *   [[x0, x1, ...], [a0, a1, ...], [b0, b1, ...]]
 *
 * x is epoch SECONDS (uPlot's time scale), sorted ascending; rows with an
 * unreadable time are dropped; a missing or non-finite value becomes null so
 * uPlot draws a gap rather than a false zero.
 */
export type ChartRow = { t: string | number | Date } & Record<string, unknown>
export type AlignedSeries = [number[], ...(number | null)[][]]

function toSeconds(t: ChartRow["t"]): number | null {
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t.getTime() / 1000
  if (typeof t === "number") return Number.isFinite(t) ? (t > 1e11 ? t / 1000 : t) : null
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? null : ms / 1000
}

export function toAlignedSeries(rows: ChartRow[], keys: string[]): AlignedSeries {
  const readable = rows
    .map((row) => ({ row, x: toSeconds(row.t) }))
    .filter((r): r is { row: ChartRow; x: number } => r.x !== null)
    .sort((a, b) => a.x - b.x)
  const xs = readable.map((r) => r.x)
  const ys = keys.map((key) =>
    readable.map(({ row }) => {
      const v = row[key]
      return typeof v === "number" && Number.isFinite(v) ? v : null
    }),
  )
  return [xs, ...ys]
}
