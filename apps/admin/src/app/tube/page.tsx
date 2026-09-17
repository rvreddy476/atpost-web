"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { ContentReports, ContentReviewQueue } from "@/components/content/ContentQueues"
import { ContentStatsPanel, useContentStats } from "@/components/content/ContentStats"
import { CreatorSeries, TubeChannels } from "@/components/content/TubeSections"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { TUBE, TUBE_STATS_PART, singleStatsView } from "@/lib/admin/content"
import { findNavGroup } from "@/lib/admin/me"
import { TUBE_SECTIONS, canReadStats, visibleSections } from "@/lib/admin/sections"

/**
 * Tube. Long videos on post-service: the review queues and decisions (a
 * rejection is a takedown: `tube:videos.remove` and a fresh 2FA code), video
 * reports, channels (read-only) and a creator's series.
 */
export default function TubeDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "tube")
  const statsAllowed = canReadStats(me, "tube")
  const stats = useContentStats("tube", `${TUBE}/stats`, !!group && statsAllowed)
  if (!group) return <NoAccessToApp />
  const tabs = visibleSections(me, "tube", TUBE_SECTIONS)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Flagged and staged videos, video reports, channels and creator series." />
      {statsAllowed ? (
        <section aria-label="Key numbers" className="mb-6">
          <ContentStatsPanel view={singleStatsView(TUBE_STATS_PART, stats)} onRetry={stats.refetch} />
        </section>
      ) : null}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label="Tube sections">
          {(id) => {
            switch (id) {
              case "videos":
                return <ContentReviewQueue kind="video" />
              case "reports":
                return <ContentReports app="tube" />
              case "channels":
                return <TubeChannels />
              case "series":
                return <CreatorSeries />
              default:
                return null
            }
          }}
        </Tabs>
      ) : !statsAllowed ? (
        <p className="rounded-mo border border-mo bg-mo-surface p-6 text-sm text-mo-body">Your roles for {group.label} do not include any of its dashboard sections yet.</p>
      ) : null}
    </div>
  )
}
