"use client"

/**
 * `/tube/playlists/{playlistId}` — one playlist.
 *
 * Two independent reads, and they fail independently: the playlist's own ROW
 * (`GET /v1/playlists/{id}`, for the heading and the count) and its CONTENTS
 * (./PlaylistVideos.tsx). A page that waited for both before drawing either
 * would show nothing while one of them was slow, and a page that treated a
 * failed heading as a failed page would apologise for a list it could draw.
 *
 * ── 404 is a page and not an error ────────────────────────────────────────
 * `fetchPlaylist` returns null for a 404 and throws on everything else — the
 * same split `fetchChannel` makes, and for the same reason: "no such playlist"
 * is a sentence this app can write, and "the server is broken" is a different
 * one. A private playlist belonging to somebody else is whichever of 403/404
 * post-service's `GetPlaylist` takes; the 403 branch throws and lands in the
 * error card, which says less but says nothing false.
 */

import { useEffect, useState } from "react"
import { useSession } from "@atpost/api-client/session"
import { fetchPlaylist } from "./api"
import { playlistCountLabel, visibilityLabel, type TubePlaylist } from "./playlists"
import { PlaylistVideos } from "./PlaylistVideos"
import { EmptyCard, EMPTY_ACTION, PageHeader } from "@/browse/states"

export function TubePlaylistDetail({ playlistId }: { playlistId: string }) {
  const session = useSession()
  const [row, setRow] = useState<TubePlaylist | null>(null)
  /** Distinct from `row === null`: "we have not looked yet" is not "gone". */
  const [state, setState] = useState<"loading" | "found" | "missing" | "failed">("loading")

  useEffect(() => {
    // Waits for the session because a private playlist reads differently with
    // one: post-service decides visibility from the caller's `X-User-Id`, and
    // asking before the cookie has been read would ask as nobody.
    if (session.status === "unknown") return
    let live = true
    setState("loading")
    fetchPlaylist(playlistId)
      .then((found) => {
        if (!live) return
        setRow(found)
        setState(found ? "found" : "missing")
      })
      .catch(() => {
        if (live) setState("failed")
      })
    return () => {
      live = false
    }
  }, [playlistId, session.status])

  if (state === "missing") {
    return (
      <div>
        <PageHeader title="Playlist" />
        <EmptyCard
          title="That playlist is not here"
          body="It may have been deleted, or it may be private to somebody else."
          action={
            <a href="/tube/playlists" className={EMPTY_ACTION}>
              Your playlists
            </a>
          }
        />
      </div>
    )
  }

  const meta =
    row &&
    [playlistCountLabel(row.count), visibilityLabel(row.visibility)]
      .filter(Boolean)
      .join(" · ")

  return (
    <div>
      <PageHeader
        // The heading waits for the row rather than guessing. "Playlist" for
        // one beat is honest; a title invented from the id would not be.
        title={row?.title ?? "Playlist"}
        lede={
          state === "failed"
            ? "The playlist's own details could not be read. Its videos are below."
            : meta || undefined
        }
      />

      {row?.description && (
        <p className="mb-5 max-w-2xl whitespace-pre-line text-sm text-mo-body">
          {row.description}
        </p>
      )}

      {/* The contents are fetched whatever the heading did: a failed row read
          says so above and the list below still works. */}
      <PlaylistVideos
        playlistId={playlistId}
        label={row ? `Videos in ${row.title}` : "Videos in this playlist"}
        emptyTitle="Nothing in this playlist yet"
        emptyBody="Use the three-dot menu on any video card to save it here."
      />
    </div>
  )
}
