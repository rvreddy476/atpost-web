"use client"
import Link from "next/link"
import { useQueries, useQuery } from "@tanstack/react-query"
import { ArrowRight, ClipboardList, RefreshCw, ShieldAlert, Wrench, Zap } from "lucide-react"
import { useAdmin } from "@/components/shell/AdminShell"
import { APP_ICONS } from "@/components/shell/SideNav"
import api from "@/lib/admin/api"
import { adminPrefix, canReadStats, can } from "@/lib/admin/sections"
import { STATS_APPS, statsView, type StatsApp } from "@/lib/admin/stats"
import { humanise, readList, str, when } from "@/lib/admin/data"
import { buttonSecondary } from "@/components/blocks/buttons"
import { useApprovals } from "@/hooks/useApprovals"
import { ContentCard, useContentCards } from "@/components/content/ContentCards"
import { MonetizationCard, PaymentsCard, useMoneyCards } from "@/components/money/MoneyCards"

const PRIMARY: Record<StatsApp, {key:string; tab:string}> = {
  trust_safety:{key:"open_grievances",tab:"grievances"}, dating:{key:"reports_pending",tab:"reports"},
  food:{key:"restaurants_pending_review",tab:"approvals"}, commerce:{key:"sellers_pending",tab:"sellers"},
  rider:{key:"partners_pending_review",tab:"partners"}, doorstep:{key:"pros_pending_verification",tab:"approvals"},
}
const TONES = ["admin-tone-purple", "admin-tone-green", "", "admin-tone-rose", "admin-tone-amber"]
function AdditionalReviewQueues() {
  const {nav}=useAdmin()
  const content=useContentCards(nav.apps)
  const money=useMoneyCards(nav.apps)
  return <div className="mt-5 grid gap-4 lg:grid-cols-2">
    {content.map(({app,group})=><ContentCard key={app} app={app} group={group}/>)}
    {money.monetization && <MonetizationCard group={money.monetization}/>}
    {money.payments && <PaymentsCard {...money.payments}/>}
  </div>
}
export function AdminDashboard({ pending = false }: {pending?:boolean}) {
  const {me,nav} = useAdmin()
  const sources = STATS_APPS.flatMap(app => {
    const group = nav.apps.find(g => g.app === app)
    return group && canReadStats(me, app) ? [{app,group}] : []
  })
  const queries = useQueries({queries:sources.map(({app})=>({
    queryKey:["admin",app,"stats"],
    queryFn:async()=>(await api.get(`${adminPrefix(app)}/stats`)).data as unknown,
    retry:false, refetchInterval:60_000,
  }))})
  const modules = sources.map(({app,group},i)=>{
    const query=queries[i]
    const view=statsView(app, query.isError ? {status:"error",message:"Could not load this module."} : query.data === undefined ? {status:"loading"} : {status:"ok",raw:query.data})
    return {app,group,view,primary:view.tiles.find(t=>t.key===PRIMARY[app].key),href:group.links.find(l=>l.id===PRIMARY[app].tab)?.href ?? `${group.href}?tab=${PRIMARY[app].tab}`}
  })
  const approvals=useApprovals()
  const canAudit=nav.console.some(l=>l.id==="audit")
  const activity=useQuery({queryKey:["admin","overview","audit"],queryFn:async()=>(await api.get("/v1/admin/audit?limit=5")).data as unknown,enabled:canAudit,retry:false})
  const read=(app:StatsApp,key:string)=>modules.find(m=>m.app===app)?.view.tiles.find(t=>t.key===key)?.value
  const summaries=[
    {label:"Open reports",value:read("trust_safety","open_reports"),Icon:ShieldAlert,href:"/trust?tab=reports"},
    {label:"Home service applications",value:read("doorstep","pros_pending_verification"),Icon:Wrench,href:"/doorstep?tab=approvals"},
    {label:"Home service documents",value:read("doorstep","documents_pending"),Icon:ClipboardList,href:"/doorstep?tab=approvals"},
    {label:"Open grievances",value:read("trust_safety","open_grievances"),Icon:ClipboardList,href:"/trust?tab=grievances"},
  ].filter(s=>nav.apps.some(g=>s.href.startsWith(g.href+"?")))
  const urgent=modules.flatMap(m=>m.view.tiles.filter(t=>t.tone==="bad"||t.tone==="warn").map(t=>({...t,group:m.group}))).sort((a,b)=>(a.tone==="bad"?0:1)-(b.tone==="bad"?0:1)).slice(0,6)
  const refresh=()=>{queries.forEach(q=>void q.refetch());if(canAudit)void activity.refetch()}
  const reporting=modules.filter(m=>m.view.state==="ok").length
  return <div>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-mo-display text-3xl font-semibold tracking-tight text-mo-ink">{pending?"Pending requests":"Your operations, at a glance"}</h1><p className="mt-1 text-sm text-mo-body">{pending?"Review applications, documents and reports by module.":"A clear view of your work across Cleestudio."}</p></div>
      <button type="button" onClick={refresh} disabled={queries.some(q=>q.isFetching)} className={buttonSecondary}><RefreshCw size={15}/> Refresh</button>
    </div>
    {can(me, "platform", "audit.read") && <div className="mb-4"><Link href="/notifications" className={buttonSecondary}>Partner notification delivery</Link></div>}
    <div className="admin-dashboard-grid">
      <div className="min-w-0">
        <div className="admin-summary-grid">{summaries.map(({label,value,Icon,href},i)=><Link href={href} key={label} className="admin-summary admin-card"><span className={`admin-tile-icon ${TONES[i]}`}><Icon size={23}/></span><div><strong>{value == null?"—":value.toLocaleString()}</strong><small>{label}</small></div></Link>)}</div>
        <div className="admin-section-heading"><h2>{pending?"Module review queues":"Modules overview"}</h2><span className="text-xs text-mo-body">{reporting} of {modules.length} reporting</span></div>
        <div className="admin-module-grid">{nav.apps.map((group,i)=>{
          const entry=modules.find(m=>m.app===group.app)
          const Icon=APP_ICONS[group.app]
          return <Link key={group.app} href={entry?.href??group.href} className="admin-module admin-card" data-app-card={group.app}>
            <div className="admin-module-title"><span className={`admin-tile-icon ${TONES[i%TONES.length]}`}><Icon size={23}/></span>{group.label}</div>
            <div className="admin-module-number">{entry ? entry.primary?.value == null ? "—" : entry.primary.value.toLocaleString() : <span className="text-sm">Manage module</span>}</div>
            <div className="admin-module-footer"><span>{entry?.view.state==="unavailable"?"Connection unavailable":entry?.view.state==="loading"?"Loading…":entry?.primary?.label??"Open workspace"}</span><ArrowRight size={15}/></div>
          </Link>
        })}</div>
        {pending && <div className="mt-6 space-y-4">{modules.map(m=><section className="admin-card p-5" key={m.app}><div className="admin-section-heading"><h2>{m.group.label}</h2><Link href={m.href}>Open review queue →</Link></div>{m.view.state==="unavailable"?<p role="alert" className="text-sm text-mo-bad">Unable to load this queue. Refresh to retry.</p>:<dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{m.view.tiles.map(t=><div key={t.key}><dt className="text-xs text-mo-body">{t.label}</dt><dd className="mt-1 text-lg font-semibold">{t.value==null?"—":t.display}</dd></div>)}</dl>}</section>)}</div>}
        {pending && <AdditionalReviewQueues/>}
        {!pending && <section className="admin-card mt-6 p-5"><div className="admin-section-heading"><h2>Review workload</h2><Link href="/pending">View queues →</Link></div>
          <p className="text-xs text-mo-body">Primary review queue for each reporting module.</p>
          {modules.map(m=><div className="admin-workload-row" key={m.app}><Link href={m.href}>{m.group.label}</Link><meter aria-label={m.group.label} min={0} max={Math.max(1,...modules.map(n=>n.primary?.value??0))} value={m.primary?.value??0}/><span>{m.primary?.value??"—"}</span></div>)}
        </section>}
      </div>
      <aside className="admin-dashboard-aside space-y-5">
        <section className="admin-action-card"><Zap size={27}/><h2 className="mt-3 text-lg font-semibold">Take action faster</h2><p>Review pending applications and resolve issues across your modules.</p><Link href="/pending">View pending items <ArrowRight size={15}/></Link></section>
        <section className="admin-card p-5"><div className="admin-section-heading"><h2>Needs attention</h2></div>
          {urgent.length?urgent.map(item=><Link key={item.group.app+item.key} href={item.group.href} className="admin-queue-row"><span className="admin-tile-icon admin-tone-rose"><ShieldAlert size={18}/></span><span>{item.label}<small>{item.group.label}</small></span><span className="admin-count">{item.display}</span></Link>):<p className="text-sm text-mo-body">{reporting===modules.length?"No urgent items in reporting queues.":"Waiting for module data."}</p>}
          {nav.console.some(l=>l.id==="approvals") && <Link className="admin-queue-row" href="/approvals"><span>Two-person approvals<small>{approvals.isError?"Could not load approvals":approvals.isLoading?"Loading…":`${approvals.items.filter(a=>a.status==="pending"&&!a.requestedByMe).length} waiting for your review`}</small></span><ArrowRight size={15} className="ml-auto"/></Link>}
        </section>
        {canAudit && <section className="admin-card p-5"><div className="admin-section-heading"><h2>Recent activity</h2><Link href="/audit">View all</Link></div>
          {activity.isError?<p className="text-sm text-mo-body">Activity could not be loaded.</p>:activity.isPending?<p className="text-sm text-mo-body">Loading activity…</p>:readList(activity.data).length?readList(activity.data).slice(0,5).map((row,i)=><div className="admin-queue-row" key={str(row.id)??i}><span className="admin-tile-icon"><ClipboardList size={18}/></span><span>{humanise(str(row.operation)??"Admin activity")}<small>{when(row.created_at)}</small></span></div>):<p className="text-sm text-mo-body">No recent activity.</p>}
        </section>}
      </aside>
    </div>
  </div>
}
