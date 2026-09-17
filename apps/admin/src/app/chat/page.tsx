"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { ChatChannels, ChatGroupReports } from "@/components/content/ChatSections"
import { ContentStatsPanel, useContentStats } from "@/components/content/ContentStats"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { CHAT, CHAT_STATS_PARTS, mergedStatsView } from "@/lib/admin/content"
import { findNavGroup } from "@/lib/admin/me"
import { CHAT_SECTIONS, canReadStats, visibleSections } from "@/lib/admin/sections"

/**
 * Chat. Stats come from channel-, group- and community-service, one part
 * each; a part that did not answer says so. Suspending or unsuspending a
 * channel needs a fresh 2FA code; group and community decisions are recorded
 * but not enforced yet.
 */
export default function ChatDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "chat")
  const statsAllowed = canReadStats(me, "chat")
  const stats = useContentStats("chat", `${CHAT}/stats`, !!group && statsAllowed)
  if (!group) return <NoAccessToApp />
  const tabs = visibleSections(me, "chat", CHAT_SECTIONS)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Reports on broadcast channels, groups and communities; channel suspension." />
      {statsAllowed ? (
        <section aria-label="Key numbers" className="mb-6">
          <ContentStatsPanel view={mergedStatsView(CHAT_STATS_PARTS, stats)} onRetry={stats.refetch} />
        </section>
      ) : null}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label="Chat sections">
          {(id) => {
            switch (id) {
              case "channels":
                return <ChatChannels />
              case "groups":
                return <ChatGroupReports scope="groups" />
              case "communities":
                return <ChatGroupReports scope="communities" />
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
