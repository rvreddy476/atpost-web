/**
 * The playlist routes, and the batch hydration a playlist page cannot avoid.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFIED AGAINST post-service's ROUTE TABLE, 2026-09-18
 * (internal/http/handler.go and internal/http/video_series_handler.go)
 *
 *   GET    /v1/creators/{creatorId}/playlists?limit&offset  200 [Playlist]
 *   POST   /v1/playlists          {title,description?,visibility?}  201 Playlist
 *   GET    /v1/playlists/{id}                               200 Playlist | 404
 *   DELETE /v1/playlists/{id}                               204
 *   POST   /v1/playlists/{id}/items      {post_id,position?} 201 {playlist_id,…}
 *   DELETE /v1/playlists/{id}/items/{postId}                 204
 *   GET    /v1/playlists/{id}/items                          200 [PlaylistItem]
 *   POST   /v1/posts/batch        {ids:[…≤100]}              200 {id: PostDetail}
 *
 * Three things about that table decide the shape of this file.
 *
 * ── There is no "my playlists" route, and `{creatorId}` is exactly one ────
 * `GET /v1/creators/{creatorId}/playlists` takes ANY user id, and the viewer's
 * own is a user id. So `fetchMyPlaylists(viewerId)` is not a workaround, it is
 * the route used as intended. It does NOT filter by visibility
 * (`ListPlaylistsByCreator`, post-service) — flagged in ./playlists.ts, which
 * is why the page labels a row Private rather than implying it is hidden.
 *
 * ── `/items` answers POINTERS, so every playlist page is two round trips ──
 * `{playlist_id, post_id, position, added_at}` and nothing else: no title, no
 * media, no author. `POST /v1/posts/batch` turns those ids into posts, capped
 * at 100 per request and answering a MAP rather than a list — so the ORDER is
 * computed from `position` by `orderedPostIds` and the map is read back
 * through it. A page that rendered the map's own key order would show a
 * playlist in whatever order Go's map iteration felt like.
 *
 * ── The batch's rows are PostDetail, not feed rows ────────────────────────
 * The same shortfall `/v1/posts/by-author` has and ../tube/channelApi.ts
 * records in full: id, title, counts, `view_count` and a `media[]` carrying
 * `duration_ms` and `hls_url`, but no `variants` (so no poster), no `blurhash`
 * and no `author`. `channel` IS present on long videos — `GetPostsByIDs` runs
 * the same channel attach `GetPost` does — so a playlist row can name its
 * channel where a trending row cannot. The card handles all of it already;
 * this note exists so nobody spends an afternoon looking for the missing
 * posters.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance; every gateway response is
 * `{data, error, meta}` and a caller reads `res.data.data`.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"
import {
  WATCH_LATER_TITLE,
  findWatchLater,
  orderedPostIds,
  parsePlaylist,
  parsePlaylists,
  type PlaylistItemRow,
  type TubePlaylist,
} from "./playlists"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/**
 * How many playlists a page asks for.
 *
 * This route pages on `limit`/`offset` rather than on a cursor — the only
 * offset-paged route this zone touches, which is why nothing here shares the
 * cursor plumbing the feed calls use. Fifty is well past where a rail of
 * playlists is a navigation structure anybody scrolls, and the page says so
 * when it hits the ceiling rather than silently truncating.
 */
const PLAYLIST_PAGE = 50

/** The hard cap post-service enforces on `/v1/posts/batch`; over it is a 400. */
const BATCH_MAX = 100

/* ── Reading ──────────────────────────────────────────────────────────────── */

/**
 * The viewer's own playlists, newest first (the server's `created_at DESC`).
 *
 * `creatorId` is the VIEWER's user id. See the header: there is no "my
 * playlists" route and this is it.
 */
export async function fetchMyPlaylists(creatorId: string): Promise<TubePlaylist[]> {
  const res = await api.get<Envelope<unknown[]>>(
    `/v1/creators/${encodeURIComponent(creatorId)}/playlists`,
    { params: { limit: PLAYLIST_PAGE, offset: 0 } }
  )
  return parsePlaylists(res.data)
}

/**
 * One playlist's own row, or null when it is gone or not this viewer's to see.
 *
 * 404 is null and everything else throws, the same split `fetchChannel` in
 * ../tube/channelApi.ts makes and for the same reason: "no such playlist" is a
 * page this app can draw, and "the server is broken" is not. Collapsing them
 * would show somebody "that playlist does not exist" about a playlist that
 * does.
 *
 * A private playlist belonging to somebody else answers 403 or 404 depending
 * on the path taken through `GetPlaylist`; 403 is left to throw, because the
 * page's error card saying so is more honest than pretending it is missing.
 */
export async function fetchPlaylist(id: string): Promise<TubePlaylist | null> {
  try {
    const res = await api.get<Envelope<unknown>>(`/v1/playlists/${encodeURIComponent(id)}`)
    return parsePlaylist(res.data?.data)
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404) return null
    throw error
  }
}

/** A playlist's items as post ids, already in `position` order. */
export async function fetchPlaylistItemIds(id: string): Promise<string[]> {
  const res = await api.get<Envelope<PlaylistItemRow[]>>(
    `/v1/playlists/${encodeURIComponent(id)}/items`
  )
  const rows = res.data?.data
  return orderedPostIds(Array.isArray(rows) ? rows : [])
}

/**
 * Posts by id, in the order asked for.
 *
 * The server answers a map, so the order is restored here from the argument.
 * Ids the map does not carry are DROPPED rather than rendered as a gap: a
 * playlist item whose post was deleted is a pointer to nothing, and a blank
 * tile with no title is worse than one fewer row. The page says how many rows
 * it drew, so the shortfall is visible rather than silent.
 *
 * Chunked at 100 because that is post-service's cap and it REJECTS rather than
 * truncating — the same failure mode `fetchFollowStates` chunks around in
 * ../tube/api.ts.
 */
export async function fetchPostsByIds(ids: readonly string[]): Promise<FeedItem[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []

  const found = new Map<string, FeedItem>()
  for (let i = 0; i < unique.length; i += BATCH_MAX) {
    const chunk = unique.slice(i, i + BATCH_MAX)
    const res = await api.post<Envelope<Record<string, FeedItem | null>>>("/v1/posts/batch", {
      ids: chunk,
    })
    const body = res.data?.data ?? {}
    for (const id of chunk) {
      const row = body[id]
      if (row && typeof row === "object" && typeof row.id === "string") found.set(id, row)
    }
  }
  return unique.map((id) => found.get(id)).filter((row): row is FeedItem => Boolean(row))
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

/**
 * Create a playlist. 201, and the row comes back with its id.
 *
 * `visibility` defaults to "private" here where the SERVER's default is
 * "public". That inversion is deliberate and it is the safer direction: a
 * playlist made from a card menu in one click is not a publishing act, and
 * somebody who meant to keep a private queue and finds it public has been
 * harmed in a way that somebody who wanted it public and has to say so has
 * not. The create form offers the choice.
 */
export async function createPlaylist(
  title: string,
  visibility: "private" | "unlisted" | "public" = "private"
): Promise<TubePlaylist | null> {
  const res = await api.post<Envelope<unknown>>("/v1/playlists", {
    title,
    description: "",
    visibility,
  })
  return parsePlaylist(res.data?.data)
}

/** Delete a playlist. 204; the body is nothing. Owner only, server-enforced. */
export async function deletePlaylist(id: string): Promise<void> {
  await api.delete(`/v1/playlists/${encodeURIComponent(id)}`)
}

/**
 * Add a video to a playlist.
 *
 * `position` is not sent. The field exists and takes an int, but nothing in
 * this app reorders a playlist — there is no PATCH for an item's position, so
 * an order chosen here could never be corrected — and omitting it lets the
 * server append, which is what "add to playlist" means everywhere else.
 */
export async function addToPlaylist(playlistId: string, postId: string): Promise<void> {
  await api.post(`/v1/playlists/${encodeURIComponent(playlistId)}/items`, { post_id: postId })
}

/**
 * Remove a video from a playlist.
 *
 * A 404 is treated as done, the same way `removeFromHistory` treats one: the
 * row being asked to go is already gone, which is the outcome that was wanted,
 * and a Remove that rolled back over "it was not there" would put a card back
 * on screen for something the server has no record of.
 */
export async function removeFromPlaylist(playlistId: string, postId: string): Promise<void> {
  try {
    await api.delete(
      `/v1/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(postId)}`
    )
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404) return
    throw error
  }
}

/* ── Watch later ──────────────────────────────────────────────────────────── */

/**
 * The viewer's Watch later, creating it the first time.
 *
 * TWO requests on a cold call and one on every later one, which is the price
 * of a queue built out of playlists. The list read comes first on purpose: a
 * create-then-ignore-the-conflict would make a new list on every press,
 * because the server has no unique constraint on a title and would happily
 * take fifty.
 *
 * The race is real and is handled by ./playlists.ts rather than here: two tabs
 * pressing Save at the same moment both find nothing and both create, and
 * `findWatchLater` picks the oldest match from then on, so every later visit
 * agrees about which list it is. The duplicate is visible on the Playlists
 * page where it can be deleted, rather than hidden behind a row.
 */
export async function ensureWatchLater(creatorId: string): Promise<TubePlaylist> {
  const existing = findWatchLater(await fetchMyPlaylists(creatorId))
  if (existing) return existing
  const made = await createPlaylist(WATCH_LATER_TITLE, "private")
  if (!made) throw new Error("Watch later could not be created.")
  return made
}
