"use client"

import { useState } from "react"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, Field, IdText, LookupForm, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonGhost, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { CHAT } from "@/lib/admin/content"
import { humanise, isRecord, isUuid, str, when, type Row } from "@/lib/admin/data"
import { can } from "@/lib/admin/sections"
import { NotEnforcedNote } from "./ContentStats"

export const CHAT_KEY = adminKey("chat")
const LIMIT = 50
const validateUuid = (v: string) => (isUuid(v) ? null : "Enter a full channel id (a UUID).")

export type ChatScope = "channels" | "groups" | "communities"

const SCOPE: Record<ChatScope, { noun: string; idKey: string; nameKey: string | null }> = {
  channels: { noun: "Channel", idKey: "channel_id", nameKey: null },
  groups: { noun: "Group", idKey: "group_id", nameKey: "group_name" },
  communities: { noun: "Community", idKey: "community_id", nameKey: "community_name" },
}

/**
 * One report queue (channel-service, group-service or community-service),
 * newest first, paged by cursor. Upholding or dismissing needs a reason. For
 * a channel report the row also offers Suspend channel (step-up).
 */
export function ChatReportQueue({ scope }: { scope: ChatScope }) {
  const { me } = useAdmin()
  const def = SCOPE[scope]
  const [status, setStatus] = useState("")
  const [cursors, setCursors] = useState<string[]>([])
  const [viewing, setViewing] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<Row | null>(null)
  const [suspending, setSuspending] = useState<Row | null>(null)
  const cursor = cursors.at(-1)
  const base = `${CHAT}/${scope}`
  const list = useAdminList("chat", `${base}/reports?limit=${LIMIT}${status ? `&status=${status}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
  const meta = isRecord(list.raw) && isRecord(list.raw.meta) ? list.raw.meta : null
  const next = meta ? str(meta.next_cursor) : null
  const detail = useAdminObject("chat", `${base}/reports/${encodeURIComponent(viewing ?? "")}`, { enabled: viewing !== null })
  const decide = useAdminMutation<{ id: string; decision: string; reason: string }>({
    request: ({ id, decision, reason }) => ({ method: "post", url: `${base}/reports/${encodeURIComponent(id)}/decision`, body: { decision, reason } }),
    invalidate: [CHAT_KEY],
    successMessage: "Report decided",
    errorTitle: "Report decision failed",
    onDone: () => setDeciding(null),
  })
  const suspend = useAdminMutation<{ channelId: string; reason: string }>({
    request: ({ channelId, reason }) => ({ method: "post", url: `${CHAT}/channels/${encodeURIComponent(channelId)}/suspend`, body: { reason } }),
    invalidate: [CHAT_KEY],
    successMessage: "Channel suspended",
    errorTitle: "Channel suspension failed",
    onDone: () => setSuspending(null),
  })
  const canAct = can(me, "chat", "reports.act")
  const canSuspend = scope === "channels" && can(me, "chat", "channels.moderate")

  const columns: DataColumn<Row>[] = [
    {
      key: "subject",
      header: def.noun,
      value: (r) => str(r[def.idKey]),
      filterable: true,
      cell: (r) => (
        <span>
          {def.nameKey && str(r[def.nameKey]) ? <span className="mr-1">{str(r[def.nameKey])}</span> : null}
          <IdText id={r[def.idKey]} />
        </span>
      ),
    },
    ...(scope === "channels"
      ? [{ key: "update", header: "Update", value: (r: Row) => str(r.update_id), cell: (r: Row) => (str(r.update_id) ? <IdText id={r.update_id} /> : "Whole channel") } satisfies DataColumn<Row>]
      : [{ key: "target", header: "Target", value: (r: Row) => str(r.target_type), cell: (r: Row) => <span>{humanise(r.target_type)} <IdText id={r.target_id} /></span> } satisfies DataColumn<Row>]),
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true, cell: (r) => humanise(r.reason) },
    { key: "details", header: "Details", value: (r) => str(r.details) ?? str(r.description) },
    { key: "reporter", header: "Reporter", value: (r) => str(r.reporter_id), cell: (r) => <IdText id={r.reporter_id} /> },
    { key: "status", header: "Status", value: (r) => str(r.status), cell: (r) => <StatusPill value={r.status} tone={r.status === "open" || r.status === "pending" ? "warn" : "normal"} /> },
    { key: "created", header: "Filed", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => {
        const open = r.status === "open" || r.status === "pending"
        return (
          <span className="inline-flex gap-1">
            <button type="button" className={buttonGhost} onClick={() => setViewing(String(r.id))} aria-label={`View report ${str(r.id)}`}>
              View
            </button>
            {canAct && open ? (
              <button type="button" className={buttonSecondary} onClick={() => setDeciding(r)} aria-label={`Decide report ${str(r.id)}`}>
                Decide
              </button>
            ) : null}
            {canSuspend ? (
              <button type="button" className={buttonDanger} onClick={() => setSuspending(r)} aria-label={`Suspend channel of report ${str(r.id)}`}>
                Suspend channel
              </button>
            ) : null}
          </span>
        )
      },
    },
  ]

  const detailItems = (d: Row): [string, React.ReactNode][] => [
    [def.noun, `${def.nameKey && str(d[def.nameKey]) ? `${str(d[def.nameKey])} · ` : ""}${str(d[def.idKey]) ?? "—"}`],
    ...(scope === "channels" ? ([["Update", str(d.update_id) ?? "Whole channel"]] as [string, React.ReactNode][]) : ([["Target", `${humanise(d.target_type)} ${str(d.target_id) ?? ""}`]] as [string, React.ReactNode][])),
    ["Reason", humanise(d.reason)],
    ["Details", str(d.details) ?? str(d.description) ?? "—"],
    ["Reporter", str(d.reporter_id) ?? "—"],
    ["Status", humanise(d.status)],
    ["Reviewed by", str(d.reviewed_by) ?? "—"],
    ["Review reason", str(d.review_reason) ?? "—"],
    ["Reviewed", when(d.reviewed_at)],
    ["Filed", when(d.created_at)],
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
              <option value="">Open</option>
              <option value="all">All</option>
            </select>
          )}
        </Field>
      </div>
      <DataTable caption={`${def.noun} reports`} rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage={`No ${status === "all" ? "" : "open "}${def.noun.toLowerCase()} reports.`} pageSize={LIMIT} />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className={buttonSecondary} disabled={cursors.length === 0} onClick={() => setCursors((c) => c.slice(0, -1))}>
          Newer
        </button>
        <button type="button" className={buttonSecondary} disabled={!next} onClick={() => next && setCursors((c) => [...c, next])}>
          Older
        </button>
      </div>
      {viewing ? (
        <section aria-label="Report detail" className="mt-4 rounded-mo border border-mo bg-mo-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold text-mo-ink">Report {viewing}</h3>
            <button type="button" className={buttonGhost} onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
          {detail.isLoading ? (
            <p className="text-sm text-mo-body">Loading…</p>
          ) : detail.error ? (
            <p role="alert" className="text-sm text-mo-bad">
              {detail.error}
            </p>
          ) : detail.data ? (
            <Details items={detailItems(isRecord(detail.data.report) ? detail.data.report : detail.data)} />
          ) : null}
        </section>
      ) : null}
      <ChoiceDialog
        open={deciding !== null}
        title={`Decide this ${def.noun.toLowerCase()} report`}
        description={deciding ? `${def.noun} ${str(deciding[def.idKey])}, reported for ${humanise(deciding.reason).toLowerCase()}.` : null}
        choiceLabel="Decision"
        choices={[
          {
            value: "uphold",
            label: "Uphold",
            hint:
              scope === "channels"
                ? "Records that the report was justified. It does not suspend the channel by itself: use Suspend channel for that."
                : `Records that the report was justified. Nothing happens to the ${def.noun.toLowerCase()} yet: the server does not enforce these decisions.`,
          },
          { value: "dismiss", label: "Dismiss", hint: "Closes the report with no finding against the target." },
        ]}
        requireReason
        busy={decide.isPending}
        onConfirm={(decision, reason) => deciding && decide.mutate({ id: String(deciding.id), decision, reason })}
        onClose={() => setDeciding(null)}
      />
      <ConfirmReasonDialog
        open={suspending !== null}
        title="Suspend this channel?"
        description={suspending ? `Channel ${str(suspending.channel_id)}: its updates stop reaching followers until it is unsuspended. Needs a fresh 2FA code.` : null}
        confirmLabel="Suspend"
        destructive
        busy={suspend.isPending}
        onConfirm={(reason) => suspending && suspend.mutate({ channelId: String(suspending.channel_id), reason })}
        onClose={() => setSuspending(null)}
      />
    </>
  )
}

/** Suspend or unsuspend a broadcast channel by id. Both need a fresh 2FA code. */
export function ChannelControls() {
  const [channelId, setChannelId] = useState<string | null>(null)
  const [action, setAction] = useState<"suspend" | "unsuspend" | null>(null)
  const run = useAdminMutation<{ action: "suspend" | "unsuspend"; reason: string }>({
    request: ({ action: a, reason }) => ({ method: "post", url: `${CHAT}/channels/${encodeURIComponent(channelId ?? "")}/${a}`, body: { reason } }),
    invalidate: [CHAT_KEY],
    successMessage: (data) => {
      const body = isRecord(data) && isRecord(data.data) ? data.data : null
      const status = body ? str(body.status) : null
      return status ? `Channel is now ${humanise(status).toLowerCase()}` : "Channel updated"
    },
    errorTitle: "Channel action failed",
    onDone: () => setAction(null),
  })

  return (
    <section className="mt-8">
      <h3 className="mb-2 text-sm font-semibold text-mo-ink">Suspend or unsuspend a channel</h3>
      <LookupForm label="Channel id" placeholder="00000000-0000-0000-0000-000000000000" button="Select channel" validate={validateUuid} onSubmit={setChannelId} />
      {channelId ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-4">
          <p className="mb-3 text-sm text-mo-ink">
            Channel <span className="font-mo-mono">{channelId}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonDanger} onClick={() => setAction("suspend")}>
              Suspend
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setAction("unsuspend")}>
              Unsuspend
            </button>
          </div>
        </div>
      ) : null}
      <ConfirmReasonDialog
        open={action !== null}
        title={action === "suspend" ? "Suspend this channel?" : "Unsuspend this channel?"}
        description={
          action === "suspend"
            ? "Its updates stop reaching followers until it is unsuspended. Needs a fresh 2FA code."
            : "Its updates reach followers again. Needs a fresh 2FA code."
        }
        confirmLabel={action === "suspend" ? "Suspend" : "Unsuspend"}
        destructive={action === "suspend"}
        requireReason
        busy={run.isPending}
        onConfirm={(reason) => action && run.mutate({ action, reason })}
        onClose={() => setAction(null)}
      />
    </section>
  )
}

/** Channels: the report queue, then the suspend controls for a channels.moderate holder. */
export function ChatChannels() {
  const { me } = useAdmin()
  const readsReports = can(me, "chat", "reports.read") || can(me, "chat", "reports.act")
  return (
    <>
      {readsReports ? <ChatReportQueue scope="channels" /> : <p className="text-sm text-mo-body">Listing channel reports needs the reports read permission.</p>}
      {can(me, "chat", "channels.moderate") ? <ChannelControls /> : null}
    </>
  )
}

/** Group and community report queues. Decisions are recorded but the server enforces nothing yet. */
export function ChatGroupReports({ scope }: { scope: "groups" | "communities" }) {
  return (
    <>
      <NotEnforcedNote>
        Decisions on {scope === "groups" ? "group" : "community"} reports are recorded with your reason but enforce nothing yet: upholding one does not hide, lock or
        suspend anything. Nothing in the apps files these reports yet either, so this queue may stay empty.
      </NotEnforcedNote>
      <ChatReportQueue scope={scope} />
    </>
  )
}
