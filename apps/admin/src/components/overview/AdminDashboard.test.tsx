import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { writeFileSync } from "node:fs"
import { AdminDashboard } from "./AdminDashboard"
import { SideNav } from "../shell/SideNav"
import { ProductMark, TopBar } from "../shell/TopBar"

const fixture=vi.hoisted(()=>({
  me:{userId:"preview-admin",mfa:{required:false,verified:false,authTime:null},stepUpRequired:false,stepUpWindowSeconds:300,stepUpValidUntil:null,platform:["*"],apps:{},navigation:[]},
  nav:{apps:[
    {app:"trust_safety",label:"Trust & safety",href:"/trust",links:[]},
    {app:"commerce",label:"MStore",href:"/commerce",links:[]},
    {app:"food",label:"Feast",href:"/food",links:[]},
    {app:"doorstep",label:"Doorstep",href:"/doorstep",links:[]},
    {app:"rider",label:"Mopedu",href:"/rider",links:[]},
    {app:"dating",label:"Dating",href:"/dating",links:[]},
    {app:"social",label:"Social",href:"/social",links:[]},
    {app:"tube",label:"Tube",href:"/tube",links:[]},
    {app:"payments",label:"Payments",href:"/payments",links:[]},
  ],console:[{id:"access",label:"Users & access",href:"/access"},{id:"approvals",label:"Approvals",href:"/approvals"},{id:"audit",label:"Audit logs",href:"/audit"}]},
  failed:false,
}))
vi.mock("../shell/AdminShell",()=>({useAdmin:()=>fixture}))
vi.mock("@/hooks/useAdminMe",()=>({useAdminIdentity:()=>({data:"preview@example.test"})}))
vi.mock("next/navigation",()=>({usePathname:()=>"/",useSearchParams:()=>new URLSearchParams()}))
vi.mock("@/hooks/useApprovals",()=>({useApprovals:()=>({items:[],isLoading:false,isError:false})}))
vi.mock("@tanstack/react-query",()=>({
  useQueries:({queries}:{queries:unknown[]})=>queries.map(()=>({isError:fixture.failed,isFetching:false,data:{data:{open_reports:6,open_grievances:1,grievances_overdue:1,reports_pending:2,restaurants_pending_review:3,sellers_pending:4,partners_pending_review:2,pros_pending_verification:1,documents_pending:2}},refetch:vi.fn()})),
  useQuery:()=>({isError:false,isPending:false,data:{data:{items:[]}},refetch:vi.fn()}),
}))
describe("Admin overview",()=>{
  it("renders module queues without fictional platform totals or 2FA banners",()=>{
    fixture.failed=false
    const markup=renderToStaticMarkup(<AdminDashboard/>)
    expect(markup).toContain("Your operations, at a glance")
    expect(markup).toContain("Home service documents")
    expect(markup).toContain("/doorstep?tab=approvals")
    expect(markup).not.toContain("All systems operational")
    expect(markup).not.toContain("2FA")
  })
  it("keeps unavailable counts distinct from zero",()=>{
    fixture.failed=true
    const markup=renderToStaticMarkup(<AdminDashboard/>)
    expect(markup).toContain("Connection unavailable")
    expect(markup).toContain("Waiting for module data")
    expect(markup).not.toContain("No urgent items")
    fixture.failed=false
  })
  it("renders the pending workspace with links to module queues",()=>{
    expect(renderToStaticMarkup(<AdminDashboard pending/>)).toContain("Module review queues")
  })
  it("renders the responsive shell with the same components as deployment",()=>{
    const nav=fixture.nav as Parameters<typeof SideNav>[0]["nav"]
    const content=renderToStaticMarkup(<div className="mo-root"><div className="admin-layout"><aside className="admin-rail"><ProductMark/><SideNav nav={nav}/></aside><div className="min-w-0"><TopBar me={fixture.me} nav={nav} onToggleNav={()=>undefined}/><main className="admin-main"><AdminDashboard/></main></div></div></div>)
    expect(content).toContain("Cleestudio")
    expect(content).toContain("admin-module-grid")
    if(process.env.ADMIN_RENDER_PREVIEW)writeFileSync(process.env.ADMIN_RENDER_PREVIEW, content)
  })
})
