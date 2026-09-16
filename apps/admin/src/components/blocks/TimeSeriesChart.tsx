"use client"

import { useEffect, useMemo, useRef } from "react"
import type uPlot from "uplot"
import { toAlignedSeries, type ChartRow } from "@/lib/blocks/chart"

export interface ChartSeries {
  key: string
  label: string
  /** A Momentum role name, e.g. "cyan", "purple", "good", "warn". */
  role?: "cyan" | "purple" | "good" | "warn" | "bad" | "body"
}

function roleColor(role: ChartSeries["role"] = "cyan"): string {
  if (typeof window === "undefined") return "#06B6D4"
  const rgb = getComputedStyle(document.documentElement).getPropertyValue(`--mo-${role}`).trim()
  return rgb ? `rgb(${rgb.split(/\s+/).join(",")})` : "#06B6D4"
}

/**
 * A time-series line chart on uPlot.
 *
 * Why uPlot: ~50 KB, zero dependencies, canvas-drawn, and framework-agnostic,
 * so there is no React-version peer to fall behind (React 19 is fine). It
 * never fetches anything, needs no eval, and styles through CSSOM plus one
 * static stylesheet — all inside the console's strict CSP. It is loaded with
 * a dynamic import so pages without a chart do not pay for it.
 *
 * The rows are also rendered as a visually hidden table: a canvas says nothing
 * to a screen reader.
 */
export function TimeSeriesChart({
  title,
  rows,
  series,
  height = 240,
}: {
  title: string
  rows: ChartRow[]
  series: ChartSeries[]
  height?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const data = useMemo(() => toAlignedSeries(rows, series.map((s) => s.key)), [rows, series])

  useEffect(() => {
    const el = container.current
    if (!el) return
    let chart: uPlot | null = null
    let observer: ResizeObserver | null = null
    let cancelled = false

    void import("uplot").then(({ default: UPlot }) => {
      if (cancelled) return
      const grid = { stroke: "rgba(255,255,255,0.06)", width: 1 }
      const axis = { stroke: roleColor("body"), grid, ticks: grid }
      chart = new UPlot(
        {
          width: el.clientWidth || 600,
          height,
          series: [{}, ...series.map((s) => ({ label: s.label, stroke: roleColor(s.role), width: 2, spanGaps: false }))],
          axes: [axis, axis],
          legend: { show: true },
          cursor: { drag: { x: false, y: false } },
        },
        data as uPlot.AlignedData,
        el,
      )
      observer = new ResizeObserver(() => chart?.setSize({ width: el.clientWidth, height }))
      observer.observe(el)
    })

    return () => {
      cancelled = true
      observer?.disconnect()
      chart?.destroy()
    }
  }, [data, series, height])

  return (
    <figure className="admin-chart rounded-mo border border-mo bg-mo-surface p-4">
      <figcaption className="mb-2 font-mo-display text-sm font-semibold text-mo-ink">{title}</figcaption>
      <div ref={container} aria-hidden="true" />
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data[0].map((x, i) => (
            <tr key={x}>
              <td>{new Date(x * 1000).toISOString()}</td>
              {series.map((s, j) => (
                <td key={s.key}>{data[j + 1][i] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
