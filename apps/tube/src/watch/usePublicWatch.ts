"use client"

/**
 * The anonymous viewer's version of `useTubeFeed`, for one video.
 *
 * Deliberately the SAME surface — `item`, `loading`, `error`, `missing`,
 * `retry`, `patch` — so `Watch` below takes one shape whoever is looking and
 * the two sources meet in exactly one place (`WatchScreen`). A second
 * component for the signed-out page would have been two copies of a player, a
 * rail, three overlays and a comment thread to keep in step.
 *
 * ── `patch` is local, and that is the whole of it ─────────────────────────
 * The signed-in page's `patch` writes into the feed's page cache so a like
 * survives navigating away and back. There is no cache here — this hook holds
 * one row — so `patch` merges into that row and nothing else. It exists at all
 * because the comment thread moves the post's comment count and the action row
 * has to agree with it; every other use of `patch` on this page is behind a
 * control a stranger does not get.
 *
 * ── One request, no walk ──────────────────────────────────────────────────
 * The signed-in path walks up to twelve feed pages looking for the id, because
 * the ranked feed is the only hydrated source. This is one `GET /v1/posts/{id}`
 * and it either answers or 404s, so there is no "bounded search" and no
 * "probably not in your ranking" state — just the video, or nothing.
 */

import { useCallback, useEffect, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchPublicWatchPost } from "./api"

export interface PublicWatch {
  item: FeedItem | null
  loading: boolean
  /** The request failed. Distinct from `missing`, which is the server's 404. */
  error: string | null
  /** The server will not show this video to a stranger. Nothing failed. */
  missing: boolean
  retry: () => void
  patch: (id: string, change: Partial<FeedItem>) => void
}

export function usePublicWatch(postId: string, enabled: boolean): PublicWatch {
  const [item, setItem] = useState<FeedItem | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError(null)
    setMissing(false)

    fetchPublicWatchPost(postId)
      .then((row) => {
        if (!live) return
        setItem(row)
        setMissing(row === null)
      })
      .catch(() => {
        // A network failure or a 500. NOT a 404 — `fetchPublicWatchPost`
        // already turned that into null, because a refusal is not a failure
        // and the two want different words on screen.
        if (live) setError("This video could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [attempt, enabled, postId])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const patch = useCallback((id: string, change: Partial<FeedItem>) => {
    setItem((prev) => (prev && prev.id === id ? { ...prev, ...change } : prev))
  }, [])

  return { item, loading, error, missing, retry, patch }
}
