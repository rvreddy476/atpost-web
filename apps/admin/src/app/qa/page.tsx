"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { ContentStatsPanel, useContentStats } from "@/components/content/ContentStats"
import { QaActions, QaHide, QaQuestions, QaReports } from "@/components/content/QaSections"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { QA, QA_STATS_PART, singleStatsView } from "@/lib/admin/content"
import { findNavGroup } from "@/lib/admin/me"
import { QA_SECTIONS, canReadStats, visibleSections } from "@/lib/admin/sections"

/**
 * Q&A. Every write carries a reason (blank or over 2,000 characters is refused
 * before any call); merging two questions is irreversible and needs a fresh
 * 2FA code.
 */
export default function QaDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "qa")
  const statsAllowed = canReadStats(me, "qa")
  const stats = useContentStats("qa", `${QA}/stats`, !!group && statsAllowed)
  if (!group) return <NoAccessToApp />
  const tabs = visibleSections(me, "qa", QA_SECTIONS)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Reports on questions, answers and comments; hide, lock, mark duplicate or merge; the actions history." />
      {statsAllowed ? (
        <section aria-label="Key numbers" className="mb-6">
          <ContentStatsPanel view={singleStatsView(QA_STATS_PART, stats)} onRetry={stats.refetch} />
        </section>
      ) : null}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label="Q&A sections">
          {(id) => {
            switch (id) {
              case "reports":
                return <QaReports />
              case "questions":
                return <QaQuestions />
              case "answers":
                return <QaHide kind="answers" />
              case "comments":
                return <QaHide kind="comments" />
              case "actions":
                return <QaActions />
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
