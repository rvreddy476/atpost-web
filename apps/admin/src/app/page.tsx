"use client"

import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"
import { useAdmin } from "@/components/shell/AdminShell"
import { PageHeader } from "@/components/blocks/PageHeader"
import { StatTiles, useAppStats } from "@/components/blocks/StatGrid"
import { ContentCard, useContentCards } from "@/components/content/ContentCards"
import { MonetizationCard, PaymentsCard, useMoneyCards } from "@/components/money/MoneyCards"
import { useApprovals } from "@/hooks/useApprovals"
import { canReadStats } from "@/lib/admin/sections"
import { STATS_APPS, statsView, type StatsApp } from "@/lib/admin/stats"
import type { NavGroup } from "@/lib/admin/me"

const isStatsApp = (app: string): app is StatsApp => (STATS_APPS as readonly string[]).includes(app)

/** One application's card: its most urgent numbers, or "unavailable" when they cannot be read. */
function StatsCard({ group, app }: { group: NavGroup; app: StatsApp }) {
  const stats = useAppStats(app, true)
  const view = statsView(app, stats, 4)
  return (
    <article className="flex h-full flex-col rounded-mo border border-mo bg-mo-surface p-4" aria-labelledby={`card-${app}`} data-app-card={app}>
      <div className="mb-3 flex items-center gap-2">
        <h2 id={`card-${app}`} className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">
          {group.label}
        </h2>
        <Link href={group.href} className="inline-flex items-center gap-1 text-sm text-mo-cyan hover:underline">
          Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {view.state === "unavailable" ? (
        <p role="alert" className="mb-2 text-xs text-mo-bad">
          Numbers unavailable: {view.message}
        </p>
      ) : null}
      <StatTiles view={view} compact />
    </article>
  )
}

/**
 * The landing page: one card per application this admin may open. Apps whose
 * stats this admin may read show their most urgent numbers (overdue
 * grievances, open panics, pending approvals and money owed); the rest are a
 * link to their dashboard.
 */
export default function AdminOverview() {
  const { nav, me } = useAdmin()
  const approvals = useApprovals()
  const waiting = approvals.items.filter((item) => item.status === "pending" && !item.requestedByMe).length
  const canSeeApprovals = nav.console.some((link) => link.id === "approvals")

  const withStats = STATS_APPS.flatMap((app) => {
    const group = nav.apps.find((g) => g.app === app)
    return group && canReadStats(me, app) ? [{ app, group }] : []
  })
  const money = useMoneyCards(nav.apps)
  const content = useContentCards(nav.apps)
  const others = nav.apps.filter(
    (g) =>
      !(isStatsApp(g.app) && canReadStats(me, g.app)) &&
      !(g.app === "monetization" && money.monetization) &&
      !(g.app === "payments" && money.payments) &&
      !content.some((c) => c.app === g.app),
  )
  const moneyCards = [
    money.monetization ? <MonetizationCard key="monetization" group={money.monetization} /> : null,
    money.payments ? <PaymentsCard key="payments" group={money.payments.group} applications={money.payments.applications} /> : null,
  ].filter(Boolean)

  return (
    <div>
      <PageHeader
        eyebrow="Admin console"
        title="Overview"
        description={
          nav.apps.length > 0
            ? "The most urgent numbers from each application you can open."
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

      {withStats.length + moneyCards.length + content.length > 0 ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2" aria-label="Application numbers">
          {withStats.map(({ app, group }) => (
            <StatsCard key={app} app={app} group={group} />
          ))}
          {moneyCards}
          {content.map(({ app, group }) => (
            <ContentCard key={app} app={app} group={group} />
          ))}
        </div>
      ) : null}

      {others.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Applications">
          {others.map((group) => (
            <li key={group.app}>
              <Link
                href={group.href}
                className="block h-full rounded-mo border border-mo bg-mo-surface p-5 transition-colors hover:border-mo-strong hover:bg-mo-raised"
              >
                <span className="font-mo-display text-lg font-semibold text-mo-ink">{group.label}</span>
                <span className="mt-1 block text-sm text-mo-body">
                  {group.links.length > 0 ? group.links.map((l) => l.label).join(", ") : "Open the dashboard"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
