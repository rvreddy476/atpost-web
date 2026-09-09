import { notFound } from "next/navigation"
import { WatchScreen } from "@/watch/WatchScreen"

/**
 * `/tube/{postId}` — the watch page.
 *
 * This route is what makes Share in the action row mean anything: a video you
 * cannot link to is not shareable, so the button and the route are one feature
 * and neither is finished without the other. It is also where the founder's
 * "Full video expand" lives — see src/watch/expand.ts.
 *
 * ── The id is validated here, before anything is fetched ──────────────────
 * Every id in this system is a UUID, and the two things that arrive at this
 * route which are NOT videos are worth separating. A malformed id is a bad
 * link and gets a 404 immediately — no request, no skeleton, no "we could not
 * find it" over a surface that never looked. A well-formed id that is simply
 * not in this viewer's ranked videos is a different answer, and `WatchScreen`
 * gives it after actually looking: see `DEEP_LINK_MAX_PAGES` in
 * src/tube/useTubeFeed.ts for why that search is bounded.
 *
 * The check is deliberately shape-only. Asking the server whether the post
 * exists would be a second round trip that answers a question the feed walk is
 * about to answer better — "is this video one you can see", which is not the
 * same as "does this row exist".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WatchPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  if (!UUID.test(postId)) notFound()
  return <WatchScreen postId={postId} />
}
