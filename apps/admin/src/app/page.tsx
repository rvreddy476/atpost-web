"use client"

import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"
import { useAdmin } from "@/components/shell/AdminShell"
import { PageHeader } from "@/components/blocks/PageHeader"
import { useApprovals } from "@/hooks/useApprovals"

/**
 * The landing page: every application this admin may open, and the approvals
 * waiting for them. Platform-wide counts (users, signups, overdue grievances)
 * arrive with admin-service's stats route in Wave 1 B2/B4.
 */
export default function AdminOverview() {
  const { nav, me } = useAdmin()
  const approvals = useApprovals()
  const waiting = approvals.items.filter((item) => item.status === "pending" && !item.requestedByMe).length
  const canSeeApprovals = nav.console.some((link) => link.id === "approvals")

  return (
    <div>
      <PageHeader
        eyebrow="Admin console"
        title="Overview"
        description={
          nav.apps.length > 0
            ? "Pick an application to open its dashboard."
            : "Your account holds no application permissions yet. A platform admin can grant them from Access."
        }
      />

      {canSeeApprovals ? (
        <Link
          href="/approvals"
          className="mb-6 flex items-center gap-3 rounded-mo border border-mo bg-mo-surface p-4 hover:border-mo-strong"
        >
          <Inbox className="h-5 w-5 text-mo-cyan" aria-hidden="true" />
          <span className="flex-1 text-sm text-mo-ink">
            {approvals.isLoading
              ? "Checking approvals…"
              : approvals.isError
                ? "Approvals could not be loaded."
                : waiting === 0
                  ? "No approvals waiting for you."
                  : `${waiting} approval${waiting === 1 ? "" : "s"} waiting for you`}
          </span>
          <ArrowRight className="h-4 w-4 text-mo-body" aria-hidden="true" />
        </Link>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Applications">
        {nav.apps.map((group) => (
          <li key={group.app}>
            <Link
              href={group.href}
              className="block h-full rounded-mo border border-mo bg-mo-surface p-5 transition-colors hover:border-mo-strong hover:bg-mo-raised"
            >
              <span className="font-mo-display text-lg font-semibold text-mo-ink">{group.label}</span>
              <span className="mt-1 block text-sm text-mo-body">
                {(me.apps[group.app]?.length ?? 0) > 0
                  ? `${me.apps[group.app]?.length} permission${me.apps[group.app]?.length === 1 ? "" : "s"}`
                  : "Platform access"}
                {group.links.length > 0 ? ` · ${group.links.map((l) => l.label).join(", ")}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
