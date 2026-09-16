"use client"

import { useState } from "react"
import { ComingNext, PageHeader } from "@/components/blocks/PageHeader"
import { DateRangePicker } from "@/components/blocks/DateRangePicker"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { presetRange } from "@/lib/blocks/dateRange"

/**
 * Audit: the unified `admin.audit_log` trail, filterable by app, actor,
 * operation and date, with export. Placeholder until admin-service exposes a
 * read route (Wave 1 B4); the range picker is already wired to the filter
 * state the query will use.
 */
export default function AuditPage() {
  const { nav } = useAdmin()
  const [range, setRange] = useState(() => presetRange("7d", new Date()))
  if (!nav.console.some((link) => link.id === "audit")) return <NoAccessToApp />
  return (
    <div>
      <PageHeader
        eyebrow="Console"
        title="Audit"
        description="Every admin action: who, what, on which application, and why."
        actions={<DateRangePicker value={range} onChange={setRange} maxDays={90} />}
      />
      <ComingNext>
        The audit trail for {range.from} to {range.to} appears here once admin-service exposes its audit read route.
      </ComingNext>
    </div>
  )
}
