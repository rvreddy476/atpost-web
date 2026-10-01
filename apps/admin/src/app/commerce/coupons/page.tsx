"use client"

import { PageHeader } from "@/components/blocks/PageHeader"
import { StoreCoupons } from "@/components/commerce/StoreCoupons"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { findNavGroup } from "@/lib/admin/me"
import { canManageCoupons } from "@/lib/admin/storeCoupons"

/**
 * MStore → Coupons (commerce:coupons.manage). A typed URL without the
 * permission, or without MStore in the admin's navigation, gets the same
 * refusal as any other area they cannot open.
 */
export default function StoreCouponsPage() {
  const { me, nav } = useAdmin()
  if (!findNavGroup(nav, "commerce") || !canManageCoupons(me)) return <NoAccessToApp />
  return (
    <div>
      <PageHeader eyebrow="MStore" title="Coupons" description="Platform coupons MStore funds, and the coupons sellers run on their own products." />
      <StoreCoupons />
    </div>
  )
}
