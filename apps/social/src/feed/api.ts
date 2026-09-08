/**
 * Every URL the feed knows. This is the whole network surface of the zone.
 *
 * It is one file on purpose. The packages under packages/ are network-free so
 * that reels and tube can reuse them, which only means anything if the wiring
 * they are free OF lives somewhere findable — this is that place. Adding a
 * `fetch` to a component is the change that quietly ends the arrangement.
 *
 * ── The envelope is NOT unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance with a cookie/CSRF request
 * interceptor and a 401-refresh response interceptor; it does not touch the
 * body. Every gateway response is `{data, error, meta}`, so a caller reads
 * `res.data.data` — which is what every hook in apps/commerce does. That is
 * ugly enough to be worth hiding once, here, rather than twenty times.
 *
 * ── Routes verified against the running gateway, not guessed ──────────────
 *   GET    /v1/feed/home            ?limit&cursor&feed_mode
 *   POST   /v1/posts/{id}/like      no body, TOGGLES  -> {liked, count}
 *   POST   /v1/posts/{id}/bookmark  no body, SETS     -> {bookmarked:true}
 *   DELETE /v1/posts/{id}/bookmark                    -> {bookmarked:false}
 *   POST   /v1/posts/{id}/repost    {type:"plain"}    -> 201
 *   DELETE /v1/posts/{id}/repost                      -> 204, EMPTY BODY
 *   POST   /v1/analytics/events     {events:[...]}    -> 202 {accepted,duplicate}
 *
 * Two of those are shaped differently from their neighbours and both are easy
 * to get wrong: like is a toggle that ignores what you wanted, bookmark is a
 * pair of idempotent setters; and the repost delete answers 204 with no
 * envelope at all, so parsing its body throws.
 */

import api from "@atpost/api-client"
import type { FeedItem, FeedPage } from "@atpost/types/feed"
import type { AnalyticsEvent, SendOutcome } from "@momentum/analytics"

/**
 * The server clamps `limit` and only returns `meta.next_cursor` when the page
 * came back FULL (`len(items) >= limit`). Ask for more than the ranker can
 * produce and you get a short page — which is indistinguishable from the end
 * of the feed, because that is exactly what a short page means. Verified: 25
 * returns 25 and a cursor, 30 returns 20 and no cursor. 20 is the size the
 * endpoint is built around.
 */
const PAGE_SIZE = 20

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/**
 * One page of the home feed.
 *
 * ── Why `ranked` and never the default ────────────────────────────────────
 * This is a product decision, not a query-string detail. `feed_mode` defaults
 * to `chronological`, which is posts from accounts you FOLLOW — so a new
 * account, which follows nobody, gets `{"data":[]}`. The front door of the
 * platform would be blank on the day someone joins it, which is the single
 * worst moment for it to be blank. `ranked` is the mode with the cold-start
 * path and it returns content for an account with no graph at all.
 *
 * (Confirmed on the live stack with the test account: `chronological` answers
 * an empty array, `ranked` answers twenty posts.)
 */
export async function fetchFeedPage(cursor?: string | null): Promise<FeedPage> {
  const res = await api.get<Envelope<FeedItem[]>>("/v1/feed/home", {
    params: {
      limit: PAGE_SIZE,
      feed_mode: "ranked",
      ...(cursor ? { cursor } : {}),
    },
  })

  return {
    items: res.data?.data ?? [],
    // Absent means end-of-feed. It is the normal terminating condition, not a
    // missing field to work around.
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/**
 * Like, or unlike.
 *
 * The route is a TOGGLE and takes no body, so `next` is not sent — it is only
 * what the caller expected. The response carries the truth for both the state
 * and the count, and the count is the interesting half: other people have been
 * liking this post too, so the server's number is not our optimistic ±1 and
 * should replace it rather than be reconciled with it.
 */
export async function toggleLike(postId: string): Promise<{ on: boolean; count: number }> {
  const res = await api.post<Envelope<{ liked: boolean; count: number }>>(
    `/v1/posts/${postId}/like`
  )
  const body = res.data?.data
  return { on: Boolean(body?.liked), count: body?.count ?? 0 }
}

/**
 * Save, or unsave.
 *
 * Not a toggle, unlike `like`: two idempotent routes, so the desired state
 * picks the method. Calling POST twice leaves it saved rather than toggling it
 * back off, which is the behaviour you want from a control that might be
 * double-tapped.
 *
 * There is also a richer `/v1/saved` collections API. It is not used here: it
 * keys deletes on the SAVED-ROW id rather than the post id, which the feed
 * does not have and would need a second request to learn.
 */
export async function setBookmark(postId: string, saved: boolean): Promise<{ on: boolean }> {
  const path = `/v1/posts/${postId}/bookmark`
  const res = saved
    ? await api.post<Envelope<{ bookmarked: boolean }>>(path)
    : await api.delete<Envelope<{ bookmarked: boolean }>>(path)
  return { on: Boolean(res.data?.data?.bookmarked) }
}

/**
 * Repost, or undo.
 *
 * `type` is required on the create — a bare `{}` is a 422. The DELETE answers
 * **204 with no body at all**, so there is nothing to read and nothing to
 * parse; the state is inferred from the fact that it did not throw.
 */
export async function setRepost(postId: string, reposted: boolean): Promise<{ on: boolean }> {
  const path = `/v1/posts/${postId}/repost`
  if (reposted) {
    await api.post(path, { type: "plain" })
    return { on: true }
  }
  await api.delete(path)
  return { on: false }
}

/**
 * Ship a batch of analytics events.
 *
 * This is the transport @momentum/analytics is constructed with — the whole
 * reason that package takes a function instead of importing axios. It
 * classifies the failure rather than throwing, because the queue's decision
 * about whether to retry, bisect, or stop depends entirely on which kind it
 * was:
 *
 *   401              stop. The rows are real watch time; keep them for after a
 *                    re-auth rather than throwing a creator's minutes away.
 *   422 CONTENT_NOT_READY
 *                    transient, and NOT a client bug. It means the ownership
 *                    projection has not caught up with a freshly published
 *                    video yet. Dropping these would systematically lose the
 *                    first views of every new upload — the views that matter
 *                    most to the person who just posted.
 *   429 / 5xx / off  transient.
 *   400 and the rest permanent, so the queue bisects and drops one event.
 */
export async function sendAnalytics(events: AnalyticsEvent[]): Promise<SendOutcome> {
  try {
    const res = await api.post<Envelope<{ accepted: number; duplicate: number }>>(
      "/v1/analytics/events",
      { events }
    )
    const body = res.data?.data
    return {
      kind: "ok",
      result: { accepted: body?.accepted ?? 0, duplicate: body?.duplicate ?? 0 },
    }
  } catch (err: unknown) {
    const e = err as {
      response?: { status?: number; data?: { error?: { code?: string } } }
    }
    const status = e.response?.status
    const code = e.response?.data?.error?.code

    if (status === 401) return { kind: "unauthenticated" }
    if (status === 422 && code === "CONTENT_NOT_READY") return { kind: "transient" }
    if (status === undefined || status === 429 || status >= 500) return { kind: "transient" }
    return { kind: "permanent" }
  }
}
