"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { LiveBans, LiveNow, LiveReports } from "@/components/live/LiveSections"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { liveAbilities } from "@/lib/admin/live"
import { findNavGroup } from "@/lib/admin/me"

/**
 * Live (live-service-v2). Opens only with live:streams.read; the reports and
 * the bans appear with their own read permissions, and every button with the
 * permission for that write. Every write asks for a fresh 2FA code first and
 * needs a written reason.
 */
export default function LiveDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "live")
  const can = liveAbilities(me)
  if (!group || !can.page) return <NoAccessToApp />

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Streams on air now, open viewer reports, and platform-wide live bans." />
      <LiveNow />
      {can.reports ? <LiveReports /> : null}
      {can.ban ? <LiveBans /> : null}
    </div>
  )
}
