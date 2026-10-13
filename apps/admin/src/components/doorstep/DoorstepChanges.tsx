"use client"

import { useState } from "react"
import { Details } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { humanise, isRecord, readList, str, when, type Row } from "@/lib/admin/data"
import { DoorstepActionDialog, useDoorstepMutation, useDoorstepStepUpRead, useMayWrite } from "./DoorstepBits"
import { useDocumentViewer } from "./DoorstepDocuments"
import { ProfessionalDetail } from "./DoorstepProfessionals"

export function changeDetails(r: Row): [string,string][] {
 const p = isRecord(r.payload) ? r.payload : {}
 const profile = isRecord(p.profile) ? p.profile : {}
 const area = isRecord(p.area) ? p.area : {}
 if (r.kind === "profile") return [["Requested name",str(profile.display_name) ?? "Unchanged"],["Profile photo",profile.photo_media_id ? "Replacement photo submitted" : "Unchanged"]]
 if (r.kind === "area") return [["Requested area",str(area.area_label) ?? "Selected map location"],["Travel radius",typeof area.radius_m === "number" ? `${area.radius_m / 1000} km` : "—"]]
 if (r.kind === "pan") return [["PAN",`Ending ${str(p.pan_last4) ?? "—"}`],["Next step","Record a fresh identity review after approving this change."]]
 if (r.kind === "skills") return [["Requested services",Array.isArray(p.skills) ? p.skills.filter(isRecord).map(s=>humanise(s.Code)).join(", ") : "—"]]
 if (r.kind === "hours") return [["Requested hours",Array.isArray(p.hours) ? p.hours.filter(isRecord).map(w=>`${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][Number(w.Weekday)] ?? "Day"} ${str(w.Start)}–${str(w.End)}`).join("; ") : "—"]]
 return []
}

export function DoorstepChanges() {
 const query = useDoorstepStepUpRead("/v1/admin/doorstep/partner-changes")
 const mayWrite = useMayWrite()
 const viewer = useDocumentViewer(true)
 const [open,setOpen] = useState<string|null>(null)
 const [pending,setPending] = useState<{row:Row;write:"change.approve"|"change.reject"}|null>(null)
 const mutation = useDoorstepMutation({onDone:()=>setPending(null)})
 if (open) return <ProfessionalDetail id={open} onBack={()=>setOpen(null)}/>
 if (query.isLoading) return <p>Loading submitted changes…</p>
 if (query.error || query.dismissed) return <div role="alert"><p>{query.error ?? "The review queue could not be opened."}</p><button className={buttonSecondary} onClick={query.retry}>Try again</button></div>
 const rows = readList(query.raw)
 return <section className="space-y-4">
  <h3 className="text-lg font-semibold">Partner change requests</h3>
  {!rows.length && <p className="text-mo-body">No changes are awaiting review.</p>}
  {viewer.element}
  {rows.map(r=><article className="rounded-mo border border-mo bg-mo-surface p-5 space-y-4" key={String(r.id)}>
   <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{humanise(r.kind)} change</h4><span className="text-sm text-mo-body">{when(r.created_at)}</span></div>
   <Details items={changeDetails(r)}/>
   {r.kind === "profile" && isRecord(r.payload) && isRecord(r.payload.profile) && Boolean(r.payload.profile.photo_media_id) && <button className={buttonSecondary} disabled={viewer.openingId !== null} onClick={()=>void viewer.view({...r,kind:"profile_photo"})}>View submitted photo</button>}
   <div className="flex flex-wrap gap-2">
    <button className={buttonSecondary} onClick={()=>setOpen(String(r.pro_id))}>View partner</button>
    {mayWrite("change.approve") && <><button className={buttonPrimary} onClick={()=>setPending({row:r,write:"change.approve"})}>Approve change</button><button className={buttonSecondary} onClick={()=>setPending({row:r,write:"change.reject"})}>Reject change</button></>}
   </div>
  </article>)}
  {pending && <DoorstepActionDialog write={pending.write} subject={`${humanise(pending.row.kind)} change`} busy={mutation.isPending} onClose={()=>setPending(null)} onConfirm={reason=>mutation.mutate({write:pending.write,target:{id:String(pending.row.id)},body:{decision:pending.write === "change.approve" ? "approve" : "reject",reason}})}/>}
 </section>
}
