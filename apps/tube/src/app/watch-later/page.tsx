import type { Metadata } from "next"
import { TubeWatchLater } from "@/playlists/TubeWatchLater"

/**
 * `/tube/watch-later`: a full page in the Tube application.
 *
 * `noindex` because this is one person's queue behind a session, and a search
 * result pointing at it is a search result pointing at a sign-in card.
 *
 * The queue itself is a reserved PLAYLIST rather than a list of its own —
 * there is no watch-later route on this gateway. ../../playlists/playlists.ts
 * has the three options that were considered and what the choice costs.
 */
export const metadata: Metadata = {
  title: "Watch later",
  robots: { index: false, follow: false },
}

export default function WatchLaterPage() {
  return <TubeWatchLater />
}
