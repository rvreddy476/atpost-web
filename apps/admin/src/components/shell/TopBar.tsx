"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Bell, LogOut, Menu, Search } from "lucide-react"
import { adminSignOut, withBasePath } from "@/lib/admin/api"
import { useAdminIdentity } from "@/hooks/useAdminMe"
import type { AdminMe, AdminNavModel } from "@/lib/admin/me"

export function ProductMark() {
  return <Link href="/" aria-label="Cleestudio admin overview" className="admin-brand"><span className="admin-mark" aria-hidden="true">C</span><span><strong>Cleestudio</strong><small>Admin Portal</small></span></Link>
}
export function TopBar({ me, nav, onToggleNav }: { me: AdminMe; nav: AdminNavModel; onToggleNav: () => void }) {
  const { data: email } = useAdminIdentity()
  const [search, setSearch] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const identity = email ?? me.userId
  const links = [{href:"/",label:"Dashboard"},{href:"/pending",label:"Pending requests"},...nav.console,...nav.apps.flatMap(g=>[{href:g.href,label:g.label},...g.links])]
  const matches = search.trim() ? links.filter(l=>l.label.toLowerCase().includes(search.trim().toLowerCase())).slice(0,12) : []
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();input.current?.focus()}if(e.key==="Escape")setSearch("")};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[])
  return <header className="admin-topbar">
    <button type="button" onClick={onToggleNav} aria-label="Toggle navigation" className="admin-icon-button admin-mobile-nav-close"><Menu size={20}/></button>
    <div className="admin-search"><label className="admin-search-input"><Search size={17} aria-hidden="true"/><input ref={input} aria-label="Search admin modules and menus" placeholder="Search modules and menus…" value={search} onChange={e=>setSearch(e.target.value)}/><kbd className="hidden shrink-0 text-[10px] text-mo-body sm:block">Ctrl K</kbd></label>
    {search.trim() && <div className="admin-search-results" aria-label="Search results">{matches.length ? matches.map(l=><Link key={l.href+l.label} href={l.href} onClick={()=>setSearch("")}>{l.label}</Link>):<p className="p-3 text-sm text-mo-body">No matching menu. Try “Doorstep” or “Access”.</p>}</div>}</div>
    <div className="ml-auto flex min-w-0 items-center gap-3">
      <Link href="/pending" className="admin-icon-button" aria-label="Pending requests"><Bell size={19}/></Link>
      <span className="hidden h-8 border-l border-mo sm:block" />
      <span className="admin-tile-icon !h-9 !w-9 !rounded-full text-xs font-bold" aria-hidden="true">{(email??"AD").slice(0,2).toUpperCase()}</span>
      <span className="hidden min-w-0 text-xs sm:block"><strong className="block max-w-[190px] truncate" title={identity} data-testid="admin-identity">{identity}</strong><span className="text-mo-body">Administrator</span></span>
      <button type="button" aria-label="Sign out" title="Sign out" className="admin-icon-button" onClick={()=>void adminSignOut().then(()=>window.location.assign(withBasePath("/login")))}><LogOut size={18}/></button>
    </div>
  </header>
}

