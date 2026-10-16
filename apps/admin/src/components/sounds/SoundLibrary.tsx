"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Music, Plus, Search } from "lucide-react"
import { DataTable } from "@/components/blocks/DataTable"
import { PageHeader } from "@/components/blocks/PageHeader"
import { ErrorNote, Field } from "@/components/blocks/bits"
import { buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdminList } from "@/hooks/useAdminQuery"
import { type Row } from "@/lib/admin/data"
import { STATUS_FILTERS, SOUNDS_APP, readSoundPage, soundListUrl, type SoundAbilities, type SoundStatusFilter } from "@/lib/admin/sounds"
import { AddSoundDialog } from "./AddSoundDialog"
import { soundColumns } from "./SoundBits"
import { SoundDrawer } from "./SoundDrawer"

interface Filters {
  status: SoundStatusFilter
  q: string
  genre: string
}

const NO_FILTERS: Filters = { status: "all", q: "", genre: "" }

/**
 * The sound library page: the list (newest first, cursor-paged by the
 * server), its filters, the detail drawer and — for a holder of
 * media:sounds.manage — Add sound.
 */
export function SoundLibrary({ can }: { can: SoundAbilities }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  // cursors[i] opens page i; page 0 has none.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [open, setOpen] = useState<Row | null>(null)
  const [adding, setAdding] = useState(false)

  const page = cursors.length - 1
  const url = soundListUrl({ ...filters, cursor: cursors[page] })
  const list = useAdminList(SOUNDS_APP, url)
  const { rows, nextCursor } = useMemo(() => readSoundPage(list.raw), [list.raw])
  const columns = useMemo(() => soundColumns(setOpen), [])

  const apply = (next: Filters) => {
    setFilters(next)
    setDraft(next)
    setCursors([null])
  }
  const filtered = filters.status !== "all" || filters.q.trim() !== "" || filters.genre.trim() !== ""
  const empty = !list.isLoading && !list.isError && rows.length === 0 && page === 0

  return (
    <div>
      <PageHeader
        eyebrow="Content"
        title="Sound library"
        description="Licensed and original sounds creators can add to their posts. New sounds start as drafts and reach creators only once enabled."
        actions={
          can.manage ? (
            <button type="button" className={buttonPrimary} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add sound
            </button>
          ) : null
        }
      />

      <form
        role="search"
        aria-label="Filter sounds"
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          apply(draft)
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <Field label="Search">
            {(id) => <input id={id} type="search" className={inputClass} placeholder="Title or artist" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />}
          </Field>
        </div>
        <div className="w-44">
          <Field label="Genre">
            {(id) => <input id={id} className={inputClass} placeholder="Any genre" value={draft.genre} onChange={(e) => setDraft({ ...draft, genre: e.target.value })} />}
          </Field>
        </div>
        <div className="w-52">
          <Field label="Status">
            {(id) => (
              <select id={id} className={inputClass} value={draft.status} onChange={(e) => apply({ ...draft, status: e.target.value as SoundStatusFilter })}>
                {STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <button type="submit" className={buttonSecondary}>
          <Search className="h-4 w-4" aria-hidden="true" /> Apply
        </button>
        {filtered ? (
          <button type="button" className={buttonGhost} onClick={() => apply(NO_FILTERS)}>
            Clear filters
          </button>
        ) : null}
      </form>

      {list.isError ? (
        <ErrorNote message={list.error ?? "The sound library could not be loaded."} onRetry={list.refetch} />
      ) : empty && !filtered ? (
        <div className="rounded-mo border border-dashed border-mo-strong bg-mo-surface p-8 text-center">
          <Music className="mx-auto mb-3 h-8 w-8 text-mo-body" aria-hidden="true" />
          <p className="font-semibold text-mo-ink">{can.manage ? "No sounds yet — add the first one" : "No sounds yet"}</p>
          <p className="mt-1 text-sm text-mo-body">{can.manage ? "Upload an audio file and record its licence; it stays a draft until you enable it." : "Sounds appear here once an admin adds them."}</p>
          {can.manage ? (
            <button type="button" className={`${buttonPrimary} mt-4`} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add sound
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <DataTable
            caption="Sound library"
            rows={rows}
            columns={columns}
            rowId={(r) => String(r.id)}
            loading={list.isLoading}
            emptyMessage="No sounds match these filters."
            pageSize={100}
            onRowClick={setOpen}
          />
          {page > 0 || nextCursor ? (
            <nav aria-label="Sound library pages" className="mt-2 flex items-center justify-end gap-2 text-sm text-mo-body">
              <span>Page {page + 1}</span>
              <button type="button" className={buttonSecondary} disabled={page === 0 || list.isLoading} onClick={() => setCursors((c) => c.slice(0, -1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Newer
              </button>
              <button
                type="button"
                className={buttonSecondary}
                disabled={!nextCursor || list.isLoading}
                onClick={() => nextCursor && setCursors((c) => [...c, nextCursor])}
              >
                Older <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </>
      )}

      <SoundDrawer id={open ? String(open.id) : null} initial={open} can={can} onClose={() => setOpen(null)} />
      {can.manage ? (
        <AddSoundDialog
          open={adding}
          onClose={() => setAdding(false)}
          onCreated={(sound) => {
            apply(NO_FILTERS)
            if (sound) setOpen(sound)
          }}
        />
      ) : null}
    </div>
  )
}
