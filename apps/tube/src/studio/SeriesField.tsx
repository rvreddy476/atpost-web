"use client"

/**
 * The "Series" card: which series this upload joins, and as which episode.
 *
 * ── Why it is on the Details step ─────────────────────────────────────────
 * A series is part of what the video IS, like its title and its category,
 * and it is the one thing on this form a creator decides BEFORE uploading:
 * "this is episode 4". Putting it under Visibility would file it with the
 * compliance switches, which it is not.
 *
 * ── The number is suggested, shown, and editable ──────────────────────────
 * `nextEpisodeNum` in ./fields.ts proposes one past the highest existing
 * number (and says why a gap is not filled). The creator can type another.
 * Typing a number that already exists is allowed, because the server's write
 * is an upsert and replacing episode 2 is a real thing somebody may mean;
 * the card says, in so many words, which video that would replace.
 *
 * ── It is not permanent, and the card says so ─────────────────────────────
 * Everything else on this form is settable only at create. The series is
 * not: it is a separate row, and the links editor at /links/{postId} can move
 * or replace it afterwards. Worth one line on screen, because the rest of
 * the studio has taught the creator that nothing here can be changed.
 */

import { useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { MAX_EPISODES } from "@/links/sequence"
import { SERIES_EPISODE_NUM_MAX } from "@/watch/api"
import { episodeLabel } from "@/watch/links"
import { nextEpisodeNum, type VideoDraft } from "./fields"
import { StudioCard, StudioField, studioInputClass } from "./StudioControls"
import type { SeriesPicker } from "./useSeriesPicker"

interface Props {
  draft: VideoDraft
  patch: (change: Partial<VideoDraft>) => void
  series: SeriesPicker
  /** The validator's sentence for the `series` field, if any. */
  error: string | null
}

export function SeriesField({ draft, patch, series, error }: Props) {
  const [making, setMaking] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")

  const chosen = series.list.find((s) => s.id === draft.seriesId) ?? null

  /**
   * The default number, once the episodes are known.
   *
   * Only while the draft has none: a number the creator typed is theirs, and
   * a re-fetch of the same series must not overwrite it. Changing series
   * resets the number to null (see the select's onChange), which is what
   * makes this run again for the new one.
   */
  useEffect(() => {
    if (!draft.seriesId || draft.seriesEpisodeNum !== null || !series.facts) return
    patch({ seriesEpisodeNum: nextEpisodeNum(series.facts.episodeNums) })
  }, [draft.seriesId, draft.seriesEpisodeNum, series.facts, patch])

  const clash =
    draft.seriesEpisodeNum !== null
      ? (series.episodes.find((e) => e.episode_num === draft.seriesEpisodeNum) ?? null)
      : null

  return (
    <StudioCard
      title="Series"
      description={`Optional. Put this video in order with others, up to ${MAX_EPISODES} in a series. A viewer who reaches the end of one episode is offered the next.`}
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <StudioField label="Series" error={error} description={series.listError ?? undefined}>
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              className={studioInputClass}
              value={draft.seriesId ?? ""}
              disabled={series.listLoading}
              onChange={(e) =>
                patch({ seriesId: e.target.value || null, seriesEpisodeNum: null })
              }
            >
              <option value="">{series.listLoading ? "Loading your series" : "Not in a series"}</option>
              {series.list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {typeof s.episode_count === "number"
                    ? ` · ${s.episode_count} episode${s.episode_count === 1 ? "" : "s"}`
                    : ""}
                </option>
              ))}
            </select>
          )}
        </StudioField>
        <button
          type="button"
          onClick={() => setMaking((was) => !was)}
          className="inline-flex items-center gap-1.5 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          {making ? (
            "Cancel"
          ) : (
            <>
              <Plus aria-hidden className="h-4 w-4" />
              New series
            </>
          )}
        </button>
      </div>

      {making && (
        <div className="mt-4 rounded-mo border border-mo bg-mo-sunken p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StudioField label="Series title">
              {({ id }) => (
                <input
                  id={id}
                  className={studioInputClass}
                  value={newTitle}
                  placeholder="How I built it"
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              )}
            </StudioField>
            <StudioField label="Description" description="Optional.">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  className={studioInputClass}
                  value={newDescription}
                  placeholder="What the series is about"
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              )}
            </StudioField>
          </div>
          {/* The one control on this whole studio that writes before Post.
              Said plainly, because the rest of the form has taught the
              creator that nothing happens until the button. */}
          <p className="mt-3 text-xs text-mo-body">
            This creates the series straight away, before the video is posted, because the
            episode has to have somewhere to go. It is invisible to viewers until it has
            episodes.
          </p>
          {series.createError && (
            <p role="alert" className="mt-2 text-xs text-mo-bad">
              {series.createError}
            </p>
          )}
          <button
            type="button"
            disabled={!newTitle.trim() || series.creating}
            onClick={() => {
              void series.create(newTitle.trim(), newDescription.trim()).then((made) => {
                if (!made) return
                // A new series starts with this video as episode 1: it is the
                // video the form is about, and an empty series with a number
                // box would be asking a question with one sensible answer.
                patch({ seriesId: made.id, seriesEpisodeNum: 1 })
                setMaking(false)
                setNewTitle("")
                setNewDescription("")
              })
            }}
            className="mo-btn-primary mt-3 inline-flex h-10 items-center gap-2 rounded-mo-pill px-5 text-sm disabled:opacity-50"
          >
            {series.creating ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            Create it
          </button>
        </div>
      )}

      {draft.seriesId && (
        <div className="mt-5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <StudioField
            label="Episode number"
            description={
              series.episodesLoading
                ? "Reading the series"
                : clash
                  ? `Episode ${clash.episode_num} is already "${episodeLabel(clash)}". Posting will replace it with this video.`
                  : undefined
            }
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                max={SERIES_EPISODE_NUM_MAX}
                step={1}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                className={`${studioInputClass} w-28 tabular-nums`}
                value={draft.seriesEpisodeNum ?? ""}
                disabled={series.episodesLoading}
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  if (raw === "") {
                    patch({ seriesEpisodeNum: null })
                    return
                  }
                  const n = Number(raw)
                  patch({ seriesEpisodeNum: Number.isFinite(n) ? Math.trunc(n) : null })
                }}
              />
            )}
          </StudioField>
          <p className="text-sm text-mo-body sm:pt-7">
            {draft.seriesEpisodeNum !== null && !series.episodesLoading ? (
              <>
                Will be episode {draft.seriesEpisodeNum}
                {chosen ? (
                  <>
                    {" "}
                    of <span className="text-mo-ink">{chosen.title}</span>
                  </>
                ) : null}
                .
              </>
            ) : null}{" "}
            <span className="block text-xs">Also editable later under Links.</span>
          </p>
        </div>
      )}
    </StudioCard>
  )
}
