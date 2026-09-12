/**
 * The creator side of linked video — every write this feature makes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE READS ARE NOT REDEFINED HERE, ON PURPOSE
 *
 * `fetchVideoCards`, `fetchEndScreens`, `fetchSeriesEpisodes`,
 * `fetchCreatorVideoSeries` and `fetchPostSeries` already exist in
 * `src/watch/api.ts`, with the wire shapes and the two-services-worth of
 * notes behind them. They are imported and re-exported rather than restated.
 *
 * That is the single most important decision in this directory. The whole
 * hazard of an authoring flow built beside a rendering flow is that the two
 * grow separate ideas of the same row — the editor writes `teaser` and the
 * player reads `teaser_text`, and nobody finds out until a creator reports
 * that their card is blank. One definition of `VideoCard`, one definition of
 * `EndScreen`, one definition of `SeriesEpisode`, and the editor is
 * type-checked against the very shapes the watch page renders.
 *
 * ── The direction of the dependency ───────────────────────────────────────
 * `src/links/` imports from `src/watch/`; nothing in `src/watch/` imports from
 * here, and nothing should. The watch page must keep working with no editor in
 * the build at all — it did for a day, and it is the surface a viewer sees.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WRITES VERIFIED AGAINST THE RUNNING GATEWAY, 2026-09-10 (localhost:8080)
 *
 *   POST /v1/posts/{id}/cards        {cards:[…]}   -> 200 {"saved":n}
 *   POST /v1/posts/{id}/end-screens  {screens:[…]} -> 200 {"saved":n}
 *   POST /v1/video-series            {title,…}     -> 201 {VideoSeries}
 *   POST /v1/video-series/{id}/episodes            -> 201 {SeriesEpisode}
 *
 * And one that arrived on 2026-09-12, which is why the sequence can shrink:
 *
 *   DELETE /v1/video-series/{id}/episodes/{ref}    -> 204, no body
 *     `ref` is an episode number OR a post id. It leaves a gap and does not
 *     renumber — ./sequence.ts is built around that. (`DELETE
 *     /v1/video-series/{id}` exists too, 204; this editor does not call it,
 *     so a series made by mistake still stays. See `makeSeries`.)
 *
 * And the four failures worth naming, each reproduced rather than assumed:
 *
 *   · `{}` with no `cards` key at all is `400 INVALID_REQUEST … 'Cards' …
 *     failed on the 'required' tag`. `{"cards":[]}` is a 200 that wipes.
 *   · a wrong enum value is a **500** carrying a raw SQLSTATE, because only a
 *     database CHECK constraint enforces it. Guarded in ./model.ts.
 *   · an end screen with no `position` is a **500** — NOT NULL, no default.
 *   · `episode_num: 0` is `400 … 'EpisodeNum' failed on the 'required' tag`,
 *     because Go's `binding:"required"` reads an int's zero value as absent.
 *
 * A cards or end-screens POST that fails leaves the previous rows intact — the
 * delete and the insert are one transaction, confirmed by saving a card, then
 * failing a save with a bad enum, then reading the original card back.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import { fetchAuthorVideos } from "@/tube/channelApi"
import {
  fetchCreatorVideoSeries,
  fetchEndScreens,
  fetchPostSeries,
  fetchSeriesEpisodes,
  fetchVideoCards,
  isNotFound,
  type EndScreen,
  type PostSeries,
  type SeriesEpisode,
  type VideoCard,
  type VideoSeries,
} from "@/watch/api"
import { isUuid } from "./model"
import type { WireCard, WireEndScreen } from "./payload"
import type { EpisodeWrite } from "./sequence"

export {
  fetchCreatorVideoSeries,
  fetchEndScreens,
  fetchPostSeries,
  fetchSeriesEpisodes,
  fetchVideoCards,
}
export type { EndScreen, PostSeries, SeriesEpisode, VideoCard, VideoSeries }

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

/* ── The creator's own videos ───────────────────────────────────────────── */

export interface CreatorVideoPage {
  items: FeedItem[]
  nextCursor: string | null
}

/**
 * The videos this creator may author links on and link to.
 *
 * `fetchAuthorVideos` unchanged — `GET /v1/posts/by-author/{id}?type=long_video`
 * — because a creator's own list of long videos is one question with one
 * answer and the channel page already asks it. Its header records the exact
 * hydration shortfall (no `variants`, no `blurhash`, no `author`, no
 * `channel`), which matters here for one reason: the picker draws no posters,
 * by necessity rather than by choice, and says so.
 *
 * What these rows DO carry is `media[].duration_ms`, and that is the only
 * source of a video's length available to this editor.
 * `GET /v1/videos/{postId}` — the obvious candidate — answers
 * `404 Video metadata not found` for a post whose media has not been attached,
 * verified, so it cannot be relied on. See `videoDurationMs`.
 */
export async function fetchCreatorVideos(
  creatorId: string,
  cursor?: string | null
): Promise<CreatorVideoPage> {
  return fetchAuthorVideos(creatorId, cursor)
}

/**
 * How long a video is, in milliseconds, or 0 when the row does not say.
 *
 * Zero is "unknown" and is NEVER treated as "zero length" anywhere downstream:
 * `alternateProblem` skips its past-the-end check on it, and `upNextWindow`
 * returns null rather than a window. A post whose media is still transcoding
 * genuinely has no duration anywhere the client can see it, and inventing one
 * would place cards at times that mean nothing.
 */
export function videoDurationMs(item: FeedItem): number {
  const media = item.media?.find((m) => m.kind === "video") ?? item.media?.[0]
  const ms = media?.duration_ms
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : 0
}

/* ── Cards and end screens ──────────────────────────────────────────────── */

/**
 * Replace every card on a video.
 *
 * The body must be the WHOLE set — see ./payload.ts, which is the only thing
 * that should ever build one. The count is returned because it is the one
 * cheap confirmation available: `{"saved":2}` for a two-card body is the
 * server agreeing about what it just stored, and a mismatch is worth surfacing
 * rather than assuming.
 */
export async function saveVideoCards(
  postId: string,
  body: { cards: WireCard[] }
): Promise<number> {
  const res = await api.post<Envelope<{ saved?: number }>>(
    `/v1/posts/${encodeURIComponent(postId)}/cards`,
    body
  )
  return res.data?.data?.saved ?? 0
}

/** Replace every end screen on a video. Same discipline as `saveVideoCards`. */
export async function saveEndScreens(
  postId: string,
  body: { screens: WireEndScreen[] }
): Promise<number> {
  const res = await api.post<Envelope<{ saved?: number }>>(
    `/v1/posts/${encodeURIComponent(postId)}/end-screens`,
    body
  )
  return res.data?.data?.saved ?? 0
}

/* ── Series ─────────────────────────────────────────────────────────────── */

/** What a creator can set when making a series. */
export interface NewSeries {
  title: string
  description?: string
  channelId?: string | null
  coverMediaId?: string | null
  trailerPostId?: string | null
  isPublic?: boolean
}

/**
 * Make a series.
 *
 * ── The optional id fields are validated HERE because the server does not ──
 * `channel_id`, `cover_media_id` and `trailer_post_id` are parsed with
 * something that DISCARDS a value it cannot read: a malformed UUID does not
 * produce a 400, it produces a 201 for a series that silently has no trailer.
 * The failure is invisible — the creator sets a trailer, the request succeeds,
 * and the field is simply empty for ever.
 *
 * So anything that is not a UUID is refused before the request rather than
 * dropped after it. An ABSENT field is fine and is not sent at all; the check
 * is only ever about a value that was supplied and is wrong.
 *
 * `title` is genuinely required and is the only one the handler enforces.
 */
export async function createVideoSeries(input: NewSeries): Promise<VideoSeries> {
  const title = input.title.trim()
  if (!title) throw new Error("A series needs a title.")

  for (const [label, value] of [
    ["channel", input.channelId],
    ["cover image", input.coverMediaId],
    ["trailer video", input.trailerPostId],
  ] as const) {
    if (value && !isUuid(value)) {
      throw new Error(
        `That ${label} id is not a valid id. The server would accept the request and ` +
          `silently drop it, so it was not sent.`
      )
    }
  }

  const res = await api.post<Envelope<VideoSeries>>("/v1/video-series", {
    title,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.channelId ? { channel_id: input.channelId } : {}),
    ...(input.coverMediaId ? { cover_media_id: input.coverMediaId } : {}),
    ...(input.trailerPostId ? { trailer_post_id: input.trailerPostId } : {}),
    is_public: input.isPublic ?? true,
  })
  const series = res.data?.data
  if (!series?.id) throw new Error("The series was created but the server did not name it.")
  return series
}

/**
 * Put a video at one episode number.
 *
 * An UPSERT on `(series_id, episode_num)`: sending episode 2 again replaces
 * whichever post was episode 2 and recomputes the series' `episode_count`. It
 * is NOT a full replace of the series — unlike cards and end screens — which
 * is why `episodeWrites` in ./sequence.ts sends only what changed.
 *
 * `episode_num` is 1-based and **0 is rejected as missing**, not as invalid.
 * The guard here is belt and braces over `episodeNumAt`, because the error the
 * server gives for a 0 does not say what is wrong.
 *
 * `403` means the series is not yours. Worth catching by name: the backend is
 * growing ownership checks on exactly these routes, and the honest sentence
 * for a creator is "this series belongs to somebody else", not "something went
 * wrong".
 */
export async function addSeriesEpisode(
  seriesId: string,
  write: EpisodeWrite
): Promise<SeriesEpisode> {
  if (!Number.isInteger(write.episodeNum) || write.episodeNum < 1) {
    throw new Error(`Episode numbers start at 1; got ${String(write.episodeNum)}.`)
  }
  const res = await api.post<Envelope<SeriesEpisode>>(
    `/v1/video-series/${encodeURIComponent(seriesId)}/episodes`,
    {
      post_id: write.postId,
      episode_num: write.episodeNum,
      ...(write.title ? { title: write.title } : {}),
    }
  )
  const episode = res.data?.data
  if (!episode) throw new Error("The episode was saved but the server did not describe it.")
  return episode
}

/** What a removal found on the server. Both mean the row is not there now. */
export type EpisodeRemovalResult = "removed" | "already-gone"

/**
 * Take one episode out of a series.
 *
 * `DELETE /v1/video-series/{id}/episodes/{ref}`, where `ref` is an episode
 * number or a post id — the route accepts either, and ./sequence.ts's
 * `episodeRemoval` decides which to send and why. A 204 is the whole answer;
 * there is no body to parse, so the only things this function can get wrong
 * are the ref it sends and the status it swallows.
 *
 * ── A 404 is "already gone", not a failure ────────────────────────────────
 * The creator asked for the row to not be there, and it is not there. A
 * second click on a slow connection, or a phone that removed the same episode
 * a minute ago, both arrive as a 404, and turning either into a red "that
 * video no longer exists" would be telling the creator the thing they wanted
 * has failed to happen. It is returned as its own word rather than folded
 * into "removed" so the caller can say something quieter if it wants to.
 *
 * ── The ref is checked before it goes, because the error would not say ────
 * A number below 1 is not an episode number, and a string that is not a UUID
 * is not a post id. Either would come back as a 404 from the route, which
 * this function would then read as "already gone" and report as success.
 * That is the one way a bug here could look like a working feature, so the
 * shape is refused up front with a sentence that names it.
 *
 * Everything else is rethrown; `writeFailureMessage` has the sentences.
 */
export async function removeSeriesEpisode(
  seriesId: string,
  ref: string | number
): Promise<EpisodeRemovalResult> {
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref < 1) {
      throw new Error(`Episode numbers start at 1; got ${String(ref)}.`)
    }
  } else if (!isUuid(ref)) {
    throw new Error("That episode's video id is not a valid id, so nothing was sent.")
  }
  try {
    await api.delete(
      `/v1/video-series/${encodeURIComponent(seriesId)}/episodes/${encodeURIComponent(String(ref))}`
    )
    return "removed"
  } catch (error) {
    if (isNotFound(error)) return "already-gone"
    throw error
  }
}

/**
 * The sentence to show a creator for a failed write.
 *
 * The three statuses that mean something specific on these endpoints, and a
 * deliberate refusal to dress up the fourth. A 500 here is very often the
 * database CHECK constraint on one of the two type enums, which this editor
 * should have made impossible — so it says the request was refused and keeps
 * the server's own message, rather than replacing a real diagnosis with
 * "please try again".
 */
export function writeFailureMessage(error: unknown): string {
  const err = error as {
    response?: { status?: number; data?: Envelope<unknown> }
    message?: string
  }
  const status = err.response?.status
  const detail = err.response?.data?.error?.message
  if (status === 401) return "Your session has expired. Sign in again and nothing will be lost."
  if (status === 403) return "This video is not yours to edit."
  if (status === 404) return "That video no longer exists."
  if (status === 400) return detail || "The server refused the request."
  if (status && status >= 500) {
    return `The server refused this write${detail ? `: ${detail}` : "."}`
  }
  return err.message || "The save could not be sent."
}
