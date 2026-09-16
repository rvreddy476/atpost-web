"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useAdmin } from "@/components/shell/AdminShell"
import type { NavGroup } from "@/lib/admin/me"
import { MON, monetizationStatsView } from "@/lib/admin/monetization"
import { PAY, paymentsApplicationLabel, paymentsCan, paymentsQuery, paymentsScope, paymentsStatsView, type PaymentsScope } from "@/lib/admin/payments"
import { canReadStats } from "@/lib/admin/sections"
import { MoneyStats, useMoneyStats } from "./MoneyBits"

function Card({ group, app, children }: { group: NavGroup; app: string; children: React.ReactNode }) {
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
      {children}
    </article>
  )
}

/** Monetization: open fraud reviews first, or the calm "not launched" note instead of numbers. */
export function MonetizationCard({ group }: { group: NavGroup }) {
  const stats = useMoneyStats("monetization", `${MON}/stats`, true)
  return (
    <Card group={group} app="monetization">
      <MoneyStats view={monetizationStatsView(stats, 4)} compact />
    </Card>
  )
}

function PaymentsNumbers({ application, title }: { application: string; title?: string }) {
  const stats = useMoneyStats("payments", `${PAY}/stats${paymentsQuery(application)}`, true)
  return (
    <div>
      {title ? <h3 className="mb-2 text-sm text-mo-ink">{title}</h3> : null}
      <MoneyStats view={paymentsStatsView(stats, application, 4)} compact />
    </div>
  )
}

/** The applications whose payments stats this admin may read: [""] for all, or each confined one. */
export function paymentsStatsApplications(me: Parameters<typeof paymentsCan>[0], scope: PaymentsScope): string[] {
  if (scope.kind === "all") return paymentsCan(me, scope, "", "stats.read") ? [""] : []
  if (scope.kind === "confined") return scope.applications.filter((a) => paymentsCan(me, scope, a, "stats.read"))
  return []
}

/** Payments: refunds needing attention first, then stuck intents; per application for a confined admin. */
export function PaymentsCard({ group, applications }: { group: NavGroup; applications: string[] }) {
  return (
    <Card group={group} app="payments">
      <div className="space-y-4">
        {applications.map((a) => (
          <PaymentsNumbers key={a || "all"} application={a} title={applications.length > 1 || a ? paymentsApplicationLabel(a) : undefined} />
        ))}
      </div>
    </Card>
  )
}

/** Which Money cards the overview shows for this admin. */
export function useMoneyCards(groups: NavGroup[]) {
  const { me } = useAdmin()
  const monetization = groups.find((g) => g.app === "monetization")
  const payments = groups.find((g) => g.app === "payments")
  const scope = paymentsScope(me, me.navigation.find((n) => n.app === "payments")?.applications)
  const paymentApps = payments ? paymentsStatsApplications(me, scope) : []
  return {
    monetization: monetization && canReadStats(me, "monetization") ? monetization : null,
    payments: payments && paymentApps.length > 0 ? { group: payments, applications: paymentApps } : null,
  }
}
