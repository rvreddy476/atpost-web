"use client"

import { useState } from "react"
import { Info } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Details, IdText, LookupForm, OffsetPager } from "@/components/blocks/bits"
import { buttonGhost } from "@/components/blocks/buttons"
import { useAdminList, useAdminObject } from "@/hooks/useAdminQuery"
import { TUBE } from "@/lib/admin/content"
import { bool, isUuid, num, str, when, type Row } from "@/lib/admin/data"

const LIMIT = 50

/** Channels by handle or name, and one channel's detail. Read-only: no channel moderation exists on the server yet. */
export function TubeChannels() {
  const [query, setQuery] = useState<string | null>(null)
  const [ref, setRef] = useState<string | null>(null)
  const results = useAdminList("tube", `${TUBE}/channels/search?q=${encodeURIComponent(query ?? "")}&limit=${LIMIT}`, { enabled: query !== null })
  const detail = useAdminObject("tube", `${TUBE}/channels/${encodeURIComponent(ref ?? "")}`, { enabled: ref !== null })

  const columns: DataColumn<Row>[] = [
    { key: "name", header: "Channel", value: (r) => str(r.name), sortable: true },
    { key: "handle", header: "Handle", value: (r) => str(r.handle), filterable: true, cell: (r) => <span className="font-mo-mono text-xs">@{str(r.handle) ?? "—"}</span> },
    { key: "owner", header: "Owner", value: (r) => str(r.user_id), cell: (r) => <IdText id={r.user_id} /> },
    { key: "videos", header: "Videos", value: (r) => num(r.video_count), sortable: true, align: "right" },
    { key: "subs", header: "Subscribers", value: (r) => num(r.subscriber_count), sortable: true, align: "right" },
    { key: "created", header: "Created", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (r) => (
        <button type="button" className={buttonGhost} onClick={() => setRef(str(r.handle) ?? String(r.id))} aria-label={`Open channel ${str(r.handle) ?? str(r.id)}`}>
          Detail
        </button>
      ),
    },
  ]

  return (
    <section>
      <p role="note" className="mb-4 flex items-start gap-2 rounded-mo border border-mo bg-mo-surface p-3 text-sm text-mo-ink">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-mo-body" aria-hidden="true" />
        <span>Channels are read-only here: channel moderation (suspend, hide) does not exist on the server yet. Act on a channel&apos;s videos from the Videos tab.</span>
      </p>
      <LookupForm label="Search channels" placeholder="Handle or name" button="Search" onSubmit={setQuery} />
      {query !== null ? (
        <DataTable caption="Channels" rows={results.data} columns={columns} rowId={(r) => String(r.id)} loading={results.isLoading} error={results.error} onRetry={results.refetch} emptyMessage="No channels match." pageSize={LIMIT} />
      ) : null}
      {ref ? (
        <section aria-label="Channel detail" className="mt-4 rounded-mo border border-mo bg-mo-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold text-mo-ink">Channel {ref}</h3>
            <button type="button" className={buttonGhost} onClick={() => setRef(null)}>
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
            <Details
              items={[
                ["Name", str(detail.data.name) ?? "—"],
                ["Handle", str(detail.data.handle) ? `@${str(detail.data.handle)}` : "—"],
                ["Owner", str(detail.data.user_id) ?? "—"],
                ["About", str(detail.data.about) ?? "—"],
                ["Videos", num(detail.data.video_count)?.toLocaleString("en-IN") ?? "—"],
                ["Subscribers", num(detail.data.subscriber_count)?.toLocaleString("en-IN") ?? "—"],
                ["Created", when(detail.data.created_at)],
                ["Updated", when(detail.data.updated_at)],
              ]}
            />
          ) : null}
        </section>
      ) : null}
    </section>
  )
}

/** A creator's video series, private ones included. */
export function CreatorSeries() {
  const [userId, setUserId] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const list = useAdminList("tube", `${TUBE}/creators/${encodeURIComponent(userId ?? "")}/series?limit=${LIMIT}&offset=${offset}`, { enabled: userId !== null })

  const columns: DataColumn<Row>[] = [
    { key: "title", header: "Series", value: (r) => str(r.title), sortable: true, filterable: true },
    { key: "episodes", header: "Episodes", value: (r) => num(r.episode_count), sortable: true, align: "right" },
    { key: "public", header: "Visibility", value: (r) => (bool(r.is_public) ? "public" : "private"), cell: (r) => (bool(r.is_public) ? "Public" : "Private") },
    { key: "complete", header: "Complete", value: (r) => (bool(r.is_complete) ? "yes" : "no"), cell: (r) => (bool(r.is_complete) ? "Yes" : "Ongoing") },
    { key: "channel", header: "Channel", value: (r) => str(r.channel_id), cell: (r) => (str(r.channel_id) ? <IdText id={r.channel_id} /> : "—") },
    { key: "created", header: "Created", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]

  return (
    <section>
      <LookupForm
        label="Creator user id"
        placeholder="00000000-0000-0000-0000-000000000000"
        button="List series"
        validate={(v) => (isUuid(v) ? null : "Enter a full user id (a UUID).")}
        onSubmit={(v) => {
          setUserId(v)
          setOffset(0)
        }}
      />
      {userId ? (
        <>
          <DataTable caption="Video series" rows={list.data} columns={columns} rowId={(r) => String(r.id)} loading={list.isLoading} error={list.error} onRetry={list.refetch} emptyMessage="This creator has no series." pageSize={LIMIT} />
          <OffsetPager offset={offset} limit={LIMIT} count={list.data.length} onChange={setOffset} />
        </>
      ) : null}
    </section>
  )
}
