"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { BusinessPages } from "@/components/content/BusinessPages"
import { CommentsQueue, ContentReports, ContentReviewQueue, CreatorCounts, FlaggedReels } from "@/components/content/ContentQueues"
import { ContentStatsPanel, useContentStats } from "@/components/content/ContentStats"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { SOCIAL, SOCIAL_STATS_PARTS, mergedStatsView } from "@/lib/admin/content"
import { findNavGroup } from "@/lib/admin/me"
import { SOCIAL_SECTIONS, canReadStats, visibleSections } from "@/lib/admin/sections"

/**
 * Social. Numbers come from post-service (posts, reels, comments) and
 * user-service (business pages), each shown on its own. A rejection is a
 * takedown: the kind's `.remove` permission and a fresh 2FA code. Page
 * suspension, disabling, reinstating and every document read or decision are
 * step-up; documents are identity proofs and start blurred.
 */
export default function SocialDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "social")
  const statsAllowed = canReadStats(me, "social")
  const stats = useContentStats("social", `${SOCIAL}/stats`, !!group && statsAllowed)
  if (!group) return <NoAccessToApp />
  const tabs = visibleSections(me, "social", SOCIAL_SECTIONS)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Flagged and staged posts and reels, comments, content reports, creators and business pages." />
      {statsAllowed ? (
        <section aria-label="Key numbers" className="mb-6">
          <ContentStatsPanel view={mergedStatsView(SOCIAL_STATS_PARTS, stats)} onRetry={stats.refetch} />
        </section>
      ) : null}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label="Social sections">
          {(id) => {
            switch (id) {
              case "posts":
                return <ContentReviewQueue kind="post" />
              case "reels":
                return (
                  <>
                    <ContentReviewQueue kind="reel" />
                    <FlaggedReels />
                  </>
                )
              case "comments":
                return <CommentsQueue />
              case "reports":
                return <ContentReports app="social" />
              case "creators":
                return <CreatorCounts />
              case "pages":
                return <BusinessPages />
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
