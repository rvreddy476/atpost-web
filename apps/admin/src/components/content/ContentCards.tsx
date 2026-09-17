"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useAdmin } from "@/components/shell/AdminShell"
import { CHAT, CHAT_STATS_PARTS, QA, QA_STATS_PART, SOCIAL, SOCIAL_STATS_PARTS, TUBE, TUBE_STATS_PART, mergedStatsView, singleStatsView, type ContentStatsView } from "@/lib/admin/content"
import type { NavGroup } from "@/lib/admin/me"
import { canReadStats } from "@/lib/admin/sections"
import { ContentStatsPanel, useContentStats } from "./ContentStats"

export type ContentCardApp = "social" | "tube" | "qa" | "chat"
export const CONTENT_CARD_APPS: readonly ContentCardApp[] = ["social", "tube", "qa", "chat"]

function Card({ group, children }: { group: NavGroup; children: React.ReactNode }) {
  return (
    <article className="flex h-full flex-col rounded-mo border border-mo bg-mo-surface p-4" aria-labelledby={`card-${group.app}`} data-app-card={group.app}>
      <div className="mb-3 flex items-center gap-2">
        <h2 id={`card-${group.app}`} className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">
          {group.label}
        </h2>
        <Link href={group.href} className="inline-flex items-center gap-1 text-sm text-mo-cyan hover:underline">
          Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </article>
  )
}

const CARD: Record<ContentCardApp, { url: string; view: (result: Parameters<typeof singleStatsView>[1]) => ContentStatsView }> = {
  social: { url: `${SOCIAL}/stats`, view: (r) => mergedStatsView(SOCIAL_STATS_PARTS, r, { compact: true }) },
  tube: { url: `${TUBE}/stats`, view: (r) => singleStatsView(TUBE_STATS_PART, r, { compact: true }) },
  qa: { url: `${QA}/stats`, view: (r) => singleStatsView(QA_STATS_PART, r, { compact: true }) },
  chat: { url: `${CHAT}/stats`, view: (r) => mergedStatsView(CHAT_STATS_PARTS, r, { compact: true }) },
}

/** One content app's card: its urgent numbers first (open reports, flagged pending), each unavailable source named. */
export function ContentCard({ app, group }: { app: ContentCardApp; group: NavGroup }) {
  const stats = useContentStats(app, CARD[app].url, true)
  return (
    <Card group={group}>
      <ContentStatsPanel view={CARD[app].view(stats)} compact />
    </Card>
  )
}

/** The content apps whose stats this admin may read, in the rail's order. */
export function useContentCards(groups: NavGroup[]): { app: ContentCardApp; group: NavGroup }[] {
  const { me } = useAdmin()
  return groups.flatMap((group) => {
    const app = CONTENT_CARD_APPS.find((a) => a === group.app)
    return app && canReadStats(me, app) ? [{ app, group }] : []
  })
}
