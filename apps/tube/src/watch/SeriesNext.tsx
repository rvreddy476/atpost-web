"use client"

/**
 * The series: "next episode", the episode list under it, and the switch that
 * decides whether the next one starts by itself.
 *
 * A series is the third of the founder's linked-video mechanisms and the only
 * one of the three with an ORDER: a card is a moment, an end screen is a
 * window, and a series is a queue. So the affordance is a queue's: the next
 * episode first and prominent, because that is what somebody who has just
 * finished an episode wants, and the whole list behind it for somebody who
 * wants to go somewhere else in it.
 *
 * ── The current episode is a row, and it is not a link ────────────────────
 * It is marked `aria-current="true"` and rendered as text. A link to the page
 * you are on is a control that appears to do something and does not, and on a
 * watch page it would tear down and rebuild the player to arrive where it
 * already was.
 *
 * ── Where the rows come from ──────────────────────────────────────────────
 * `GET /v1/posts/{id}/series`, one request, through ./useWatchLinks.ts. Until
 * 2026-09-12 there was no such endpoint and this rail rendered only under
 * `?links=preview` from ./fixtures.ts; the preview still works and still wears
 * its badge, so a fixture can never pass for a series somebody made.
 *
 * ── The autoplay switch lives here as well as on the countdown ────────────
 * The countdown card is the place somebody discovers the preference; this rail
 * is the place they come back to change it. A switch that only exists for ten
 * seconds at the end of a video is a setting nobody can find.
 */

import Link from "next/link"
import { ListVideo, SkipForward } from "lucide-react"
import type { SeriesEpisode } from "./api"
import { PreviewBadge } from "./Chapters"
import { AutoplayNextSwitch } from "./NextEpisodeCountdown"
import { episodeLabel, nextEpisode, orderedEpisodes, watchHref } from "./links"

export interface SeriesNextProps {
  episodes: SeriesEpisode[]
  /** The video being watched, which is how the list finds where "next" is from. */
  postId: string
  /** The series' own name, when something can supply one. */
  seriesTitle?: string
  isPreview?: boolean
  /** The viewer's "Autoplay next episode" preference, and how to change it. */
  autoplayNext?: boolean
  onAutoplayNextChange?: (next: boolean) => void
}

export function SeriesNext({
  episodes,
  postId,
  seriesTitle,
  isPreview,
  autoplayNext,
  onAutoplayNextChange,
}: SeriesNextProps) {
  if (episodes.length === 0) return null

  const ordered = orderedEpisodes(episodes)
  const next = nextEpisode(ordered, postId)
  const currentIndex = ordered.findIndex((e) => e.post_id === postId)

  return (
    <section aria-labelledby="tube-series" className="mt-6 rounded-mo bg-mo-surface p-4">
      <div className="flex items-center gap-2">
        <ListVideo aria-hidden className="h-4 w-4 text-mo-body" />
        <h2
          id="tube-series"
          className="min-w-0 flex-1 truncate font-mo-display text-sm font-semibold tracking-mo-display text-mo-ink"
        >
          {seriesTitle?.trim() || "In this series"}
        </h2>
        {isPreview && <PreviewBadge />}
        {autoplayNext !== undefined && onAutoplayNextChange && (
          <AutoplayNextSwitch checked={autoplayNext} onChange={onAutoplayNextChange} compact />
        )}
      </div>

      {/* The count is the orientation. "Episode 2 of 4" is the one sentence
          that tells somebody both where they are and how much is left, and it
          is only drawn when this video is actually IN the list: a series
          fetched for the wrong post would otherwise claim a position it has
          not got. */}
      {currentIndex !== -1 && (
        <p className="mt-1 text-sm text-mo-body">
          Episode {currentIndex + 1} of {ordered.length}
        </p>
      )}

      {next ? (
        <Link
          href={watchHref(next.post_id)}
          className="mt-3 flex items-center gap-2 rounded-mo-pill border border-mo-strong px-3 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
        >
          <SkipForward aria-hidden className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Next: {episodeLabel(next)}</span>
        </Link>
      ) : (
        currentIndex !== -1 && (
          <p className="mt-3 text-sm text-mo-body">This is the latest episode.</p>
        )
      )}

      <ol className="mt-3 flex flex-col gap-0.5">
        {ordered.map((episode) => {
          const current = episode.post_id === postId
          const label = episodeLabel(episode)
          const row = (
            <>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-mo-body">
                {episode.episode_num}
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </>
          )
          return (
            <li key={`${episode.series_id}-${episode.episode_num}`}>
              {current ? (
                <p
                  aria-current="true"
                  className="flex items-center gap-3 rounded-mo bg-mo-raised px-2 py-1.5 text-sm font-semibold text-mo-ink"
                >
                  {row}
                  <span className="sr-only">(now playing)</span>
                </p>
              ) : (
                <Link
                  href={watchHref(episode.post_id)}
                  className="flex items-center gap-3 rounded-mo px-2 py-1.5 text-sm text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
                >
                  {row}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
