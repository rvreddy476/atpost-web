"use client"

/**
 * `/tube/watch-later` — the reserved queue.
 *
 * ── The page is a playlist page that finds its own id ─────────────────────
 * There is no watch-later route on this gateway. ./playlists.ts holds the
 * whole argument for building the queue as a reserved playlist — the three
 * options considered, why browser storage and bookmarks were rejected, and
 * what the choice costs. This page is the consequence: it reads the viewer's
 * playlists, finds the one titled "Watch later", and hands its id to the same
 * component `/tube/playlists/{id}` uses.
 *
 * ── It does NOT create one ────────────────────────────────────────────────
 * Opening an empty queue is not a reason to write to somebody's account.
 * `ensureWatchLater` creates on the first SAVE, which is a deliberate act;
 * visiting a page is not. So a viewer who has never saved anything sees the
 * empty state and no playlist is made — which also means their Playlists page
 * is not quietly populated by having glanced at this one.
 *
 * ── One extra request, and it is the honest one ───────────────────────────
 * The id costs a playlist-list read before the items can be asked for. The
 * alternative — remembering the id in browser storage — would be a cache of
 * somebody's account state that goes stale the moment they delete the list on
 * another device, and the symptom would be a queue that 404s with no
 * explanation.
 */

import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { fetchMyPlaylists } from "./api"
import { findWatchLater } from "./playlists"
import { PlaylistVideos } from "./PlaylistVideos"
import { BrowseError, BrowseSkeleton, EmptyCard, EMPTY_ACTION, PageHeader, SignInCard } from "@/browse/states"

const LEDE = "Videos you saved to watch later, oldest first."

export function TubeWatchLater() {
  const session = useSession()
  const viewerId = session.user?.id ?? null

  const [playlistId, setPlaylistId] = useState<string | null>(null)
  const [state, setState] = useState<"loading" | "found" | "none" | "failed">("loading")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (session.status === "unknown") return
    if (!viewerId) {
      setState("none")
      return
    }
    let live = true
    setState("loading")
    fetchMyPlaylists(viewerId)
      .then((rows) => {
        if (!live) return
        const reserved = findWatchLater(rows)
        setPlaylistId(reserved?.id ?? null)
        setState(reserved ? "found" : "none")
      })
      .catch(() => {
        if (live) setState("failed")
      })
    return () => {
      live = false
    }
  }, [viewerId, session.status, reload])

  if (session.signedOut) {
    return (
      <div>
        <PageHeader title="Watch later" />
        <SignInCard
          what="Sign in to use Watch later"
          why="The queue is kept against your account, so it is the same list on every device."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Watch later" lede={LEDE} />

      {state === "loading" ? (
        <BrowseSkeleton />
      ) : state === "failed" ? (
        <BrowseError
          message="Your Watch later queue could not be loaded."
          onRetry={() => setReload((n) => n + 1)}
        />
      ) : state === "none" || !playlistId ? (
        /* No queue yet, and none is created by looking. See the header. */
        <EmptyCard
          icon={Clock}
          title="Nothing saved for later"
          body="Use the three-dot menu on any video card and choose Save to Watch later. The queue is made the first time you use it."
          action={
            <a href="/tube" className={EMPTY_ACTION}>
              Browse videos
            </a>
          }
        />
      ) : (
        <PlaylistVideos
          playlistId={playlistId}
          label="Watch later"
          emptyTitle="Nothing saved for later"
          emptyBody="Use the three-dot menu on any video card and choose Save to Watch later."
        />
      )}
    </div>
  )
}
