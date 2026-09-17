"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { DocumentViewer, type ViewerDocument } from "@/components/blocks/DocumentViewer"
import { Details, IdText, LookupForm, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation, useStepUpRead } from "@/hooks/useAdminMutation"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { SOCIAL } from "@/lib/admin/content"
import { humanise, isRecord, isUuid, readList, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import { SOCIAL_KEY } from "./ContentQueues"

const LIMIT = 50

type PageAction = "approve" | "reject" | "suspend" | "disable" | "reinstate"

const PAGE_ACTIONS: Record<PageAction, { permission: string; label: string; title: string; explain: string; destructive: boolean; stepUp: boolean }> = {
  approve: { permission: "pages.moderate", label: "Approve", title: "Approve this page?", explain: "The page goes live and its owner is told.", destructive: false, stepUp: false },
  reject: { permission: "pages.moderate", label: "Reject", title: "Reject this page?", explain: "The page stays off and the owner sees your reason.", destructive: true, stepUp: false },
  suspend: { permission: "pages.suspend", label: "Suspend", title: "Suspend this page?", explain: "The page is hidden from everyone until it is reinstated.", destructive: true, stepUp: true },
  disable: { permission: "pages.disable", label: "Disable", title: "Disable this page?", explain: "The page is switched off for good; the owner cannot bring it back.", destructive: true, stepUp: true },
  reinstate: { permission: "pages.suspend", label: "Reinstate", title: "Reinstate this page?", explain: "A suspended page goes live again.", destructive: false, stepUp: true },
}

/** Which actions make sense for a page in this status; the buttons are also gated by permission. */
function actionsFor(status: string | null): PageAction[] {
  switch (status) {
    case "suspended":
      return ["reinstate", "disable"]
    case "disabled":
      return []
    case "active":
    case "approved":
      return ["suspend", "disable"]
    default:
      return ["approve", "reject", "suspend", "disable"]
  }
}

/** Business pages: the pending queue and a lookup by id, then one page's detail with its documents. */
export function BusinessPages() {
  const { me } = useAdmin()
  const [offset, setOffset] = useState(0)
  const [pageId, setPageId] = useState<string | null>(null)
  const canModerate = can(me, "social", "pages.moderate")
  const list = useAdminList("social", `${SOCIAL}/pages/pending?limit=${LIMIT}&offset=${offset}`, { enabled: canModerate })

  if (pageId) return <PageDetail id={pageId} onBack={() => setPageId(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Page", value: (r) => str(r.page_name), sortable: true, filterable: true },
    { key: "handle", header: "Handle", value: (r) => str(r.page_handle), filterable: true, cell: (r) => <span className="font-mo-mono text-xs">@{str(r.page_handle) ?? "—"}</span> },
    { key: "category", header: "Category", value: (r) => str(r.category), filterable: true, cell: (r) => humanise(r.category) },
    { key: "type", header: "Type", value: (r) => str(r.page_type), cell: (r) => humanise(r.page_type) },
    { key: "owner", header: "Owner", value: (r) => str(r.user_id), cell: (r) => <IdText id={r.user_id} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone="warn" /> },
    { key: "submitted", header: "Submitted", value: (r) => str(r.submitted_at), sortable: true, cell: (r) => when(r.submitted_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setPageId(String(r.id))} aria-label={`Open page ${str(r.page_name) ?? str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <section>
      {canModerate ? (
        <>
          <DataTable caption="Pages pending review" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No pages waiting for review." pageSize={LIMIT} />
          <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
        </>
      ) : (
        <p className="mb-4 text-sm text-mo-body">Listing pending pages needs the pages moderate permission; open a page by id below.</p>
      )}
      <div className="mt-6">
        <LookupForm label="Open a page by id" placeholder="00000000-0000-0000-0000-000000000000" button="Open page" validate={(v) => (isUuid(v) ? null : "Enter a full page id (a UUID).")} onSubmit={setPageId} />
      </div>
    </section>
  )
}

/**
 * One page: its details, decisions, and its documents. Document metadata
 * comes with the page; the files themselves are identity proofs, so each
 * starts blurred and "Reveal" runs the audited, step-up documents read.
 */
function PageDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useAdmin()
  const read = useStepUpRead()
  const detail = useAdminObject("social", `${SOCIAL}/pages/${encodeURIComponent(id)}`)
  const [action, setAction] = useState<PageAction | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [docDecision, setDocDecision] = useState<{ doc: Row; decision: "approve" | "reject" } | null>(null)

  const run = useAdminMutation<{ action: PageAction; reason: string }>({
    request: ({ action: a, reason }) => ({ method: "post", url: `${SOCIAL}/pages/${encodeURIComponent(id)}/${a}`, body: { reason } }),
    invalidate: [SOCIAL_KEY],
    successMessage: (data) => {
      const body = isRecord(data) && isRecord(data.data) ? data.data : null
      const status = body ? str(body.status) : null
      return status ? `Page is now ${humanise(status).toLowerCase()}` : "Page updated"
    },
    errorTitle: "Page action failed",
    onDone: () => setAction(null),
  })
  const decideDoc = useAdminMutation<{ docId: string; decision: "approve" | "reject"; reason: string }>({
    request: ({ docId, decision, reason }) => ({ method: "post", url: `${SOCIAL}/pages/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/${decision}`, body: { reason } }),
    invalidate: [SOCIAL_KEY],
    successMessage: "Document decided",
    errorTitle: "Document decision failed",
    onDone: () => setDocDecision(null),
  })

  const page = detail.data && isRecord(detail.data.page) ? detail.data.page : null
  const documents = detail.data ? readList({ items: detail.data.documents }) : []
  const status = page ? str(page.status) : null
  const allowed = actionsFor(status).filter((a) => can(me, "social", PAGE_ACTIONS[a].permission))
  const current = action ? PAGE_ACTIONS[action] : null
  const canReviewDocs = can(me, "social", "documents.review")

  /** One audited, step-up read of the documents (with their URLs), then the chosen one is unblurred. */
  const reveal = async (doc: ViewerDocument) => {
    if (urls[doc.id]) return true
    const raw = await read(`${SOCIAL}/pages/${encodeURIComponent(id)}/documents`)
    if (raw === null) return false
    const next: Record<string, string> = {}
    for (const row of readList(raw)) {
      const docId = str(row.id)
      const url = str(row.document_url)
      if (docId && url) next[docId] = url
    }
    setUrls((u) => ({ ...u, ...next }))
    return !!next[doc.id]
  }

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to pages
      </button>
      {detail.isLoading ? (
        <p className="text-sm text-mo-body">Loading…</p>
      ) : detail.error ? (
        <p role="alert" className="text-sm text-mo-bad">
          {detail.error}
        </p>
      ) : page ? (
        <>
          <h3 className="font-mo-display text-lg font-semibold text-mo-ink">
            {str(page.page_name) ?? id} <span className="font-mo-mono text-sm text-mo-body">@{str(page.page_handle) ?? "—"}</span>
          </h3>
          <Details
            items={[
              ["Status", <StatusPill key="s" value={page.status} tone={status === "suspended" || status === "disabled" ? "bad" : status === "active" || status === "approved" ? "good" : "warn"} />],
              ["Owner", str(page.user_id) ?? "—"],
              ["Category", humanise(page.category)],
              ["Type", humanise(page.page_type)],
              ["Description", str(page.description) ?? "—"],
              ["Address", str(page.address) ?? "—"],
              ["Phone", str(page.phone) ?? "—"],
              ["Email", str(page.business_email) ?? "—"],
              ["Website", str(page.website) ?? "—"],
              ["Verification", humanise(page.verification_status)],
              ["Submitted", when(page.submitted_at)],
              ["Approved", when(page.approved_at)],
              ["Rejected", when(page.rejected_at)],
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {allowed.map((a) => (
              <button key={a} type="button" className={PAGE_ACTIONS[a].destructive ? buttonDanger : a === "approve" ? buttonPrimary : buttonSecondary} onClick={() => setAction(a)}>
                {PAGE_ACTIONS[a].label}
              </button>
            ))}
            {allowed.length === 0 ? <p className="text-sm text-mo-body">No actions apply to this page with your roles.</p> : null}
          </div>

          <section aria-label="Documents" className="space-y-3">
            <h4 className="text-sm font-semibold text-mo-ink">Documents</h4>
            {documents.length === 0 ? <p className="text-sm text-mo-body">No documents uploaded.</p> : null}
            {!canReviewDocs && documents.length > 0 ? <p className="text-xs text-mo-body">Revealing or deciding a document needs the documents review permission.</p> : null}
            {documents.map((doc) => {
              const docId = String(doc.id)
              const url = urls[docId] ?? null
              const kind: ViewerDocument["kind"] = url && /\.pdf(\?|$)/i.test(url) ? "pdf" : "image"
              return (
                <div key={docId} className="space-y-2" data-document={docId}>
                  <DocumentViewer
                    document={{ id: docId, title: `${humanise(doc.document_type)} · ${humanise(doc.status)}`, url, kind, sensitive: true }}
                    onReveal={canReviewDocs ? reveal : async () => false}
                    watermark={me.userId}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-mo-body">
                    <span>Uploaded {when(doc.created_at)}</span>
                    {str(doc.rejection_reason) ? <span>Rejected: {str(doc.rejection_reason)}</span> : null}
                    {canReviewDocs && (doc.status === "pending" || doc.status === "PENDING" || doc.status === "submitted") ? (
                      <span className="ml-auto inline-flex gap-1">
                        <button type="button" className={buttonSecondary} onClick={() => setDocDecision({ doc, decision: "approve" })} aria-label={`Approve ${humanise(doc.document_type)}`}>
                          Approve
                        </button>
                        <button type="button" className={buttonDanger} onClick={() => setDocDecision({ doc, decision: "reject" })} aria-label={`Reject ${humanise(doc.document_type)}`}>
                          Reject
                        </button>
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </section>
        </>
      ) : null}
      <ConfirmReasonDialog
        open={current !== null}
        title={current?.title ?? ""}
        description={current ? `${current.explain}${current.stepUp ? " Needs a fresh 2FA code." : ""}` : null}
        confirmLabel={current?.label ?? "Confirm"}
        destructive={current?.destructive ?? false}
        requireReason={action === "approve" || action === "reinstate" ? false : true}
        busy={run.isPending}
        onConfirm={(reason) => action && run.mutate({ action, reason })}
        onClose={() => setAction(null)}
      />
      <ConfirmReasonDialog
        open={docDecision !== null}
        title={docDecision?.decision === "approve" ? "Approve this document?" : "Reject this document?"}
        description={docDecision ? `${humanise(docDecision.doc.document_type)}. ${docDecision.decision === "approve" ? "It counts towards the page's verification." : "The owner sees your reason and can upload another."} Needs a fresh 2FA code.` : null}
        confirmLabel={docDecision?.decision === "approve" ? "Approve" : "Reject"}
        destructive={docDecision?.decision === "reject"}
        busy={decideDoc.isPending}
        onConfirm={(reason) => docDecision && decideDoc.mutate({ docId: String(docDecision.doc.id), decision: docDecision.decision, reason })}
        onClose={() => setDocDecision(null)}
      />
    </div>
  )
}
