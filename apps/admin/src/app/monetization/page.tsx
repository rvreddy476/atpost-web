"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { CreatorFund } from "@/components/money/CreatorFund"
import { Creators, MonetizationRefunds, Wallets } from "@/components/money/MonetizationActions"
import { Disputes, FraudReviews, MonetizationAudit, PayoutRequests } from "@/components/money/MonetizationQueues"
import { MoneyStats, useMoneyStats } from "@/components/money/MoneyBits"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { findNavGroup } from "@/lib/admin/me"
import { MON, monetizationStatsView } from "@/lib/admin/monetization"
import { MONETIZATION_SECTIONS, canReadStats, visibleSections } from "@/lib/admin/sections"

/**
 * Monetization. Every write needs a fresh 2FA code; creator-fund rates, quality
 * bands, budgets, settlement and reversals always wait for a second approver,
 * and refunds do at ₹5,000 or more. While money is switched off for the beta
 * the page says so instead of showing numbers.
 */
export default function MonetizationDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "monetization")
  const statsAllowed = canReadStats(me, "monetization")
  const stats = useMoneyStats("monetization", `${MON}/stats`, !!group && statsAllowed)
  if (!group) return <NoAccessToApp />
  const tabs = visibleSections(me, "monetization", MONETIZATION_SECTIONS)
  const view = monetizationStatsView(stats)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Fraud reviews, wallets, the creator fund, disputes, refunds and the payout queue." />
      {statsAllowed ? (
        <section aria-label="Key numbers" className="mb-6">
          <MoneyStats view={view} onRetry={stats.refetch} />
        </section>
      ) : null}
      {tabs.length > 0 ? (
        <Tabs tabs={tabs} label="Monetization sections">
          {(id) => {
            switch (id) {
              case "fraud":
                return <FraudReviews />
              case "wallets":
                return <Wallets />
              case "fund":
                return <CreatorFund />
              case "creators":
                return <Creators />
              case "disputes":
                return <Disputes />
              case "refunds":
                return <MonetizationRefunds />
              case "payouts":
                return <PayoutRequests />
              case "audit":
                return <MonetizationAudit />
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
