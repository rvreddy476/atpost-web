/**
 * The one request this zone makes from the SERVER, and the reasons it is not
 * the one the browser makes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT IS DELIBERATELY ANONYMOUS
 *
 * This feeds `generateMetadata`, whose output is `<meta>` tags in HTML served
 * to whoever asked — a crawler, a link unfurler, a cache in front of either.
 * So the question it must answer is "what may a STRANGER be told about this
 * video", and the only honest way to ask that is to be a stranger: no cookie,
 * no Authorization, no X-User-Id.
 *
 * That is not a nicety. If this forwarded the requesting viewer's session, the
 * author of a private video would generate a page whose `og:title` is the
 * private title — and that HTML is what a proxy, a corporate cache or a "send
 * to a friend" button then hands to somebody else. post-service's visibility
 * gate is excellent and it answers per viewer; the fix is to ask it as nobody.
 *
 * The api-client cannot be used here for a second, duller reason: its baseURL
 * is this zone's basePath (`/tube`), which is meaningless without an origin, so
 * it works only in a browser. The gateway's own address is `API_GATEWAY_URL`,
 * the same variable the proxy route uses.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT IS CACHED, AND IT IS SAFE TO CACHE FOR EXACTLY THAT REASON
 *
 * Because the request carries no identity, every caller gets the same answer,
 * so Next's data cache holds one entry per video rather than one per viewer.
 * Five minutes is short enough that unpublishing a video stops it being
 * previewed quickly and long enough that a link posted into a busy channel does
 * not become a thundering herd on post-service.
 *
 * A cache entry is only ever "what a stranger may see", which is the strongest
 * property this file has: there is no key under which a private row could be
 * stored, because a private row is never fetched.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY FAILURE IS `null`, AND `null` IS NOT AN ERROR
 *
 * 404 is the normal answer for a private, unlisted-to-nobody, deleted,
 * scheduled, flagged or still-processing video, and for one that does not
 * exist. A timeout is the answer when post-service is slow. All of them mean
 * the same thing to a preview — there is nothing to say — and none of them may
 * stop the page rendering, because the page is for a signed-in viewer who may
 * well be allowed to watch the very video this request was refused.
 */

import type { PostRow } from "./metadata"

const GATEWAY = process.env.API_GATEWAY_URL || "http://localhost:8080"

/**
 * How long a preview may be stale. Seconds, for Next's data cache.
 *
 * Exported so the test can assert it is finite rather than `false`: an
 * accidental `revalidate: false` would cache a video's title for the lifetime
 * of the deployment, and unpublishing would not clear it.
 */
export const PREVIEW_REVALIDATE_SECONDS = 300

/**
 * A hard ceiling on how long a crawler waits for us.
 *
 * `generateMetadata` blocks the HTML, so a hung upstream is a hung page — and
 * the unfurlers that matter give up in a few seconds and cache the nothing they
 * got. Better to serve the site-level fallback quickly than the right card too
 * late.
 */
const TIMEOUT_MS = 2_500

/**
 * The public row for one post, or null.
 *
 * `{"data": Post}` — the standard envelope. The body is parsed defensively
 * because this runs during metadata generation, where an exception is a 500 on
 * a page that would otherwise have rendered perfectly.
 */
export async function fetchPublicPost(postId: string): Promise<PostRow | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${GATEWAY}/v1/posts/${encodeURIComponent(postId)}`, {
      // Named, so that "we sent no credentials" is visible at the call site and
      // not merely true by omission.
      headers: { accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: PREVIEW_REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: PostRow } | null
    const data = body?.data
    return data && typeof data.id === "string" ? data : null
  } catch {
    // Aborted, refused, unparseable. The page still renders; the card is the
    // site's own.
    return null
  } finally {
    clearTimeout(timer)
  }
}
