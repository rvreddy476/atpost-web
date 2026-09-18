import type { Metadata } from "next"
import { WatchNotFound } from "@/watch/states"

/**
 * The same 404 body, at the watch page's second address.
 *
 * `/tube/watch/{postId}` is reached by every subscription notification, so it
 * is the address most likely to be pressed long after a video was taken down.
 * See the sibling at app/[postId]/not-found.tsx for why the boundary sits on
 * the segment rather than at the root of the app.
 */
export const metadata: Metadata = {
  title: "Video not found",
  robots: { index: false, follow: false },
}

export default function WatchAliasNotFoundPage() {
  return <WatchNotFound />
}
