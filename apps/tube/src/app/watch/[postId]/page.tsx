import { notFound } from "next/navigation"
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
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function WatchAliasPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  if (!UUID.test(postId)) notFound()
  return <WatchScreen postId={postId} />
}
