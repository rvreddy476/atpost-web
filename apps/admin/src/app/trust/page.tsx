"use client"

import { AppDashboard } from "@/components/blocks/AppDashboard"
import { TrustAppeals, TrustReports } from "@/components/trust/TrustQueues"
import { TrustGrievances } from "@/components/trust/Grievances"
import { TrustKeywordFilters, TrustMediaLabels, TrustStrikes, TrustVerification } from "@/components/trust/TrustLookups"
import { TRUST_SECTIONS } from "@/lib/admin/sections"

/**
 * Trust & safety. Overdue grievances and those due within 48 hours lead the
 * header; appeals overturned and grievances closed ask for a fresh 2FA code
 * (admin-service decides that from the outcome sent).
 */
export default function TrustDashboard() {
  return (
    <AppDashboard
      app="trust_safety"
      description="Reports, appeals and grievances across every application. Grievances must be resolved within 15 days."
      sections={TRUST_SECTIONS}
      renderSection={(id) => {
        switch (id) {
          case "reports":
            return <TrustReports />
          case "appeals":
            return <TrustAppeals />
          case "grievances":
            return <TrustGrievances />
          case "strikes":
            return <TrustStrikes />
          case "verification":
            return <TrustVerification />
          case "media-labels":
            return <TrustMediaLabels />
          case "keyword-filters":
            return <TrustKeywordFilters />
          default:
            return null
        }
      }}
    />
  )
}
