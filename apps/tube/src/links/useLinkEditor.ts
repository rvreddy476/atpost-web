"use client"

/**
 * Everything the link editor knows, loaded together and saved together.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LOAD THE WHOLE SET, EDIT THE WHOLE SET, SAVE THE WHOLE SET
 *
 * Two of the three endpoints behind this screen are FULL REPLACES: they delete
 * every row for the post and insert the body. That single fact decides the
 * shape of this hook.
 *
 *   · Nothing is ever saved from a control's `onChange`. An autosave on a
 *     replace endpoint means every keystroke is a delete-and-insert of the
 *     whole set, and the keystroke that lands while another row is half-typed
 *     is the one that deletes it.
 *   · The baseline is kept next to the draft, so "unsaved" is a fact rather
 *     than a flag somebody has to remember to set. A flag gets out of step;
 *     a comparison cannot.
 *   · Rows this editor does not manage — a `poll` card, a second end screen —
 *     are held from the load and written back in the same body. See
 *     ./payload.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT COUNTS AS "YOUR" VIDEO, AND WHY IT IS ASKED THIS WAY
 *
 * The gate is `GET /v1/posts/by-author/{viewer}` — if the post is in the
 * viewer's own long videos it is theirs to edit. That is a client-side gate
 * and it is deliberately NOT presented as security: at the time of writing,
 * `POST /v1/posts/{id}/cards` accepts a write from any authenticated user for
 * any post, and a backend change adding ownership checks to exactly these
 * routes is in flight. This editor is built as though that check exists —
 * `writeFailureMessage` already has the sentence for its 403 — and the gate
 * here exists so a creator is never shown an editor for a video the server is
 * about to refuse.
 *
 * It also buys the two things the editor cannot work without and has no other
 * source for: the subject video's TITLE and its DURATION. `GET /v1/videos/
 * {postId}` looks like the right place for the latter and is not — it answers
 * `404 Video metadata not found` for a post whose media is not attached,
 * verified. A by-author row's `media[].duration_ms` is the only length
 * available, and when it is absent the duration is honestly unknown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { videoTitle } from "@/tube/video"
import type { EndScreen, SeriesEpisode, VideoCard, VideoSeries } from "@/watch/api"
import {
  addSeriesEpisode,
  createVideoSeries,
  fetchCreatorVideoSeries,
  fetchCreatorVideos,
  fetchEndScreens,
  fetchSeriesEpisodes,
  fetchVideoCards,
  saveEndScreens,
  saveVideoCards,
  videoDurationMs,
  writeFailureMessage,
} from "./api"
import {
  MAX_ALTERNATES,
  alternateProblems,
  emptyAlternate,
  type AlternateDraft,
} from "./model"
import { IncompleteLinkSet, buildCardsPayload, buildEndScreensPayload } from "./payload"
import {
  MAX_EPISODES,
  episodeWrites,
  slotProblems,
  slotsFromEpisodes,
  strandedEpisodes,
  type EpisodeSlot,
} from "./sequence"
import { emptyUpNext, hasUpNext, upNextWindow, type UpNextDraft } from "./upnext"

/**
 * How far back through the creator's videos the editor will read.
 *
 * `/v1/posts/by-author` pages twelve at a time. Five pages is sixty videos:
 * enough to find the subject and to fill a picker for every creator on this
 * platform today, and bounded so a creator with a thousand videos does not
 * spend a minute of requests on a screen about three links. The same
 * discipline as `DEEP_LINK_MAX_PAGES` in ../tube/useTubeFeed.ts, and the
 * picker says when it has hit the bound rather than pretending the list is
 * complete.
 */
export const MAX_LIBRARY_PAGES = 5

/** A video the creator owns, reduced to what this screen needs of it. */
export interface LibraryVideo {
  id: string
  title: string
  durationMs: number
  createdAt: string
}

function toLibraryVideo(item: FeedItem): LibraryVideo {
  return {
    id: item.id,
    title: videoTitle(item),
    durationMs: videoDurationMs(item),
    createdAt: item.created_at,
  }
}

/* ── Local keys ─────────────────────────────────────────────────────────── */

/**
 * A key for a row on screen, which is NOT the row's server id.
 *
 * It cannot be. Every save deletes and re-inserts, so the server hands back
 * new ids for rows nobody touched — a list keyed on those remounts every row
 * on every save, losing focus and any half-typed text in the process.
 */
let keySeed = 0
function mintKey(prefix: string): string {
  keySeed += 1
  return `${prefix}-${keySeed}`
}

/* ── The editable state, and the baseline it is compared against ────────── */

interface Draft {
  alternates: AlternateDraft[]
  upNext: UpNextDraft
  seriesId: string | null
  slots: EpisodeSlot[]
}

export type SaveSection = "alternates" | "sequence" | "upnext"

export interface SaveOutcome {
  section: SaveSection
  ok: boolean
  message: string
}

export interface LinkEditorState {
  status: "loading" | "ready" | "missing" | "error"
  /** Why the editor cannot be shown, when `status` is not "ready". */
  problem: string | null

  subject: LibraryVideo | null
  /** Every video the creator owns, for the pickers. Bounded — see above. */
  library: LibraryVideo[]
  /** True when there are more videos than were read. Said on screen. */
  libraryTruncated: boolean

  alternates: AlternateDraft[]
  alternateProblems: Map<string, string>

  seriesList: VideoSeries[]
  seriesId: string | null
  savedEpisodes: SeriesEpisode[]
  slots: EpisodeSlot[]
  slotProblems: Map<string, string>
  /** Saved episode numbers this arrangement would abandon and cannot remove. */
  stranded: number[]

  upNext: UpNextDraft

  /** Rows loaded from the server that this editor does not manage. */
  passthroughCards: VideoCard[]
  passthroughScreens: EndScreen[]

  dirty: Record<SaveSection, boolean>
  anyDirty: boolean
  saving: boolean
  outcomes: SaveOutcome[]
}

/* ── Comparing a draft to its baseline ──────────────────────────────────── */

/**
 * A section's content as one comparable string.
 *
 * Not deep equality on objects: the local `key` differs between a row loaded
 * from the server and the same row after a reorder that recreated the array,
 * and a comparison that included it would call an untouched section dirty.
 * What is compared is exactly what would be SENT.
 */
function alternatesFingerprint(drafts: readonly AlternateDraft[]): string {
  return JSON.stringify(
    drafts.map((d) => [d.targetId, d.title.trim(), d.teaser.trim(), Math.max(0, Math.round(d.atMs))])
  )
}

function slotsFingerprint(seriesId: string | null, slots: readonly EpisodeSlot[]): string {
  return JSON.stringify([seriesId, slots.map((s) => [s.postId, s.title.trim()])])
}

function upNextFingerprint(draft: UpNextDraft): string {
  return JSON.stringify([draft.targetId, draft.title.trim(), draft.leadMs])
}

/* ── Loading the existing rows into drafts ──────────────────────────────── */

/**
 * The saved cards, split into the ones this editor manages and the rest.
 *
 * A card is managed when it is a `video` card — the founder's "alternate
 * videos". `poll`, `playlist` and `external_link` cards have no control on
 * this screen; they are held and written back untouched rather than being
 * shown as something they are not, or silently deleted on the first save.
 *
 * Ordered by `appear_at_ms`, which is what the endpoint returns and what the
 * timeline underneath the rows draws.
 */
function splitCards(cards: readonly VideoCard[]): {
  drafts: AlternateDraft[]
  passthrough: VideoCard[]
} {
  const managed = cards.filter((c) => c.type === "video")
  const passthrough = cards.filter((c) => c.type !== "video")
  const drafts = managed
    .slice()
    .sort((a, b) => a.appear_at_ms - b.appear_at_ms)
    .map((card) => ({
      key: mintKey("alt"),
      targetId: card.target_id ?? "",
      targetTitle: "",
      title: card.title ?? "",
      teaser: card.teaser_text ?? "",
      atMs: Math.max(0, Math.round(card.appear_at_ms) || 0),
    }))
  return { drafts, passthrough }
}

/**
 * The saved end screens, split into the up-next tile and the rest.
 *
 * ── Which one is "the" up-next tile, given an unordered GET ───────────────
 * `GET …/end-screens` is unordered and the rows carry nothing that says what
 * they are for. So the rule is positional and stated rather than clever: the
 * LATEST-STARTING `video` screen is the up-next tile, because that is what an
 * up-next tile is — the last thing offered before the video ends. Everything
 * else, including any earlier `video` screen, is passthrough.
 *
 * The consequence is worth being plain about: a creator who has two `video`
 * end screens written by another client sees one of them in this editor and
 * the other listed as untouched. That is better than either alternative —
 * showing both in a control built for one, or replacing both with one.
 */
function splitEndScreens(
  screens: readonly EndScreen[],
  durationMs: number
): { draft: UpNextDraft; passthrough: EndScreen[] } {
  const candidates = screens.filter((s) => s.type === "video" && s.target_id)
  if (candidates.length === 0) return { draft: emptyUpNext(), passthrough: screens.slice() }

  const tile = candidates.reduce((latest, s) => (s.start_ms > latest.start_ms ? s : latest))
  const leadMs =
    durationMs > 0 && Number.isFinite(tile.start_ms)
      ? Math.max(1_000, Math.round(durationMs - tile.start_ms))
      : emptyUpNext().leadMs
  return {
    draft: {
      targetId: tile.target_id ?? "",
      targetTitle: "",
      title: tile.title?.trim() ?? "",
      leadMs,
    },
    passthrough: screens.filter((s) => s !== tile),
  }
}

/* ── The hook ───────────────────────────────────────────────────────────── */

export function useLinkEditor(postId: string, creatorId: string | null) {
  const [status, setStatus] = useState<LinkEditorState["status"]>("loading")
  const [problem, setProblem] = useState<string | null>(null)

  const [subject, setSubject] = useState<LibraryVideo | null>(null)
  const [library, setLibrary] = useState<LibraryVideo[]>([])
  const [libraryTruncated, setLibraryTruncated] = useState(false)

  const [draft, setDraft] = useState<Draft>({
    alternates: [],
    upNext: emptyUpNext(),
    seriesId: null,
    slots: [],
  })
  const [baseline, setBaseline] = useState({
    alternates: alternatesFingerprint([]),
    slots: slotsFingerprint(null, []),
    upNext: upNextFingerprint(emptyUpNext()),
  })

  const [seriesList, setSeriesList] = useState<VideoSeries[]>([])
  const [savedEpisodes, setSavedEpisodes] = useState<SeriesEpisode[]>([])
  const [passthroughCards, setPassthroughCards] = useState<VideoCard[]>([])
  const [passthroughScreens, setPassthroughScreens] = useState<EndScreen[]>([])

  const [saving, setSaving] = useState(false)
  const [outcomes, setOutcomes] = useState<SaveOutcome[]>([])

  // Bumped to re-run the load after a save, so the baseline is always the
  // server's answer rather than what we believe we sent.
  const [reloadToken, setReloadToken] = useState(0)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /* ── Load ─────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!postId || !creatorId) return
    let alive = true
    setStatus("loading")
    setProblem(null)
    setOutcomes([])

    void (async () => {
      try {
        // 1. The creator's own videos. Both the ownership gate and the picker.
        const videos: LibraryVideo[] = []
        let cursor: string | null = null
        let truncated = false
        for (let page = 0; page < MAX_LIBRARY_PAGES; page += 1) {
          const result = await fetchCreatorVideos(creatorId, cursor)
          for (const item of result.items) videos.push(toLibraryVideo(item))
          cursor = result.nextCursor
          if (!cursor) break
          if (page === MAX_LIBRARY_PAGES - 1) truncated = true
        }
        if (!alive) return

        const found = videos.find((v) => v.id === postId) ?? null
        if (!found) {
          setStatus("missing")
          setProblem(
            "This video is not one of yours, or it is further back than this screen reads. " +
              "Links can only be edited on your own videos."
          )
          return
        }

        // 2. Everything already attached to it. Settled independently: a
        //    series lookup that fails must not stop the cards loading.
        const [cardsResult, screensResult, seriesResult] = await Promise.allSettled([
          fetchVideoCards(postId),
          fetchEndScreens(postId),
          fetchCreatorVideoSeries(creatorId),
        ])
        if (!alive) return

        const cards = cardsResult.status === "fulfilled" ? cardsResult.value : []
        const screens = screensResult.status === "fulfilled" ? screensResult.value : []
        const allSeries = seriesResult.status === "fulfilled" ? seriesResult.value : []

        // 3. Which series, if any, this video is already an episode of.
        //    `findSeriesForVideo` in ../watch/api.ts does the same walk for the
        //    watch page; it is repeated here rather than reused because this
        //    screen needs the FULL series list anyway for the picker, so the
        //    first of its two requests is already paid for.
        let chosen: VideoSeries | null = null
        let episodes: SeriesEpisode[] = []
        for (const series of allSeries.slice(0, MAX_LIBRARY_PAGES)) {
          try {
            const rows = await fetchSeriesEpisodes(series.id)
            if (rows.some((e) => e.post_id === postId)) {
              chosen = series
              episodes = rows
              break
            }
          } catch {
            continue
          }
        }
        if (!alive) return

        const titleOf = (id: string) =>
          videos.find((v) => v.id === id)?.title ?? "A video not in this list"
        const { drafts, passthrough } = splitCards(cards)
        const split = splitEndScreens(screens, found.durationMs)
        const slots = slotsFromEpisodes(episodes, titleOf, () => mintKey("ep"))

        for (const d of drafts) d.targetTitle = titleOf(d.targetId)
        if (split.draft.targetId) split.draft.targetTitle = titleOf(split.draft.targetId)

        setSubject(found)
        setLibrary(videos)
        setLibraryTruncated(truncated)
        setSeriesList(allSeries)
        setSavedEpisodes(episodes)
        setPassthroughCards(passthrough)
        setPassthroughScreens(split.passthrough)
        setDraft({
          alternates: drafts,
          upNext: split.draft,
          seriesId: chosen?.id ?? null,
          slots,
        })
        setBaseline({
          alternates: alternatesFingerprint(drafts),
          slots: slotsFingerprint(chosen?.id ?? null, slots),
          upNext: upNextFingerprint(split.draft),
        })
        setStatus("ready")
      } catch (error) {
        if (!alive) return
        setStatus("error")
        setProblem(writeFailureMessage(error))
      }
    })()

    return () => {
      alive = false
    }
  }, [postId, creatorId, reloadToken])

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const durationMs = subject?.durationMs ?? 0

  const altProblems = useMemo(
    () => alternateProblems(draft.alternates, postId, durationMs),
    [draft.alternates, postId, durationMs]
  )
  const sequenceProblems = useMemo(() => slotProblems(draft.slots), [draft.slots])
  const stranded = useMemo(
    () => strandedEpisodes(savedEpisodes, draft.slots),
    [savedEpisodes, draft.slots]
  )

  const dirty = useMemo(
    () => ({
      alternates: alternatesFingerprint(draft.alternates) !== baseline.alternates,
      sequence: slotsFingerprint(draft.seriesId, draft.slots) !== baseline.slots,
      upnext: upNextFingerprint(draft.upNext) !== baseline.upNext,
    }),
    [draft, baseline]
  )
  const anyDirty = dirty.alternates || dirty.sequence || dirty.upnext

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const addAlternate = useCallback(() => {
    setDraft((d) => {
      if (d.alternates.length >= MAX_ALTERNATES) return d
      // Placed a full window after the last one so a new row does not arrive
      // already colliding — the first thing a creator would have to fix is a
      // problem the editor created.
      const last = d.alternates[d.alternates.length - 1]
      const at = last ? last.atMs + 30_000 : 0
      return { ...d, alternates: [...d.alternates, emptyAlternate(mintKey("alt"), at)] }
    })
  }, [])

  const updateAlternate = useCallback((key: string, patch: Partial<AlternateDraft>) => {
    setDraft((d) => ({
      ...d,
      alternates: d.alternates.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    }))
  }, [])

  const removeAlternate = useCallback((key: string) => {
    setDraft((d) => ({ ...d, alternates: d.alternates.filter((a) => a.key !== key) }))
  }, [])

  const setUpNext = useCallback((patch: Partial<UpNextDraft>) => {
    setDraft((d) => ({ ...d, upNext: { ...d.upNext, ...patch } }))
  }, [])

  /**
   * Replace the whole slot list — a reorder, a removal, a field edit.
   *
   * Deliberately NOT capped at `MAX_EPISODES` here. The cap belongs on the
   * "add" control, and applying it to every write would TRUNCATE a series that
   * already has more episodes than this screen would create — which is exactly
   * the shrink the server cannot perform. A longer list loaded from the server
   * stays as long as it is.
   */
  const setSlots = useCallback((next: EpisodeSlot[]) => {
    setDraft((d) => ({ ...d, slots: next }))
  }, [])

  const addSlot = useCallback((postIdToAdd: string, title: string) => {
    setDraft((d) => {
      if (d.slots.length >= MAX_EPISODES) return d
      return {
        ...d,
        slots: [
          ...d.slots,
          { key: mintKey("ep"), postId: postIdToAdd, videoTitle: title, title: "" },
        ],
      }
    })
  }, [])

  /**
   * Choose a different series to build the sequence in.
   *
   * Its episodes are fetched immediately, because the slots the creator is
   * about to rearrange ARE that series' episodes — showing the previous
   * series' order under a new series' name would be a lie the first save would
   * then write.
   */
  const chooseSeries = useCallback(
    async (seriesId: string | null) => {
      if (!seriesId) {
        setSavedEpisodes([])
        setDraft((d) => ({ ...d, seriesId: null, slots: [] }))
        return
      }
      try {
        const rows = await fetchSeriesEpisodes(seriesId)
        if (!live.current) return
        const titleOf = (id: string) =>
          library.find((v) => v.id === id)?.title ?? "A video not in this list"
        setSavedEpisodes(rows)
        setDraft((d) => ({
          ...d,
          seriesId,
          slots: slotsFromEpisodes(rows, titleOf, () => mintKey("ep")),
        }))
      } catch (error) {
        setOutcomes([
          { section: "sequence", ok: false, message: writeFailureMessage(error) },
        ])
      }
    },
    [library]
  )

  /**
   * Make a new series and switch to it.
   *
   * This writes IMMEDIATELY, unlike everything else on the screen, and the
   * section says so. A series is a container: episodes are addressed by its id,
   * so there is nothing to put them in until it exists. Worth being blunt with
   * the creator about the cost, because it is not recoverable — there is no
   * `DELETE /v1/video-series/{id}`, verified, so an empty series made by
   * mistake is permanent. It is invisible to viewers until it has episodes,
   * which is the only mitigation there is.
   */
  const makeSeries = useCallback(
    async (title: string, description: string) => {
      try {
        const series = await createVideoSeries({ title, description, isPublic: true })
        if (!live.current) return null
        setSeriesList((list) => [series, ...list])
        setSavedEpisodes([])
        setDraft((d) => ({
          ...d,
          seriesId: series.id,
          // A new series starts with this video as episode 1 — it is the video
          // the screen is about, and an empty sequence editor with a "pick a
          // video" row would be asking a question with one sensible answer.
          slots: subject
            ? [{ key: mintKey("ep"), postId: subject.id, videoTitle: subject.title, title: "" }]
            : [],
        }))
        return series
      } catch (error) {
        setOutcomes([{ section: "sequence", ok: false, message: writeFailureMessage(error) }])
        return null
      }
    },
    [subject]
  )

  /* ── Save ─────────────────────────────────────────────────────────────── */

  /**
   * Save every section that changed.
   *
   * ── Each section is reported on its own ───────────────────────────────
   * Three endpoints, so a save can half succeed and there is no transaction
   * spanning them. Saying "saved" after the cards landed and the series did
   * not is the failure that makes somebody close the tab on unsaved work. Each
   * outcome is kept and shown.
   *
   * ── The sequence is the one that can half-fail INSIDE itself ──────────
   * Cards and end screens are one request each. A sequence is one request per
   * changed episode, and there is no way to roll one back. So its writes go in
   * ASCENDING episode order and stop at the first failure — an interrupted
   * renumber that got 1 and 2 right is a shorter correct series, whereas
   * writing 3 before 1 and failing leaves a series whose numbering means
   * nothing.
   */
  const save = useCallback(async () => {
    if (!subject) return
    setSaving(true)
    const results: SaveOutcome[] = []

    if (dirty.alternates) {
      try {
        const body = buildCardsPayload(draft.alternates, passthroughCards, subject.id, durationMs)
        const saved = await saveVideoCards(subject.id, body)
        results.push({
          section: "alternates",
          ok: true,
          message:
            saved === body.cards.length
              ? `${draft.alternates.length} alternate${draft.alternates.length === 1 ? "" : "s"} saved.`
              : `Saved, but the server stored ${saved} of ${body.cards.length} rows.`,
        })
      } catch (error) {
        results.push({
          section: "alternates",
          ok: false,
          message:
            error instanceof IncompleteLinkSet
              ? error.message
              : writeFailureMessage(error),
        })
      }
    }

    if (dirty.upnext) {
      try {
        const body = buildEndScreensPayload(draft.upNext, passthroughScreens, durationMs)
        await saveEndScreens(subject.id, body)
        results.push({
          section: "upnext",
          ok: true,
          message: hasUpNext(draft.upNext) ? "Up next saved." : "Up next removed.",
        })
      } catch (error) {
        results.push({
          section: "upnext",
          ok: false,
          message:
            error instanceof IncompleteLinkSet ? error.message : writeFailureMessage(error),
        })
      }
    }

    if (dirty.sequence) {
      const blocked = stranded.length > 0
      const incomplete = sequenceProblems.size > 0
      if (!draft.seriesId) {
        results.push({
          section: "sequence",
          ok: false,
          message: "Pick or create a series before saving the sequence.",
        })
      } else if (blocked) {
        results.push({
          section: "sequence",
          ok: false,
          message:
            `Episode ${stranded.join(", ")} would be left behind, and this platform has no way ` +
            `to remove an episode from a series. Put a video back in that slot, or replace it ` +
            `with a different one.`,
        })
      } else if (incomplete) {
        results.push({
          section: "sequence",
          ok: false,
          message: "Some episodes are not finished. Nothing was sent.",
        })
      } else {
        const writes = episodeWrites(savedEpisodes, draft.slots)
        let done = 0
        let failure: string | null = null
        for (const write of writes) {
          try {
            await addSeriesEpisode(draft.seriesId, write)
            done += 1
          } catch (error) {
            failure = writeFailureMessage(error)
            break
          }
        }
        results.push(
          failure
            ? {
                section: "sequence",
                ok: false,
                message:
                  writes.length === 0 || done === 0
                    ? failure
                    : `${done} of ${writes.length} episodes were saved before this failed: ${failure}`,
              }
            : {
                section: "sequence",
                ok: true,
                message: writes.length === 0 ? "Nothing to change." : `${writes.length} episode${writes.length === 1 ? "" : "s"} saved.`,
              }
        )
      }
    }

    if (!live.current) return
    setOutcomes(results)
    setSaving(false)
    // Reload whatever happened. After a partial failure the server's answer is
    // the only description of the state that is true.
    if (results.some((r) => r.ok)) setReloadToken((n) => n + 1)
  }, [
    subject,
    dirty,
    draft,
    durationMs,
    passthroughCards,
    passthroughScreens,
    savedEpisodes,
    sequenceProblems,
    stranded,
  ])

  /** Throw the draft away and re-read the server. */
  const discard = useCallback(() => setReloadToken((n) => n + 1), [])

  const state: LinkEditorState = {
    status,
    problem,
    subject,
    library,
    libraryTruncated,
    alternates: draft.alternates,
    alternateProblems: altProblems,
    seriesList,
    seriesId: draft.seriesId,
    savedEpisodes,
    slots: draft.slots,
    slotProblems: sequenceProblems,
    stranded,
    upNext: draft.upNext,
    passthroughCards,
    passthroughScreens,
    dirty,
    anyDirty,
    saving,
    outcomes,
  }

  return {
    state,
    upNextWindow: upNextWindow(durationMs, draft.upNext.leadMs),
    addAlternate,
    updateAlternate,
    removeAlternate,
    setUpNext,
    setSlots,
    addSlot,
    chooseSeries,
    makeSeries,
    save,
    discard,
  }
}
