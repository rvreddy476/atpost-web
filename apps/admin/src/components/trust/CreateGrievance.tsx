"use client"
import { useState } from "react"
import { Plus } from "lucide-react"
import { Dialog } from "@/components/blocks/Dialog"
import { Field } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey } from "@/hooks/useAdminQuery"
import { can } from "@/lib/admin/sections"
import { humanise, isUuid } from "@/lib/admin/data"

export function CreateGrievance({onCreated}:{onCreated:()=>void}) {
  const {me,nav}=useAdmin()
  const [open,setOpen]=useState(false)
  const [subject,setSubject]=useState("other")
  const [module,setModule]=useState("")
  const [description,setDescription]=useState("")
  const [entity,setEntity]=useState("")
  const [attempted,setAttempted]=useState(false)
  const error=description.trim().length<10?"Add at least 10 characters describing the issue.":entity.trim()&&!isUuid(entity.trim())?"Enter a valid related item ID or leave it empty.":null
  const mutation=useAdminMutation<Record<string,string>>({
    request:body=>({method:"post",url:"/v1/admin/trust/grievances",body}),
    invalidate:[adminKey("trust_safety")], successMessage:"Grievance submitted",errorTitle:"Could not submit grievance",
    onDone:()=>{setOpen(false);setDescription("");setEntity("");setAttempted(false);onCreated()},
  })
  if(!can(me,"trust_safety","grievances.act"))return null
  return <>
    <button type="button" className={buttonPrimary} onClick={()=>setOpen(true)}><Plus size={16}/> Raise grievance</button>
    <Dialog open={open} title="Raise a grievance" onClose={()=>setOpen(false)} dismissible={!mutation.isPending}>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();setAttempted(true);if(!error&&!mutation.isPending)mutation.mutate({subject,description:description.trim(),about_entity_type:module,...(entity.trim()?{about_entity_id:entity.trim()}:{})})}}>
        <Field label="Subject *">{id=><select id={id} className={inputClass} value={subject} onChange={e=>setSubject(e.target.value)}>{["content_complaint","privacy","account","intellectual_property","other"].map(s=><option key={s} value={s}>{humanise(s)}</option>)}</select>}</Field>
        <Field label="Module">{id=><select id={id} className={inputClass} value={module} onChange={e=>setModule(e.target.value)}><option value="">Platform</option>{nav.apps.map(g=><option key={g.app} value={g.app}>{g.label}</option>)}</select>}</Field>
        <Field label="Description *">{id=><textarea id={id} className={inputClass} rows={5} required minLength={10} maxLength={10000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the issue and the outcome needed."/ >}</Field>
        <Field label="Related item ID (optional)">{id=><input id={id} className={inputClass} value={entity} onChange={e=>setEntity(e.target.value)} placeholder="Post, order or booking UUID"/>}</Field>
        {attempted&&error&&<p role="alert" className="text-sm text-mo-bad">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={buttonSecondary} disabled={mutation.isPending} onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className={buttonPrimary} disabled={mutation.isPending}>{mutation.isPending?"Submitting…":"Submit grievance"}</button></div>
      </form>
    </Dialog>
  </>
}
