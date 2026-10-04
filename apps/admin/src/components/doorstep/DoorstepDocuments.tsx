"use client"

import { useEffect, useRef, useState } from "react"
import { Eye } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ErrorNote, IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { CheckField } from "@/components/blocks/formFields"
import { KycDocumentViewer } from "@/components/commerce/KycDocumentViewer"
import { useAdmin } from "@/components/shell/AdminShell"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { useAdminIdentity } from "@/hooks/useAdminMe"
import { apiUrl } from "@/lib/admin/api"
import { readList, readObject, str, when, type Row } from "@/lib/admin/data"
import {
  DECISION_BODIES,
  DOCUMENT_STATUSES,
  DOORSTEP_PAGE,
  DOORSTEP_STEP_UP_READS,
  DOORSTEP_REVEALS,
  doorstepViewErrorMessage,
  documentApprovalWarning,
  documentLabel,
  faceMatchAdvice,
  indiaToday,
  policeClearUntil,
  reviewTone,
  sortDocumentQueue,
  type FaceMatchAdvice,
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
        title={viewer ? `${documentLabel(viewer.doc)} · professional ${(str(viewer.doc.pro_id) ?? "").slice(0, 8)}` : "Document"}
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
    <button type="button" className={buttonSecondary} disabled={viewer.openingId !== null} onClick={() => viewer.view(doc)} aria-label={`View ${documentLabel(doc)} ${str(doc.id)}`}>
      <Eye className="h-4 w-4" aria-hidden="true" />
      {viewer.openingId === str(doc.id) ? "Opening…" : "View"}
    </button>
  )
}

export type DocumentDecision = { write: "document.approve" | "document.reject"; doc: Row } | null

/** Where the selfie's face-match advice comes from: the professional's record (a step-up read of its own). */
export type FaceMatchSource =
  | { kind: "ready"; advice: FaceMatchAdvice | null }
  | { kind: "loading" }
  | { kind: "no-permission" }
  | { kind: "unavailable"; retry?: () => void }

/** What approving each kind of document does, for the queue's column. */
export function documentEffect(doc: Row): string {
  const kind = str(doc.kind)
  if (kind === "police_certificate") {
    const until = policeClearUntil(doc.issued_on)
    return until ? `Background check clear until ${until}` : "No issue date: cannot clear the check"
  }
  if (kind === "selfie") return "Passes the face-match step"
  if (kind === "trade_certificate") return str(doc.skill_code) ? `Verifies the skill ${str(doc.skill_code)}` : "Verifies its skill"
  return "—"
}

/** The face-match advice for a selfie decision, always labelled as advice. */
function FaceMatchNote({ source }: { source: FaceMatchSource }) {
  const box = "rounded-mo border border-mo bg-mo-sunken p-3 text-sm"
  if (source.kind === "loading") return <p className={`${box} text-mo-body`}>Loading the face-match similarity…</p>
  if (source.kind === "no-permission") {
    return <p className={`${box} text-mo-body`}>The face-match similarity is on the professional&rsquo;s record, which needs the professionals read permission. Compare the selfie with the DigiLocker photo yourself.</p>
  }
  if (source.kind === "unavailable") {
    return (
      <p className={`${box} text-mo-body`}>
        The face-match similarity could not be read. Compare the selfie with the DigiLocker photo yourself.{" "}
        {source.retry ? (
          <button type="button" className="underline" onClick={source.retry}>
            Try again
          </button>
        ) : null}
      </p>
    )
  }
  const advice = source.advice
  if (!advice) return <p className={`${box} text-mo-body`}>No face match is recorded for this professional. Compare the selfie with the DigiLocker photo yourself.</p>
  const tone = advice.tone === "bad" ? "text-mo-bad" : advice.tone === "warn" ? "text-mo-warn" : "text-mo-ink"
  return (
    <div className={box} aria-label="Face match advice">
      <p className="text-xs font-semibold uppercase tracking-wide text-mo-body">Face match (advice only)</p>
      <p className={`mt-1 ${tone}`}>{advice.advice}</p>
      <p className="mt-1 text-xs text-mo-body">The face match never approves a selfie by itself. Your decision does.</p>
    </div>
  )
}

/**
 * Approve or reject one document. A selfie shows the face-match similarity
 * as advice and, to approve, the reviewer must confirm they looked at it
 * themselves; a police certificate says until when the check clears, and a
 * stale or undated one cannot be approved.
 */
export function DocumentDecisionDialog({ pending, faceMatch, onClose }: { pending: DocumentDecision; faceMatch: FaceMatchSource; onClose: () => void }) {
  const [looked, setLooked] = useState(false)
  const mutation = useDoorstepMutation({ onDone: () => onClose() })
  const doc = pending?.doc ?? null
  const today = indiaToday()
  const isSelfie = str(doc?.kind) === "selfie"
  const approving = pending?.write === "document.approve"
  const warning = approving && doc ? documentApprovalWarning(doc, today) : null
  const clearUntil = doc && str(doc.kind) === "police_certificate" ? policeClearUntil(doc.issued_on) : null
  const needsLook = approving && isSelfie

  useEffect(() => {
    setLooked(false)
  }, [pending])

  return (
    <DoorstepActionDialog
      write={pending?.write ?? null}
      subject={doc ? `this ${documentLabel(doc).toLowerCase()}` : null}
      busy={mutation.isPending}
      canConfirm={warning === null && (!needsLook || looked)}
      onConfirm={(reason) =>
        pending &&
        mutation.mutate({
          write: pending.write,
          target: { id: String(pending.doc.id) },
          body: DECISION_BODIES.document(pending.write === "document.approve" ? "approve" : "reject", reason),
        })
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        {isSelfie ? <FaceMatchNote source={faceMatch} /> : null}
        {needsLook ? <CheckField label="I looked at the selfie myself and it is the same person as the DigiLocker photo." hint="Required: the similarity score is advice, not a decision." checked={looked} onChange={setLooked} /> : null}
        {warning ? (
          <p role="alert" className="text-sm text-mo-bad">
            {warning}
          </p>
        ) : clearUntil ? (
          <p className="text-sm text-mo-body">
            The background check will be clear until <strong className="text-mo-ink">{clearUntil}</strong>.
          </p>
        ) : null}
      </div>
    </DoorstepActionDialog>
  )
}

/**
 * The document review queue: police clearance certificates first, then
 * selfies, trade certificates and the rest, oldest first. Nothing here is
 * approved without an admin. The list carries media ids only; each image
 * opens in the view-only viewer behind a fresh 2FA code. A selfie decision
 * reads the professional's face match (as advice) from their record.
 */
export function DoorstepDocumentQueue() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("pending")
  const [pending, setPending] = useState<DocumentDecision>(null)
  // A step-up read in admin-service: the queue prompts for the 2FA code instead of failing.
  const list = useDoorstepStepUpRead(DOORSTEP_STEP_UP_READS.documents.path(status))
  const viewer = useDocumentViewer()
  const mayWrite = useMayWrite()
  const rows = sortDocumentQueue(list.raw === undefined ? [] : readList(list.raw))

  // The face match lives on the professional's record (a step-up read too, inside the window the queue opened).
  const mayReadPro = can(me, "doorstep", DOORSTEP_STEP_UP_READS.professional.permission)
  const selfiePro = pending && str(pending.doc.kind) === "selfie" ? str(pending.doc.pro_id) : null
  const pro = useDoorstepStepUpRead(DOORSTEP_STEP_UP_READS.professional.path(selfiePro ?? ""), { enabled: selfiePro !== null && mayReadPro })
  const faceMatch: FaceMatchSource = !mayReadPro
    ? { kind: "no-permission" }
    : pro.isLoading
      ? { kind: "loading" }
      : pro.raw !== undefined
        ? { kind: "ready", advice: faceMatchAdvice(readObject(pro.raw)) }
        : { kind: "unavailable", retry: pro.retry }

  const columns: DataColumn<Row>[] = [
    { key: "kind", header: "Document", value: (r) => str(r.kind), sortable: true, filterable: true, cell: (r) => documentLabel(r) },
    { key: "pro", header: "Professional", value: (r) => str(r.pro_id), filterable: true, cell: (r) => <IdText id={r.pro_id} /> },
    { key: "issued", header: "Issued", value: (r) => str(r.issued_on), sortable: true, cell: (r) => str(r.issued_on) ?? "—" },
    { key: "effect", header: "Approving it", value: (r) => documentEffect(r), cell: (r) => <span className="text-xs">{documentEffect(r)}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={str(r.status) === "pending" ? "Waiting for an admin" : r.status} tone={reviewTone(r.status)} /> },
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
            <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "document.approve", doc: r })} aria-label={`Approve ${documentLabel(r)} ${str(r.id)}`}>
              Approve
            </button>
            <button type="button" className={buttonDanger} onClick={() => setPending({ write: "document.reject", doc: r })} aria-label={`Reject ${documentLabel(r)} ${str(r.id)}`}>
              Reject
            </button>
          </span>
        ) : (
          (str(r.reason) ?? "")
        ),
    },
  ]

  return (
    <section aria-label="Document review" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <ValueFilter value={status} options={DOCUMENT_STATUSES} onChange={setStatus} />
        <p className="flex-1 text-xs text-mo-body">
          Nothing a professional uploads is approved without an admin: a selfie&rsquo;s face match is advice only. View only: viewing an image asks for a fresh 2FA code, and every view is recorded.
        </p>
      </div>
      {list.dismissed ? (
        <StepUpDismissedNote what="The document queue" onRetry={list.retry} />
      ) : (
        <DataTable caption="Selfies and documents" rows={rows} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.retry} emptyMessage="No documents with this status." pageSize={DOORSTEP_PAGE} />
      )}
      {viewer.element}
      <DocumentDecisionDialog pending={pending} faceMatch={faceMatch} onClose={() => setPending(null)} />
    </section>
  )
}
