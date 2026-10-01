"use client"

import { useState } from "react"
import { Ban, CircleStop, Gavel, RefreshCw, Undo2 } from "lucide-react"
import { ChoiceDialog } from "@/components/blocks/ChoiceDialog"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { IdText, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonSecondary } from "@/components/blocks/buttons"
import { TextField } from "@/components/blocks/formFields"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { str, when, type Row } from "@/lib/admin/data"
import {
  BAN_LIST_KEYS,
  LIVE_BANS,
  LIVE_REFRESH_MS,
  LIVE_REPORTS,
  LIVE_STREAMS,
  activeStreams,
  banUser,
  banUserIdProblem,
  liveAbilities,
  liveRequest,
  liveStatusLabel,
  liveStatusTone,
  reportMessage,
  reportReasonLabel,
  reportReporter,
  reportStream,
  resolveChoices,
  sortBans,
  sortReports,
  streamHost,
  streamStartedAt,
  viewerCount,
  type LiveAbilities,
  type LiveWrite,
  type ResolveAction,
} from "@/lib/admin/live"
import { stepUpWindowOpen } from "@/lib/admin/stepUp"

const LIVE_KEY = adminKey("live")

function Person({ person }: { person: { name: string | null; id: string | null } }) {
  return (
    <span className="flex flex-col">
      {person.name ? <span className="font-semibold">{person.name}</span> : null}
      <IdText id={person.id} />
    </span>
  )
}

function SectionHeading({ id, title, note }: { id: string; title: string; note?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="font-mo-display text-lg font-semibold text-mo-ink">
        {title}
      </h2>
      {note ? <p className="text-sm text-mo-body">{note}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live now
// ---------------------------------------------------------------------------

/** The "live now" table. The Stop button exists only for a holder of live:streams.stop. */
export function liveStreamColumns(can: Pick<LiveAbilities, "stop">, onStop: (row: Row) => void): DataColumn<Row>[] {
  const columns: DataColumn<Row>[] = [
    { key: "title", header: "Stream", value: (r) => str(r.title), sortable: true, filterable: true, cell: (r) => <span className="font-semibold">{str(r.title) ?? "Untitled"}</span> },
    { key: "status", header: "Status", value: (r) => liveStatusLabel(r.status), sortable: true, cell: (r) => <StatusPill value={liveStatusLabel(r.status)} tone={liveStatusTone(r.status)} /> },
    { key: "host", header: "Host", value: (r) => streamHost(r).name ?? streamHost(r).id, filterable: true, cell: (r) => <Person person={streamHost(r)} /> },
    { key: "viewers", header: "Viewers", value: (r) => viewerCount(r), sortable: true, align: "right", cell: (r) => (viewerCount(r) ?? 0).toLocaleString("en-IN") },
    { key: "started", header: "Started", value: (r) => streamStartedAt(r), sortable: true, cell: (r) => when(streamStartedAt(r)) },
  ]
  if (can.stop) {
    columns.push({
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonDanger} onClick={() => onStop(r)} aria-label={`Stop ${str(r.title) ?? "stream"}`}>
          <CircleStop className="h-4 w-4" aria-hidden="true" /> Stop
        </button>
      ),
    })
  }
  return columns
}

/** Streams starting, live or reconnecting, re-read every 15 seconds. */
export function LiveNow() {
  const { me } = useAdmin()
  const can = liveAbilities(me)
  const list = useAdminList("live", LIVE_STREAMS, { keys: ["streams", "items", "rows"], refetchInterval: LIVE_REFRESH_MS })
  const [stopping, setStopping] = useState<Row | null>(null)

  const write = useAdminMutation<LiveWrite>({
    request: liveRequest,
    invalidate: [LIVE_KEY],
    successMessage: "Stream stopped",
    errorTitle: "The stream was not stopped",
    stepUpFirst: () => stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
    onDone: () => setStopping(null),
  })

  return (
    <section aria-labelledby="live-now" className="mb-10">
      <SectionHeading
        id="live-now"
        title="Live now"
        note={
          <span className="inline-flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Starting, live and reconnecting streams. Refreshes every 15 seconds.
          </span>
        }
      />
      <DataTable
        caption="Live now"
        rows={activeStreams(list.data)}
        columns={liveStreamColumns(can, setStopping)}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="Nobody is live right now."
        pageSize={50}
      />
      <ConfirmReasonDialog
        open={stopping !== null}
        title={`Stop ${str(stopping?.title) ?? "this stream"}?`}
        description="Ends it at once for the host and every viewer; the host sees that an admin stopped it. Needs a fresh 2FA code."
        confirmLabel="Stop stream"
        destructive
        busy={write.isPending}
        onConfirm={(reason) => stopping && write.mutate({ kind: "stop", streamId: String(stopping.id), reason })}
        onClose={() => setStopping(null)}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** The open reports table. The Resolve button exists only for a holder of live:reports.act. */
export function liveReportColumns(can: Pick<LiveAbilities, "resolve">, onResolve: (row: Row) => void): DataColumn<Row>[] {
  const columns: DataColumn<Row>[] = [
    {
      key: "reason",
      header: "Reason",
      value: (r) => reportReasonLabel(r.reason),
      sortable: true,
      filterable: true,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold">{reportReasonLabel(r.reason)}</span>
          {str(r.note) ? <span className="text-xs text-mo-body">{str(r.note)}</span> : null}
        </span>
      ),
    },
    { key: "reporter", header: "Reporter", value: (r) => reportReporter(r).name ?? reportReporter(r).id, filterable: true, cell: (r) => <Person person={reportReporter(r)} /> },
    {
      key: "message",
      header: "Message",
      value: (r) => reportMessage(r).text,
      filterable: true,
      cell: (r) => {
        const message = reportMessage(r)
        if (message.text) return <q className="block max-w-xs break-words text-sm">{message.text}</q>
        return <span className="text-xs text-mo-body">{message.id ? "Message no longer available" : "The stream itself"}</span>
      },
    },
    {
      key: "stream",
      header: "Stream",
      value: (r) => reportStream(r).title ?? reportStream(r).id,
      filterable: true,
      cell: (r) => <Person person={{ name: reportStream(r).title, id: reportStream(r).id }} />,
    },
    { key: "reported", header: "Reported", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]
  if (can.resolve) {
    columns.push({
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => onResolve(r)} aria-label={`Resolve ${reportReasonLabel(r.reason)} report`}>
          <Gavel className="h-4 w-4" aria-hidden="true" /> Resolve
        </button>
      ),
    })
  }
  return columns
}

/** Open viewer reports, A to Z by reason, oldest first within one. */
export function LiveReports() {
  const { me } = useAdmin()
  const can = liveAbilities(me)
  const list = useAdminList("live", LIVE_REPORTS, { keys: ["reports", "items", "rows"] })
  const [resolving, setResolving] = useState<Row | null>(null)

  const write = useAdminMutation<LiveWrite>({
    request: liveRequest,
    invalidate: [LIVE_KEY],
    successMessage: "Report resolved",
    errorTitle: "The report was not resolved",
    stepUpFirst: () => stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
    onDone: () => setResolving(null),
  })

  return (
    <section aria-labelledby="live-reports" className="mb-10">
      <SectionHeading id="live-reports" title="Open reports" note="Reports viewers made on streams and their chat messages." />
      <DataTable
        caption="Open live reports"
        rows={sortReports(list.data)}
        columns={liveReportColumns(can, setResolving)}
        rowId={(r) => String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="No open reports."
        pageSize={50}
      />
      <ChoiceDialog
        open={resolving !== null}
        title={`Resolve this ${resolving ? reportReasonLabel(resolving.reason).toLowerCase() : ""} report`}
        description="The outcome and your reason go into live-service's audit trail. Needs a fresh 2FA code."
        choiceLabel="Outcome"
        choices={resolving ? resolveChoices(can, resolving) : []}
        confirmLabel="Resolve"
        requireReason
        busy={write.isPending}
        onConfirm={(action, reason) => resolving && write.mutate({ kind: "resolve", reportId: String(resolving.id), action: action as ResolveAction, reason })}
        onClose={() => setResolving(null)}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Live bans
// ---------------------------------------------------------------------------

/** The live bans table. The Unban button exists only for a holder of live:users.ban. */
export function liveBanColumns(can: Pick<LiveAbilities, "ban">, onUnban: (row: Row) => void): DataColumn<Row>[] {
  const columns: DataColumn<Row>[] = [
    { key: "user", header: "User", value: (r) => banUser(r).name ?? banUser(r).id, sortable: true, filterable: true, cell: (r) => <Person person={banUser(r)} /> },
    { key: "reason", header: "Reason", value: (r) => str(r.reason), filterable: true, cell: (r) => <span className="block max-w-sm break-words text-sm">{str(r.reason) ?? "—"}</span> },
    { key: "by", header: "Banned by", value: (r) => str(r.banned_by) ?? str(r.actor_user_id), cell: (r) => <IdText id={str(r.banned_by) ?? str(r.actor_user_id)} /> },
    { key: "since", header: "Since", value: (r) => str(r.created_at) ?? str(r.banned_at), sortable: true, cell: (r) => when(str(r.created_at) ?? str(r.banned_at)) },
  ]
  if (can.ban) {
    columns.push({
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonSecondary} onClick={() => onUnban(r)} aria-label={`Unban ${banUser(r).name ?? banUser(r).id ?? "user"}`}>
          <Undo2 className="h-4 w-4" aria-hidden="true" /> Unban
        </button>
      ),
    })
  }
  return columns
}

/** Platform-wide live bans: who may not go live or chat on any stream. */
export function LiveBans() {
  const { me } = useAdmin()
  const can = liveAbilities(me)
  const list = useAdminList("live", LIVE_BANS, { keys: [...BAN_LIST_KEYS], enabled: can.ban })
  const [banning, setBanning] = useState(false)
  const [userId, setUserId] = useState("")
  const [unbanning, setUnbanning] = useState<Row | null>(null)

  const write = useAdminMutation<LiveWrite>({
    request: liveRequest,
    invalidate: [LIVE_KEY],
    successMessage: "Live ban updated",
    errorTitle: "The live ban was not changed",
    stepUpFirst: () => stepUpWindowOpen(me.stepUpValidUntil, Date.now()),
    onDone: (_data, w) => {
      if (w.kind === "ban") {
        setBanning(false)
        setUserId("")
      }
      if (w.kind === "unban") setUnbanning(null)
    },
  })

  if (!can.ban) return null
  const idProblem = banUserIdProblem(userId)

  return (
    <section aria-labelledby="live-bans">
      <SectionHeading id="live-bans" title="Live bans" note="A banned person cannot go live or chat on any stream." />
      <div className="mb-3">
        <button
          type="button"
          className={buttonDanger}
          onClick={() => {
            setUserId("")
            setBanning(true)
          }}
        >
          <Ban className="h-4 w-4" aria-hidden="true" /> Ban a user
        </button>
      </div>
      <DataTable
        caption="Live bans"
        rows={sortBans(list.data)}
        columns={liveBanColumns(can, setUnbanning)}
        rowId={(r) => banUser(r).id ?? String(r.id)}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        emptyMessage="Nobody is banned from live."
        pageSize={50}
      />
      <ConfirmReasonDialog
        open={banning}
        title="Ban a user from live"
        description="They can no longer go live or chat on any stream. To end a stream of theirs that is on air now, use Stop in Live now. Needs a fresh 2FA code."
        confirmLabel="Ban from live"
        destructive
        canConfirm={idProblem === null}
        busy={write.isPending}
        onConfirm={(reason) => idProblem === null && write.mutate({ kind: "ban", userId: userId.trim(), reason })}
        onClose={() => setBanning(false)}
      >
        <TextField
          label="User id"
          value={userId}
          onChange={setUserId}
          placeholder="00000000-0000-0000-0000-000000000000"
          hint={userId.trim() && idProblem ? idProblem : "The person's full user id."}
        />
      </ConfirmReasonDialog>
      <ConfirmReasonDialog
        open={unbanning !== null}
        title={`Unban ${unbanning ? (banUser(unbanning).name ?? banUser(unbanning).id ?? "this user") : "this user"}?`}
        description="They may go live and chat again (going live still needs the pilot list). Needs a fresh 2FA code."
        confirmLabel="Unban"
        requireReason
        busy={write.isPending}
        onConfirm={(reason) => {
          const id = unbanning ? banUser(unbanning).id : null
          if (id) write.mutate({ kind: "unban", userId: id, reason })
        }}
        onClose={() => setUnbanning(null)}
      />
    </section>
  )
}
