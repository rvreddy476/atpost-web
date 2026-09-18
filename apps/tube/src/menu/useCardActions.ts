"use client"

/**
 * One set of card-menu handlers for a whole grid.
 *
 * ── Why this is a hook on the PAGE and not state on the card ──────────────
 * Every row of the menu needs something the card does not have and cannot
 * cheaply get: the viewer's playlists, which Watch later is, and which videos
 * are already in it. Twelve cards each fetching that is twelve copies of two
 * requests, twelve caches that disagree the moment one of them writes, and a
 * "Save to Watch later" on card three that leaves card seven still offering to
 * save the same video. So the state is held once, per grid, and handed down.
 *
 * ── Nothing is fetched until a menu is opened ─────────────────────────────
 * `prime()` is called by VideoCardMenu's `onOpen`, and it is idempotent. A
 * visit that never opens a menu makes no extra requests at all; the first
 * press costs two (the playlist list, then that list's items) and every press
 * after it costs none. Loading on mount was the alternative and it would put
 * two guaranteed requests on every page with a grid on it — the same argument
 * ../chrome/useTubeViewer.ts makes for not asking anything while signed out.
 *
 * ── The optimism is local and it is rolled back ───────────────────────────
 * A Watch later press updates the local set immediately and puts it back on a
 * failure, because the server answers 201 with no body worth reading and the
 * card has nothing else to show. A bookmark press is the same shape and goes
 * through `setBookmark` in ../tube/api.ts, which is idempotent by method
 * rather than a toggle — so a double press leaves it saved rather than
 * flipping it back.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────
 * It does not hide the card. `not_interested` removes a video from every
 * surface on the NEXT fetch, and the page that owns the list is the only thing
 * that can take a row out of it — so this reports the outcome and the grid
 * decides. `TubeBrowse` does exactly that, and puts the row back when the call
 * comes home false.
 */

import { useCallback, useRef, useState } from "react"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import type { ReportReason } from "@momentum/content"
import { setBookmark } from "@/tube/api"
import { fileReport, sendFeedback } from "@/tube/discoverApi"
import {
  addToPlaylist,
  createPlaylist,
  ensureWatchLater,
  fetchMyPlaylists,
  fetchPlaylistItemIds,
  removeFromPlaylist,
} from "@/playlists/api"
import { findWatchLater, type TubePlaylist } from "@/playlists/playlists"
import { videoHref } from "@/tube/video"
import { ZONE } from "@/zone"

export interface CardActions {
  /** True once there is a session; the menu shows no list rows without one. */
  signedIn: boolean
  playlists: TubePlaylist[]
  playlistsLoading: boolean
  /** Post ids known to be in the reserved queue. */
  watchLater: ReadonlySet<string>
  /** Post ids the viewer has bookmarked, as far as this grid knows. */
  saved: ReadonlySet<string>
  /** Fetch the lists, once. Safe to call on every menu open. */
  prime: () => void
  toggleWatchLater: (postId: string) => Promise<void>
  saveToPlaylist: (playlistId: string, postId: string) => Promise<void>
  createAndSave: (title: string, postId: string) => Promise<void>
  toggleBookmark: (item: FeedItem) => Promise<void>
  share: (item: FeedItem, title: string) => void
  feedback: (item: FeedItem, target: "post" | "author") => Promise<boolean>
  report: (postId: string, reason: ReportReason, details: string) => Promise<boolean>
  /** True when this is the viewer's own video, so the menu drops two rows. */
  isOwn: (item: FeedItem) => boolean
}

export function useCardActions(): CardActions {
  const { signedIn, user } = useSession()
  const viewerId = user?.id ?? null

  const [playlists, setPlaylists] = useState<TubePlaylist[]>([])
  const [playlistsLoading, setPlaylistsLoading] = useState(false)
  const [watchLater, setWatchLater] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())

  /**
   * The lists have been asked for.
   *
   * A ref and not state: `prime` is called from a click handler on every menu
   * open, and a state flag would re-render the whole grid the first time and
   * still race a second press in the same tick.
   */
  const primed = useRef(false)
  /** The Watch later playlist's id, once it is known or created. */
  const watchLaterId = useRef<string | null>(null)

  const prime = useCallback(() => {
    if (primed.current || !signedIn || !viewerId) return
    primed.current = true
    setPlaylistsLoading(true)
    fetchMyPlaylists(viewerId)
      .then(async (rows) => {
        setPlaylists(rows)
        const reserved = findWatchLater(rows)
        if (!reserved) return
        watchLaterId.current = reserved.id
        // The contents, so the row can say "Remove" where it should. A
        // failure here leaves the set empty, which makes the row offer to
        // save something already saved — harmless, because the server takes
        // the duplicate add and the playlist page shows one row.
        const ids = await fetchPlaylistItemIds(reserved.id)
        setWatchLater(new Set(ids))
      })
      .catch(() => {
        // The menu still works: the list rows just have nothing to offer but
        // "new playlist", and Watch later creates one on first use.
        primed.current = false
      })
      .finally(() => setPlaylistsLoading(false))
  }, [signedIn, viewerId])

  const toggleWatchLater = useCallback(
    async (postId: string) => {
      if (!viewerId) throw new Error("Sign in to use Watch later.")
      const had = watchLater.has(postId)
      // Optimistic, and rolled back below. The server's answer carries
      // nothing this row could draw instead.
      setWatchLater((prev) => {
        const next = new Set(prev)
        if (had) next.delete(postId)
        else next.add(postId)
        return next
      })
      try {
        const list = watchLaterId.current
          ? { id: watchLaterId.current }
          : await ensureWatchLater(viewerId)
        watchLaterId.current = list.id
        if (had) await removeFromPlaylist(list.id, postId)
        else await addToPlaylist(list.id, postId)
        // A freshly created Watch later is a new playlist and belongs in the
        // list the "Save to playlist" step shows.
        if (!playlists.some((row) => row.id === list.id)) {
          const rows = await fetchMyPlaylists(viewerId)
          setPlaylists(rows)
        }
      } catch (error) {
        setWatchLater((prev) => {
          const next = new Set(prev)
          if (had) next.add(postId)
          else next.delete(postId)
          return next
        })
        throw error
      }
    },
    [playlists, viewerId, watchLater]
  )

  const saveToPlaylist = useCallback(async (playlistId: string, postId: string) => {
    await addToPlaylist(playlistId, postId)
    if (playlistId === watchLaterId.current) {
      setWatchLater((prev) => new Set(prev).add(postId))
    }
  }, [])

  const createAndSave = useCallback(
    async (title: string, postId: string) => {
      if (!viewerId) throw new Error("Sign in to make a playlist.")
      const made = await createPlaylist(title, "private")
      if (!made) throw new Error("That playlist could not be created.")
      await addToPlaylist(made.id, postId)
      setPlaylists((prev) => [made, ...prev])
      if (made.reserved) watchLaterId.current = made.id
    },
    [viewerId]
  )

  const toggleBookmark = useCallback(
    async (item: FeedItem) => {
      const was = saved.has(item.id) || item.is_bookmarked === true
      const next = !was
      setSaved((prev) => {
        const copy = new Set(prev)
        if (next) copy.add(item.id)
        else copy.delete(item.id)
        return copy
      })
      try {
        const result = await setBookmark(item.id, next)
        // The server's own answer replaces the guess. `setBookmark` is two
        // idempotent routes rather than a toggle, so this cannot disagree
        // with a double press.
        setSaved((prev) => {
          const copy = new Set(prev)
          if (result.on) copy.add(item.id)
          else copy.delete(item.id)
          return copy
        })
      } catch (error) {
        setSaved((prev) => {
          const copy = new Set(prev)
          if (was) copy.add(item.id)
          else copy.delete(item.id)
          return copy
        })
        throw error
      }
    },
    [saved]
  )

  /**
   * Share: the platform sheet where there is one, the clipboard where there
   * is not.
   *
   * The URL is ABSOLUTE and carries the zone prefix, which `videoHref` does
   * not — it returns "/{id}" because `next/link` adds the basePath itself.
   * A link shared as "/abc" is a link to nothing; this is the one place in
   * the zone that has to put "/tube" back on by hand, and the reason is
   * written down in ../tube/video.ts from the other side.
   */
  const share = useCallback((item: FeedItem, title: string) => {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}${ZONE}${videoHref(item)}`
    const nav = window.navigator as Navigator & {
      share?: (data: { title?: string; url: string }) => Promise<void>
    }
    if (typeof nav.share === "function") {
      void nav.share({ title, url }).catch(() => {
        /* A dismissed share sheet is not an error. */
      })
      return
    }
    void nav.clipboard?.writeText(url).catch(() => {
      /* No clipboard permission. The menu's own notice says nothing landed. */
    })
  }, [])

  const feedback = useCallback(
    (item: FeedItem, target: "post" | "author") =>
      sendFeedback(
        { kind: target, id: target === "post" ? item.id : item.author_id },
        "not_interested"
      ),
    []
  )

  const report = useCallback(
    (postId: string, reason: ReportReason, details: string) =>
      fileReport(postId, reason, details),
    []
  )

  const isOwn = useCallback(
    (item: FeedItem) => Boolean(viewerId) && item.author_id === viewerId,
    [viewerId]
  )

  return {
    signedIn,
    playlists,
    playlistsLoading,
    watchLater,
    saved,
    prime,
    toggleWatchLater,
    saveToPlaylist,
    createAndSave,
    toggleBookmark,
    share,
    feedback,
    report,
    isOwn,
  }
}
