"use client"

import { useEffect, useRef, useState } from "react"
import { Eye, X } from "lucide-react"
import { apiUrl } from "@/lib/admin/api"
import { buttonGhost, buttonSecondary } from "@/components/blocks/buttons"
import { ErrorNote, Loading, StatusPill } from "@/components/blocks/bits"
import { useAdmin } from "@/components/shell/AdminShell"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { useAdminIdentity } from "@/hooks/useAdminMe"
import { useSellerKycDocuments } from "@/hooks/useAdminCommerce"
import { when } from "@/lib/admin/data"
import { STEP_UP_REQUIRED, adminErrorMessage, readApiError } from "@/lib/admin/mutation"
import {
  KYC_VIEW_MESSAGES,
  fetchKycImage,
  kycDocumentLabel,
  kycDocumentViewPath,
  kycStatus,
  stepUpWindowOpen,
  viewKycDocument,
  watermarkLines,
  type KycDocument,
} from "@/lib/admin/kycView"
import { KycDocumentViewer } from "./KycDocumentViewer"

/** The list read (permission commerce:kyc.verify, no step-up). */
function listErrorMessage(err: unknown): string {
  const { status, code } = readApiError(err)
  if (status === 403 && code !== STEP_UP_REQUIRED) return KYC_VIEW_MESSAGES.forbidden
  if (status === 404) return "This seller has no KYC documents on record."
  return adminErrorMessage(err, "The KYC documents could not be loaded.")
}

/**
 * A seller's KYC documents: type, status, uploaded, and View. There is no
 * download button and no link anywhere in it — View opens the in-console
 * canvas viewer and nothing else. Presentational, so its markup can be
 * checked without a browser.
 */
export function KycDocumentsSection({
  storeName,
  documents,
  loading,
  error,
  onRetry,
  onView,
  openingId,
  viewError,
  notice,
  onClose,
}: {
  storeName: string
  documents: KycDocument[] | undefined
  loading: boolean
  error: string | null
  onRetry?: () => void
  onView: (doc: KycDocument) => void
  openingId: string | null
  viewError: string | null
  notice: string | null
  onClose?: () => void
}) {
  return (
    <section aria-labelledby="kyc-documents-title" className="mt-6 rounded-mo border border-mo bg-mo-surface p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1">
          <h2 id="kyc-documents-title" className="font-mo-display text-lg font-semibold text-mo-ink">
            KYC documents · {storeName}
          </h2>
          <p className="mt-1 text-sm text-mo-body">Viewing a document asks for a fresh 2FA code. View only. Every view is recorded.</p>
        </div>
        {onClose ? (
          <button type="button" className={buttonGhost} onClick={onClose} aria-label="Close KYC documents">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {loading ? (
        <Loading what="Loading KYC documents…" />
      ) : error ? (
        <ErrorNote message={error} onRetry={onRetry} />
      ) : !documents || documents.length === 0 ? (
        <p className="p-2 text-sm text-mo-body">This seller has not uploaded any KYC documents.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-mo-body">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">Document</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
              <th scope="col" className="py-2 pr-3 font-semibold">Uploaded</th>
              <th scope="col" className="py-2 text-right font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const status = kycStatus(doc.verificationStatus)
              return (
                <tr key={doc.id} className="border-t border-mo">
                  <td className="py-2 pr-3 font-semibold text-mo-ink">{kycDocumentLabel(doc.documentType)}</td>
                  <td className="py-2 pr-3">
                    <StatusPill value={status.label} tone={status.tone} />
                  </td>
                  <td className="py-2 pr-3 text-mo-body">{when(doc.uploadedAt)}</td>
                  <td className="py-2 text-right">
                    {doc.viewable ? (
                      <button
                        type="button"
                        className={buttonSecondary}
                        disabled={openingId !== null}
                        onClick={() => onView(doc)}
                        aria-label={`View ${kycDocumentLabel(doc.documentType)}`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {openingId === doc.id ? "Opening…" : "View"}
                      </button>
                    ) : (
                      <span className="text-xs text-mo-body">No image on file</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {viewError ? (
        <div className="mt-3">
          <ErrorNote message={viewError} />
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-mo-body">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

type OpenViewer = { doc: KycDocument; bitmap: ImageBitmap; lines: [string, string] }

/**
 * How one view works:
 *   1. View → the console's step-up prompt, unless /me says a step-up window
 *      is open. Dismissed: nothing is fetched.
 *   2. fetch(/view, credentials) → Blob (image/* only, 15 MB cap).
 *   3. createImageBitmap(blob). The blob is not kept: no object URL is ever
 *      made from it, and it is unreachable once this function returns.
 *   4. The bitmap goes to the canvas viewer, which draws it under a
 *      watermark naming this admin and the time, and disposes it on close.
 * admin-service writes one audit row per /view call.
 */
export function SellerKycDocuments({ seller, onClose }: { seller: { id: string; store_name: string }; onClose?: () => void }) {
  // Render with key={seller.id}: another seller is a fresh instance, and the old viewer disposes on unmount.
  const { me } = useAdmin()
  const requestStepUp = useStepUp()
  const identity = useAdminIdentity()
  const documents = useSellerKycDocuments(seller.id)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [viewer, setViewer] = useState<OpenViewer | null>(null)
  const attempt = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const view = async (doc: KycDocument) => {
    if (openingId !== null) return
    const id = ++attempt.current
    setOpeningId(doc.id)
    setViewError(null)
    setNotice(null)
    try {
      const outcome = await viewKycDocument({
        stepUpWindowOpen: stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
        requestStepUp,
        fetchImage: () => fetchKycImage(apiUrl(kycDocumentViewPath(seller.id, doc.id))),
      })
      if (id !== attempt.current || !alive.current) return
      if (outcome.kind === "cancelled") {
        setNotice("Not opened: viewing a KYC document needs a fresh 2FA code.")
        return
      }
      if (outcome.kind === "error") {
        setViewError(outcome.message)
        return
      }
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(outcome.blob)
      } catch {
        if (id === attempt.current && alive.current) setViewError(KYC_VIEW_MESSAGES.unreadable)
        return
      }
      if (id !== attempt.current || !alive.current) {
        bitmap.close()
        return
      }
      setViewer({ doc, bitmap, lines: watermarkLines(identity.data ?? me.userId, new Date()) })
    } finally {
      if (id === attempt.current && alive.current) setOpeningId(null)
    }
  }

  return (
    <>
      <KycDocumentsSection
        storeName={seller.store_name}
        documents={documents.data}
        loading={documents.isLoading}
        error={documents.isError ? listErrorMessage(documents.error) : null}
        onRetry={() => void documents.refetch()}
        onView={(doc) => void view(doc)}
        openingId={openingId}
        viewError={viewError}
        notice={notice}
        onClose={onClose}
      />
      <KycDocumentViewer
        open={viewer !== null}
        title={viewer ? `${kycDocumentLabel(viewer.doc.documentType)} · ${seller.store_name}` : "KYC document"}
        bitmap={viewer?.bitmap ?? null}
        watermark={viewer?.lines ?? []}
        onClose={() => setViewer(null)}
      />
    </>
  )
}
