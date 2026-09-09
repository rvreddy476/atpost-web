"use client"

/**
 * Alternate videos — the founder's "alternate videos kind of things".
 *
 * Up to three in-video cards, each a target, a title and a moment. This is the
 * loose, unordered half of linked video; the ordered half is ./SequenceSection.
 *
 * ── The timestamp is a field AND a picture ────────────────────────────────
 * Typed as "1:30" rather than as 90000 (`parseClock`), and drawn on ./Timeline
 * as the twelve-second window it really is. The field is the control and the
 * strip is the check — two cards eight seconds apart look fine as two numbers
 * and are one card cut in half on the picture.
 *
 * ── The timestamp field keeps its own text ───────────────────────────────
 * `atMs` is the truth and the string beside it is what somebody is halfway
 * through typing. They are separate state because they must be: deriving the
 * field's value from `atMs` means typing "1:" reformats to "0:01" under the
 * cursor, and deleting the last character of "1:30" jumps the card to the
 * start of the video. The parse is committed only when it succeeds; an
 * unparseable string leaves `atMs` alone and says so.
 */

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { CARD_VISIBLE_MS, chapterClock } from "@/watch/timeline"
import { MAX_ALTERNATES, MAX_CARD_TEASER, MAX_CARD_TITLE, parseClock, type AlternateDraft } from "./model"
import { Timeline, type TimelineMark } from "./Timeline"
import { VideoPicker } from "./VideoPicker"
import { Action, Notice, Section, TextField } from "./ui"
import type { LibraryVideo } from "./useLinkEditor"
import type { UpNextWindow } from "./upnext"

export interface AlternatesSectionProps {
  drafts: readonly AlternateDraft[]
  problems: Map<string, string>
  library: readonly LibraryVideo[]
  libraryTruncated: boolean
  subjectId: string
  durationMs: number
  upNextWindow: UpNextWindow | null
  passthroughCount: number
  dirty: boolean
  onAdd: () => void
  onUpdate: (key: string, patch: Partial<AlternateDraft>) => void
  onRemove: (key: string) => void
}

export function AlternatesSection({
  drafts,
  problems,
  library,
  libraryTruncated,
  subjectId,
  durationMs,
  upNextWindow,
  passthroughCount,
  dirty,
  onAdd,
  onUpdate,
  onRemove,
}: AlternatesSectionProps) {
  const marks: TimelineMark[] = drafts.map((d) => ({
    key: d.key,
    atMs: d.atMs,
    label: d.title || "Alternate",
    problem: problems.has(d.key),
  }))

  return (
    <Section
      id="alternates"
      title="Alternate videos"
      intro={`Up to ${MAX_ALTERNATES} of your other videos, offered part-way through this one. Each appears for ${Math.round(
        CARD_VISIBLE_MS / 1000
      )} seconds at the moment you choose, and a viewer can dismiss it.`}
      aside={<DirtyMark dirty={dirty} />}
    >
      {drafts.length === 0 && (
        <p className="text-[13px] text-mo-body">
          None yet. Nothing is drawn over the video.
        </p>
      )}

      <ul className="space-y-4">
        {drafts.map((draft, index) => (
          <AlternateRow
            key={draft.key}
            draft={draft}
            index={index}
            problem={problems.get(draft.key) ?? null}
            library={library}
            libraryTruncated={libraryTruncated}
            exclude={[subjectId, ...drafts.filter((d) => d.key !== draft.key).map((d) => d.targetId)]}
            durationMs={durationMs}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))}
      </ul>

      {durationMs > 0 ? (
        <Timeline durationMs={durationMs} marks={marks} upNext={upNextWindow} />
      ) : (
        drafts.length > 0 && (
          <div className="mt-3">
            <Notice>
              This video has no length recorded yet — its media is still being
              processed, or none is attached — so there is no timeline to draw
              against and no check that a moment is inside the video.
            </Notice>
          </div>
        )
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Action onClick={onAdd} disabled={drafts.length >= MAX_ALTERNATES}>
          <span className="flex items-center gap-1.5">
            <Plus aria-hidden className="h-4 w-4" />
            Add an alternate
          </span>
        </Action>
        <span className="text-[12px] text-mo-body">
          {drafts.length} of {MAX_ALTERNATES}
        </span>
      </div>

      {passthroughCount > 0 && (
        <div className="mt-3">
          <Notice tone="warn">
            This video also carries {passthroughCount} card{passthroughCount === 1 ? "" : "s"} of a
            kind this screen has no control for — a poll, a playlist or an
            external link. They are kept exactly as they are when you save.
          </Notice>
        </div>
      )}
    </Section>
  )
}

function DirtyMark({ dirty }: { dirty: boolean }) {
  if (!dirty) return null
  return (
    <span className="rounded-mo-pill bg-mo-warn/20 px-2 py-0.5 text-[11px] font-semibold text-mo-warn">
      Unsaved
    </span>
  )
}

function AlternateRow({
  draft,
  index,
  problem,
  library,
  libraryTruncated,
  exclude,
  durationMs,
  onUpdate,
  onRemove,
}: {
  draft: AlternateDraft
  index: number
  problem: string | null
  library: readonly LibraryVideo[]
  libraryTruncated: boolean
  exclude: readonly string[]
  durationMs: number
  onUpdate: (key: string, patch: Partial<AlternateDraft>) => void
  onRemove: (key: string) => void
}) {
  // See the file header: the field's text and the committed value are separate
  // state on purpose.
  const [clock, setClock] = useState(() => chapterClock(draft.atMs))
  const [clockBad, setClockBad] = useState(false)

  const commitClock = (text: string) => {
    setClock(text)
    const parsed = parseClock(text)
    if (parsed === null) {
      setClockBad(text.trim().length > 0)
      return
    }
    setClockBad(false)
    onUpdate(draft.key, { atMs: parsed })
  }

  return (
    <li className="rounded-mo border border-mo bg-mo-sunken p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-mo-eyebrow text-mo-body">
          Alternate {index + 1}
        </h3>
        <button
          type="button"
          onClick={() => onRemove(draft.key)}
          aria-label={`Remove alternate ${index + 1}`}
          className="rounded-mo p-1 text-mo-body transition-colors duration-150 ease-mo hover:text-mo-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span
            id={`alt-${draft.key}-target-label`}
            className="block text-[12px] font-semibold text-mo-body"
          >
            Links to
          </span>
          <div className="mt-1">
            <VideoPicker
              label={`Video for alternate ${index + 1}`}
              videos={library}
              value={draft.targetId}
              truncated={libraryTruncated}
              exclude={exclude}
              onChange={(video) =>
                onUpdate(draft.key, {
                  targetId: video.id,
                  targetTitle: video.title,
                  // A blank title is filled in from the video's own. The server
                  // takes a card with no title at all and stores "", which the
                  // watch page draws as an empty box — so a sensible default
                  // beats an empty required field.
                  title: draft.title.trim() || video.title,
                })
              }
              onClear={() => onUpdate(draft.key, { targetId: "", targetTitle: "" })}
            />
          </div>
        </div>

        <TextField
          id={`alt-${draft.key}-at`}
          label="Appears at"
          value={clock}
          onChange={commitClock}
          placeholder="1:30"
          inputMode="numeric"
          problem={clockBad ? "Type a time like 1:30, or 0:45." : null}
          hint={
            durationMs > 0
              ? `Anywhere up to ${chapterClock(durationMs)}.`
              : "Minutes and seconds."
          }
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField
          id={`alt-${draft.key}-title`}
          label="Title a viewer sees"
          value={draft.title}
          onChange={(next) => onUpdate(draft.key, { title: next })}
          maxLength={MAX_CARD_TITLE}
          placeholder="Watch this next"
          problem={problem}
        />
        <TextField
          id={`alt-${draft.key}-teaser`}
          label="Teaser (optional)"
          value={draft.teaser}
          onChange={(next) => onUpdate(draft.key, { teaser: next })}
          maxLength={MAX_CARD_TEASER}
          placeholder="A second line, if it helps"
        />
      </div>
    </li>
  )
}
