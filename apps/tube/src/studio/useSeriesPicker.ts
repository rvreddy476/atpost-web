"use client"

/**
 * The creator's series, for the upload studio's "Series" card.
 *
 * ── Three small facts, kept apart ─────────────────────────────────────────
 * The LIST of series (one request, once), the EPISODES of the chosen one
 * (one request per choice, so the studio can suggest a number and warn about
 * an overwrite), and the act of MAKING one. They are separate state because
 * they fail separately: a list that could not load is "you can still attach
 * it later under Links", an episode list that could not load is "the number
 * is a guess", and a create that failed is a sentence under the button.
 *
 * ── The draft owns the choice; this hook owns what the choice needs ───────
 * `seriesId` and `seriesEpisodeNum` live on the `VideoDraft` in ./fields.ts,
 * with the rest of the form, so the validator can see them. This hook is
 * handed the chosen id and answers with its episodes. It never writes the
 * draft, and it never writes an episode: that is the publish path's job,
 * after the post exists.
 *
 * ── Creating a series writes immediately, like it does under Links ────────
 * There is nothing to put an episode in until the series exists, and the
 * episode is written after the post is. So "New series" here is a real
 * `POST /v1/video-series` at the moment the button is pressed, before
 * anything is published, and the card says so beside the button.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createVideoSeries,
  fetchCreatorVideoSeries,
  fetchSeriesEpisodes,
  writeFailureMessage,
  type SeriesEpisode,
  type VideoSeries,
} from "@/links/api"
import type { SeriesFacts } from "./fields"

export interface SeriesPicker {
  list: VideoSeries[]
  listLoading: boolean
  /** Set when the list could not be read. The card is still usable without it. */
  listError: string | null
  /** The chosen series' episodes, in `episode_num` order. Empty while loading. */
  episodes: SeriesEpisode[]
  episodesLoading: boolean
  /** What ./fields.ts's validator needs, or null while unknown. Memoised. */
  facts: SeriesFacts | null
  creating: boolean
  createError: string | null
  /** Make a series and add it to the list. Null when it could not be made. */
  create: (title: string, description: string) => Promise<VideoSeries | null>
}

export function useSeriesPicker(
  creatorId: string | null,
  seriesId: string | null,
  enabled: boolean
): SeriesPicker {
  const [list, setList] = useState<VideoSeries[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [episodes, setEpisodes] = useState<SeriesEpisode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  /* ── The list ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled || !creatorId) return
    let live = true
    setListLoading(true)
    fetchCreatorVideoSeries(creatorId)
      .then((rows) => {
        if (live) setList(rows)
      })
      .catch(() => {
        if (live) {
          setListError(
            "Your series could not be loaded. You can still add this video to one afterwards, under Links."
          )
        }
      })
      .finally(() => {
        if (live) setListLoading(false)
      })
    return () => {
      live = false
    }
  }, [creatorId, enabled])

  /* ── The chosen one's episodes ────────────────────────────────────────── */

  useEffect(() => {
    if (!seriesId) {
      setEpisodes([])
      setEpisodesLoading(false)
      return
    }
    let live = true
    setEpisodes([])
    setEpisodesLoading(true)
    fetchSeriesEpisodes(seriesId)
      .then((rows) => {
        if (live) setEpisodes(rows)
      })
      .catch(() => {
        // Unknown episodes are treated as none: the suggested number is then
        // 1, the creator can change it, and a real clash comes back from the
        // episode write as a sentence on the Posted screen rather than being
        // guessed at here.
        if (live) setEpisodes([])
      })
      .finally(() => {
        if (live) setEpisodesLoading(false)
      })
    return () => {
      live = false
    }
  }, [seriesId])

  /**
   * Memoised so `validateDraft`'s `useMemo` in the studio does not re-run on
   * every render: a fresh object here would be a fresh dependency there.
   */
  const facts = useMemo<SeriesFacts | null>(() => {
    if (!seriesId || episodesLoading) return null
    return { episodeNums: episodes.map((e) => e.episode_num) }
  }, [seriesId, episodes, episodesLoading])

  /* ── Making one ───────────────────────────────────────────────────────── */

  const create = useCallback(async (title: string, description: string) => {
    setCreating(true)
    setCreateError(null)
    try {
      const series = await createVideoSeries({ title, description, isPublic: true })
      setList((prev) => [series, ...prev])
      return series
    } catch (error) {
      setCreateError(writeFailureMessage(error))
      return null
    } finally {
      setCreating(false)
    }
  }, [])

  return {
    list,
    listLoading,
    listError,
    episodes,
    episodesLoading,
    facts,
    creating,
    createError,
    create,
  }
}
