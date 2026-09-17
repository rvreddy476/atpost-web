"use client"

import { useState } from "react"
import { Field } from "@/components/blocks/bits"
import { inputClass } from "@/components/blocks/buttons"
import { PageHeader } from "@/components/blocks/PageHeader"
import { Tabs } from "@/components/blocks/Tabs"
import { MoneyStats, MoneyTiles, useMoneyStats } from "@/components/money/MoneyBits"
import {
  PaymentsApplications,
  PaymentsAudit,
  PaymentsIntents,
  PaymentsReconciliation,
  PaymentsRefunds,
  type PaymentsSectionProps,
} from "@/components/money/PaymentsSections"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { findNavGroup } from "@/lib/admin/me"
import {
  PAY,
  acceptApplication,
  applicationChoices,
  initialApplication,
  paymentsApplicationLabel,
  paymentsCan,
  paymentsQuery,
  paymentsScope,
  paymentsStatsView,
  visiblePaymentsSections,
} from "@/lib/admin/payments"
import { PAYMENTS_SECTIONS } from "@/lib/admin/sections"

/**
 * Payments. A platform or payments admin sees every application and may
 * narrow to one; an admin confined to Feast, MStore or Dating sees only their
 * own application and is never offered another. Resolving a refund needs a
 * fresh 2FA code, and refunded manually or written off always waits for a
 * second admin, whatever the amount; only test data resolves at once.
 */
export default function PaymentsDashboard() {
  const { me, nav } = useAdmin()
  const group = findNavGroup(nav, "payments")
  const navEntry = me.navigation.find((n) => n.app === "payments")
  const scope = paymentsScope(me, navEntry?.applications)
  const [application, setApplication] = useState<string | null>(() => initialApplication(scope))
  const statsAllowed = application !== null && paymentsCan(me, scope, application, "stats.read")
  const stats = useMoneyStats("payments", `${PAY}/stats${paymentsQuery(application)}`, !!group && statsAllowed)

  if (!group || scope.kind === "none") return <NoAccessToApp />
  const choices = applicationChoices(scope)
  const tabs = application === null ? [] : visiblePaymentsSections(me, scope, application, PAYMENTS_SECTIONS)
  const props: PaymentsSectionProps | null = application === null ? null : { application, can: (action) => paymentsCan(me, scope, application, action) }
  const view = application === null ? null : paymentsStatsView(stats, application)

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} description="Refunds needing attention, payment intents, reconciliation and the application registry." />

      <div className="mb-6">
        {choices ? (
          <div className="w-64">
            <Field label="Application">
              {(id) => (
                <select
                  id={id}
                  className={inputClass}
                  value={application ?? ""}
                  onChange={(e) => {
                    const next = acceptApplication(scope, e.target.value)
                    if (next !== null) setApplication(next)
                  }}
                >
                  {application === null ? <option value="">Choose an application…</option> : null}
                  {choices.map((c) => (
                    <option key={c.value || "all"} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        ) : application ? (
          <p className="text-sm text-mo-body" data-testid="payments-application">
            Application: <span className="font-semibold text-mo-ink">{paymentsApplicationLabel(application)}</span>
          </p>
        ) : null}
      </div>

      {application === null ? (
        <p role="status" className="rounded-mo border border-mo bg-mo-surface p-6 text-sm text-mo-body">
          You may view more than one application. Choose one to load its payments.
        </p>
      ) : (
        <>
          {statsAllowed && view ? (
            <section aria-label="Key numbers" className="mb-6 space-y-4">
              <div>
                <h2 className="mb-2 text-sm font-semibold text-mo-ink">{application ? paymentsApplicationLabel(application) : "All applications"}</h2>
                <MoneyStats view={view} onRetry={stats.refetch} />
              </div>
              {view.applications.length > 0 ? (
                <details className="rounded-mo border border-mo bg-mo-surface p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-mo-ink">By application</summary>
                  <div className="mt-3 space-y-4">
                    {view.applications.map((a) => (
                      <div key={a.key}>
                        <h3 className="mb-2 text-sm text-mo-ink">{a.label}</h3>
                        <MoneyTiles tiles={a.tiles} label={`${a.label} numbers`} compact />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}
          {tabs.length > 0 && props ? (
            <Tabs key={application} tabs={tabs} label="Payments sections">
              {(id) => {
                switch (id) {
                  case "refunds":
                    return <PaymentsRefunds {...props} />
                  case "intents":
                    return <PaymentsIntents {...props} />
                  case "reconciliation":
                    return <PaymentsReconciliation {...props} />
                  case "applications":
                    return <PaymentsApplications {...props} />
                  case "audit":
                    return <PaymentsAudit {...props} />
                  default:
                    return null
                }
              }}
            </Tabs>
          ) : !statsAllowed ? (
            <p className="rounded-mo border border-mo bg-mo-surface p-6 text-sm text-mo-body">Your roles for {group.label} do not include any of its dashboard sections yet.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
