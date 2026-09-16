"use client"

import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { findNavGroup } from "@/lib/admin/me"
import { canReadStats, visibleSections, type SectionDef } from "@/lib/admin/sections"
import type { StatsApp } from "@/lib/admin/stats"
import { PageHeader } from "./PageHeader"
import { StatsHeader } from "./StatGrid"
import { Tabs } from "./Tabs"

/**
 * One application's dashboard: its stats header (with `<app>:stats.read`),
 * then a tab per section the admin holds a permission for. An admin with the
 * app in their navigation but none of these sections sees an honest note, and
 * one without the app sees the same refusal as any typed URL.
 */
export function AppDashboard({
  app,
  description,
  sections,
  renderSection,
  extra,
}: {
  app: StatsApp
  description?: React.ReactNode
  sections: readonly SectionDef[]
  renderSection: (id: string) => React.ReactNode
  /** Shown between the stats and the tabs (MStore's links to its older screens). */
  extra?: React.ReactNode
}) {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, app)
  if (!group) return <NoAccessToApp />
  const tabs = visibleSections(me, app, sections)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description={description} />
      <StatsHeader app={app} />
      {extra}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label={`${group.label} sections`}>
          {renderSection}
        </Tabs>
      ) : !canReadStats(me, app) && !extra ? (
        <p className="rounded-mo border border-mo bg-mo-surface p-6 text-sm text-mo-body">
          Your roles for {group.label} do not include any of its dashboard sections yet.
        </p>
      ) : null}
    </div>
  )
}
