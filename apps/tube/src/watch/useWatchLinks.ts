"use client"

/**
 * The three linked-video mechanisms, fetched together.
 *
 * Chapters, cards, end screens and — where there is anything to ask — series
 * episodes. One hook rather than four because they are one question about one
 * video, they are all cheap, and four hooks would be four independent loading
 * states for a page that has nothing useful to do with three of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A FAILED FETCH HERE IS NOT A PAGE ERROR
 *
 * None of this is the video. A 500 from `/chapters` — which is what the running
 * server answers for EVERY post today, see the header of ./api.ts — must not
 * turn a watchable page into an apology. So every request is settled
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
 * THE SERIES LOOKUP IS SEPARATE, AND IT IS SEPARATE BECAUSE IT IS EXPENSIVE
 *
 * The other three are one request each against the post being watched. A series
 * is not: no endpoint answers "which series is this post an episode of", so it
 * costs a list of the creator's series plus one episode fetch per series until
 * the post turns up. `findSeriesForVideo` bounds that and says what it costs.
 *
 * It is therefore fired in its own effect, AFTER the cheap three, and its
 * result lands separately — so a video with no series does not make the chapter
 * list wait on two round trips that were only ever going to answer "no".
 */

import { useEffect, useState } from "react"
import {
  fetchChapters,
  fetchEndScreens,
  fetchVideoCards,
  findSeriesForVideo,
  type Chapter,
  type EndScreen,
  type SeriesEpisode,
  type VideoCard,
} from "./api"
import {
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
 * @param creatorId the video's author — the only way into the series lookup,
 *        since there is no post→series endpoint. Omit and no series is sought.
 * @param enabled false while the browser is known to be signed out. `/chapters`,
 *        `/cards` and `/end-screens` answer 200 without a session, but a
 *        signed-out viewer never gets past `WatchSignedOut`, so asking would be
 *        requests for a page nobody is looking at.
 */
export function useWatchLinks(
  postId: string,
  creatorId?: string,
  enabled = true
): WatchLinks {
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
        seriesTitle: null,
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

  /* ── The expensive one, on its own ────────────────────────────────────── */

  useEffect(() => {
    if (!enabled || !postId || !creatorId || preview) return
    let live = true
    void findSeriesForVideo(creatorId, postId).then((found) => {
      if (!live) return
      // `findSeriesForVideo` never rejects — an unbuildable series rail is an
      // absent one, never an error on a watchable page.
      setSeries(found ? { episodes: found.episodes, title: found.series.title } : NO_SERIES)
    })
    return () => {
      live = false
    }
  }, [postId, creatorId, enabled, preview])

  // The preview branch already put its episodes in `links`; the real branch
  // keeps them here so the two round trips land independently.
  if (links.isPreview) return links
  return { ...links, seriesEpisodes: series.episodes, seriesTitle: series.title }
}
