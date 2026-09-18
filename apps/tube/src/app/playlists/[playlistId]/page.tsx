import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { TubePlaylistDetail } from "@/playlists/TubePlaylistDetail"

/**
 * `/tube/playlists/{playlistId}` — one playlist.
 *
 * `noindex` because a playlist can be private and this route cannot know which
 * before it renders. A public playlist losing its search listing is a small
 * cost; a private one gaining one is not a cost that can be taken back.
 *
 * ── The id is validated here, before anything is fetched ──────────────────
 * Exactly as ../../[postId]/page.tsx does it, and for the same reason: a
 * malformed id is a bad link and deserves a 404 immediately — no request, no
 * skeleton, no "that playlist is not here" over a surface that never looked.
 * post-service answers `400 INVALID_ID` to a non-UUID anyway, so this is the
 * same verdict one round trip earlier.
 *
 * The check is shape-only. "Does this playlist exist and may you see it" is a
 * question the page asks the server, and `fetchPlaylist` splits its answer
 * into a page (404 → "that playlist is not here") and an error (anything
 * else), which is a distinction this route cannot make.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const metadata: Metadata = {
  title: "Playlist",
  robots: { index: false, follow: false },
}

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ playlistId: string }>
}) {
  const { playlistId } = await params
  if (!UUID.test(playlistId)) notFound()
  return <TubePlaylistDetail playlistId={playlistId} />
}
