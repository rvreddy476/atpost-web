/**
 * The history page's three calls, and nothing else's.
 *
 * ../tube/api.ts is the feed and the action bar; ../watch/api.ts is the
 * watch page's own questions, including the per-video progress read and
 * write. This file is the LIST of that progress and the two ways to shorten
 * it. Kept beside the page that reads it, for the reason ../watch/api.ts
 * gives about itself: every call here has exactly one call site, so a
 * correction to the contract is one line in one file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CODED AGAINST THE CONTRACT, 2026-09-12, SESSION REQUIRED
 *
 *   GET    /v1/videos/history?limit&cursor   → {data:[history row], meta:{next_cursor?}}
 *   DELETE /v1/videos/history                → 204, every row of this viewer's
 *   DELETE /v1/videos/{id}/progress          → 204, one row (and its resume point)
 *
 * post-service is building these while this file is written. All three are
 * 401 without a session, and the page never asks while signed out for the
 * reason ../tube/useTubeFeed.ts records: each 401 costs a failed token
 * refresh behind it.
 *
 * ── `/v1/videos/history`, not `/v1/videos/continue-watching` ──────────────
 * The older endpoint is real and the rail's essay used to name it. It is a
 * DIFFERENT list: rows you have not finished, ordered for resuming, capped
 * for a shelf. History is every row including the finished ones, newest
 * first, paged. A history page built on continue-watching would silently
 * lose everything somebody watched to the end, which is most of a history.
 */

import api from "@atpost/api-client"
import { parseHistoryPage, type HistoryPage } from "./history"

/**
 * Twelve, the same page the browse grid asks for and for the same reason: a
 * poster and a blurhash per row, decoded on the main thread, for rows most
 * people will never scroll to.
 */
const PAGE_SIZE = 12

export async function fetchHistoryPage(cursor?: string | null): Promise<HistoryPage> {
  const res = await api.get<unknown>("/v1/videos/history", {
    params: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  })
  return parseHistoryPage(res.data)
}

/** Every row of this viewer's history. 204; the body is nothing. */
export async function clearHistory(): Promise<void> {
  await api.delete("/v1/videos/history")
}

/**
 * One row, which is also that video's resume point: the two are one table.
 *
 * A 404 is treated as done rather than as a failure. The row being asked to
 * go is already gone, which is the outcome that was wanted, and a Remove
 * that rolls back over "it was not there" would put a card back on screen
 * for a video the server has no record of.
 */
export async function removeFromHistory(postId: string): Promise<void> {
  try {
    await api.delete(`/v1/videos/${encodeURIComponent(postId)}/progress`)
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 404) return
    throw error
  }
}
