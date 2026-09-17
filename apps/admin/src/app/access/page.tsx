"use client"

import { AccessAudit } from "@/components/access/AccessAudit"
import { AccessGrant } from "@/components/access/AccessGrant"
import { AccessHolders } from "@/components/access/AccessHolders"
import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { ErrorNote } from "@/components/blocks/bits"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { useAdminObject } from "@/hooks/useAdminQuery"
import { ACCESS, accessTabs, readCatalogue } from "@/lib/admin/access"

/**
 * Access: who holds which admin role, for which application, until when,
 * and whether they have 2FA enrolled; grant and revoke with a reason and a
 * fresh 2FA code; the trail of those changes. The shell shows the page to
 * any platform permission; the tabs need `platform:roles.read` (Holders,
 * Audit) and `platform:roles.manage` (Grant). Emails are never shown
 * unmasked.
 */
export default function AccessPage() {
  const { me, nav } = useAdmin()
  const allowed = nav.console.some((link) => link.id === "access")
  const tabs = allowed ? accessTabs(me) : []
  const catalogue = useAdminObject("platform", `${ACCESS}/catalogue`, { enabled: tabs.length > 0 })
  if (!allowed) return <NoAccessToApp />
  const cat = readCatalogue(catalogue.raw)

  return (
    <div>
      <PageHeader eyebrow="Console" title="Access" description="Who holds which admin role, for which application, until when — and whether they have 2FA. Every change asks for a reason and a fresh 2FA code." />
      {catalogue.error ? <div className="mb-4"><ErrorNote message={`The role catalogue could not be loaded (${catalogue.error}). Roles and applications cannot be chosen until it is.`} onRetry={catalogue.refetch} /></div> : null}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label="Access sections">
          {(id) => {
            switch (id) {
              case "holders":
                return <AccessHolders catalogue={cat} />
              case "grant":
                return <AccessGrant catalogue={cat} />
              case "audit":
                return <AccessAudit />
              default:
                return null
            }
          }}
        </Tabs>
      ) : (
        <p className="rounded-mo border border-mo bg-mo-surface p-6 text-sm text-mo-body">Your platform permissions do not include reading or managing roles.</p>
      )}
    </div>
  )
}
