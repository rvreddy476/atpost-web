"use client"

import { ComingNext, PageHeader } from "@/components/blocks/PageHeader"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"

/**
 * Access: grant and revoke roles per application, with expiry and reason; list
 * holders and their 2FA status. Placeholder until admin-service exposes the
 * role routes (Wave 1 B4). Role changes will go through useAdminMutation, so
 * step-up and the reason dialog already apply.
 */
export default function AccessPage() {
  const { nav } = useAdmin()
  if (!nav.console.some((link) => link.id === "access")) return <NoAccessToApp />
  return (
    <div>
      <PageHeader eyebrow="Console" title="Access" description="Who holds which admin role, for which application, until when." />
      <ComingNext>
        Role grants and revocations appear here once admin-service exposes its role routes. Every change will ask for a
        reason and a fresh 2FA code.
      </ComingNext>
    </div>
  )
}
