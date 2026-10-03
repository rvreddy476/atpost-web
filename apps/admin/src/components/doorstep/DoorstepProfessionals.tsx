"use client"

import { useState } from "react"
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
  approvalBlockers,
  detailRows,
  documentKindLabel,
  nextCursor,
  proTone,
  proWrites,
  readReadiness,
  reviewTone,
  stepLabel,
  type DoorstepWrite,
} from "@/lib/admin/doorstep"
import { can } from "@/lib/admin/sections"
import { CursorPager, DoorstepActionDialog, StepUpDismissedNote, ValueFilter, useDoorstepMutation, useDoorstepStepUpRead, useMayWrite } from "./DoorstepBits"
import { ViewDocumentButton, useDocumentViewer } from "./DoorstepDocuments"

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

type Pending = { write: DoorstepWrite; skill?: string } | null

/** One professional. Approve is offered only once every required onboarding step is done; the server refuses otherwise too. */
export function ProfessionalDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useAdmin()
  const mayWrite = useMayWrite()
  // A step-up read in admin-service: the detail carries document media ids and the payout account.
  const detail = useDoorstepStepUpRead(DOORSTEP_STEP_UP_READS.professional.path(id))
  const zones = useAdminList("doorstep", DOORSTEP_READS.zones(""), { enabled: can(me, "doorstep", "catalogue.read") })
  const viewer = useDocumentViewer()
  const [pending, setPending] = useState<Pending>(null)
  const mutation = useDoorstepMutation({ onDone: () => setPending(null) })

  const d = detail.raw === undefined ? null : readObject(detail.raw)
  const p = d && isRecord(d.professional) ? d.professional : null
  const status = str(p?.status)
  const readiness = readReadiness(d)
  const blockers = approvalBlockers(d)
  const writes = proWrites(status).filter((w) => mayWrite(w) && (w !== "pro.approve" || blockers.length === 0))
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
    { key: "skill", header: "Skill", value: (r) => str(r.skill_code), cell: (r) => <span className="font-mo-mono text-xs">{str(r.skill_code)}</span> },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
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
    { key: "kind", header: "Document", value: (r) => str(r.kind), cell: (r) => documentKindLabel(r.kind) },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
    { key: "issued", header: "Issued", value: (r) => str(r.issued_on) },
    { key: "expires", header: "Expires", value: (r) => str(r.expires_on) },
    { key: "reason", header: "Reason", value: (r) => str(r.reason) },
    { key: "view", header: "Image", value: () => null, cell: (r) => <ViewDocumentButton doc={r} viewer={viewer} /> },
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
            ["Professional id", <IdText key="id" id={p.id} />],
            ["User", <IdText key="u" id={p.user_id} />],
            ["City", str(p.city_code)],
            ["Gender (from Aadhaar)", humanise(p.gender)],
            ["Rating", num(p.rating_avg) === null ? "No ratings yet" : `${(num(p.rating_avg) ?? 0).toFixed(2)} from ${num(p.rating_count) ?? 0}`],
            ["Jobs completed", String(num(p.jobs_completed) ?? 0)],
            ["Max jobs a day", String(num(p.max_jobs_per_day) ?? "—")],
            ["Can go on duty", readiness.canGoOnDuty ? "Yes" : "No"],
            ["Joined", when(p.created_at)],
            ["Updated", when(p.updated_at)],
          ]}
        />
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-semibold text-mo-ink">Onboarding</h4>
          <ul className="flex flex-wrap gap-1" aria-label="Onboarding steps">
            {readiness.completed.map((s) => (
              <li key={`c-${s}`}>
                <StatusPill value={stepLabel(s)} tone="good" />
              </li>
            ))}
            {readiness.missing.map((s) => (
              <li key={`m-${s}`}>
                <StatusPill value={`${stepLabel(s)}: missing`} tone="warn" />
              </li>
            ))}
            {readiness.recommended.map((s) => (
              <li key={`r-${s}`}>
                <StatusPill value={`${stepLabel(s)}: recommended`} tone="normal" />
              </li>
            ))}
          </ul>
          {status === "pending_verification" && blockers.length > 0 ? (
            <p className="text-xs text-mo-body">Approve appears once these are done: {blockers.join(", ")}.</p>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {writes.map((w) => (
            <button key={w} type="button" className={DOORSTEP_WRITES[w].destructive ? buttonDanger : buttonPrimary} onClick={() => setPending({ write: w })}>
              {DOORSTEP_WRITES[w].label}
            </button>
          ))}
        </div>
      </section>

      <DataTable caption="Skills" rows={detailRows(d, "skills")} columns={skillColumns} rowId={(r) => String(r.skill_code)} emptyMessage="No skills declared." />

      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Service area and hours">
        <h4 className="mb-2 text-sm font-semibold text-mo-ink">Service area and hours</h4>
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
                : "Not in the detail answer yet",
            ],
          ]}
        />
      </section>

      <DataTable caption="Documents" rows={detailRows(d, "documents")} columns={documentColumns} rowId={(r) => String(r.id)} emptyMessage="No documents uploaded." />
      {viewer.element}

      <div className="grid gap-4 lg:grid-cols-2">
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
            { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={reviewTone(r.status)} /> },
            { key: "score", header: "Score", value: (r) => num(r.score), align: "right", cell: (r) => (num(r.score) === null ? "—" : (num(r.score) ?? 0).toFixed(2)) },
            { key: "at", header: "Verified", value: (r) => str(r.verified_at), cell: (r) => when(r.verified_at) },
          ]}
          rowId={(r) => String(r.kind)}
          emptyMessage="No KYC checks yet."
        />
      </div>

      <section className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Payout account">
        <h4 className="mb-2 text-sm font-semibold text-mo-ink">Payout account</h4>
        {payout ? (
          <Details
            items={[
              ["Holder", str(payout.account_holder)],
              ["Account", str(payout.account_last4) ? `•••• ${str(payout.account_last4)}` : null],
              ["IFSC", str(payout.ifsc)],
              ["Status", <StatusPill key="s" value={payout.status} tone={reviewTone(payout.status)} />],
            ]}
          />
        ) : (
          <p className="text-sm text-mo-body">No bank account added. Payouts are off; settlements are computed only.</p>
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
        <p className="text-xs text-mo-body">Status history is not in the detail answer yet; the Audit tab lists every admin decision.</p>
      )}

      <DoorstepActionDialog
        write={pending?.write ?? null}
        subject={pending?.skill ? `“${pending.skill}”` : str(p.display_name)}
        busy={mutation.isPending}
        onConfirm={(reason) => {
          if (!pending) return
          if (pending.write === "skill.verify" || pending.write === "skill.revoke") {
            mutation.mutate({ write: pending.write, target: { id, skill: pending.skill }, body: DECISION_BODIES.skill(pending.write === "skill.verify", reason) })
          } else {
            mutation.mutate({ write: pending.write, target: { id }, body: DOORSTEP_WRITES[pending.write].reason || reason ? DECISION_BODIES.reason(reason) : {} })
          }
        }}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
