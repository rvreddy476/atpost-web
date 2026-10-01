"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { BankOffers, BankOffersExplainer } from "@/components/money/BankOffers"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { canManageOffers } from "@/lib/admin/bankOffers"
import { findNavGroup } from "@/lib/admin/me"

/**
 * Money → Bank offers (payments:offers.manage). A typed URL without the
 * permission, or without Payments in the admin's navigation, gets the same
 * refusal as any other area they cannot open.
 */
export default function BankOffersPage() {
  const { me, nav } = useAdmin()
  if (!findNavGroup(nav, "payments") || !canManageOffers(me)) return <NoAccessToApp />
  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Bank offers"
        description="Razorpay Offers that MStore checkout makes available to buyers, and the terms payments-service checks a discounted payment against."
      />
      <BankOffersExplainer />
      <BankOffers />
    </div>
  )
}
