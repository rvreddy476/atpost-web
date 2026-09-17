"use client"

import { AppDashboard } from "@/components/blocks/AppDashboard"
import { RiderCities, RiderFares } from "@/components/rider/RiderConfig"
import { RiderComplaints, RiderRides } from "@/components/rider/RiderOps"
import { RiderPartners } from "@/components/rider/RiderPartners"
import { RiderAudit, RiderReports } from "@/components/rider/RiderReports"
import { RiderDocuments, RiderPayments, RiderVehicles } from "@/components/rider/RiderReview"
import { RiderIncidents } from "@/components/rider/RiderSafety"
import { RIDER_SECTIONS } from "@/lib/admin/sections"

/**
 * Mopedu (rider-service through admin-service). Step-up: suspending or
 * blocking a partner, the document list and decisions (a KYC reveal),
 * verifying or rejecting a subscription payment, cancelling a ride, an
 * incident's contact alerts, and fare rules. Nothing here is two-person: no
 * money leaves the platform. The product stays dormant to the public.
 */
export default function RiderDashboard() {
  return (
    <AppDashboard
      app="rider"
      description="Partners, their documents, vehicles and subscription payments; rides, complaints and safety incidents; cities, zones and fares."
      sections={RIDER_SECTIONS}
      renderSection={(id) => {
        switch (id) {
          case "partners":
            return <RiderPartners />
          case "documents":
            return <RiderDocuments />
          case "vehicles":
            return <RiderVehicles />
          case "payments":
            return <RiderPayments />
          case "rides":
            return <RiderRides />
          case "complaints":
            return <RiderComplaints />
          case "incidents":
            return <RiderIncidents />
          case "cities":
            return <RiderCities />
          case "fares":
            return <RiderFares />
          case "reports":
            return <RiderReports />
          case "audit":
            return <RiderAudit />
          default:
            return null
        }
      }}
    />
  )
}
