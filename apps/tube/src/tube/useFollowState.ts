"use client"

/**
 * The viewer's edge toward the ONE author on this page.
 *
 * ── Why this is singular where apps/reels' version is a cache ─────────────
 * apps/reels keeps a `Map` for the life of its surface because a reels
 * scroller shows one author after another for as long as somebody keeps
 * swiping, and the same author's reels are usually consecutive. A watch page
 * shows exactly one video by exactly one channel, and navigating to another
 * video is a route change. A cache here would be a Map with one entry in it,
 * plus the in-flight bookkeeping that makes a Map with one entry safe.
 *
 * The batch endpoint is still the one asked, with a chunk of one. It is the
 * cheapest correct call — `GET /v1/graph/relationship?user_id&other_id` is the
 * singular route and would work equally well, but then this zone would know
 * two graph endpoints for one question and they would eventually disagree
 * about what `pending_sent` means.
 *
 * ── "Not yet known" is a state, and it is not "not following" ─────────────
 * `state` is `undefined` until the answer lands, and the caller must not draw
 * a Follow button on `undefined`. A button that appears on somebody you
 * already follow and then vanishes a beat later is worse than one that arrives
 * late: the person in between has been told something false about who they
 * follow. `showsFollow` in ../watch/watch.ts is the predicate that encodes it,
 * and it is tested.
 *
 * ── A failed lookup is not recorded ───────────────────────────────────────
 * If the call fails the edge stays unknown and the button stays hidden, rather
 * than being written down as "none" and offering a Follow whose real state
 * nobody checked.
 */

import { useCallback, useEffect, useState } from "react"
import type { FollowState } from "@momentum/interactions"
import { fetchFollowStates, setFollow } from "./api"

export interface FollowEdge {
  /** Undefined means "not yet known", never "not following". */
  state: FollowState | undefined
  /** Follow or unfollow, optimistically, returning the server's verdict. */
  toggle: (next: "follow" | "unfollow") => Promise<FollowState>
}

export function useFollowState(
  viewerId: string | null,
  authorId: string | undefined
): FollowEdge {
  const [state, setState] = useState<FollowState | undefined>(undefined)

  useEffect(() => {
    // Nothing to ask about, and nothing to ask ABOUT ourselves: the server
    // would answer "none" for the viewer's own id and the caller would then
    // have a Follow button offering to follow yourself.
    if (!viewerId || !authorId || authorId === viewerId) {
      setState(undefined)
      return
    }
    let cancelled = false
    fetchFollowStates(viewerId, [authorId])
      .then((found) => {
        if (cancelled) return
        const edge = found.get(authorId)
        if (edge) setState(edge)
      })
      // Deliberately silent and deliberately not recorded. See the header.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [viewerId, authorId])

  const toggle = useCallback(
    async (next: "follow" | "unfollow"): Promise<FollowState> => {
      if (!authorId) throw new Error("No author to follow")
      const before = state
      // Optimistic, but never optimistic about WHICH outcome a follow had:
      // "requested" is only ever written from the server's own answer, because
      // guessing it wrong in either direction misinforms somebody about
      // whether they are going to see this channel's videos.
      setState(next === "follow" ? "following" : "none")
      try {
        const settled = await setFollow(authorId, next)
        setState(settled)
        return settled
      } catch (error) {
        setState(before)
        throw error
      }
    },
    [authorId, state]
  )

  return { state, toggle }
}
