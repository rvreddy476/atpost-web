"use client"

import { CircleOff, TriangleAlert } from "lucide-react"
import { buttonSecondary } from "@/components/blocks/buttons"
import { useMoneyStats } from "@/components/money/MoneyBits"
import { urgentTiles, type ContentStatsView, type ContentTile, type StatsPartView } from "@/lib/admin/content"
import type { StatsResult } from "@/lib/admin/stats"

/** `GET <url>` as a StatsResult, refreshed every minute. */
export function useContentStats(app: string, url: string, enabled: boolean): StatsResult & { refetch: () => void } {
  return useMoneyStats(app, url, enabled)
}

const TONE: Record<ContentTile["tone"], string> = {
  bad: "border-mo-bad/60 bg-mo-bad/10",
  warn: "border-mo-warn/60 bg-mo-warn/10",
  normal: "border-mo bg-mo-surface",
  unknown: "border-dashed border-mo-strong bg-mo-surface",
}

export function ContentTiles({ tiles, compact = false, label }: { tiles: ContentTile[]; compact?: boolean; label?: string }) {
  return (
    <dl aria-label={label} className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {tiles.map((t) => (
        <div key={t.key} className={`rounded-mo border p-3 ${TONE[t.tone]}`} data-stat={t.key} data-tone={t.tone}>
          <dt className="text-xs text-mo-body">{t.label}</dt>
          <dd
            className={`mt-1 font-mo-display font-semibold ${compact ? "text-lg" : "text-xl"} ${
              t.tone === "unknown" ? "text-sm text-mo-body" : t.tone === "bad" ? "text-mo-bad" : "text-mo-ink"
            } ${t.display.length > 24 ? "!text-sm" : ""}`}
          >
            {t.display}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** One source that did not answer: its name and the reason, never zeros. */
function UnavailablePart({ part, compact = false }: { part: StatsPartView; compact?: boolean }) {
  return (
    <p role="status" data-part={part.name} data-state="unavailable" className={`flex items-start gap-2 rounded-mo border border-dashed border-mo-strong bg-mo-surface text-sm text-mo-body ${compact ? "p-2" : "p-3"}`}>
      <CircleOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold text-mo-ink">{part.label}</span>: unavailable{part.error ? ` (${part.error})` : ""}. These numbers are not known right now; they are not zero.
      </span>
    </p>
  )
}

/**
 * A content dashboard's numbers. Each source is its own group; one that did
 * not answer says so while the others still render. With `compact` (an
 * overview card) only the urgent tiles of the answered parts are shown, with
 * one line per unavailable part.
 */
export function ContentStatsPanel({ view, onRetry, compact = false }: { view: ContentStatsView; onRetry?: () => void; compact?: boolean }) {
  const down = view.parts.filter((p) => p.status === "unavailable")
  if (compact) {
    return (
      <div className="space-y-2">
        <ContentTiles tiles={urgentTiles(view)} compact />
        {down.map((p) => (
          <UnavailablePart key={p.name} part={p} compact />
        ))}
      </div>
    )
  }
  const several = view.parts.length > 1
  return (
    <div className="space-y-4">
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
      {view.parts.map((part) =>
        part.status === "unavailable" ? (
          <UnavailablePart key={part.name} part={part} />
        ) : (
          <section key={part.name} data-part={part.name} data-state={part.status} aria-label={part.label} className="space-y-2">
            {several ? <h3 className="text-sm font-semibold text-mo-ink">{part.label}</h3> : null}
            <ContentTiles tiles={part.tiles} />
            {part.generatedAt ? <p className="text-xs text-mo-body">Counted {new Date(part.generatedAt).toLocaleTimeString()}</p> : null}
          </section>
        ),
      )}
      {view.state === "partial" && onRetry ? (
        <button type="button" className={buttonSecondary} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

/** The note under a section whose server side does nothing yet. */
export function NotEnforcedNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="note" className="mb-4 flex items-start gap-2 rounded-mo border border-mo-warn/50 bg-mo-warn/10 p-3 text-sm text-mo-ink">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-mo-warn" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
