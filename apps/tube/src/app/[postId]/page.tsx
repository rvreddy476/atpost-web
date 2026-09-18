import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { readServerSession } from "@atpost/api-client/server"
import { shouldRenderWatchPage } from "@/watch/metadata"
import { watchPageMetadata } from "@/watch/pageMetadata"
import { fetchPublicPost } from "@/watch/serverPost"
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
 * ── What changed, and what deliberately did not ───────────────────────────
 * The note that used to sit here said asking the server whether the post exists
 * would be "a second round trip that answers a question the feed walk is about
 * to answer better". That is still true OF THE PAGE, and the feed walk is still
 * what renders it. It stopped being the whole story the moment this route had
 * to produce `<meta>` tags: a shared link previewed as nothing at all — no
 * title, no picture, no description — because every word on this page arrives
 * after JavaScript, and an unfurler does not run any.
 *
 * So there is now one ANONYMOUS server read, and it answers a different
 * question from the feed walk's: not "may this viewer watch it" but "may a
 * stranger be told about it". src/watch/serverPost.ts says why it must be
 * anonymous and why that makes it safely cacheable; src/watch/metadata.ts
 * holds the rule that an unlisted video gets the page and no preview.
 *
 * The signed-in path is untouched. `WatchScreen` still walks the feed, still
 * distinguishes its four empty states, and never sees this request's result.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The link preview.
 *
 * A malformed id gets the site's own card rather than an exception: this runs
 * BEFORE the component, so throwing here would turn a bad link into a 500
 * instead of the 404 the page below gives it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>
}): Promise<Metadata> {
  const { postId } = await params
  if (!UUID.test(postId)) return {}
  return watchPageMetadata(postId)
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  if (!UUID.test(postId)) notFound()

  /*
    A real 404 for a visitor nobody could serve.

    Both reads are free here: the session is a cookie this request already
    carries, and the post is the very fetch `generateMetadata` just made, which
    Next serves from the data cache rather than repeating.

    The rule is in `shouldRenderWatchPage` and it is narrow: a signed-in request
    ALWAYS renders, because the anonymous probe says nothing about what this
    viewer may see. Only a signed-out request for a video no stranger can read
    becomes a 404 — which is what stops a crawler indexing a "Sign in to watch"
    shell for a video that may not even exist.
  */
  const [{ signedIn }, post] = await Promise.all([
    readServerSession(),
    fetchPublicPost(postId),
  ])
  if (!shouldRenderWatchPage({ signedIn, post })) notFound()

  return <WatchScreen postId={postId} />
}
