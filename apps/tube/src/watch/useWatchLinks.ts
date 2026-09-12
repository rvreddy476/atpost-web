"use client"

/**
 * The three linked-video mechanisms, fetched together.
 *
 * Chapters, cards, end screens and series episodes. One hook rather than four
 * because they are one question about one video, they are all cheap, and four
 * hooks would be four independent loading states for a page that has nothing
 * useful to do with three of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A FAILED FETCH HERE IS NOT A PAGE ERROR
 *
 * None of this is the video. A 500 from `/chapters`, which is what the running
 * server answered for EVERY post for a day (see the header of ./api.ts), must
 * not turn a watchable page into an apology. So every request is settled
 * independently and a failure produces an empty list plus a note in
 * `unavailable`, which the surfaces use to say "chapters could not be loaded"
 * where a chapter list would have been, and to say nothing at all where there
 * simply are none.
 *
 * That distinction is the whole reason `unavailable` exists rather than a bare
 * `error` string: "this video has no chapters" and "we could not find out
 * whether it has chapters" are different sentences, and only one of them is
 * worth taking space on the page for.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SERIES LOOKUP IS STILL ITS OWN EFFECT, FOR A DIFFERENT REASON THAN BEFORE
 *
 * Until 2026-09-12 it was separate because it was EXPENSIVE: no endpoint
 * answered "which series is this post in", so the page listed the creator's
 * series and read each one's episodes until the post turned up, up to four
 * deep. `GET /v1/posts/{id}/series` replaced that walk with one request, and
 * `fetchPostSeries` in ./api.ts is the whole of it.
 *
 * It stays in its own effect because its normal answer is a 404. Three of the
 * four requests answer 200 with an empty list for a video that has nothing;
 * this one answers "not found" for the common case, and settling it with the
 * others would mean either teaching `allSettled` that one rejection is fine
 * or wrapping it so it never rejects. Separate, it is simply "null, or a
 * series", and the chapter list does not wait on it either way.
 */

import { useEffect, useState } from "react"
import {
  fetchChapters,
  fetchEndScreens,
  fetchPostSeries,
  fetchVideoCards,
  type Chapter,
  type EndScreen,
  type SeriesEpisode,
  type VideoCard,
} from "./api"
import {
  PREVIEW_SERIES_TITLE,
  previewCards,
  previewChapters,
  previewEndScreens,
  previewSeriesEpisodes,
  wantsLinkPreview,
} from "./fixtures"

export interface WatchLinks {
  chapters: Chapter[]
  cards: VideoCard[]
  endScreens: EndScreen[]
  /**
   * Every episode of the series this video is in, or empty.
   *
   * The FULL list rather than the server's `next` pointer, on purpose: the
   * rail draws the whole queue, and `nextEpisode` in ./links.ts derives "what
   * plays after this" from the same rows, so the countdown and the rail can
   * never disagree about which video is next.
   */
  seriesEpisodes: SeriesEpisode[]
  /** The series' own name, when this video is an episode of one. */
  seriesTitle: string | null
  /** Which of them could not be fetched at all. Empty is the good case. */
  unavailable: {
    chapters: boolean
    cards: boolean
    endScreens: boolean
  }
  /**
   * These rows came from ./fixtures.ts because the URL asked for them.
   *
   * Surfaced so every surface that draws one can say so on screen. A preview
   * that is indistinguishable from real content is how a fixture ends up in a
   * screenshot that somebody later reads as evidence the feature has data.
   */
  isPreview: boolean
}

const NONE: WatchLinks = {
  chapters: [],
  cards: [],
  endScreens: [],
  seriesEpisodes: [],
  seriesTitle: null,
  unavailable: { chapters: false, cards: false, endScreens: false },
  isPreview: false,
}

interface SeriesState {
  episodes: SeriesEpisode[]
  title: string | null
}

const NO_SERIES: SeriesState = { episodes: [], title: null }

/**
 * @param postId the video being watched.
 * @param enabled false while the browser is known to be signed out. `/chapters`,
 *        `/cards` and `/end-screens` answer 200 without a session, but a
 *        signed-out viewer never gets past `WatchSignedOut`, so asking would be
 *        requests for a page nobody is looking at.
 */
export function useWatchLinks(postId: string, enabled = true): WatchLinks {
  const [links, setLinks] = useState<WatchLinks>(NONE)
  const [series, setSeries] = useState<SeriesState>(NO_SERIES)
  const [preview, setPreview] = useState(false)

  /* ── The three cheap ones, together ───────────────────────────────────── */

  useEffect(() => {
    setSeries(NO_SERIES)
    if (!enabled || !postId) {
      setLinks(NONE)
      setPreview(false)
      return
    }

    // `window.location.search` rather than `useSearchParams`: this component
    // renders under a dynamic route, and reading the search params through
    // Next's hook opts the whole subtree into a Suspense requirement for
    // something that is a developer switch. The URL is read once, here.
    const wanted =
      typeof window !== "undefined" && wantsLinkPreview(window.location.search)
    setPreview(wanted)

    if (wanted) {
      setLinks({
        chapters: previewChapters(postId),
        cards: previewCards(postId),
        endScreens: previewEndScreens(postId),
        seriesEpisodes: previewSeriesEpisodes(postId),
        seriesTitle: PREVIEW_SERIES_TITLE,
        unavailable: { chapters: false, cards: false, endScreens: false },
        isPreview: true,
      })
      return
    }

    let live = true
    // `allSettled`, not `all`. One rejection out of three must not discard the
    // other two, and none of the three is the video.
    void Promise.allSettled([
      fetchChapters(postId),
      fetchVideoCards(postId),
      fetchEndScreens(postId),
    ]).then(([chapters, cards, endScreens]) => {
      if (!live) return
      setLinks({
        chapters: chapters.status === "fulfilled" ? chapters.value : [],
        cards: cards.status === "fulfilled" ? cards.value : [],
        endScreens: endScreens.status === "fulfilled" ? endScreens.value : [],
        seriesEpisodes: [],
        seriesTitle: null,
        unavailable: {
          chapters: chapters.status === "rejected",
          cards: cards.status === "rejected",
          endScreens: endScreens.status === "rejected",
        },
        isPreview: false,
      })
    })

    return () => {
      live = false
    }
  }, [postId, enabled])

  /* ── The series, on its own ───────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled || !postId || preview) return
    let live = true
    void fetchPostSeries(postId)
      .then((found) => {
        if (!live) return
        setSeries(found ? { episodes: found.episodes, title: found.series.title } : NO_SERIES)
      })
      .catch(() => {
        // `fetchPostSeries` has already turned the normal 404 into null; what
        // reaches here is a real failure. It is still an absent rail rather
        // than an error on a watchable page, because the rail is not the
        // video and a viewer cannot do anything about a 500 from it.
        if (live) setSeries(NO_SERIES)
      })
    return () => {
      live = false
    }
  }, [postId, enabled, preview])

  // The preview branch already put its episodes in `links`; the real branch
  // keeps them here so the two round trips land independently.
  if (links.isPreview) return links
  return { ...links, seriesEpisodes: series.episodes, seriesTitle: series.title }
}
