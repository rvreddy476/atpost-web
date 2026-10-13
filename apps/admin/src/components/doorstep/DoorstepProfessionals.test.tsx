import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ProfessionalDetail } from "./DoorstepProfessionals"

const fixture = vi.hoisted(() => ({ missing: ["identity_review"], linkedIdentity: true, permission: true }))
vi.mock("@/components/shell/AdminShell", () => ({ useAdmin: () => ({ me: {} }) }))
vi.mock("@/lib/admin/sections", () => ({ can: () => true }))
vi.mock("@/hooks/useAdminQuery", () => ({ useAdminList: () => ({ data: [] }) }))
vi.mock("./DoorstepDocuments", () => ({ useDocumentViewer: () => ({ element: null }), ViewDocumentButton: () => null, DocumentDecisionDialog: () => null }))
vi.mock("./DoorstepBits", () => ({
  useMayWrite: () => () => fixture.permission,
  useDoorstepMutation: () => ({ isPending: false }),
  useDoorstepStepUpRead: () => ({ raw: { data: {
    professional: { id: "test", status: "pending_verification", display_name: "Review applicant", application: { declared_gender: "male", state_name: "Telangana", town: "Hyderabad", primary_phone_last4: "1234" } },
    identity_document_approved: fixture.linkedIdentity,
    readiness: { missing_steps: fixture.missing, completed_steps: ["bank", "skills", "selfie_face_match", "pan"] },
    skills: [], documents: [],
  } } }),
  DoorstepActionDialog: () => null, StepUpDismissedNote: () => null, CursorPager: () => null, ValueFilter: () => null,
}))

const render = () => renderToStaticMarkup(<ProfessionalDetail id="test" onBack={() => undefined} />)
describe("professional review page", () => {
  beforeEach(() => { fixture.missing = ["identity_review"]; fixture.linkedIdentity = true; fixture.permission = true })
  it("offers Approve after document review without a separate identity-review trip", () => {
    const html = render()
    expect(html).toMatch(/<button(?![^>]* disabled=)[^>]*>Approve<\/button>/)
    expect(html).toContain("Confirm the identity check when approving")
    expect(html.indexOf('aria-label="Professional detail"')).toBeLessThan(html.indexOf("GST registration"))
  })
  it("keeps Approve visible and explains incomplete required reviews", () => {
    fixture.missing = ["bank", "pan"]
    const html = render()
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/)
    expect(html).toContain("Before approval: Bank account, PAN number")
    expect(html).not.toContain("Approve appears once")
  })
  it("does not grant an action to a reviewer without permission", () => {
    fixture.permission = false
    expect(render()).not.toMatch(/>Approve<\/button>/)
  })
  it("keeps workspace and service-specific configuration collapsed", () => {
    const html = render()
    expect(html).toContain("Workspace setup · service area and hours")
    expect(html).toContain("Review history &amp; service-specific checks")
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    expect(html).toContain("Experience certificates are optional")
  })
})
