/**
 * The discovery surfaces: trending, the shorts shelf, continue-watching, your
 * own uploads, and the two ways to tell the ranker it got something wrong.
 *
 * ./api.ts is the ranked feed, the follow graph, the action bar and analytics.
 * ./channelApi.ts is the shell's questions — a channel, its videos, its
 * playlists, the two searches. This file is everything the NEW pages need, and
 * it is a third file rather than a longer second one for the reason ./api.ts
 * gives about itself: a file whose name is a lie about half its contents is
 * worse than three short ones.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ OFF post-service AND feed-service, 2026-09-18
 *
 *   GET  /v1/posts/trending?content_type=&limit=&cursor=  PUBLIC
 *        → {data:{items:[PostDetail], next_cursor}}   ← NOT the usual envelope
 *   GET  /v1/posts/recent?content_type=&category=&limit=  PUBLIC
 *        → {data:[PostDetail], meta:{next_cursor}}
 *   GET  /v1/videos/continue-watching?limit=             SESSION
 *        → {data:[{post, position_ms, duration_ms, completed, …}]}
 *   GET  /v1/uploads/videos?limit=&cursor=               SESSION
 *        → {data:[UploadDetail], meta:{next_cursor}}
 *   POST /v1/feed/feedback {post_id|author_id, signal}   SESSION
 *   POST /v1/reports {entity_type,entity_id,reason,details}
 *
 * Four of those have a trap in them, and each trap is a silent wrong answer
 * rather than an error:
 *
 *   · TRENDING PUTS ITS CURSOR INSIDE `data`. Every other paged route on this
 *     gateway answers `{data:[…], meta:{next_cursor}}`; this one answers
 *     `{data:{items, next_cursor}}`. A caller that read `res.data.data` as an
 *     array gets an object, `Array.isArray` is false, and the page renders
 *     "nothing is trending" for a full shelf.
 *
 *   · TRENDING TAKES REPEATED PARAMS, NOT A COMMA LIST. It reads
 *     `c.QueryArray("content_type")` where `/v1/posts/recent` splits on
 *     commas, and it REJECTS the legacy spelling "video" with
 *     `400 INVALID_CONTENT_TYPE` where recent silently normalises it. One
 *     string is sent here, which both readings agree about.
 *
 *   · THE TRENDING ROWS ARE THIN, AND THAT DECIDED THE PAGE'S SHAPE.
 *     `GetTrendingPosts` hydrates counts and media state and calls NEITHER
 *     `attachChannelRefs` NOR anything that fills `variants`. So a trending
 *     row has a title, an age, counts and a duration, and has no poster, no
 *     blurhash and no channel name. That is why there is no hero carousel on
 *     Home: a featured strip is a picture with words over it, and there is no
 *     picture to be had. ../trending/TubeTrending.tsx says so on the page.
 *
 *   · CONTINUE-WATCHING HAS NO `meta` AT ALL. It is a capped shelf, not a
 *     paged list, and it is a DIFFERENT list from `/v1/videos/history`:
 *     unfinished rows ordered for resuming, against every row including the
 *     finished ones. ../history/api.ts has the same note from the other side.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import type { ReportReason } from "@momentum/content"
import { parseHistoryPage, type HistoryRow } from "@/history/history"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/** Rows plus the cursor that follows them, or null at the end. */
export interface VideoPage {
  items: FeedItem[]
  nextCursor: string | null
}

/**
 * Twelve, the same page every other grid in this zone asks for.
 *
 * Not a preference: the grid decodes a blurhash per row on the main thread,
 * and a bigger page is more decodes for videos most people never scroll to.
 * ./api.ts makes the argument in full and uses the same number, so every grid
 * in the app fills at the same rate.
 */
const PAGE_SIZE = 12

function rowsOf(body: unknown): FeedItem[] {
  if (!Array.isArray(body)) return []
  return body.filter(
    (row): row is FeedItem =>
      Boolean(row) && typeof row === "object" && typeof (row as FeedItem).id === "string"
  )
}

/* ── Trending ─────────────────────────────────────────────────────────────── */

/**
 * The top long videos right now — RUTUBE's "In the top".
 *
 * PUBLIC: no session, no 401, which is what lets Trending be one of the three
 * things a signed-out visitor can do here. Ranked by the same engagement score
 * the hashtag "top" sort uses.
 *
 * The envelope is unwrapped by hand because this route's is not the gateway's
 * usual one — see the header, where the trap is written out. The cursor is
 * echoed back verbatim and never constructed: `/v1/posts/*` pages on a bare
 * RFC3339Nano timestamp, the third of the three cursor families ./api.ts
 * documents, and mixing them is a 400.
 */
export async function fetchTrendingVideos(cursor?: string | null): Promise<VideoPage> {
  const res = await api.get<Envelope<{ items?: unknown; next_cursor?: unknown }>>(
    "/v1/posts/trending",
    {
      params: {
        // ONE string, not an array. Axios would serialise an array as
        // `content_type[]=…`, which `c.QueryArray("content_type")` does not
        // see at all — a filter that silently did nothing.
        content_type: "long_video",
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
    }
  )
  const body = res.data?.data
  const next = body?.next_cursor
  return {
    items: rowsOf(body?.items),
    nextCursor: typeof next === "string" && next.length > 0 ? next : null,
  }
}

/* ── The Shorts shelf ─────────────────────────────────────────────────────── */

/**
 * Recent shorts, for the shelf on Home. PUBLIC, so it is there signed out too.
 *
 * `flick` is the canonical content type and `reel` is its legacy synonym;
 * `/v1/posts/recent` normalises the second to the first and de-duplicates, so
 * sending both is one filter rather than two. It is sent both ways because a
 * row written before the rename is still a row.
 *
 * These are NOT opened by this app. Every tile is a plain `<a>` into the reels
 * zone — see REELS_PATH in ../chrome/links.ts for why Tube does not grow its
 * own shorts player.
 */
export async function fetchShorts(limit = 12): Promise<FeedItem[]> {
  const res = await api.get<Envelope<unknown[]>>("/v1/posts/recent", {
    params: { content_type: "flick,reel", limit },
  })
  return rowsOf(res.data?.data)
}

/* ── Continue watching ────────────────────────────────────────────────────── */

/**
 * What the viewer has started and not finished — RUTUBE's "Watching" shelf.
 *
 * Parsed by ../history/history.ts rather than here: the rows are the same
 * shape the history page draws (`ContinueWatchingItem` on the server), and two
 * parsers for one shape is how the resume line on one surface starts
 * disagreeing with the bar on the other. `parseHistoryPage` tolerates the
 * missing `meta` — an absent cursor is this route's normal state, because it
 * is a capped shelf rather than a paged list.
 *
 * 401 for an anonymous browser, so the shelf is never asked for while signed
 * out. ../tube/useTubeFeed.ts records what that costs when it is: each 401
 * drags a failed token refresh behind it.
 */
export async function fetchContinueWatching(limit = 12): Promise<HistoryRow[]> {
  const res = await api.get<unknown>("/v1/videos/continue-watching", { params: { limit } })
  return parseHistoryPage(res.data).rows
}

/* ── Your own uploads ─────────────────────────────────────────────────────── */

/**
 * The viewer's own long videos, newest first.
 *
 * ── This needs no channel, and that is why the rail row changed ───────────
 * `GET /v1/uploads/videos` is keyed on the caller's `X-User-Id` and answers an
 * EMPTY LIST for somebody who has never published — not a 403, not a 404. So
 * "Your videos" is a page anybody signed in can open, and the page says "you
 * have not uploaded a video yet", which is a true sentence about videos. The
 * row used to point at `/@{handle}` and go dark with "you have no channel",
 * which is a true sentence about a different noun. ../chrome/rail.ts has the
 * change written down.
 *
 * ── The rows are better hydrated than the other PostDetail surfaces ───────
 * `GetMyVideos` runs the media-state overlay AND `attachChannelRefs`, and it
 * does not hide a still-processing video from its own author — `is_processing`
 * simply says so. There are still no `variants`, so still no poster; the card
 * already draws that case.
 */
export async function fetchMyVideos(cursor?: string | null): Promise<VideoPage> {
  const res = await api.get<Envelope<unknown[]>>("/v1/uploads/videos", {
    params: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  })
  return {
    items: rowsOf(res.data?.data),
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/* ── Telling the ranker it got one wrong ──────────────────────────────────── */

/** Which of the two edges a feedback press is about. */
export type FeedbackTarget = "post" | "author"

/**
 * "Not interested" on a video, or "Don't recommend this channel".
 *
 * ── Exactly one of the two ids, never both and never neither ──────────────
 * feed-service rejects both together and neither with the same 400
 * ("post_id and author_id are mutually exclusive" / "post_id or author_id is
 * required"), so the target is a discriminated argument here rather than two
 * optional fields and the body cannot be built wrong. Lifted from
 * apps/social/src/feed/api.ts, which discovered it; this is the same endpoint
 * against the same service, and two zones disagreeing about it is the failure
 * that file's header exists to prevent.
 *
 * ── It is not cosmetic, and the card acts on it ───────────────────────────
 * `not_interested` on a post removes that post from EVERY surface on the next
 * fetch; on an author it removes everything they have posted. So the grid
 * takes the card away immediately rather than waiting for a refetch, and puts
 * it back when this answers false — which is why this reports a boolean
 * instead of throwing.
 *
 * ── "Don't recommend channel" sends the AUTHOR's id, not the channel's ────
 * There is no channel-level feedback route. A channel belongs to exactly one
 * user (`channels.user_id`), and `channel.user_id` on a feed row is that
 * person — so muting the author is muting the channel, and the label says
 * channel because that is the noun this app uses. The server also refuses the
 * viewer's OWN id with a 400, which is why the menu drops the row on your own
 * video.
 */
export async function sendFeedback(
  target: { kind: FeedbackTarget; id: string },
  signal: "interested" | "not_interested"
): Promise<boolean> {
  try {
    await api.post("/v1/feed/feedback", {
      ...(target.kind === "post" ? { post_id: target.id } : { author_id: target.id }),
      signal,
    })
    return true
  } catch {
    return false
  }
}

/**
 * File a report against a video.
 *
 * 200 rather than 201 on success, and **409 ACTIVE_REPORT_EXISTS** when the
 * same person reports the same post twice — which means their report is
 * already open in the moderation queue. That is the state they were trying to
 * reach, so it comes back as success. apps/social's `fileReport` made the
 * distinction first and has it tested; this is the same route.
 *
 * `reason` is trust-safety-service's own allowlist, not free text.
 * `REPORT_REASONS` in @momentum/content mirrors `validReportCategories`, and
 * the menu offers nothing that is not on it.
 */
export async function fileReport(
  postId: string,
  reason: ReportReason,
  details: string
): Promise<boolean> {
  try {
    await api.post("/v1/reports", {
      entity_type: "post",
      entity_id: postId,
      reason,
      details,
    })
    return true
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    return status === 409
  }
}
