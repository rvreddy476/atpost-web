"use client"

import { use } from "react"
import { ComingNext, PageHeader } from "@/components/blocks/PageHeader"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { findNavGroup } from "@/lib/admin/me"

/**
 * One application's dashboard. A placeholder the Wave 2 dashboards replace
 * app by app (a static route such as app/dating/page.tsx wins over this one).
 *
 * The route answers only for an app in this admin's navigation; a typed URL
 * for any other app shows the same refusal as one they cannot see.
 */
export default function AppDashboardPlaceholder({ params }: { params: Promise<{ app: string }> }) {
  const { app } = use(params)
  const { nav } = useAdmin()
  const group = findNavGroup(nav, app)
  if (!group) return <NoAccessToApp />

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} />
      <ComingNext>
        The {group.label} dashboard — its key numbers, work queues and audit view — is being built. Actions here will
        run through the admin console with 2FA step-up where required.
      </ComingNext>
    </div>
  )
}
