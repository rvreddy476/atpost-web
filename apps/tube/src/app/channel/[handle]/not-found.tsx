import type { Metadata } from "next"
import { ChannelNotFound } from "@/channel/states"

/**
 * What `/tube/@{handle}` renders under a real 404.
 *
 * Two requests reach it, and neither of them is "the channel failed to load":
 * an empty or malformed handle, and a well-formed handle the gateway answered
 * 404 for. Both are decided on the server, in page.tsx, before any of this
 * app's client code runs — which is why this is a 404 STATUS and not a 200
 * whose body apologises. A shared link to a deleted channel should tell a
 * crawler it is gone, not hand it an indexable page.
 *
 * ── It is scoped to this segment, not to the zone ─────────────────────────
 * A `not-found.tsx` at the root of `app/` would become the answer for every
 * missing route in Tube — a video, a playlist, the studio — and the wording
 * here is about a channel. Next resolves the nearest boundary above the
 * segment that called `notFound()`, so this file serves exactly this route.
 * The two watch routes each have their own copy for the same reason.
 *
 * `noindex` is not decoration. An indexable 404 body is how "No such channel"
 * ends up in a search result under the name of a channel that does exist.
 */
export const metadata: Metadata = {
  title: "Channel not found",
  robots: { index: false, follow: false },
}

export default function ChannelNotFoundPage() {
  // No handle: `notFound()` carries nothing with it, and inventing one from
  // the URL here would mean reading headers in a route that is otherwise
  // static. The copy reads correctly without it.
  return <ChannelNotFound />
}
