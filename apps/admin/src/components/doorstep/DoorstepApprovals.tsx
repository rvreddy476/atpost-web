"use client"

import { useState } from "react"
import { useAdmin } from "@/components/shell/AdminShell"
import { can } from "@/lib/admin/sections"
import { AreaSwitch } from "./DoorstepBits"
import { DoorstepDocumentQueue } from "./DoorstepDocuments"
import { DoorstepPriceQueue } from "./DoorstepPrices"
import { DoorstepProfessionals } from "./DoorstepProfessionals"

type Area = "professionals" | "documents" | "prices"

/**
 * Approvals. Founder rule (4 Oct 2026): nothing a professional submits is
 * approved by itself, so everything waits here for an admin: professionals
 * (their readiness decides whether Approve is offered; skills are verified
 * on the professional), documents (selfies, with the face match as advice
 * only, trade and police certificates) and prices. Each area shows only to
 * an admin who can read it: the waiting list needs pros.read, the document
 * queue documents.review, the price queue prices.review.
 */
export function DoorstepApprovals() {
  const { me } = useAdmin()
  const areas = [
    ...(can(me, "doorstep", "pros.read") ? [{ id: "professionals" as const, label: "Professionals waiting" }] : []),
    ...(can(me, "doorstep", "documents.review") ? [{ id: "documents" as const, label: "Selfies and documents" }] : []),
    ...(can(me, "doorstep", "prices.review") ? [{ id: "prices" as const, label: "Prices" }] : []),
  ]
  const [area, setArea] = useState<Area>(areas[0]?.id ?? "professionals")
  if (areas.length === 0) return <p className="text-sm text-mo-body">Reviewing professionals needs the professionals read, document review or price review permission.</p>
  const current = areas.some((a) => a.id === area) ? area : areas[0].id

  return (
    <div>
      {areas.length > 1 ? <AreaSwitch value={current} areas={areas} onChange={setArea} label="Which approvals" /> : null}
      {current === "professionals" ? (
        <DoorstepProfessionals initialStatus="pending_verification" caption="Professionals waiting for review" />
      ) : current === "documents" ? (
        <DoorstepDocumentQueue />
      ) : (
        <DoorstepPriceQueue />
      )}
    </div>
  )
}
