"use client"

/**
 * The sequence — the founder's "one to three sequence of videos".
 *
 * A video series: pick or make one, then arrange up to three episodes. This is
 * the ordered half of linked video, and the only mechanism on this platform
 * that has an order at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO THINGS ON THIS PANEL WRITE STRAIGHT AWAY, AND THE PANEL SAYS SO
 *
 * Everything else on this screen is held until Save. These two are not:
 *
 * 1. CREATING A SERIES. Episodes are addressed by the series' id and there is
 *    nothing to put them in until it exists. This editor does not delete a
 *    series afterwards (the server has the route; nothing in ./api.ts calls
 *    it), so an empty one made by mistake stays. Said before the button.
 *
 * 2. REMOVING AN EPISODE. The save path is a list of upserts and an upsert
 *    cannot say "nothing here any more"; `DELETE …/episodes/{ref}` can, and
 *    it is sent when the creator confirms. Every slot has a Remove control,
 *    saved or not; a saved one asks first, inline, because the click is the
 *    write. What the panel then shows follows the server's rule: THE OTHER
 *    EPISODES KEEP THEIR NUMBERS. Remove episode 2 of three and the list
 *    reads "Episode 1, Episode 3", with one sentence saying why there is no
 *    2. ./sequence.ts has the whole argument.
 *
 * Reordering is the thing this panel is for and is safe: `episodeWrites`
 * recomputes every slot's number from its POSITION (`episodeNumbers`), and
 * episode numbers start at 1 — `episode_num: 0` is rejected by the handler as
 * a MISSING field, which is the least helpful error on the endpoint and the
 * reason no index is ever written straight to the wire.
 */

import { useState } from "react"
import { ArrowDown, ArrowUp, ListVideo, Plus, Trash2 } from "lucide-react"
import type { SeriesEpisode, VideoSeries } from "@/watch/api"
import {
  MAX_EPISODES,
  episodeGaps,
  episodeNumbers,
  episodeRemoval,
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
  /** Writes immediately for a saved episode. See the header. */
  onRemoveSlot: (key: string) => void
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
  onRemoveSlot,
}: SequenceSectionProps) {
  const [making, setMaking] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  // The one slot whose Remove is awaiting a yes. Local to the panel: it is
  // not draft state, and a re-render from elsewhere should not lose it.
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)

  const subjectInSequence = slots.some((s) => s.postId === subjectId)
  const numbers = episodeNumbers(savedEpisodes, slots.length)
  const gaps = episodeGaps(savedEpisodes)

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
              This button saves straight away, like Remove on an episode and
              unlike everything else here: episodes have to belong to a series
              that already exists. This editor does not delete a series
              afterwards, so an empty one made by mistake stays. It is invisible
              to viewers until it has episodes.
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
              const num = numbers[index]!
              // A slot the server holds a row for asks before it goes; one
              // added this session is a local edit and just goes.
              const onServer = episodeRemoval(savedEpisodes, slots, index)?.ref !== null
              const confirming = confirmingKey === slot.key
              return (
                <li key={slot.key} className="rounded-mo border border-mo bg-mo-sunken p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-mo-eyebrow text-mo-body">
                      Episode {num}
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
                        label={`Move episode ${num} earlier`}
                      />
                      <MoveButton
                        direction="down"
                        disabled={index === slots.length - 1}
                        onClick={() => onSetSlots(moveSlot(slots, index, index + 1))}
                        label={`Move episode ${num} later`}
                      />
                      <button
                        type="button"
                        aria-label={`Remove episode ${num}`}
                        aria-expanded={onServer ? confirming : undefined}
                        aria-controls={onServer ? `ep-${slot.key}-confirm` : undefined}
                        onClick={() => {
                          if (onServer) setConfirmingKey(confirming ? null : slot.key)
                          else onRemoveSlot(slot.key)
                        }}
                        className="rounded-mo p-1 text-mo-body transition-colors duration-150 ease-mo hover:text-mo-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {confirming && onServer && (
                    <RemoveConfirm
                      id={`ep-${slot.key}-confirm`}
                      episodeNum={num}
                      onConfirm={() => {
                        setConfirmingKey(null)
                        onRemoveSlot(slot.key)
                      }}
                      onCancel={() => setConfirmingKey(null)}
                    />
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="block text-[12px] font-semibold text-mo-body">Video</span>
                      <div className="mt-1">
                        <VideoPicker
                          label={`Video for episode ${num}`}
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

          {gaps.length > 0 && (
            <div className="mt-3">
              <Notice>
                There is no episode {gaps.join(", ")}. A removed episode leaves its
                number empty rather than moving the others down, and a viewer at the end of
                one episode is offered the next one that exists.
              </Notice>
            </div>
          )}

          {stranded.length > 0 && (
            <div className="mt-3">
              <Notice tone="bad">
                Episode {stranded.join(", ")} is on the server but not in this list, so it
                cannot be saved as it stands. Discard to reload the series, then remove the
                episode if you do not want it.
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
 * The inline yes-or-no under a saved episode's Remove.
 *
 * Inline and not a modal, because the row it is about is right there and the
 * sentence is short. `role="alertdialog"` so a screen reader lands on the
 * question rather than on the first button; the buttons say what they do in
 * full ("Remove it", "Keep it") because "OK" under a destructive question is
 * the wording that gets pressed by reflex. The destructive one is drawn in
 * `mo-bad` and not in the ember primary, which this screen reserves for
 * Save.
 */
function RemoveConfirm({
  id,
  episodeNum,
  onConfirm,
  onCancel,
}: {
  id: string
  episodeNum: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      id={id}
      role="alertdialog"
      aria-labelledby={`${id}-question`}
      className="mt-3 rounded-mo border border-mo-bad/60 bg-mo-surface p-3"
    >
      <p id={`${id}-question`} className="text-[13px] text-mo-ink">
        Remove episode {episodeNum} from this series? This happens straight away, not on
        Save. The other episodes keep their numbers, so there will be no episode{" "}
        {episodeNum} until you add one.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-mo-pill border border-mo-bad px-4 py-2 text-[13px] font-semibold text-mo-bad transition-colors duration-150 ease-mo hover:bg-mo-bad/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
        >
          Remove it
        </button>
        <Action onClick={onCancel}>Keep it</Action>
      </div>
    </div>
  )
}

/**
 * Adding an episode is a pick, not an empty row.
 *
 * An empty slot would immediately be an invalid one, and a creator who opened
 * it by accident would then have to remove it. Choosing the video first means
 * every slot that exists is a complete one.
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
