"use client"

import { AppDashboard } from "@/components/blocks/AppDashboard"
import { DatingPhotos, DatingReports, DatingSelfies } from "@/components/dating/DatingQueues"
import { DatingAudit, DatingPanic, DatingRisk } from "@/components/dating/DatingSafety"
import { DATING_SECTIONS } from "@/lib/admin/sections"

/**
 * Dating. Suspending or reinstating a profile and revealing a panic location
 * need a fresh 2FA code; nothing in Dating is two-person (a suspension is
 * reversible — permanent bans land platform-wide in identity).
 */
export default function DatingDashboard() {
  return (
    <AppDashboard
      app="dating"
      description="Reports, photo and selfie review, panic incidents and account risk."
      sections={DATING_SECTIONS}
      renderSection={(id) => {
        switch (id) {
          case "reports":
            return <DatingReports />
          case "photos":
            return <DatingPhotos />
          case "selfies":
            return <DatingSelfies />
          case "panic":
            return <DatingPanic />
          case "risk":
            return <DatingRisk />
          case "audit":
            return <DatingAudit />
          default:
            return null
        }
      }}
    />
  )
}
