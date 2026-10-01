import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { KycDocumentsSection } from "./SellerKycDocuments"
import { KycDocumentViewer } from "./KycDocumentViewer"
import type { KycDocument } from "@/lib/admin/kycView"

/**
 * View only means the markup itself offers nothing to save: no link, no
 * <img> (whose context menu has "Save image as" and "Open image in new
 * tab"), and no download control of any kind — in the list or the viewer.
 */

const docs: KycDocument[] = [
  { id: "d1", documentType: "pan_card", verificationStatus: "pending", uploadedAt: "2026-09-30T10:00:00Z", viewable: true },
  { id: "d2", documentType: "cancelled_cheque", verificationStatus: "verified", uploadedAt: null, viewable: true },
  { id: "d3", documentType: "aadhaar", verificationStatus: "needs_correction", uploadedAt: null, viewable: false },
]

const section = (over: Partial<Parameters<typeof KycDocumentsSection>[0]> = {}) =>
  renderToStaticMarkup(
    <KycDocumentsSection
      storeName="Asha Stores"
      documents={docs}
      loading={false}
      error={null}
      onView={() => undefined}
      openingId={null}
      viewError={null}
      notice={null}
      onClose={() => undefined}
      {...over}
    />,
  )

const viewer = () =>
  renderToStaticMarkup(
    <KycDocumentViewer
      open
      title="PAN card · Asha Stores"
      bitmap={null}
      watermark={["ops@momentum.example · 2026-10-01 19:35 +05:30", "Momentum · KYC · view only"]}
      onClose={() => undefined}
    />,
  )

function expectNothingToSave(html: string) {
  expect(html).not.toMatch(/<a[\s>]/i)
  expect(html).not.toMatch(/href=/i)
  expect(html).not.toMatch(/<img[\s>]/i)
  expect(html).not.toMatch(/download/i)
  expect(html).not.toMatch(/blob:/i)
}

describe("KycDocumentsSection", () => {
  it("lists each document by its label, status and a View button, with nothing to save", () => {
    const html = section()
    expect(html).toContain("KYC documents · Asha Stores")
    expect(html).toContain("PAN card")
    expect(html).toContain("Cancelled cheque")
    expect(html).toContain("Needs correction")
    expect(html).toContain('aria-label="View PAN card"')
    expect(html).toContain("No image on file")
    expect(html).not.toContain('aria-label="View Aadhaar"')
    expectNothingToSave(html)
  })

  it("shows the view errors and the cancelled notice without any link", () => {
    const html = section({ viewError: "This document is no longer available.", notice: "Not opened: viewing a KYC document needs a fresh 2FA code." })
    expect(html).toContain("This document is no longer available.")
    expect(html).toContain("Not opened")
    expectNothingToSave(html)
    expectNothingToSave(section({ error: "You don&#x27;t have permission to view KYC documents.", documents: undefined }))
    expectNothingToSave(section({ documents: [], loading: true }))
  })
})

describe("KycDocumentViewer", () => {
  it("is a canvas in the console's modal, hidden from print, with the view-only line", () => {
    const html = viewer()
    expect(html).toContain("<canvas")
    expect(html).toContain('draggable="false"')
    expect(html).toMatch(/class="[^"]*kyc-viewer/)
    expect(html).toMatch(/<canvas[^>]*class="[^"]*select-none/)
    expect(html).toContain("View only. Every view is recorded.")
    expect(html).toContain("Fit")
    expect(html).toContain("100%")
    expect(html).toContain("200%")
    expect(html).toContain("Rotate")
    expectNothingToSave(html)
  })
})
