import type { Metadata } from "next"
import { TubePlaylists } from "@/playlists/TubePlaylists"

/**
 * `/tube/playlists`: a full page in the Tube application.
 *
 * `noindex`: one person's lists behind a session.
 *
 * There is no "my playlists" route on this gateway. What there is, is
 * `GET /v1/creators/{creatorId}/playlists`, which takes any user id — and the
 * viewer's own is a user id. ../../playlists/api.ts has the table.
 */
export const metadata: Metadata = {
  title: "Playlists",
  robots: { index: false, follow: false },
}

export default function PlaylistsPage() {
  return <TubePlaylists />
}
