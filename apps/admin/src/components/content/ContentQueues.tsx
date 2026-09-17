"use client"

import { useState } from "react"
import { ChoiceDialog, type Choice } from "@/components/blocks/ChoiceDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, LookupForm, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonGhost, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import {
  CONTENT_KINDS,
  SOCIAL,
  TUBE,
  commentStatusRequirement,
  contentDecisionRequirement,
  contentPath,
  contentReviewStatusRequirement,
  contentVisibilityRequirement,
  requirementNote,
  type CommentStatus,
  type ContentApp,
  type ContentDecisionAction,
  type ContentKind,
  type ContentReviewStatus,
} from "@/lib/admin/content"
import { humanise, isRecord, isUuid, num, readList, str, when, type Row } from "@/lib/admin/data"
import { newIdempotencyKey } from "@/lib/admin/mutation"
import { can } from "@/lib/admin/sections"

export const SOCIAL_KEY = adminKey("social")
export const TUBE_KEY = adminKey("tube")
const LIMIT = 50

const appKey = (app: ContentApp) => (app === "social" ? SOCIAL_KEY : TUBE_KEY)
const appBase = (app: ContentApp) => (app === "social" ? SOCIAL : TUBE)

const clip = (value: unknown, n = 120) => {
  const s = str(value)
  return s ? (s.length > n ? `${s.slice(0, n)}…` : s) : "—"
}

// ---------------------------------------------------------------------------
// Decisions on a post, reel or video
// ---------------------------------------------------------------------------

const DECISION_LABEL: Record<ContentDecisionAction, string> = { approve: "Approve", reject: "Reject (takedown)", needs_changes: "Needs changes" }
const DECISION_EXPLAIN: Record<ContentDecisionAction, string> = {
  approve: "Marks it approved; it stays (or becomes) visible.",
  reject: "Rejects it: it is taken down and hidden from every reader.",
  needs_changes: "Sends it back to the author for changes; it is not shown meanwhile.",
}

/** POST <kind>/:id/moderation {decision_id, action, reason}. A fresh decision id per action, so a retry after step-up never applies twice. */
export function useContentDecision(kind: ContentKind, onDone: () => void) {
  return useAdminMutation<{ id: string; action: ContentDecisionAction; reason: string; reportId?: string }>({
    request: ({ id, action, reason, reportId }) => ({
      method: "post",
      url: contentPath(kind, `/${encodeURIComponent(id)}/moderation`),
      body: { decision_id: newIdempotencyKey(), action, reason, ...(reportId ? { report_id: reportId } : {}) },
    }),
    invalidate: [appKey(CONTENT_KINDS[kind].app)],
    successMessage: `${CONTENT_KINDS[kind].label} decided`,
    errorTitle: `${CONTENT_KINDS[kind].label} decision failed`,
    onDone,
  })
}

/** The decision dialog. Choices the admin may not make are not offered; reject says it is a takedown. */
export function ContentDecisionDialog({
  kind,
  target,
  busy,
  onConfirm,
  onClose,
}: {
  kind: ContentKind
  target: Row | null
  busy: boolean
  onConfirm: (action: ContentDecisionAction, reason: string) => void
  onClose: () => void
}) {
  const { me } = useAdmin()
  const def = CONTENT_KINDS[kind]
  const choices: Choice[] = (["approve", "needs_changes", "reject"] as const)
    .filter((action) => can(me, def.app, contentDecisionRequirement(kind, action).permission))
    .map((action) => {
      const req = contentDecisionRequirement(kind, action)
      return { value: action, label: DECISION_LABEL[action], hint: `${DECISION_EXPLAIN[action]} ${requirementNote(req)}`, destructive: req.takedown }
    })
  return (
    <ChoiceDialog
      open={target !== null}
      title={`Decide this ${def.label.toLowerCase()}`}
      description={target ? `${def.label} ${str(target.id) ?? str(target.reel_id) ?? ""} by ${str(target.author_id) ?? "unknown author"}.` : null}
      choiceLabel="Decision"
      choices={choices}
      requireReason
      busy={busy}
      onConfirm={(choice, reason) => onConfirm(choice as ContentDecisionAction, reason)}
      onClose={onClose}
    />
  )
}

/** A post's moderation history: decisions and review-status audit. */
function ContentHistory({ kind, id, onClose }: { kind: ContentKind; id: string; onClose: () => void }) {
  const history = useAdminObject(CONTENT_KINDS[kind].app, contentPath(kind, `/${encodeURIComponent(id)}/moderation-history`))
  const decisions = history.data ? readList({ items: history.data.decisions }) : []
  const audit = history.data ? readList({ items: history.data.review_audit }) : []
  return (
    <section aria-label="Moderation history" className="mt-4 space-y-3 rounded-mo border border-mo bg-mo-surface p-4">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold text-mo-ink">
          History of {CONTENT_KINDS[kind].label.toLowerCase()} {id}
        </h3>
        <button type="button" className={buttonGhost} onClick={onClose}>
          Close
        </button>
      </div>
      {history.isLoading ? (
        <p className="text-sm text-mo-body">Loading…</p>
      ) : history.error ? (
        <p role="alert" className="text-sm text-mo-bad">
          {history.error}
        </p>
      ) : history.data ? (
        <>
          <Details items={[["Review status", humanise(history.data.review_status)], ["Deleted", history.data.deleted === true ? "Yes" : "No"]]} />
          <DataTable
            caption="Decisions"
            rows={decisions}
            columns={[
              { key: "when", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
              { key: "action", header: "Action", value: (r) => str(r.action), cell: (r) => humanise(r.action) },
              { key: "status", header: "Status", value: (r) => str(r.resulting_status), cell: (r) => `${humanise(r.previous_status)} → ${humanise(r.resulting_status)}${r.changed === false ? " (no change)" : ""}` },
              { key: "actor", header: "By", value: (r) => str(r.actor_id), cell: (r) => <IdText id={r.actor_id} /> },
              { key: "source", header: "Source", value: (r) => str(r.source), cell: (r) => humanise(r.source) },
              { key: "reason", header: "Reason", value: (r) => str(r.reason) },
            ]}
            rowId={(r) => String(r.decision_id ?? r.created_at)}
            emptyMessage="No decisions recorded."
          />
          <DataTable
            caption="Review audit"
            rows={audit}
            columns={[
              { key: "when", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
              { key: "field", header: "Field", value: (r) => str(r.field), cell: (r) => humanise(r.field) },
              { key: "change", header: "Change", value: (r) => str(r.new_value), cell: (r) => `${humanise(r.previous_value)} → ${humanise(r.new_value)}` },
              { key: "actor", header: "By", value: (r) => str(r.actor_user_id) ?? str(r.actor_service), cell: (r) => (str(r.actor_user_id) ? <IdText id={r.actor_user_id} /> : (str(r.actor_service) ?? humanise(r.actor_type))) },
              { key: "reason", header: "Reason", value: (r) => str(r.reason) },
            ]}
            rowId={(r) => String(r.id)}
            emptyMessage="No review changes recorded."
          />
        </>
      ) : null}
    </section>
  )
}

/**
 * The flagged or staged queue of one kind. Flagged rows take a decision or a
 * review status (rejected is a takedown); staged rows can be made public.
 */
export function ContentReviewQueue({ kind }: { kind: ContentKind }) {
  const { me } = useAdmin()
  const def = CONTENT_KINDS[kind]
  const [queue, setQueue] = useState<"flagged" | "staged">("flagged")
  const [cursors, setCursors] = useState<string[]>([])
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [reviewing, setReviewing] = useState<Row | null>(null)
  const [promoting, setPromoting] = useState<Row | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const cursor = cursors.at(-1)
  const list = useAdminList(def.app, contentPath(kind, `/review-queue?queue=${queue}&limit=${LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`))
  const meta = isRecord(list.raw) && isRecord(list.raw.meta) ? list.raw.meta : null
  const next = meta ? str(meta.next_cursor) : null
  const key = appKey(def.app)

  const decide = useContentDecision(kind, () => setDeciding(null))
  const review = useAdminMutation<{ id: string; status: ContentReviewStatus; reason: string }>({
    request: ({ id, status, reason }) => ({ method: "post", url: contentPath(kind, "/review-status"), body: { post_id: id, status, reason } }),
    invalidate: [key],
    successMessage: "Review status set",
    errorTitle: "Review status failed",
    onDone: () => setReviewing(null),
  })
  const promote = useAdminMutation<{ id: string; reason: string }>({
    request: ({ id, reason }) => ({ method: "post", url: contentPath(kind, "/visibility"), body: { post_id: id, visibility: "public", reason } }),
    invalidate: [key],
    successMessage: `${def.label} made public`,
    errorTitle: "Visibility change failed",
    onDone: () => setPromoting(null),
  })
  const moderate = can(me, def.app, def.moderate)
  const remove = can(me, def.app, def.remove)

  const reviewChoices: Choice[] = (["approved", "rejected"] as const)
    .filter((status) => can(me, def.app, contentReviewStatusRequirement(kind, status).permission))
    .map((status) => {
      const req = contentReviewStatusRequirement(kind, status)
      return {
        value: status,
        label: status === "rejected" ? "Rejected (takedown)" : "Approved",
        hint: `${status === "rejected" ? "It is taken down and hidden from every reader." : "The flag is cleared and it stays visible."} ${requirementNote(req)}`,
        destructive: req.takedown,
      }
    })

  const columns: DataColumn<Row>[] = [
    { key: "id", header: def.label, value: (r) => str(r.id), cell: (r) => <IdText id={r.id} /> },
    { key: "author", header: "Author", value: (r) => str(r.author_id), filterable: true, cell: (r) => <IdText id={r.author_id} /> },
    { key: "text", header: "Text", value: (r) => str(r.text), filterable: true, cell: (r) => clip(r.text) },
    { key: "visibility", header: "Visibility", value: (r) => str(r.visibility), cell: (r) => humanise(r.visibility) },
    { key: "review", header: "Review", value: (r) => str(r.review_status), cell: (r) => <StatusPill value={r.review_status} tone={r.review_status === "flagged" ? "warn" : "normal"} /> },
    { key: "created", header: "Created", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex flex-wrap justify-end gap-1">
          <button type="button" className={buttonGhost} onClick={() => setHistory(String(r.id))} aria-label={`History of ${def.label.toLowerCase()} ${str(r.id)}`}>
            History
          </button>
          {moderate || remove ? (
            <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide ${def.label.toLowerCase()} ${str(r.id)}`}>
              Decide
            </button>
          ) : null}
          {queue === "flagged" && reviewChoices.length > 0 ? (
            <button type="button" className={buttonSecondary} onClick={() => setReviewing(r)} aria-label={`Set review status of ${def.label.toLowerCase()} ${str(r.id)}`}>
              Review status
            </button>
          ) : null}
          {queue === "staged" && can(me, def.app, contentVisibilityRequirement(kind).permission) ? (
            <button type="button" className={buttonSecondary} onClick={() => setPromoting(r)} aria-label={`Make ${def.label.toLowerCase()} ${str(r.id)} public`}>
              Make public
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Queue">
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={queue}
              onChange={(e) => {
                setQueue(e.target.value as "flagged" | "staged")
                setCursors([])
              }}
            >
              <option value="flagged">Flagged for review</option>
              <option value="staged">Staged, awaiting visibility</option>
            </select>
          )}
        </Field>
      </div>
      <DataTable caption={`${def.plural} ${queue}`} rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage={`No ${queue} ${def.plural.toLowerCase()}.`} pageSize={LIMIT} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={buttonSecondary} disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Newer
        </button>
        <button type="button" className={buttonSecondary} disabled={!next} onClick={() => next && setCursors((c) => [...c, next])}>
          Older
        </button>
      </div>
      {history ? <ContentHistory kind={kind} id={history} onClose={() => setHistory(null)} /> : null}
      <ContentDecisionDialog kind={kind} target={deciding} busy={decide.isPending} onConfirm={(action, reason) => deciding && decide.mutate({ id: String(deciding.id), action, reason })} onClose={() => setDeciding(null)} />
      <ChoiceDialog
        open={reviewing !== null}
        title={`Set the review status of this ${def.label.toLowerCase()}`}
        description={reviewing ? `${def.label} ${str(reviewing.id)} by ${str(reviewing.author_id)}.` : null}
        choiceLabel="Review status"
        choices={reviewChoices}
        requireReason
        busy={review.isPending}
        onConfirm={(status, reason) => reviewing && review.mutate({ id: String(reviewing.id), status: status as ContentReviewStatus, reason })}
        onClose={() => setReviewing(null)}
      />
      <ChoiceDialog
        open={promoting !== null}
        title={`Make this ${def.label.toLowerCase()} public`}
        description={promoting ? `${def.label} ${str(promoting.id)} leaves staging and becomes visible to everyone. ${requirementNote(contentVisibilityRequirement(kind))}` : null}
        choiceLabel="Visibility"
        choices={[{ value: "public", label: "Public" }]}
        busy={promote.isPending}
        onConfirm={(_visibility, reason) => promoting && promote.mutate({ id: String(promoting.id), reason })}
        onClose={() => setPromoting(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Reels: the moderation_reviews queue
// ---------------------------------------------------------------------------

/** Reel reviews flagged by the automated or human reviewers, with each reel's review history. Decisions go through the reel routes. */
export function FlaggedReels() {
  const [offset, setOffset] = useState(0)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [reviewsOf, setReviewsOf] = useState<string | null>(null)
  const limit = 20
  const list = useAdminList("social", `${SOCIAL}/reels/flagged?limit=${limit}&offset=${offset}`)
  const reviews = useAdminList("social", `${SOCIAL}/reels/${encodeURIComponent(reviewsOf ?? "")}/reviews`, { enabled: reviewsOf !== null })
  const decide = useContentDecision("reel", () => setDeciding(null))
  const { me } = useAdmin()
  const mayDecide = can(me, "social", "reels.moderate") || can(me, "social", "reels.remove")

  const reviewColumns: DataColumn<Row>[] = [
    { key: "reel", header: "Reel", value: (r) => str(r.reel_id), filterable: true, cell: (r) => <IdText id={r.reel_id} /> },
    { key: "reviewer", header: "Reviewer", value: (r) => str(r.reviewer_type), cell: (r) => humanise(r.reviewer_type) },
    { key: "decision", header: "Decision", value: (r) => str(r.decision), cell: (r) => <StatusPill value={r.decision} tone={r.decision === "flagged" || r.decision === "reject" ? "warn" : "normal"} /> },
    { key: "policy", header: "Policy", value: (r) => str(r.policy_violated), cell: (r) => humanise(r.policy_violated) },
    { key: "confidence", header: "Confidence", value: (r) => num(r.confidence), align: "right", cell: (r) => (num(r.confidence) === null ? "—" : `${Math.round((num(r.confidence) ?? 0) * 100)}%`) },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), cell: (r) => clip(r.reason, 80) },
    { key: "created", header: "When", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]
  const columns: DataColumn<Row>[] = [
    ...reviewColumns,
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={buttonGhost} onClick={() => setReviewsOf(String(r.reel_id))} aria-label={`Reviews of reel ${str(r.reel_id)}`}>
            Reviews
          </button>
          {mayDecide ? (
            <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide reel ${str(r.reel_id)}`}>
              Decide
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <section className="mt-8">
      <h3 className="mb-2 text-sm font-semibold text-mo-ink">Flagged reel reviews</h3>
      <DataTable caption="Flagged reel reviews" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No flagged reel reviews." pageSize={limit} />
      <OffsetPager offset={offset} limit={limit} count={list.data.length} onChange={setOffset} />
      {reviewsOf ? (
        <section aria-label="Reel reviews" className="mt-4 rounded-mo border border-mo bg-mo-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="flex-1 text-sm font-semibold text-mo-ink">Reviews of reel {reviewsOf}</h4>
            <button type="button" className={buttonGhost} onClick={() => setReviewsOf(null)}>
              Close
            </button>
          </div>
          <DataTable caption="Reel reviews" rows={reviews.data} columns={reviewColumns} rowId={(r) => String(r.id)} loading={reviews.isLoading} error={reviews.error} onRetry={reviews.refetch} emptyMessage="No reviews recorded." />
        </section>
      ) : null}
      <ContentDecisionDialog kind="reel" target={deciding} busy={decide.isPending} onConfirm={(action, reason) => deciding && decide.mutate({ id: String(deciding.reel_id), action, reason })} onClose={() => setDeciding(null)} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Content reports (Social: posts, reels, comments; Tube: videos)
// ---------------------------------------------------------------------------

/** Reports on content, by status, with a review decision and note. */
export function ContentReports({ app }: { app: ContentApp }) {
  const [status, setStatus] = useState("pending")
  const [targetType, setTargetType] = useState("")
  const [offset, setOffset] = useState(0)
  const [reviewing, setReviewing] = useState<Row | null>(null)
  const base = appBase(app)
  const list = useAdminList(app, `${base}/reports?limit=${LIMIT}&offset=${offset}${status ? `&status=${status}` : ""}${targetType ? `&target_type=${targetType}` : ""}`)
  const review = useAdminMutation<{ id: string; status: string; note: string }>({
    request: ({ id, status: s, note }) => ({ method: "patch", url: `${base}/reports/${encodeURIComponent(id)}`, body: { status: s, review_note: note } }),
    invalidate: [appKey(app)],
    successMessage: "Report reviewed",
    errorTitle: "Report review failed",
    onDone: () => setReviewing(null),
  })

  const columns: DataColumn<Row>[] = [
    { key: "target", header: "Target", value: (r) => str(r.target_type), filterable: true, cell: (r) => <span>{humanise(r.target_type)} <IdText id={r.target_id} /></span> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true, cell: (r) => humanise(r.reason) },
    { key: "description", header: "Description", value: (r) => str(r.description), cell: (r) => clip(r.description, 80) },
    { key: "reporter", header: "Reporter", value: (r) => str(r.reporter_id), cell: (r) => <IdText id={r.reporter_id} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "pending" ? "warn" : "normal"} /> },
    { key: "note", header: "Review note", value: (r) => str(r.review_note), cell: (r) => clip(r.review_note, 60) },
    { key: "created", header: "Filed", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) =>
        r.status === "pending" || r.status === "reviewed" ? (
          <button type="button" className={buttonSecondary} onClick={() => setReviewing(r)} aria-label={`Review report ${str(r.id)}`}>
            Review
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="w-48">
          <Field label="Status">
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setOffset(0)
                }}
              >
                <option value="">All</option>
                {["pending", "reviewed", "resolved", "dismissed"].map((s) => (
                  <option key={s} value={s}>
                    {humanise(s)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {app === "social" ? (
          <div className="w-48">
            <Field label="Target">
              {(id) => (
                <select
                  id={id}
                  className={inputClass}
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value)
                    setOffset(0)
                  }}
                >
                  <option value="">Posts, reels and comments</option>
                  <option value="post">Posts</option>
                  <option value="reel">Reels</option>
                  <option value="comment">Comments</option>
                </select>
              )}
            </Field>
          </div>
        ) : null}
      </div>
      <DataTable caption="Content reports" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No reports." pageSize={LIMIT} />
      <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
      <ChoiceDialog
        open={reviewing !== null}
        title="Review this report"
        description={reviewing ? `${humanise(reviewing.target_type)} ${str(reviewing.target_id)}, reported for ${humanise(reviewing.reason).toLowerCase()}. Reviewing a report does not act on the content: decide the ${app === "tube" ? "video" : "post, reel or comment"} from its own queue.` : null}
        choiceLabel="Outcome"
        choices={[
          { value: "reviewed", label: "Reviewed", hint: "Seen; kept open for a later decision." },
          { value: "resolved", label: "Resolved", hint: "Closed as acted on." },
          { value: "dismissed", label: "Dismissed", hint: "Closed with no finding." },
        ]}
        reasonLabel="Review note"
        requireReason
        busy={review.isPending}
        onConfirm={(s, note) => reviewing && review.mutate({ id: String(reviewing.id), status: s, note })}
        onClose={() => setReviewing(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const COMMENT_LABEL: Record<CommentStatus, string> = { visible: "Visible", review: "Keep in review", hidden: "Hidden (takedown)", removed: "Removed (takedown)" }
const COMMENT_EXPLAIN: Record<CommentStatus, string> = {
  visible: "Clears the flag; the comment shows to everyone.",
  review: "Keeps it out of sight while it is looked at.",
  hidden: "Hides it from every reader; it can be made visible again.",
  removed: "Removes it for good.",
}

/** Flagged comments, their audit trail, and a moderation status (hidden or removed is a takedown). */
export function CommentsQueue() {
  const { me } = useAdmin()
  const [status, setStatus] = useState("")
  const [cursors, setCursors] = useState<string[]>([])
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [auditOf, setAuditOf] = useState<string | null>(null)
  const cursor = cursors.at(-1)
  const list = useAdminList("social", `${SOCIAL}/comments/moderation?limit=${LIMIT}${status ? `&status=${status}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
  const meta = isRecord(list.raw) && isRecord(list.raw.meta) ? list.raw.meta : null
  const next = meta ? str(meta.next_cursor) : null
  const audit = useAdminList("social", `${SOCIAL}/comments/${encodeURIComponent(auditOf ?? "")}/audit`, { enabled: auditOf !== null })
  const decide = useAdminMutation<{ id: string; status: CommentStatus; reason: string }>({
    request: ({ id, status: s, reason }) => ({ method: "patch", url: `${SOCIAL}/comments/${encodeURIComponent(id)}/moderation`, body: { status: s, reason } }),
    invalidate: [SOCIAL_KEY],
    successMessage: "Comment moderated",
    errorTitle: "Comment moderation failed",
    onDone: () => setDeciding(null),
  })
  const choices: Choice[] = (["visible", "review", "hidden", "removed"] as const)
    .filter((s) => can(me, "social", commentStatusRequirement(s).permission))
    .map((s) => {
      const req = commentStatusRequirement(s)
      return { value: s, label: COMMENT_LABEL[s], hint: `${COMMENT_EXPLAIN[s]} ${requirementNote(req)}`, destructive: req.takedown }
    })

  const columns: DataColumn<Row>[] = [
    { key: "body", header: "Comment", value: (r) => str(r.body), filterable: true, cell: (r) => clip(r.body) },
    { key: "author", header: "Author", value: (r) => str(r.author_id), filterable: true, cell: (r) => <IdText id={r.author_id} /> },
    { key: "post", header: "On post", value: (r) => str(r.post_id), cell: (r) => <IdText id={r.post_id} /> },
    { key: "status", header: "Status", value: (r) => str(r.moderation_status), cell: (r) => <StatusPill value={r.moderation_status} tone={r.moderation_status === "review" ? "warn" : "normal"} /> },
    { key: "flags", header: "Flags", value: (r) => num(r.flagged_count), sortable: true, align: "right" },
    { key: "created", header: "Posted", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1">
          <button type="button" className={buttonGhost} onClick={() => setAuditOf(String(r.id))} aria-label={`Audit of comment ${str(r.id)}`}>
            Audit
          </button>
          {choices.length > 0 ? (
            <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Moderate comment ${str(r.id)}`}>
              Moderate
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="mb-3 w-56">
        <Field label="Status">
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setCursors([])
              }}
            >
              <option value="">Flagged</option>
              {["review", "hidden", "visible", "removed"].map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <DataTable caption="Comments for moderation" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="No comments waiting." pageSize={LIMIT} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={buttonSecondary} disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Newer
        </button>
        <button type="button" className={buttonSecondary} disabled={!next} onClick={() => next && setCursors((c) => [...c, next])}>
          Older
        </button>
      </div>
      {auditOf ? (
        <section aria-label="Comment audit" className="mt-4 rounded-mo border border-mo bg-mo-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold text-mo-ink">Audit of comment {auditOf}</h3>
            <button type="button" className={buttonGhost} onClick={() => setAuditOf(null)}>
              Close
            </button>
          </div>
          <DataTable
            caption="Comment audit"
            rows={audit.data}
            columns={[
              { key: "when", header: "When", value: (r) => str(r.created_at), cell: (r) => when(r.created_at) },
              { key: "action", header: "Action", value: (r) => str(r.action), cell: (r) => humanise(r.action) },
              { key: "change", header: "Change", value: (r) => str(r.new_value), cell: (r) => `${humanise(r.previous_value)} → ${humanise(r.new_value)}` },
              { key: "actor", header: "By", value: (r) => str(r.actor_user_id), cell: (r) => <IdText id={r.actor_user_id} /> },
              { key: "note", header: "Note", value: (r) => str(r.note) },
            ]}
            rowId={(r) => String(r.id)}
            loading={audit.isLoading}
            error={audit.error}
            onRetry={audit.refetch}
            emptyMessage="No audit rows for this comment."
          />
        </section>
      ) : null}
      <ChoiceDialog
        open={deciding !== null}
        title="Moderate this comment"
        description={deciding ? `"${clip(deciding.body, 140)}" by ${str(deciding.author_id)}.` : null}
        choiceLabel="Status"
        choices={choices}
        requireReason
        busy={decide.isPending}
        onConfirm={(s, reason) => deciding && decide.mutate({ id: String(deciding.id), status: s as CommentStatus, reason })}
        onClose={() => setDeciding(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------

/** A creator's content counts by user id. */
export function CreatorCounts() {
  const [userId, setUserId] = useState<string | null>(null)
  const counts = useAdminObject("social", `${SOCIAL}/creators/${encodeURIComponent(userId ?? "")}/counts`, { enabled: userId !== null })
  const items: [string, React.ReactNode][] = counts.data
    ? Object.entries(counts.data)
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => [humanise(k), (v as number).toLocaleString("en-IN")])
    : []
  return (
    <section>
      <LookupForm label="Creator user id" placeholder="00000000-0000-0000-0000-000000000000" button="Look up" validate={(v) => (isUuid(v) ? null : "Enter a full user id (a UUID).")} onSubmit={setUserId} />
      {userId ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <p className="mb-3 text-sm text-mo-ink">
            Creator <span className="font-mo-mono">{userId}</span>
          </p>
          {counts.isLoading ? (
            <p className="text-sm text-mo-body">Loading…</p>
          ) : counts.error ? (
            <p role="alert" className="text-sm text-mo-bad">
              {counts.error}
            </p>
          ) : items.length > 0 ? (
            <Details items={items} />
          ) : (
            <p className="text-sm text-mo-body">No counts returned.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
