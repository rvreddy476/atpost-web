"use client"

import { useQuery } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"
import api from "@/lib/admin/api"
import { useAdmin } from "@/components/shell/AdminShell"
import { adminPrefix, canReadStats } from "@/lib/admin/sections"
import { adminErrorMessage } from "@/lib/admin/mutation"
import { statsView, type StatTile, type StatsApp, type StatsResult, type StatsView } from "@/lib/admin/stats"
import { buttonSecondary } from "./buttons"

/** `GET /v1/admin/<app>/stats`, as a StatsResult. Disabled without the stats permission. */
export function useAppStats(app: StatsApp, enabled: boolean): StatsResult & { refetch: () => void } {
  const q = useQuery({
    queryKey: ["admin", app, "stats"],
    queryFn: async () => (await api.get(`${adminPrefix(app)}/stats`)).data as unknown,
    enabled,
    retry: false,
    refetchInterval: 60_000,
  })
  const refetch = () => void q.refetch()
  if (q.isError) return { status: "error", message: adminErrorMessage(q.error, "Stats could not be loaded."), refetch }
  if (q.data === undefined) return { status: "loading", refetch }
  return { status: "ok", raw: q.data, refetch }
}

const TONE: Record<StatTile["tone"], string> = {
  bad: "border-mo-bad/60 bg-mo-bad/10",
  warn: "border-mo-warn/60 bg-mo-warn/10",
  normal: "border-mo bg-mo-surface",
  unknown: "border-dashed border-mo-strong bg-mo-surface",
}

export function StatTiles({ view, compact = false }: { view: StatsView; compact?: boolean }) {
  return (
    <dl className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {view.tiles.map((t) => (
        <div key={t.key} className={`rounded-mo border p-3 ${TONE[t.tone]}`} data-stat={t.key} data-tone={t.tone}>
          <dt className="text-xs text-mo-body">{t.label}</dt>
          <dd
            className={`mt-1 font-mo-display font-semibold ${compact ? "text-xl" : "text-2xl"} ${
              t.tone === "unknown" ? "text-sm text-mo-body" : t.tone === "bad" ? "text-mo-bad" : "text-mo-ink"
            }`}
          >
            {t.display}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A dashboard's stats header. Renders nothing for an admin without `<app>:stats.read`. */
export function StatsHeader({ app }: { app: StatsApp }) {
  const { me } = useAdmin()
  const allowed = canReadStats(me, app)
  const stats = useAppStats(app, allowed)
  if (!allowed) return null
  const view = statsView(app, stats)
  return (
    <section aria-label="Key numbers" className="mb-6 space-y-2">
      {view.state === "unavailable" ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-mo-bad">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Stats unavailable: {view.message}
          <button type="button" className={buttonSecondary} onClick={stats.refetch}>
            Try again
          </button>
        </p>
      ) : null}
      <StatTiles view={view} />
      {view.generatedAt ? (
        <p className="text-xs text-mo-body">Counted {new Date(view.generatedAt).toLocaleTimeString()}</p>
      ) : null}
    </section>
  )
}
