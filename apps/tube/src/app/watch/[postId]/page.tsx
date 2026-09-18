import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { readServerSession } from "@atpost/api-client/server"
import { shouldRenderWatchPage } from "@/watch/metadata"
import { watchPageMetadata } from "@/watch/pageMetadata"
import { fetchPublicPost } from "@/watch/serverPost"
import { WatchScreen } from "@/watch/WatchScreen"

/**
 * `/tube/watch/{postId}`: the watch page, at its second address.
 *
 * The first is `/tube/{postId}` (src/app/[postId]/page.tsx), and this file
 * is the same body under a static `watch` segment. It exists because the
 * subscription notifications the server sends deep-link to
 * `/tube/watch/{postId}`, the YouTube shape and the one the phone's intent
 * filter answers, and a notification whose link 404s on the web is a
 * notification that teaches people not to press them.
 *
 * ── A static segment beside a dynamic one, and why that is safe ───────────
 * Next resolves static segments first, so `/tube/watch/{id}` lands here and
 * never on `[postId]` with `postId: "watch"`. The bare `/tube/watch` DOES
 * reach `[postId]` with that word, fails its UUID check and 404s, which is the
 * right answer for a path that names no video.
 *
 * ── Not a redirect ────────────────────────────────────────────────────────
 * A redirect to `/tube/{id}` would work and would cost every notification
 * press a second round trip before the skeleton. Rendering here costs
 * nothing: `WatchScreen` builds its own links (`watchHref` in
 * src/watch/links.ts) and does not read the address it was reached at.
 *
 * The UUID check is copied rather than imported, deliberately: both files are
 * the whole of what a route segment is, and a shared `routeGuards.ts` for one
 * regular expression would be a module whose only content is this comment.
 *
 * ── The METADATA is shared, and that is not the same decision ─────────────
 * `watchPageMetadata` is imported rather than copied, because the tags the two
 * addresses emit must be byte-identical — in particular the canonical URL,
 * which points at `/tube/{postId}` from BOTH. A notification link and a copied
 * link are one video, and two canonicals would tell a search engine they are
 * two pages that happen to agree. A regular expression can afford to be typed
 * twice; a rule about identity cannot.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>
}): Promise<Metadata> {
  const { postId } = await params
  if (!UUID.test(postId)) return {}
  return watchPageMetadata(postId)
}

export default async function WatchAliasPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  if (!UUID.test(postId)) notFound()

  // See the sibling route for the rule: signed in always renders, signed out
  // only renders what a stranger may read.
  const [{ signedIn }, post] = await Promise.all([
    readServerSession(),
    fetchPublicPost(postId),
  ])
  if (!shouldRenderWatchPage({ signedIn, post })) notFound()

  return <WatchScreen postId={postId} />
}
