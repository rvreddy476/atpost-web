"use client"

import { useEffect, useRef, useState } from "react"
import { Eye } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ErrorNote, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { KycDocumentViewer } from "@/components/commerce/KycDocumentViewer"
import { useAdmin } from "@/components/shell/AdminShell"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { useAdminIdentity } from "@/hooks/useAdminMe"
import { apiUrl } from "@/lib/admin/api"
import { readList, str, when, type Row } from "@/lib/admin/data"
import {
  DECISION_BODIES,
  DOCUMENT_STATUSES,
  DOORSTEP_PAGE,
  DOORSTEP_STEP_UP_READS,
  DOORSTEP_REVEALS,
  doorstepViewErrorMessage,
  documentApprovalWarning,
  documentKindLabel,
  indiaToday,
  policeClearUntil,
  reviewTone,
  sortDocumentQueue,
} from "@/lib/admin/doorstep"
import { KYC_VIEW_MESSAGES, fetchKycImage, stepUpWindowOpen, viewKycDocument, watermarkLines } from "@/lib/admin/kycView"
import { can } from "@/lib/admin/sections"
import { DoorstepActionDialog, StepUpDismissedNote, ValueFilter, useDoorstepMutation, useDoorstepStepUpRead, useMayWrite } from "./DoorstepBits"

type OpenViewer = { doc: Row; bitmap: ImageBitmap; lines: [string, string] }

/**
 * Viewing one professional's document, VIEW ONLY, as the seller KYC viewer
 * does it: a fresh 2FA code first (unless a step-up window is open), the
 * image fetched as bytes from admin-service's /view route (one audit row per
 * view), decoded to a bitmap and drawn on the watermarked canvas. No <img>,
 * no object URL, no link, nothing to save.
 */
export function useDocumentViewer() {
  const { me } = useAdmin()
  const requestStepUp = useStepUp()
  const identity = useAdminIdentity()
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [viewer, setViewer] = useState<OpenViewer | null>(null)
  const attempt = useRef(0)
  const alive = useRef(true)
  const mayView = can(me, "doorstep", DOORSTEP_REVEALS.documentView.permission)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const view = async (doc: Row) => {
    const id = str(doc.id)
    if (!id || openingId !== null) return
    const mine = ++attempt.current
    setOpeningId(id)
    setError(null)
    setNotice(null)
    try {
      let lastStatus: number | null = null
      const outcome = await viewKycDocument({
        stepUpWindowOpen: stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
        requestStepUp,
        fetchImage: async () => {
          const result = await fetchKycImage(apiUrl(DOORSTEP_REVEALS.documentView.path(id)))
          lastStatus = result.ok ? null : result.status
          return result
        },
      })
      if (mine !== attempt.current || !alive.current) return
      if (outcome.kind === "cancelled") {
        setNotice("Not opened: viewing a document needs a fresh 2FA code.")
        return
      }
      if (outcome.kind === "error") {
        // A 404 from the /view route means the viewer is not switched on yet, not that the document is gone.
        setError(doorstepViewErrorMessage({ status: lastStatus, message: outcome.message }))
        return
      }
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(outcome.blob)
      } catch {
        if (mine === attempt.current && alive.current) setError(KYC_VIEW_MESSAGES.unreadable)
        return
      }
      if (mine !== attempt.current || !alive.current) {
        bitmap.close()
        return
      }
      setViewer({ doc, bitmap, lines: watermarkLines(identity.data ?? me.userId, new Date()) })
    } finally {
      if (mine === attempt.current && alive.current) setOpeningId(null)
    }
  }

  const element = (
    <>
      {error ? <ErrorNote message={error} /> : null}
      {notice ? (
        <p role="status" className="text-sm text-mo-body">
          {notice}
        </p>
      ) : null}
      <KycDocumentViewer
        open={viewer !== null}
        title={viewer ? `${documentKindLabel(viewer.doc.kind)} · professional ${(str(viewer.doc.pro_id) ?? "").slice(0, 8)}` : "Document"}
        bitmap={viewer?.bitmap ?? null}
        watermark={viewer?.lines ?? []}
        onClose={() => setViewer(null)}
      />
    </>
  )

  return { mayView, view: (doc: Row) => void view(doc), openingId, element }
}

/** The View button for one document row. */
export function ViewDocumentButton({ doc, viewer }: { doc: Row; viewer: ReturnType<typeof useDocumentViewer> }) {
  if (!viewer.mayView || !str(doc.media_id)) return <span className="text-xs text-mo-body">—</span>
  return (
    <button type="button" className={buttonSecondary} disabled={viewer.openingId !== null} onClick={() => viewer.view(doc)} aria-label={`View ${documentKindLabel(doc.kind)} ${str(doc.id)}`}>
      <Eye className="h-4 w-4" aria-hidden="true" />
      {viewer.openingId === str(doc.id) ? "Opening…" : "View"}
    </button>
  )
}

type Pending = { write: "document.approve" | "document.reject"; doc: Row } | null

/**
 * The document review queue: police clearance certificates first, then
 * Aadhaar, PAN and trade certificates, oldest first. The list carries media
 * ids only; each image opens in the view-only viewer behind a fresh 2FA
 * code. Approving a police certificate clears the background check until 12
 * months after its issue date, and the dialog says until when.
 */
export function DoorstepDocumentQueue() {
  const [status, setStatus] = useState("pending")
  const [pending, setPending] = useState<Pending>(null)
  // A step-up read in admin-service: the queue prompts for the 2FA code instead of failing.
  const list = useDoorstepStepUpRead(DOORSTEP_STEP_UP_READS.documents.path(status))
  const viewer = useDocumentViewer()
  const mayWrite = useMayWrite()
  const mutation = useDoorstepMutation({ onDone: () => setPending(null) })
  const today = indiaToday()
  const rows = sortDocumentQueue(list.raw === undefined ? [] : readList(list.raw))

  const columns: DataColumn<Row>[] = [
    { key: "kind", header: "Document", value: (r) => str(r.kind), sortable: true, filterable: true, cell: (r) => documentKindLabel(r.kind) },
    { key: "pro", header: "Professional", value: (r) => str(r.pro_id), filterable: true, cell: (r) => <IdText id={r.pro_id} /> },
    { key: "issued", header: "Issued", value: (r) => str(r.issued_on), sortable: true, cell: (r) => str(r.issued_on) ?? "—" },
    {
      key: "clear",
      header: "Clears check until",
      value: (r) => policeClearUntil(r.issued_on),
      cell: (r) => (str(r.kind) === "police_certificate" ? (policeClearUntil(r.issued_on) ?? "No issue date") : "—"),
    },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
    { key: "uploaded", header: "Uploaded", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    { key: "view", header: "Image", value: () => null, cell: (r) => <ViewDocumentButton doc={r} viewer={viewer} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        str(r.status) === "pending" && mayWrite("document.approve") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "document.approve", doc: r })} aria-label={`Approve document ${str(r.id)}`}>
              Approve
            </button>
            <button type="button" className={buttonDanger} onClick={() => setPending({ write: "document.reject", doc: r })} aria-label={`Reject document ${str(r.id)}`}>
              Reject
            </button>
          </span>
        ) : (
          (str(r.reason) ?? "")
        ),
    },
  ]

  const warning = pending?.write === "document.approve" ? documentApprovalWarning(pending.doc, today) : null
  const clearUntil = pending && str(pending.doc.kind) === "police_certificate" ? policeClearUntil(pending.doc.issued_on) : null

  return (
    <section aria-label="Document review" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <ValueFilter value={status} options={DOCUMENT_STATUSES} onChange={setStatus} />
        <p className="flex-1 text-xs text-mo-body">View only. Viewing an image asks for a fresh 2FA code, and every view is recorded.</p>
      </div>
      {list.dismissed ? (
        <StepUpDismissedNote what="The document queue" onRetry={list.retry} />
      ) : (
        <DataTable caption="Documents" rows={rows} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.retry} emptyMessage="No documents with this status." pageSize={DOORSTEP_PAGE} />
      )}
      {viewer.element}
      <DoorstepActionDialog
        write={pending?.write ?? null}
        subject={pending ? `this ${documentKindLabel(pending.doc.kind).toLowerCase()}` : null}
        busy={mutation.isPending}
        canConfirm={warning === null}
        onConfirm={(reason) =>
          pending &&
          mutation.mutate({
            write: pending.write,
            target: { id: String(pending.doc.id) },
            body: DECISION_BODIES.document(pending.write === "document.approve" ? "approve" : "reject", reason),
          })
        }
        onClose={() => setPending(null)}
      >
        {warning ? (
          <p role="alert" className="text-sm text-mo-bad">
            {warning}
          </p>
        ) : clearUntil ? (
          <p className="text-sm text-mo-body">
            The background check will be clear until <strong className="text-mo-ink">{clearUntil}</strong>.
          </p>
        ) : null}
      </DoorstepActionDialog>
    </section>
  )
}
