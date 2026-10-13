"use client"

import { useState } from "react"
import { MapPin, Plus, Pencil } from "lucide-react"
import { Dialog } from "@/components/blocks/Dialog"
import { Field, StatusPill } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdminList } from "@/hooks/useAdminQuery"
import { str, type Row } from "@/lib/admin/data"
import { DOORSTEP_READS, checkZone, parseBoundary } from "@/lib/admin/doorstep"
import { circleBoundary, zoneSlug } from "@/lib/admin/zoneCoverage"
import { adminErrorMessage } from "@/lib/admin/mutation"
import type { MapPoint } from "@/lib/maps/google"
import { ActiveToggle, useDoorstepMutation, useMayWrite } from "./DoorstepBits"
import { ZoneMap } from "./ZoneMap"

export function DoorstepZones({ city }: { city: string }) {
  const list = useAdminList("doorstep", DOORSTEP_READS.zones(city))
  const mayWrite = useMayWrite()
  const [editing, setEditing] = useState<Row | "new" | null>(null)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-mo-ink">Working zones</h2><p className="text-sm text-mo-body">Enabled zones appear in partner work settings and customer coverage checks.</p></div>{mayWrite("zone.create")&&<button className={buttonPrimary} onClick={()=>setEditing("new")}><Plus size={16}/> Add zone</button>}</div>
    {list.isLoading?<p role="status">Loading zones…</p>:list.error?<div role="alert" className="rounded-xl border border-mo p-5"><p>{list.error}</p><button className={buttonSecondary} onClick={list.refetch}>Try again</button></div>:!list.data.length?<div className="rounded-xl border border-dashed border-mo p-8 text-center"><MapPin className="mx-auto mb-3 text-mo-cyan"/><h3 className="font-semibold">No working zones yet</h3><p className="mt-2 text-sm text-mo-body">Add a neighbourhood and coverage radius to get started.</p></div>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data.map(zone=><article className="rounded-xl border border-mo bg-mo-surface p-5" key={String(zone.id)}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-mo-ink">{str(zone.name)}</h3><p className="mt-1 text-sm text-mo-body">{city} · {String(zone.travel_buffer_minutes)} min travel buffer</p></div><StatusPill value={zone.active===true?"Enabled":"Disabled"} tone={zone.active===true?"good":"normal"}/></div><div className="mt-5 flex flex-wrap gap-2">{mayWrite("zone.update")&&<><button className={buttonSecondary} onClick={()=>setEditing(zone)}><Pencil size={14}/> Edit zone</button><ActiveToggle write="zone.update" target={{id:String(zone.id)}} active={zone.active===true} label={str(zone.name)??"zone"}/></>}</div></article>)}</div>}
    <Dialog size="xl" open={editing!==null} title={editing==="new"?"Add working zone":"Edit working zone"} onClose={()=>setEditing(null)}>{editing&&<ZoneEditor key={editing==="new"?city:String(editing.id)} city={city} existing={editing==="new"?null:editing} onDone={()=>setEditing(null)}/>}</Dialog>
  </div>
}

function ZoneEditor({city,existing,onDone}:{city:string;existing:Row|null;onDone:()=>void}) {
  const [name,setName]=useState(str(existing?.name)??"")
  const [point,setPoint]=useState<MapPoint|null>(null)
  const [label,setLabel]=useState("")
  const [radius,setRadius]=useState(5000)
  const [buffer,setBuffer]=useState(String(existing?.travel_buffer_minutes??30))
  const [active,setActive]=useState(existing?.active===true)
  const [advanced,setAdvanced]=useState(false)
  const [boundary,setBoundary]=useState(existing?.boundary?JSON.stringify(existing.boundary):"")
  const [problem,setProblem]=useState("")
  const mutation=useDoorstepMutation({onDone:()=>onDone()})
  function submit(e:React.FormEvent) {
    e.preventDefault();setProblem("")
    try {
      const minutes=Number(buffer)
      if(!name.trim()||name.trim().length<2) throw new Error("Enter a zone name with at least two characters.")
      if(!buffer.trim()||!Number.isInteger(minutes)||minutes<0||minutes>180) throw new Error("Enter a travel buffer between 0 and 180 minutes.")
      const geometry=advanced?parseBoundary(boundary):point?circleBoundary(point,radius):undefined
      if(advanced&&!geometry) throw new Error("Enter a valid Polygon or MultiPolygon boundary.")
      if(!existing&&!geometry) throw new Error("Search for an area or select the centre on the map.")
      const body:Record<string,unknown>={name:name.trim(),active,travel_buffer_minutes:minutes,...(geometry?{boundary:geometry}:{})}
      if(!existing) {
        const checked=checkZone({city_code:city,name:name.trim(),slug:zoneSlug(name)||`zone-${crypto.randomUUID().slice(0,8)}`,boundary:JSON.stringify(geometry),travel_buffer_minutes:buffer,active})
        if(!checked.ok) throw new Error(checked.problems.join(" "))
        mutation.mutate({write:"zone.create",target:{},body:checked.body})
      } else mutation.mutate({write:"zone.update",target:{id:String(existing.id)},body})
    } catch(e) {setProblem(e instanceof Error?e.message:"Check the zone details.")}
  }
  return <form onSubmit={submit} className="space-y-4">
    <Field label="Zone name *">{id=><input id={id} className={inputClass} value={name} maxLength={100} placeholder="e.g. Uppal & nearby" onChange={e=>setName(e.target.value)} required/>}</Field>
    {!advanced&&<><ZoneMap point={point} radiusM={radius} onSelect={(p,address)=>{setPoint(p);setLabel(address??"Selected map location")}}/>{label&&<p className="rounded-lg bg-mo-sunken p-3 text-sm" role="status">{label}</p>}{existing&&!point&&<p className="text-sm text-mo-body">Existing boundary will be kept. Select a new centre only to replace it.</p>}<Field label={`Coverage radius · ${radius/1000} km`}>{id=><input id={id} type="range" min={1000} max={50000} step={1000} className="w-full accent-blue-600" value={radius} onChange={e=>setRadius(Number(e.target.value))}/>}</Field></>}
    <button type="button" className="text-sm text-mo-cyan underline" onClick={()=>setAdvanced(v=>!v)}>{advanced?"Use searchable map":"Advanced boundary"}</button>
    {advanced&&<Field label="Boundary (GeoJSON)">{id=><textarea id={id} className={inputClass} rows={4} value={boundary} onChange={e=>setBoundary(e.target.value)}/>}</Field>}
    <Field label="Travel buffer (minutes)">{id=><input id={id} className={inputClass} type="number" min={0} max={180} value={buffer} onChange={e=>setBuffer(e.target.value)}/>}</Field>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/> Enable this zone for partners and customers</label>
    {Boolean(problem||mutation.error)&&<p role="alert" className="text-sm text-mo-bad">{problem||adminErrorMessage(mutation.error)}</p>}
    <div className="flex justify-end gap-2 border-t border-mo pt-4"><button type="button" className={buttonSecondary} onClick={onDone} disabled={mutation.isPending}>Cancel</button><button className={buttonPrimary} disabled={mutation.isPending}>{mutation.isPending?"Saving…":existing?"Save changes":"Create zone"}</button></div>
  </form>
}
