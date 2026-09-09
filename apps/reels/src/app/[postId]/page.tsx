import { notFound } from "next/navigation"
import { ReelsViewer } from "@/reels/ReelsViewer"

/**
 * `/reels/{postId}` — the surface, opened on one reel.
 *
 * This route is what makes Share in the rail mean anything: a reel you cannot
 * link to is not shareable, so the button and the route are one feature and
 * neither is finished without the other.
 *
 * ── The id is validated here, before anything is fetched ──────────────────
 * Every id in this system is a UUID, and the two things that arrive at this
 * route which are NOT reels are worth separating. A malformed id is a bad
 * link and gets a 404 immediately — no request, no full-screen black
 * rectangle, no "we could not find it" over a surface that never looked. A
 * well-formed id that is simply not in this viewer's ranking is a different
 * answer, and `ReelsViewer` gives it after actually looking: see
 * `DEEP_LINK_MAX_PAGES` in useReelsFeed.ts for why that search is bounded.
 *
 * The check is deliberately shape-only. Asking the server whether the post
 * exists would be a second round trip that answers a question the viewer's own
 * feed is about to answer better — "is this reel one you can see", which is
 * not the same as "does this row exist".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ReelPermalink({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  if (!UUID.test(postId)) notFound()
  return <ReelsViewer initialPostId={postId} />
}
