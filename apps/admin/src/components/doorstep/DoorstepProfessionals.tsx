"use client"

import { useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, LookupForm, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminList } from "@/hooks/useAdminQuery"
import { humanise, isRecord, isUuid, num, readObject, str, when, type Row } from "@/lib/admin/data"
import {
  DECISION_BODIES,
  DOORSTEP_PAGE,
  DOORSTEP_READS,
  DOORSTEP_STEP_UP_READS,
  DOORSTEP_WRITES,
  PRO_STATUSES,
  detailRows,
  documentLabel,
  faceMatchAdvice,
  nextCursor,
  proTone,
  proWrites,
  readReadiness,
  reviewTone,
  skillStatusLabel,
  skillsForReview,
  stepLabel,
  type DoorstepWrite,
} from "@/lib/admin/doorstep"
import { can } from "@/lib/admin/sections"
import { approveProfessional, professionalApproval } from "@/lib/admin/professionalApproval"
import { adminErrorMessage } from "@/lib/admin/mutation"
import { CursorPager, DoorstepActionDialog, StepUpDismissedNote, ValueFilter, useDoorstepMutation, useDoorstepStepUpRead, useMayWrite } from "./DoorstepBits"
import { DocumentDecisionDialog, ViewDocumentButton, useDocumentViewer, type DocumentDecision } from "./DoorstepDocuments"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * Professionals: a list by status and city (the name column filters the
 * page), opening one by id, and the detail with readiness, skills, zones,
 * hours, documents, checks and the decisions this admin may take.
 */
export function DoorstepProfessionals({ initialStatus = "", caption = "Professionals" }: { initialStatus?: string; caption?: string }) {
  const [status, setStatus] = useState(initialStatus)
  const [city, setCity] = useState("")
  const [cursor, setCursor] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const list = useAdminList("doorstep", DOORSTEP_READS.professionals({ status, city }, cursor))

  if (open) return <ProfessionalDetail id={open} onBack={() => setOpen(null)} />

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Professional", value: (r) => str(r.display_name), sortable: true, filterable: true, cell: (r) => <span>{str(r.display_name) ?? "—"} <IdText id={r.id} /></span> },
    { key: "city", header: "City", value: (r) => str(r.city_code), sortable: true },
    { key: "gender", header: "Gender", value: (r) => str(r.gender), cell: (r) => humanise(r.gender) },
    { key: "status", header: "Status", value: (r) => str(r.status), sortable: true, cell: (r) => <StatusPill value={r.status} tone={proTone(r.status)} /> },
    { key: "rating", header: "Rating", value: (r) => num(r.rating_avg), sortable: true, align: "right", cell: (r) => (num(r.rating_avg) === null ? "—" : `${(num(r.rating_avg) ?? 0).toFixed(2)} (${num(r.rating_count) ?? 0})`) },
    { key: "jobs", header: "Jobs", value: (r) => num(r.jobs_completed), sortable: true, align: "right" },
    { key: "joined", header: "Joined", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "open",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => setOpen(String(r.id))} aria-label={`Open professional ${str(r.id)}`}>
          Open
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <ValueFilter value={status} options={PRO_STATUSES} onChange={(v) => { setStatus(v); setCursor("") }} />
        <div className="w-32">
          <Field label="City">{(id) => <input id={id} className={inputClass} value={city} placeholder="HYD" maxLength={3} onChange={(e) => { setCity(e.target.value.toUpperCase()); setCursor("") }} />}</Field>
        </div>
        <div className="min-w-[18rem] flex-1">
          <LookupForm label="Open by id" placeholder="Professional id" button="Open" validate={(v) => (isUuid(v) ? null : "Enter a full professional id.")} onSubmit={(v) => setOpen(v.toLowerCase())} />
        </div>
      </div>
      <DataTable caption={caption} rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No professionals match." pageSize={DOORSTEP_PAGE} />
      <CursorPager cursor={cursor} next={nextCursor(list.raw)} onChange={setCursor} />
    </>
  )
}

type Pending = { write: DoorstepWrite; skill?: string; confirmIdentity?: boolean } | null

/** Application review first; workspace configuration is kept out of the approval checklist. */
export function ProfessionalDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useAdmin()
  const mayWrite = useMayWrite()
  // A step-up read in admin-service: the detail carries document media ids and the payout account.
  const detail = useDoorstepStepUpRead(DOORSTEP_STEP_UP_READS.professional.path(id))
  const zones = useAdminList("doorstep", DOORSTEP_READS.zones(""), { enabled: can(me, "doorstep", "catalogue.read") })
  const viewer = useDocumentViewer()
  const [pending, setPending] = useState<Pending>(null)
  const [decision, setDecision] = useState<DocumentDecision>(null)
  const mutation = useDoorstepMutation({ onDone: (write) => { if (write !== "pro.identity_review") setPending(null) } })
  const [identityChecked, setIdentityChecked] = useState(false)
  const [reviewedGender, setReviewedGender] = useState("unknown")
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalError, setApprovalError] = useState("")
  const approvalLock = useRef(false)

  const d = detail.raw === undefined ? null : readObject(detail.raw)
  const faceMatch = faceMatchAdvice(d)
  const p = d && isRecord(d.professional) ? d.professional : null
  const application = p && isRecord(p.application) ? p.application : null
  const status = str(p?.status)
  const readiness = readReadiness(d)
  const { blockers, confirmIdentity } = professionalApproval(d)
  const reviewing = status === "pending_verification" || status === "draft"
  const writes = proWrites(status).filter((w) => mayWrite(w))
  const zoneName = (zid: string) => str(zones.data.find((z) => str(z.id) === zid)?.name)
  const payout = d ? readObject({ data: d.payout_account }) : null
  const hours = d ? detailRows(d, "weekly_hours") : []
  const history = d ? detailRows(d, "status_history") : []

  const back = (
    <button type="button" className={buttonGhost} onClick={onBack}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the list
    </button>
  )
  if (detail.isLoading) return <div className="space-y-3">{back}<p className="text-sm text-mo-body">Loading the professional…</p></div>
  if (detail.dismissed) return <div className="space-y-3">{back}<StepUpDismissedNote what="Opening a professional (their documents and payout account)" onRetry={detail.retry} /></div>
  if (!p) {
    return (
      <div className="space-y-3">
        {back}
        <p role="alert" className="text-sm text-mo-bad">
          {detail.error ?? "This professional could not be read."}
        </p>
      </div>
    )
  }

  const skillColumns: DataColumn<Row>[] = [
    { key: "skill", header: "Service", value: (r) => str(r.skill_code), cell: (r) => humanise(r.skill_code) },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={skillStatusLabel(r.status)} tone={reviewTone(r.status)} /> },
    { key: "verified", header: "Verified", value: (r) => str(r.verified_at), cell: (r) => when(r.verified_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        mayWrite("skill.verify") ? (
          str(r.status) === "verified" ? (
            <button type="button" className={buttonDanger} onClick={() => setPending({ write: "skill.revoke", skill: String(r.skill_code) })}>
              Revoke
            </button>
          ) : (
            <button type="button" className={buttonPrimary} onClick={() => setPending({ write: "skill.verify", skill: String(r.skill_code) })}>
              Verify
            </button>
          )
        ) : null,
    },
  ]

  const documentColumns: DataColumn<Row>[] = [
    { key: "kind", header: "Document", value: (r) => str(r.kind), cell: (r) => documentLabel(r) },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={str(r.status) === "pending" ? "Waiting for an admin" : r.status} tone={reviewTone(r.status)} /> },
    { key: "issued", header: "Issued", value: (r) => str(r.issued_on) },
    { key: "expires", header: "Expires", value: (r) => str(r.expires_on) },
    { key: "reason", header: "Reason", value: (r) => str(r.reason) },
    { key: "view", header: "Image", value: () => null, cell: (r) => <ViewDocumentButton doc={r} viewer={viewer} /> },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        str(r.status) === "pending" && mayWrite("document.approve") ? (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonPrimary} onClick={() => setDecision({ write: "document.approve", doc: r })} aria-label={`Approve ${documentLabel(r)} ${str(r.id)}`}>
              Approve
            </button>
            <button type="button" className={buttonDanger} onClick={() => setDecision({ write: "document.reject", doc: r })} aria-label={`Reject ${documentLabel(r)} ${str(r.id)}`}>
              Reject
            </button>
          </span>
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      {back}
      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Professional detail">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-mo-display text-lg font-semibold text-mo-ink">{str(p.display_name) ?? "Professional"}</h3>
          <StatusPill value={status} tone={proTone(status)} />
        </div>
        <Details
          items={[
            ["City", application ? `${str(application.town)}, ${str(application.state_name)}` : str(p.city_code)],
            ["Gender", application ? humanise(application.declared_gender) : humanise(p.gender)],
            ["Verified mobile", application ? `Ending ${str(application.primary_phone_last4)}` : "—"],
            ["Alternate contact", application?.alternate_phone_last4 ? `Ending ${str(application.alternate_phone_last4)} · ${application.alternate_phone_verified_at ? "Verified" : "Verify later"}` : "Not supplied (optional)"],
            ["Applied", when(application?.submitted_at ?? p.created_at)],
          ]}
        />
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-semibold text-mo-ink">Application checks</h4>
          <ul className="flex flex-wrap gap-1" aria-label="Onboarding steps">
            {readiness.completed.filter(s => !application || ["selfie_face_match", "identity_review", "skills", "pan", "bank"].includes(s)).map((s) => (
              <li key={`c-${s}`}>
                <StatusPill value={stepLabel(s)} tone="good" />
              </li>
            ))}
            {readiness.missing.map((s) => (
              <li key={`m-${s}`}>
                <StatusPill value={`${stepLabel(s)}: ${s === "identity_review" && confirmIdentity ? "confirm with approval" : "to review"}`} tone="warn" />
              </li>
            ))}
            {readiness.recommended.map((s) => (
              <li key={`r-${s}`}>
                <StatusPill value={`${stepLabel(s)}: recommended`} tone="normal" />
              </li>
            ))}
          </ul>
          {reviewing && blockers.length > 0 ? (
            <p id="approval-requirements" className="text-sm text-mo-body" role="status">Before approval: {blockers.join(", ")}. Review the services and documents below.</p>
          ) : null}
          {reviewing && blockers.length === 0 ? <p className="text-sm text-mo-body">{confirmIdentity ? "Documents reviewed. Confirm the identity check when approving this partner." : "Required application checks are complete. Ready for approval."}</p> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {writes.map((w) => (
            <button key={w} type="button" className={DOORSTEP_WRITES[w].destructive ? buttonDanger : buttonPrimary}
              disabled={approvalBusy || (w === "pro.approve" && blockers.length > 0)}
              aria-describedby={w === "pro.approve" && blockers.length > 0 ? "approval-requirements" : undefined}
              onClick={() => { setIdentityChecked(false); setReviewedGender(str(p.gender) || "unknown"); setApprovalError(""); setPending({ write: w, confirmIdentity: w === "pro.approve" && confirmIdentity }) }}>
              {DOORSTEP_WRITES[w].label}
            </button>
          ))}
        </div>
      </section>

      <DataTable caption="Documents" rows={detailRows(d, "documents")} columns={documentColumns} rowId={(r) => String(r.id)} emptyMessage="No documents uploaded." />

      <div className="space-y-1">
        <DataTable caption="Services" rows={skillsForReview(d)} columns={skillColumns} rowId={(r) => String(r.skill_code)} emptyMessage="No services selected." />
        <p className="text-xs text-mo-body">Review the services this partner can provide. Experience certificates are optional supporting evidence.</p>
      </div>

      <details className="rounded-mo border border-mo bg-mo-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-mo-ink">Workspace setup · service area and hours</summary>
        <p className="my-2 text-sm text-mo-body">Configured before taking jobs, separately from application review.</p>
        <Details
          items={[
            [
              "Zones",
              Array.isArray(d?.zone_ids) && d.zone_ids.length > 0
                ? (d.zone_ids as unknown[]).map((z) => zoneName(String(z)) ?? String(z).slice(0, 8)).join(", ")
                : "None chosen",
            ],
            [
              "Weekly hours",
              hours.length > 0
                ? hours.map((h) => `${WEEKDAYS[num(h.weekday) ?? 0] ?? "?"} ${str(h.start)}–${str(h.end)}`).join(" · ")
                : "Not configured",
            ],
          ]}
        />
      </details>

      {faceMatch ? (
        <p className="rounded-mo border border-mo bg-mo-sunken p-3 text-sm text-mo-ink" aria-label="Face match advice">
          <span className="font-semibold">Face match (advice only): </span>
          {faceMatch.advice}
        </p>
      ) : null}
      {viewer.element}
      <DocumentDecisionDialog pending={decision} faceMatch={{ kind: "ready", advice: faceMatch }} onClose={() => setDecision(null)} />

      <details className="rounded-mo border border-mo bg-mo-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold text-mo-ink">Review history & service-specific checks</summary>
        <div className="my-3"><Details items={[["Professional reference", <IdText key="p" id={p.id} />], ["Account reference", <IdText key="u" id={p.user_id} />], ["Updated", when(p.updated_at)]]} /></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DataTable
          caption="Background checks"
          rows={detailRows(d, "background_checks")}
          columns={[
            { key: "source", header: "Source", value: (r) => str(r.source), cell: (r) => humanise(r.source) },
            { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
            { key: "valid", header: "Valid until", value: (r) => str(r.valid_until) },
          ]}
          rowId={(r) => String(r.id)}
          emptyMessage="No background check yet."
        />
        <DataTable
          caption="KYC checks"
          rows={detailRows(d, "kyc_checks")}
          columns={[
            { key: "kind", header: "Check", value: (r) => str(r.kind), cell: (r) => humanise(r.kind) },
            { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={str(r.status) === "pending" ? "Waiting for an admin" : r.status} tone={reviewTone(r.status)} /> },
            {
              key: "score",
              header: "Similarity (advice)",
              value: (r) => num(r.score),
              align: "right",
              cell: (r) => (num(r.score) === null ? "—" : str(r.kind) === "selfie_face_match" ? `${Number((num(r.score) ?? 0).toFixed(1))} / 100` : (num(r.score) ?? 0).toFixed(2)),
            },
            { key: "at", header: "Verified", value: (r) => str(r.verified_at), cell: (r) => when(r.verified_at) },
          ]}
          rowId={(r) => String(r.kind)}
          emptyMessage="No KYC checks yet."
        />
        </div>
        {mayWrite("pro.identity_review") ? <IdentityReviewPanel key={`identity-${id}`} id={id} application={Boolean(application)} /> : null}
        {mayWrite("pro.tax_registration") ? <TaxRegistrationPanel key={id} id={id} /> : null}
      </details>

      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Payout account">
        <h4 className="mb-2 text-sm font-semibold text-mo-ink">Payout account</h4>
        {payout ? (
          <Details
            items={[
              ["Holder", str(payout.account_holder)],
              ["Account", str(payout.account_last4) ? `•••• ${str(payout.account_last4)}` : null],
              ["IFSC", str(payout.ifsc)],
              ["Bank", str(payout.bank_name)],
              ["Branch", str(payout.branch_name)],
              ["Proof", str(payout.proof_kind)?.replaceAll("_", " ")],
              ["Review note", str(payout.reason)],
              ["Status", <StatusPill key="s" value={payout.status} tone={reviewTone(payout.status)} />],
            ]}
          />
        ) : (
          <p className="text-sm text-mo-body">No bank account submitted.</p>
        )}
      </section>

      {history.length > 0 ? (
        <DataTable
          caption="Status history"
          rows={history}
          columns={[
            { key: "when", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
            { key: "from", header: "From", value: (r) => str(r.from_status), cell: (r) => humanise(r.from_status) },
            { key: "to", header: "To", value: (r) => str(r.to_status), cell: (r) => humanise(r.to_status) },
            { key: "reason", header: "Reason", value: (r) => str(r.reason) },
          ]}
          rowId={(r) => `${str(r.created_at)}-${str(r.to_status)}`}
        />
      ) : (
        null
      )}

      <DoorstepActionDialog
        write={pending?.write ?? null}
        subject={pending?.skill ? `“${pending.skill}”` : str(p.display_name)}
        busy={mutation.isPending || approvalBusy}
        canConfirm={pending?.write !== "pro.approve" || (blockers.length === 0 && (!pending.confirmIdentity || identityChecked))}
        onConfirm={async (reason) => {
          if (!pending) return
          if (pending.write === "pro.approve") {
            if (approvalLock.current || blockers.length > 0 || (pending.confirmIdentity && !identityChecked)) return
            approvalLock.current = true; setApprovalBusy(true); setApprovalError("")
            try {
              const outcome = await approveProfessional(async (write, body) => {
                const result = await mutation.mutateAsync({ write, target: { id }, body })
                if (write === "pro.identity_review" && result.kind === "done") {
                  setPending(current => current ? { ...current, confirmIdentity: false } : null)
                }
                return result
              }, pending.confirmIdentity ? { gender: reviewedGender } : null, reason)
              if (outcome.kind === "approval") setPending(null)
            } catch (error) { setApprovalError(adminErrorMessage(error, "Approval could not be completed. Your saved reviews are preserved.")) }
            finally { approvalLock.current = false; setApprovalBusy(false) }
            return
          }
          if (pending.write === "skill.verify" || pending.write === "skill.revoke") {
            mutation.mutate({ write: pending.write, target: { id, skill: pending.skill }, body: DECISION_BODIES.skill(pending.write === "skill.verify", reason) })
          } else {
            mutation.mutate({ write: pending.write, target: { id }, body: DOORSTEP_WRITES[pending.write].reason || reason ? DECISION_BODIES.reason(reason) : {} })
          }
        }}
        onClose={() => setPending(null)}
      >
        {pending?.confirmIdentity ? <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-mo-ink"><input type="checkbox" checked={identityChecked} onChange={e => setIdentityChecked(e.target.checked)} />I reviewed the approved identity proof and selfie and confirm they belong to this applicant.</label>
          <details><summary className="cursor-pointer text-sm text-mo-body">Restricted-service eligibility (if applicable)</summary>
            <p className="my-2 text-xs text-mo-body">Only record what the evidence establishes. Unknown eligibility keeps restricted services unavailable.</p>
            <Field label="Reviewed eligibility">{fieldId => <select id={fieldId} className={inputClass} value={reviewedGender} onChange={e => { setReviewedGender(e.target.value); setIdentityChecked(false) }}><option value="unknown">Not established</option><option value="female">Female</option><option value="male">Male</option><option value="transgender">Transgender</option></select>}</Field>
          </details>
        </div> : null}
        {approvalError ? <p role="alert" className="text-sm text-mo-bad">{approvalError}</p> : null}
      </DoorstepActionDialog>
    </div>
  )
}

function TaxRegistrationPanel({ id }: { id: string }) {
  const [opened, setOpened] = useState(false)
  const [editing, setEditing] = useState(false)
  const [gstin, setGstin] = useState("")
  const [verified, setVerified] = useState(false)
  const read = useDoorstepStepUpRead(DOORSTEP_STEP_UP_READS.taxRegistration.path(id), { enabled: opened })
  const registration = read.raw === undefined ? null : readObject(read.raw)
  const mutation = useDoorstepMutation({ onDone: () => { setEditing(false); setGstin(""); setVerified(false) } })
  const valid = gstin.trim() === "" || (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin) && verified)
  return <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="GST registration">
    <h4 className="mb-2 text-sm font-semibold text-mo-ink">GST registration · manual review</h4>
    <p className="mb-3 text-sm text-mo-body">Registered-only services stay unavailable until an admin verifies the registration. GSTIN includes sensitive tax identity; opening it requires a fresh security check.</p>
    {!opened ? <button type="button" className={buttonSecondary} onClick={() => setOpened(true)}>Review registration</button> : <>
      {read.isLoading ? <p className="text-sm text-mo-body">Loading…</p> : read.dismissed ? <StepUpDismissedNote what="Opening the GST registration" onRetry={read.retry} /> : read.error ? <p role="alert" className="text-sm text-mo-bad">{read.error}</p> : <>
        <p className="mb-3 font-mo-mono text-sm text-mo-ink">{str(registration?.gstin) ?? "No registration recorded"}</p>
        <button type="button" className={buttonPrimary} onClick={() => { setGstin(str(registration?.gstin) ?? ""); setVerified(false); setEditing(true) }}>Record reviewed registration</button>
      </>}
    </>}
    <DoorstepActionDialog write={editing ? "pro.tax_registration" : null} subject={null} busy={mutation.isPending} canConfirm={valid} onClose={() => setEditing(false)} onConfirm={reason => mutation.mutate({ write: "pro.tax_registration", target: { id }, body: { gstin: gstin.trim(), verified, reason } })}>
      <Field label="GSTIN (blank to remove)">{fieldId => <input id={fieldId} className={inputClass} value={gstin} maxLength={15} autoComplete="off" onChange={e => { setGstin(e.target.value.toUpperCase()); setVerified(false) }} />}</Field>
      {gstin.trim() ? <label className="mt-3 flex gap-2 text-sm text-mo-ink"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />I checked the active registration and its ownership.</label> : <p className="mt-3 text-sm text-mo-body">This removes the registration and prevents new registered-only bookings.</p>}
      {!valid ? <p className="mt-2 text-sm text-mo-bad">Enter a 15-character GSTIN and confirm the manual verification.</p> : null}
    </DoorstepActionDialog>
  </section>
}

function IdentityReviewPanel({ id, application = false }: { id: string; application?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [gender, setGender] = useState("unknown")
  const [checked, setChecked] = useState(false)
  const mutation = useDoorstepMutation({ onDone: () => { setEditing(false); setChecked(false) } })
  return <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Manual identity review">
    <h4 className="mb-2 text-sm font-semibold text-mo-ink">Identity and salon eligibility · admin review</h4>
    <p className="mb-3 text-sm text-mo-body">{application ? "Approve the uploaded identity proof, then record your manual review." : "Review PAN submission and approve the current selfie first."} Experience or course certificates are skill evidence, not identity proof. Unknown eligibility keeps restricted salon work unavailable.</p>
    <button type="button" className={buttonSecondary} onClick={() => { setChecked(false); setEditing(true) }}>Record reviewed identity</button>
    <DoorstepActionDialog write={editing ? "pro.identity_review" : null} subject={null} busy={mutation.isPending} canConfirm={checked} onClose={() => setEditing(false)} onConfirm={reason => mutation.mutate({ write: "pro.identity_review", target: { id }, body: { gender, reason } })}>
      {application && <p className="text-sm text-mo-body">Approve the uploaded Passport, Voter ID or Driving Licence first. Self-declared gender is not reviewed eligibility. Account approval opens the workspace; job-readiness checks still apply.</p>}
      <Field label="Reviewed eligibility">{fieldId => <select id={fieldId} className={inputClass} value={gender} onChange={e => { setGender(e.target.value); setChecked(false) }}><option value="unknown">Unknown / not established</option><option value="female">Female</option><option value="male">Male</option><option value="transgender">Transgender</option></select>}</Field>
      <label className="mt-3 flex gap-2 text-sm text-mo-ink"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I reviewed the evidence. This is a manual decision, not Aadhaar/PAN authentication.</label>
    </DoorstepActionDialog>
  </section>
}
