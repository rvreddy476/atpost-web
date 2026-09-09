"use client"

/**
 * The sequence — the founder's "one to three sequence of videos".
 *
 * A video series: pick or make one, then arrange up to three episodes. This is
 * the ordered half of linked video, and the only mechanism on this platform
 * that has an order at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO THINGS ON THIS PANEL ARE NOT DESIGN CHOICES, THEY ARE THE SERVER
 *
 * 1. CREATING A SERIES WRITES IMMEDIATELY, AND IS PERMANENT. Everything else
 *    on this screen is held until Save. A series cannot be, because episodes
 *    are addressed by its id and there is nothing to put them in until it
 *    exists. And there is no `DELETE /v1/video-series/{id}` — verified, the
 *    route group has four routes and none of them removes anything — so an
 *    empty series made by mistake stays for ever. The panel says both, before
 *    the button.
 *
 * 2. AN EPISODE CANNOT BE REMOVED, ONLY REPLACED. Same absence. So the remove
 *    control appears only on a trailing slot the server has not seen yet
 *    (`canRemoveSlot`), and an arrangement that would abandon a saved episode
 *    number is refused with the number named rather than warned about and
 *    saved anyway. ./sequence.ts has the whole argument and the route table it
 *    rests on.
 *
 * Reordering, on the other hand, is completely safe and is the thing this
 * panel is for: `episodeWrites` recomputes every slot's number from its
 * POSITION, and episode numbers start at 1 — `episode_num: 0` is rejected by
 * the handler as a MISSING field, which is the least helpful error on the
 * endpoint and the reason no index is ever written straight to the wire.
 */

import { useState } from "react"
import { ArrowDown, ArrowUp, ListVideo, Plus, Trash2 } from "lucide-react"
import type { SeriesEpisode, VideoSeries } from "@/watch/api"
import {
  MAX_EPISODES,
  canRemoveSlot,
  episodeNumAt,
  moveSlot,
  type EpisodeSlot,
} from "./sequence"
import { VideoPicker } from "./VideoPicker"
import { Action, Notice, Section, TextField } from "./ui"
import type { LibraryVideo } from "./useLinkEditor"

export interface SequenceSectionProps {
  seriesList: readonly VideoSeries[]
  seriesId: string | null
  savedEpisodes: readonly SeriesEpisode[]
  slots: readonly EpisodeSlot[]
  problems: Map<string, string>
  stranded: readonly number[]
  library: readonly LibraryVideo[]
  libraryTruncated: boolean
  subjectId: string
  dirty: boolean
  onChooseSeries: (seriesId: string | null) => void
  onCreateSeries: (title: string, description: string) => void
  onSetSlots: (next: EpisodeSlot[]) => void
  onAddSlot: (postId: string, title: string) => void
}

export function SequenceSection({
  seriesList,
  seriesId,
  savedEpisodes,
  slots,
  problems,
  stranded,
  library,
  libraryTruncated,
  subjectId,
  dirty,
  onChooseSeries,
  onCreateSeries,
  onSetSlots,
  onAddSlot,
}: SequenceSectionProps) {
  const [making, setMaking] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")

  const subjectInSequence = slots.some((s) => s.postId === subjectId)

  return (
    <Section
      id="sequence"
      title="Sequence"
      intro={`Put this video in order with up to ${MAX_EPISODES - 1} others. A viewer who reaches the end of one episode is offered the next.`}
      aside={dirty ? <UnsavedPill /> : null}
    >
      {/* ── Which series ─────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="sequence-series" className="block text-[12px] font-semibold text-mo-body">
            Series
          </label>
          <select
            id="sequence-series"
            value={seriesId ?? ""}
            onChange={(e) => onChooseSeries(e.target.value || null)}
            className="mt-1 w-full rounded-mo border border-mo bg-mo-surface px-3 py-2 text-[14px] text-mo-ink outline-none transition-colors duration-150 ease-mo hover:border-mo-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
          >
            <option value="">Not in a series</option>
            {seriesList.map((series) => (
              <option key={series.id} value={series.id}>
                {series.title}
                {typeof series.episode_count === "number"
                  ? ` — ${series.episode_count} episode${series.episode_count === 1 ? "" : "s"}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
        <Action onClick={() => setMaking((was) => !was)}>
          {making ? "Cancel" : "New series"}
        </Action>
      </div>

      {making && (
        <div className="mt-3 rounded-mo border border-mo bg-mo-sunken p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id="new-series-title"
              label="Series title"
              value={newTitle}
              onChange={setNewTitle}
              placeholder="How I built it"
            />
            <TextField
              id="new-series-description"
              label="Description (optional)"
              value={newDescription}
              onChange={setNewDescription}
              placeholder="What the series is about"
            />
          </div>
          <div className="mt-3">
            <Notice tone="warn">
              This one button saves straight away, unlike everything else here —
              episodes have to belong to a series that already exists. There is
              no way to delete a series afterwards, so an empty one made by
              mistake stays. It is invisible to viewers until it has episodes.
            </Notice>
          </div>
          <div className="mt-3">
            <Action
              variant="primary"
              disabled={!newTitle.trim()}
              onClick={() => {
                onCreateSeries(newTitle.trim(), newDescription.trim())
                setMaking(false)
                setNewTitle("")
                setNewDescription("")
              }}
            >
              Create it
            </Action>
          </div>
        </div>
      )}

      {/* ── The episodes ─────────────────────────────────────────────────── */}
      {!seriesId ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-mo-body">
          <ListVideo aria-hidden className="h-4 w-4" />
          Choose a series above, or make one, and the episodes appear here.
        </p>
      ) : (
        <>
          <ol className="mt-4 space-y-3">
            {slots.map((slot, index) => {
              const removable = canRemoveSlot(savedEpisodes.length, index, slots.length)
              return (
                <li key={slot.key} className="rounded-mo border border-mo bg-mo-sunken p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-mo-eyebrow text-mo-body">
                      Episode {episodeNumAt(index)}
                      {slot.postId === subjectId && (
                        <span className="ml-2 rounded-mo-pill bg-mo-cyan/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-mo-cyan">
                          this video
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-1">
                      <MoveButton
                        direction="up"
                        disabled={index === 0}
                        onClick={() => onSetSlots(moveSlot(slots, index, index - 1))}
                        label={`Move episode ${episodeNumAt(index)} earlier`}
                      />
                      <MoveButton
                        direction="down"
                        disabled={index === slots.length - 1}
                        onClick={() => onSetSlots(moveSlot(slots, index, index + 1))}
                        label={`Move episode ${episodeNumAt(index)} later`}
                      />
                      <button
                        type="button"
                        disabled={!removable}
                        onClick={() => onSetSlots(slots.filter((s) => s.key !== slot.key))}
                        aria-label={
                          removable
                            ? `Remove episode ${episodeNumAt(index)}`
                            : `Episode ${episodeNumAt(index)} cannot be removed`
                        }
                        title={
                          removable
                            ? undefined
                            : "An episode cannot be removed once it is saved — this platform has no route for it. You can put a different video in its place."
                        }
                        className="rounded-mo p-1 text-mo-body transition-colors duration-150 ease-mo hover:text-mo-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-mo-body"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="block text-[12px] font-semibold text-mo-body">Video</span>
                      <div className="mt-1">
                        <VideoPicker
                          label={`Video for episode ${episodeNumAt(index)}`}
                          videos={library}
                          value={slot.postId}
                          truncated={libraryTruncated}
                          exclude={slots.filter((s) => s.key !== slot.key).map((s) => s.postId)}
                          onChange={(video) =>
                            onSetSlots(
                              slots.map((s) =>
                                s.key === slot.key
                                  ? { ...s, postId: video.id, videoTitle: video.title }
                                  : s
                              )
                            )
                          }
                        />
                      </div>
                      {problems.has(slot.key) && (
                        <p className="mt-1 text-[12px] text-mo-bad">{problems.get(slot.key)}</p>
                      )}
                    </div>
                    <TextField
                      id={`ep-${slot.key}-title`}
                      label="Episode title (optional)"
                      value={slot.title}
                      onChange={(next) =>
                        onSetSlots(
                          slots.map((s) => (s.key === slot.key ? { ...s, title: next } : s))
                        )
                      }
                      maxLength={120}
                      placeholder={slot.videoTitle || "Uses the video's own title"}
                    />
                  </div>
                </li>
              )
            })}
          </ol>

          {slots.length === 0 && (
            <p className="mt-4 text-[13px] text-mo-body">
              This series has no episodes yet.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AddEpisode
              disabled={slots.length >= MAX_EPISODES}
              library={library}
              libraryTruncated={libraryTruncated}
              exclude={slots.map((s) => s.postId)}
              onAdd={onAddSlot}
            />
            <span className="text-[12px] text-mo-body">
              {slots.length} of {MAX_EPISODES}
            </span>
          </div>

          {stranded.length > 0 && (
            <div className="mt-3">
              <Notice tone="bad">
                Saving would leave episode {stranded.join(", ")} behind, and this
                platform has no way to remove an episode from a series — the
                server has no delete route for one. Put a video back in that
                slot, or replace it with a different one.
              </Notice>
            </div>
          )}

          {!subjectInSequence && slots.length > 0 && (
            <div className="mt-3">
              <Notice>
                This video is not one of the episodes above, so it will not be
                part of the sequence.
              </Notice>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

function UnsavedPill() {
  return (
    <span className="rounded-mo-pill bg-mo-warn/20 px-2 py-0.5 text-[11px] font-semibold text-mo-warn">
      Unsaved
    </span>
  )
}

function MoveButton({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: "up" | "down"
  disabled: boolean
  onClick: () => void
  label: string
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="rounded-mo p-1 text-mo-body transition-colors duration-150 ease-mo hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  )
}

/**
 * Adding an episode is a pick, not an empty row.
 *
 * An empty slot would immediately be an invalid one, and — because the tail
 * slot is the only removable one — a creator who opened it by accident would
 * be able to close it again but only from the end. Choosing the video first
 * means every slot that exists is a complete one.
 */
function AddEpisode({
  disabled,
  library,
  libraryTruncated,
  exclude,
  onAdd,
}: {
  disabled: boolean
  library: readonly LibraryVideo[]
  libraryTruncated: boolean
  exclude: readonly string[]
  onAdd: (postId: string, title: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (disabled) {
    return (
      <Action disabled>
        <span className="flex items-center gap-1.5">
          <Plus aria-hidden className="h-4 w-4" />
          Add an episode
        </span>
      </Action>
    )
  }
  if (!open) {
    return (
      <Action onClick={() => setOpen(true)}>
        <span className="flex items-center gap-1.5">
          <Plus aria-hidden className="h-4 w-4" />
          Add an episode
        </span>
      </Action>
    )
  }
  return (
    <div className="w-full max-w-sm">
      <VideoPicker
        label="Video for the next episode"
        videos={library}
        value=""
        truncated={libraryTruncated}
        exclude={exclude}
        placeholder="Which video?"
        onChange={(video) => {
          onAdd(video.id, video.title)
          setOpen(false)
        }}
      />
    </div>
  )
}
