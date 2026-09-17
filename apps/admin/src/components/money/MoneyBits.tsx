"use client"

import { useQuery } from "@tanstack/react-query"
import { PauseCircle, TriangleAlert } from "lucide-react"
import api from "@/lib/admin/api"
import { buttonSecondary } from "@/components/blocks/buttons"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { adminErrorMessage } from "@/lib/admin/mutation"
import { NOT_REPORTED_BODY, NOT_REPORTED_TITLE, isNotLaunched, type MoneyStatsView, type MoneyTile } from "@/lib/admin/monetization"
import type { StatsResult } from "@/lib/admin/stats"

/**
 * A read that still answered the not-launched state. Reads return real data
 * during the beta, so this is rare; when it happens the numbers are "not
 * reported", never zeros. Not an error: no red, no retry. The "money actions
 * are switched off" note belongs to a refused write (the action's toast), not here.
 */
export function NotLaunchedNote({ compact = false }: { compact?: boolean }) {
  return (
    <div role="status" data-state="not_launched" className={`flex items-start gap-3 rounded-mo border border-mo bg-mo-surface ${compact ? "p-3" : "p-5"}`}>
      <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-mo-body" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-mo-ink">{NOT_REPORTED_TITLE}</p>
        <p className="text-sm text-mo-body">{NOT_REPORTED_BODY}</p>
      </div>
    </div>
  )
}

const TONE: Record<MoneyTile["tone"], string> = {
  bad: "border-mo-bad/60 bg-mo-bad/10",
  warn: "border-mo-warn/60 bg-mo-warn/10",
  normal: "border-mo bg-mo-surface",
  unknown: "border-dashed border-mo-strong bg-mo-surface",
}

export function MoneyTiles({ tiles, compact = false, label }: { tiles: MoneyTile[]; compact?: boolean; label?: string }) {
  return (
    <dl aria-label={label} className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {tiles.map((t) => (
        <div key={t.key} className={`rounded-mo border p-3 ${TONE[t.tone]}`} data-stat={t.key} data-tone={t.tone}>
          <dt className="text-xs text-mo-body">{t.label}</dt>
          <dd
            className={`mt-1 font-mo-display font-semibold ${compact ? "text-lg" : "text-xl"} ${
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

/** A stats view: the not-launched note, or an "unavailable" line above the tiles. */
export function MoneyStats({ view, onRetry, compact = false }: { view: MoneyStatsView; onRetry?: () => void; compact?: boolean }) {
  if (view.state === "not_launched") return <NotLaunchedNote compact={compact} />
  return (
    <div className="space-y-2">
      {view.state === "unavailable" ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-mo-bad">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Numbers unavailable: {view.message}
          {onRetry ? (
            <button type="button" className={buttonSecondary} onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
      <MoneyTiles tiles={view.tiles} compact={compact} />
      {view.generatedAt ? <p className="text-xs text-mo-body">Counted {new Date(view.generatedAt).toLocaleTimeString()}</p> : null}
    </div>
  )
}

/** `GET <url>` as a StatsResult, for the Money stats routes. */
export function useMoneyStats(key: string, url: string, enabled: boolean): StatsResult & { refetch: () => void } {
  const q = useQuery({
    queryKey: ["admin", key, "stats", url],
    queryFn: async () => (await api.get(url)).data as unknown,
    enabled,
    retry: false,
    refetchInterval: 60_000,
  })
  const refetch = () => void q.refetch()
  if (q.isError) return { status: "error", message: adminErrorMessage(q.error, "Stats could not be loaded."), refetch }
  if (q.data === undefined) return { status: "loading", refetch }
  return { status: "ok", raw: q.data, refetch }
}

/** A monetization list, knowing the not-launched answer apart from an empty list. */
export function useMonetizationList(url: string, opts: { enabled?: boolean; keys?: string[] } = {}) {
  const list = useAdminList("monetization", url, opts)
  return { ...list, notLaunched: isNotLaunched(list.raw) }
}

export function useMonetizationObject(url: string, opts: { enabled?: boolean } = {}) {
  const read = useAdminObject("monetization", url, opts)
  return { ...read, notLaunched: isNotLaunched(read.raw) }
}
