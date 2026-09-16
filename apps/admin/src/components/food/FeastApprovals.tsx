"use client"

import { useState } from "react"
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
    onDone: close,
  })
}

/** Restaurants and riders waiting to go live, and rider KYC documents. */
export function FeastApprovals() {
  const { me } = useAdmin()
  const [kycFor, setKycFor] = useState<Row | null>(null)
  if (kycFor) return <RiderKyc partner={kycFor} onBack={() => setKycFor(null)} />
  return (
    <div className="space-y-8">
      {can(me, "food", "restaurant.approve") ? <PendingQueue kind="restaurants" /> : null}
      {can(me, "food", "delivery_partner.approve") || can(me, "food", "documents.review") ? (
        <PendingQueue kind="delivery-partners" onKyc={can(me, "food", "documents.review") ? setKycFor : undefined} />
      ) : null}
      {can(me, "food", "documents.review") ? (
        <p className="text-xs text-mo-body">
          Restaurant documents (FSSAI and others) cannot be listed from the console yet: admin-service has a decide route but no
          list route for them.
        </p>
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

  const decide = useAdminMutation<{ docId: string; decision: string; reason: string }>({
    request: ({ docId, decision, reason }) => ({
      method: "post",
      url: `${FOOD}/delivery-partners/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/decide`,
      body: { decision, reason },
    }),
    invalidate: [FOOD_KEY],
    successMessage: "Document decided",
    errorTitle: "Document decision failed",
    onDone: (data) => {
      const doc = readObject(data)
      setDeciding(null)
      if (doc && kyc) {
        const documents = readList({ items: kyc.documents }).map((d) => (d.id === doc.id ? { ...d, ...doc } : d))
        setKyc({ ...kyc, documents })
      }
    },
  })

  const reveal = async () => {
    const raw = await read(`${FOOD}/delivery-partners/${encodeURIComponent(id)}/kyc`)
    if (raw === null) return false
    setKyc(readObject(raw) ?? {})
    return true
  }

  const documents = kyc ? readList({ items: kyc.documents }) : []
  const checks = kyc ? readList({ items: kyc.checks }) : []
  const missing = kyc && Array.isArray(kyc.missing) ? kyc.missing.filter((m): m is string => typeof m === "string") : []

  const docColumns: DataColumn<Row>[] = [
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
      <h3 className="font-mo-display text-lg font-semibold text-mo-ink">KYC · {str(partner.full_name) ?? id}</h3>
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
          <p className="text-xs text-mo-body">Document images are not served to the console yet; numbers stay masked.</p>
        </>
      ) : null}
      <ChoiceDialog
        open={deciding !== null}
        title="Decide this document"
        description="Deciding a KYC document needs a fresh 2FA code."
        choiceLabel="Decision"
        choices={[{ value: "APPROVED", label: "Approve" }, { value: "REJECTED", label: "Reject", destructive: true }]}
        busy={decide.isPending}
        onConfirm={(decision, reason) => deciding && decide.mutate({ docId: String(deciding.id), decision, reason })}
        onClose={() => setDeciding(null)}
      />
    </div>
  )
}
