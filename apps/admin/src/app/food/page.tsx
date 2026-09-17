"use client"

import { AppDashboard } from "@/components/blocks/AppDashboard"
import { FeastApprovals } from "@/components/food/FeastApprovals"
import { FeastOrders } from "@/components/food/FeastOrders"
import { FeastRefunds, FeastSettlements } from "@/components/food/FeastMoney"
import { FeastAudit, FeastCoupons, FeastModeration, FeastReports, FeastServiceAreas, FeastTickets } from "@/components/food/FeastOps"
import { FOOD_SECTIONS } from "@/lib/admin/sections"

/**
 * Feast. Money actions ask for a fresh 2FA code; every refund (issue or
 * request approval, whatever the amount) and every settlement mark-paid wait
 * for a second approver; refund issue and settlement generate carry an
 * Idempotency-Key reused across the 2FA retry.
 */
export default function FeastDashboard() {
  return (
    <AppDashboard
      app="food"
      description="Restaurant and rider approvals, orders, refunds, settlements and support."
      sections={FOOD_SECTIONS}
      renderSection={(id) => {
        switch (id) {
          case "approvals":
            return <FeastApprovals />
          case "orders":
            return <FeastOrders />
          case "refunds":
            return <FeastRefunds />
          case "settlements":
            return <FeastSettlements />
          case "moderation":
            return <FeastModeration />
          case "tickets":
            return <FeastTickets />
          case "coupons":
            return <FeastCoupons />
          case "service-areas":
            return <FeastServiceAreas />
          case "reports":
            return <FeastReports />
          case "audit":
            return <FeastAudit />
          default:
            return null
        }
      }}
    />
  )
}
