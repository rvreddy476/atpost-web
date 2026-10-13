"use client"

import { useState } from "react"
import { PartnerEvidenceButton } from "@/components/blocks/PartnerEvidenceButton"
import { ArrowLeft, Check, X } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DocumentViewer } from "@/components/blocks/DocumentViewer"
import { Details, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation, useStepUpRead } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { bool, humanise, readList, readObject, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import { adminErrorMessage } from "@/lib/admin/mutation"

export const FOOD = "/v1/admin/food"
export const FOOD_KEY = adminKey("food")

type Kind = "restaurants" | "delivery-partners"

function useDecision(kind: Kind, decision: "approve" | "reject", close: () => void) {
  const noun = kind === "restaurants" ? "Restaurant" : "Rider"
  return useAdminMutation<{ id: string; reason: string }>({
    request: ({ id, reason }) => ({ method: "post", url: `${FOOD}/${kind}/${encodeURIComponent(id)}/${decision}`, body: { reason } }),
    invalidate: [FOOD_KEY],
    successMessage: `${noun} ${decision === "approve" ? "approved" : "rejected"}`,
    errorTitle: `${noun} ${decision === "approve" ? "approval" : "rejection"} failed`,
    onDone: (_data, _vars, outcome) => { if (outcome === "done") close() },
  })
}

/** Restaurants and riders waiting to go live, and rider KYC documents. */
export function FeastApprovals() {
  const { me } = useAdmin()
  const [kycFor, setKycFor] = useState<Row | null>(null)
  const [restaurantFor, setRestaurantFor] = useState<Row | null>(null)
  if (restaurantFor) return <RestaurantDocuments restaurant={restaurantFor} onBack={() => setRestaurantFor(null)} />
  if (kycFor) return <RiderKyc partner={kycFor} onBack={() => setKycFor(null)} />
  return (
    <div className="space-y-8">
      {can(me, "food", "restaurant.approve") ? <PendingQueue kind="restaurants" onKyc={can(me, "food", "documents.review") ? setRestaurantFor : undefined} /> : null}
      {can(me, "food", "delivery_partner.approve") || can(me, "food", "documents.review") ? (
        <PendingQueue kind="delivery-partners" onKyc={can(me, "food", "documents.review") ? setKycFor : undefined} />
      ) : null}
    </div>
  )
}

function PendingQueue({ kind, onKyc }: { kind: Kind; onKyc?: (row: Row) => void }) {
  const { me } = useAdmin()
  const list = useAdminList("food", `${FOOD}/${kind}/pending`)
  const [rejecting, setRejecting] = useState<Row | null>(null)
  const approve = useDecision(kind, "approve", () => undefined)
  const reject = useDecision(kind, "reject", () => setRejecting(null))
  const mayDecide = can(me, "food", kind === "restaurants" ? "restaurant.approve" : "delivery_partner.approve")
  const restaurants = kind === "restaurants"

  const columns: DataColumn<Row>[] = restaurants
    ? [
        { key: "name", header: "Restaurant", value: (r) => str(r.display_name) ?? str(r.name), sortable: true, filterable: true, cell: (r) => <div><div className="font-semibold">{str(r.display_name) ?? str(r.name)}</div><div className="text-xs text-mo-body">{str(r.legal_name)}</div></div> },
        { key: "city", header: "City", value: (r) => str(r.city), sortable: true, filterable: true },
        { key: "created", header: "Applied", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
      ]
    : [
        { key: "name", header: "Rider", value: (r) => str(r.full_name), sortable: true, filterable: true },
        { key: "vehicle", header: "Vehicle", value: (r) => str(r.vehicle_type), cell: (r) => humanise(r.vehicle_type) },
        { key: "city", header: "City", value: (r) => str(r.city), sortable: true, filterable: true },
        { key: "created", header: "Applied", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
      ]
  columns.push({
    key: "actions",
    header: "",
    value: () => null,
    align: "right",
    cell: (r) => {
      const label = str(r.display_name) ?? str(r.name) ?? str(r.full_name) ?? str(r.id)
      return (
        <div className="flex justify-end gap-2">
          {onKyc ? (
            <button type="button" className={buttonSecondary} onClick={() => onKyc(r)} aria-label={`Review KYC for ${label}`}>
              Review KYC
            </button>
          ) : null}
          {mayDecide ? (
            <>
              <button type="button" className={buttonPrimary} disabled={approve.isPending} onClick={() => approve.mutate({ id: String(r.id), reason: "" })} aria-label={`Approve ${label}`}>
                <Check className="h-4 w-4" aria-hidden="true" /> Approve
              </button>
              <button type="button" className={buttonDanger} onClick={() => setRejecting(r)} aria-label={`Reject ${label}`}>
                <X className="h-4 w-4" aria-hidden="true" /> Reject
              </button>
            </>
          ) : null}
        </div>
      )
    },
  })

  return (
    <section>
      <h3 className="mb-2 font-mo-display text-base font-semibold text-mo-ink">{restaurants ? "Restaurants to approve" : "Riders to approve"}</h3>
      {restaurants ? <p className="mb-2 text-xs text-mo-body">A restaurant cannot be approved without an approved, unexpired FSSAI licence.</p> : <p className="mb-2 text-xs text-mo-body">A rider cannot be approved until their KYC is complete.</p>}
      <DataTable
        caption={restaurants ? "Restaurants pending review" : "Riders pending review"}
        rows={list.data}
        columns={columns}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage={restaurants ? "No restaurants are waiting." : "No riders are waiting."}
      />
      <ConfirmReasonDialog
        open={rejecting !== null}
        title={restaurants ? "Reject this restaurant?" : "Reject this rider?"}
        description="The applicant sees your reason."
        confirmLabel="Reject"
        destructive
        busy={reject.isPending}
        onConfirm={(reason) => rejecting && reject.mutate({ id: String(rejecting.id), reason })}
        onClose={() => setRejecting(null)}
      />
    </section>
  )
}

/**
 * A rider's KYC. The bundle starts blurred in the document viewer; "Reveal"
 * runs the audited KYC read (`food:documents.review`, step-up). Document
 * numbers and names stay masked as the service returns them.
 */
function RiderKyc({ partner, onBack }: { partner: Row; onBack: () => void }) {
  const read = useStepUpRead()
  const { me } = useAdmin()
  const id = String(partner.id)
  const [kyc, setKyc] = useState<Row | null>(null)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [reviewError, setReviewError] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const decide = useAdminMutation<{ docId: string; decision: string; reason: string }>({
    request: ({ docId, decision, reason }) => ({
      method: "post",
      url: `${FOOD}/delivery-partners/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/decide`,
      body: { decision, reason },
    }),
    invalidate: [FOOD_KEY],
    successMessage: "Document decided",
    errorTitle: "Document decision failed",
    onDone: (_data, _vars, outcome) => {
      setDeciding(null)
      if (outcome === "done") void reveal()
    },
  })

  const reveal = async () => {
    setRefreshing(true); setReviewError("")
    try {
      const raw = await read(`${FOOD}/delivery-partners/${encodeURIComponent(id)}/kyc`)
      if (raw === null) { setKyc(null); return false }
      const next = readObject(raw)
      if (!next || !Array.isArray(next.missing) || next.missing.some(item => typeof item !== "string")) throw new Error("Verification status could not be read. Please refresh.")
      setKyc(next)
      return true
    } catch (error) { setKyc(null); setReviewError(adminErrorMessage(error, "Verification could not be refreshed.")); return false }
    finally { setRefreshing(false) }
  }

  const documents = kyc ? readList({ items: kyc.documents }) : []
  const checks = kyc ? readList({ items: kyc.checks }) : []
  const missing = kyc && Array.isArray(kyc.missing) ? kyc.missing.filter((m): m is string => typeof m === "string") : []

  const docColumns: DataColumn<Row>[] = [
    { key: 'view', header: 'Preview', value: () => null, cell: (r) => <PartnerEvidenceButton path={`${FOOD}/delivery-partners/${encodeURIComponent(id)}/documents/${encodeURIComponent(String(r.id))}/view`} /> },
    { key: "type", header: "Document", value: (r) => str(r.document_type), cell: (r) => humanise(r.document_type) },
    { key: "number", header: "Number", value: (r) => str(r.number_masked), cell: (r) => <span className="font-mo-mono">{str(r.number_masked) ?? "—"}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "APPROVED" ? "good" : r.status === "REJECTED" ? "bad" : "normal"} /> },
    { key: "expires", header: "Expires", value: (r) => str(r.expires_at), cell: (r) => when(r.expires_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        str(r.status) === "PENDING" && can(me, "food", "documents.review") ? (
          <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide ${humanise(r.document_type)}`}>
            Decide
          </button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <button type="button" className={buttonGhost} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to approvals
      </button>
      <h3 className="font-mo-display text-lg font-semibold text-mo-ink">Application review · {str(partner.full_name) ?? id}</h3>
      <ReviewApproval kind="delivery-partners" id={id} ready={Boolean(kyc) && !refreshing && !reviewError && missing.length === 0} onDone={onBack} />
      {reviewError ? <p role="alert" className="text-sm text-mo-bad">{reviewError}</p> : null}
      <button type="button" className={buttonSecondary} disabled={refreshing} onClick={() => void reveal()}>{refreshing ? "Refreshing…" : "Refresh verification"}</button>
      <DocumentViewer
        document={{ id, title: "Rider KYC documents and checks", url: null, kind: "pdf", sensitive: true }}
        onReveal={reveal}
        watermark={me.userId}
      />
      {kyc ? (
        <>
          <Details
            items={[
              ["KYC status", humanise(kyc.status)],
              ["Vehicle", humanise(kyc.vehicle_type)],
              ["Driving documents required", bool(kyc.driving_documents_required) ? "Yes" : "No"],
              ["Payout account", bool(kyc.has_payout_account) ? "On file" : "Missing"],
              ["Missing", missing.length ? missing.map(humanise).join(", ") : "Nothing"],
            ]}
          />
          <DataTable
            caption="Identity checks"
            rows={checks}
            columns={[
              { key: "kind", header: "Check", value: (r) => str(r.kind), cell: (r) => humanise(r.kind) },
              { key: "name", header: "Name on document", value: (r) => str(r.name_on_document_masked) },
              { key: "valid", header: "Valid", value: (r) => (bool(r.valid) ? "yes" : "no") },
              { key: "until", header: "Valid until", value: (r) => str(r.valid_until), cell: (r) => when(r.valid_until) },
            ]}
            rowId={(r) => `${str(r.kind)}-${str(r.verified_at)}`}
            emptyMessage="No identity checks recorded."
          />
          <DataTable caption="KYC documents" rows={documents} columns={docColumns} rowId={(r) => String(r.id)} emptyMessage="No documents uploaded." />
        </>
      ) : null}
      <ChoiceDialog
        open={deciding !== null}
        title="Decide this document"
        description="Your document review decision is recorded."
        choiceLabel="Decision"
        choices={[{ value: "APPROVED", label: "Approve" }, { value: "REJECTED", label: "Reject", destructive: true }]}
        busy={decide.isPending}
        onConfirm={(decision, reason) => deciding && decide.mutate({ docId: String(deciding.id), decision, reason })}
        onClose={() => setDeciding(null)}
      />
    </div>
  )
}

function RestaurantDocuments({ restaurant, onBack }: { restaurant: Row; onBack: () => void }) {
  const read = useStepUpRead()
  const id = encodeURIComponent(String(restaurant.id))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const refresh = async () => {
    setLoading(true); setError("")
    try {
      const raw = await read(`${FOOD}/restaurants/${id}/documents`)
      setRows(raw !== null ? readList(raw) : null)
    } catch (cause) { setRows(null); setError(adminErrorMessage(cause, "Documents could not be loaded.")) }
    finally { setLoading(false) }
  }
  const decide = useAdminMutation<{ doc: string; decision: string; reason: string }>({
    request: ({ doc, decision, reason }) => ({ method: 'post', url: `${FOOD}/restaurants/${id}/documents/${encodeURIComponent(doc)}/decide`, body: { decision, reason } }),
    invalidate: [FOOD_KEY], successMessage: 'Document reviewed', errorTitle: 'Review could not be saved',
    onDone: (_data, _vars, outcome) => { setDeciding(null); if (outcome === "done") void refresh() },
  })
  return <section className="space-y-4">
    <button type="button" className={buttonGhost} onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back to approvals</button>
    <h3 className="text-lg font-semibold">{str(restaurant.display_name) ?? str(restaurant.name)} · Verification</h3>
    <ReviewApproval kind="restaurants" id={String(restaurant.id)} ready={rows !== null && !loading && !error} onDone={onBack} />
    <button type="button" className={buttonSecondary} disabled={loading} onClick={() => void refresh()}>{loading ? 'Loading…' : rows ? 'Refresh documents' : 'Open documents'}</button>
    {error ? <p role="alert" className="text-sm text-mo-bad">{error}</p> : null}
    {rows ? <DataTable caption="Restaurant verification documents" rows={rows} rowId={(r) => String(r.id)} emptyMessage="No documents submitted." columns={[
      { key: 'type', header: 'Document', value: (r) => str(r.document_type), cell: (r) => humanise(r.document_type) },
      { key: 'status', header: 'Status', value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} /> },
      { key: 'view', header: 'Preview', value: () => null, cell: (r) => r.viewable === true ? <PartnerEvidenceButton path={`${FOOD}/restaurants/${id}/documents/${encodeURIComponent(String(r.id))}/view`} /> : 'No preview' },
      { key: 'action', header: '', value: () => null, cell: (r) => r.status === 'PENDING' ? <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)}>Review</button> : null },
    ]} /> : null}
    <ChoiceDialog open={!!deciding} title="Review document" choiceLabel="Decision" choices={[{ value: 'APPROVED', label: 'Approve' }, { value: 'REJECTED', label: 'Reject', destructive: true }]} busy={decide.isPending} onConfirm={(decision, reason) => deciding && decide.mutate({ doc: String(deciding.id), decision, reason })} onClose={() => setDeciding(null)} />
  </section>
}

function ReviewApproval({ kind, id, ready, onDone }: { kind: Kind; id: string; ready: boolean; onDone: () => void }) {
  const { me } = useAdmin()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState("")
  const approve = useDecision(kind, "approve", onDone)
  if (!can(me, "food", kind === "restaurants" ? "restaurant.approve" : "delivery_partner.approve")) return null
  return <div className="space-y-2">
    <button type="button" className={buttonPrimary} disabled={!ready || approve.isPending} onClick={() => { setError(""); setConfirming(true) }}>Approve {kind === "restaurants" ? "restaurant" : "delivery partner"}</button>
    {!ready ? <p className="text-sm text-mo-body">Load and complete the required document reviews below.</p> : null}
    <ConfirmReasonDialog open={confirming} title="Approve this partner?" description="Confirm you have reviewed the application. Required verification checks still apply." confirmLabel="Approve" busy={approve.isPending} canConfirm={ready} onConfirm={async reason => { setError(""); try { await approve.mutateAsync({ id, reason }) } catch (cause) { setError(adminErrorMessage(cause, "Approval could not be completed.")) } }} onClose={() => setConfirming(false)}>
      {error ? <p role="alert" className="text-sm text-mo-bad">{error}</p> : null}
    </ConfirmReasonDialog>
  </div>
}
