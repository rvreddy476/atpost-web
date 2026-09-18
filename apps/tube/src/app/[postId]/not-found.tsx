import type { Metadata } from "next"
import { WatchNotFound } from "@/watch/states"

/**
 * What `/tube/{postId}` renders under a real 404.
 *
 * Two requests reach it, and neither of them is "the video failed to load":
 * an id that is not a UUID, and a well-formed id that no stranger may read
 * asked for by somebody who is not signed in. Both are decided on the server,
 * in page.tsx, before any of this app runs.
 *
 * ── It is scoped to this segment, not to the zone ─────────────────────────
 * A `not-found.tsx` at the root of `app/` would become the answer for every
 * missing route in Tube — the channel page, a playlist, the studio — and the
 * wording here is about a video. Next resolves the nearest boundary above the
 * segment that called `notFound()`, so this file serves exactly the two watch
 * routes and nothing else. The alias route has its own copy for the same
 * reason its UUID check is its own.
 *
 * `noindex` is not decoration. A 404 body that is indexable is how "There is
 * no video at this link" ends up in a search result under the title of a video
 * that does exist.
 */
export const metadata: Metadata = {
  title: "Video not found",
  robots: { index: false, follow: false },
}

export default function WatchNotFoundPage() {
  return <WatchNotFound />
}
