"use client"

import { AppDashboard } from "@/components/blocks/AppDashboard"
import { DoorstepApprovals } from "@/components/doorstep/DoorstepApprovals"
import { DoorstepBookings } from "@/components/doorstep/DoorstepBookings"
import { DoorstepCatalogue } from "@/components/doorstep/DoorstepCatalogue"
import { DoorstepConfig } from "@/components/doorstep/DoorstepConfig"
import { DoorstepAudit, DoorstepMoney } from "@/components/doorstep/DoorstepMoney"
import { DoorstepProfessionals } from "@/components/doorstep/DoorstepProfessionals"
import { DoorstepIncidents, DoorstepRatings, DoorstepTickets } from "@/components/doorstep/DoorstepSafety"
import { DOORSTEP_SECTIONS } from "@/lib/admin/sections"

/**
 * Doorstep, home services (doorstep-service through admin-service). The key
 * numbers head the page (doorstep:stats.read). Step-up: suspending,
 * reinstating or blocking a professional, document decisions and every
 * document image (view only, watermarked, one audit row per view), an ops
 * cancellation, new prices and rate cards, and cancellation-fee and
 * commission rules. Two-person: every refund. The product stays dormant to
 * the public behind the gateway's pilot gate.
 */
export default function DoorstepDashboard() {
  return (
    <AppDashboard
      app="doorstep"
      description="Professionals and their documents, bookings, safety incidents and support; the catalogue, prices and city configuration."
      sections={DOORSTEP_SECTIONS}
      renderSection={(id) => {
        switch (id) {
          case "approvals":
            return <DoorstepApprovals />
          case "professionals":
            return <DoorstepProfessionals />
          case "bookings":
            return <DoorstepBookings />
          case "incidents":
            return <DoorstepIncidents />
          case "tickets":
            return <DoorstepTickets />
          case "ratings":
            return <DoorstepRatings />
          case "catalogue":
            return <DoorstepCatalogue />
          case "config":
            return <DoorstepConfig />
          case "money":
            return <DoorstepMoney />
          case "audit":
            return <DoorstepAudit />
          default:
            return null
        }
      }}
    />
  )
}
