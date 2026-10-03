"use client"

import { useState } from "react"
import { useAdmin } from "@/components/shell/AdminShell"
import { can } from "@/lib/admin/sections"
import { AreaSwitch } from "./DoorstepBits"
import { DoorstepDocumentQueue } from "./DoorstepDocuments"
import { DoorstepProfessionals } from "./DoorstepProfessionals"

type Area = "professionals" | "documents"

/**
 * Approvals: professionals waiting for review (their readiness decides
 * whether Approve is offered) and the document queue, police clearance
 * certificates first. Each area shows only to an admin who can read it: the
 * waiting list needs pros.read, the queue documents.review.
 */
export function DoorstepApprovals() {
  const { me } = useAdmin()
  const areas = [
    ...(can(me, "doorstep", "pros.read") ? [{ id: "professionals" as const, label: "Professionals waiting" }] : []),
    ...(can(me, "doorstep", "documents.review") ? [{ id: "documents" as const, label: "Documents and police certificates" }] : []),
  ]
  const [area, setArea] = useState<Area>(areas[0]?.id ?? "professionals")
  if (areas.length === 0) return <p className="text-sm text-mo-body">Reviewing professionals needs the professionals read or document review permission.</p>
  const current = areas.some((a) => a.id === area) ? area : areas[0].id

  return (
    <div>
      {areas.length > 1 ? <AreaSwitch value={current} areas={areas} onChange={setArea} label="Which approvals" /> : null}
      {current === "professionals" ? <DoorstepProfessionals initialStatus="pending_verification" caption="Professionals waiting for review" /> : <DoorstepDocumentQueue />}
    </div>
  )
}
