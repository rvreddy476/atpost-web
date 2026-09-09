"use client"

/**
 * The viewer's edge toward every author on this surface.
 *
 * ── Why a cache and not a fetch per author row ────────────────────────────
 * The same reasoning as the Android client's `FollowGraph`, arrived at from
 * the same constraint: a feed row carries no relationship field, so the state
 * has to come from graph-service, and a reels scroller shows one author after
 * another for as long as somebody keeps swiping. Fetched per row that is an
 * N+1 against a service that is already the slowest hop in the page.
 *
 * Two things make this cheaper than the phone's version. It asks
 * `POST /v1/graph/relationships/batch` — one request for a whole page rather
 * than one `async` per id — and it keeps the answers for the life of the
 * surface, so an author whose reels appear three times is asked about once.
 *
 * ── "Not yet known" is a state, and it is not "not following" ─────────────
 * `edges` holds no entry for an author still in flight, and `offersFollow`
 * (in ./rail.ts) treats `undefined` as "do not offer". That is deliberate: a
 * Follow button that appears on somebody you already follow and then vanishes
 * a beat later is worse than one that arrives late, and it is the specific
 * failure that made the phone's version refuse to guess.
 *
 * ── A failed lookup is not recorded ───────────────────────────────────────
 * If the batch call fails the ids stay unknown and the button stays hidden,
 * rather than being written down as "none" and offering a Follow whose real
 * state nobody checked. The next page's request retries them for free, because
 * they are still missing from the map.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FollowState } from "@momentum/interactions"
import { fetchFollowStates, setFollow } from "./api"

export interface FollowStates {
  /** Author id -> edge. Absent means "not yet known", never "not following". */
  edges: Map<string, FollowState>
  /** Follow or unfollow, optimistically, returning the server's verdict. */
  toggle: (authorId: string, next: "follow" | "unfollow") => Promise<FollowState>
}

export function useFollowStates(viewerId: string | null, authorIds: string[]): FollowStates {
  const [edges, setEdges] = useState<Map<string, FollowState>>(new Map())
  /** Ids currently being asked about, so two pages landing together ask once. */
  const inFlight = useRef(new Set<string>())

  const key = authorIds.join(",")
  useEffect(() => {
    if (!viewerId) return
    const wanted = [...new Set(authorIds)].filter(
      (id) => id && id !== viewerId && !edges.has(id) && !inFlight.current.has(id)
    )
    if (wanted.length === 0) return

    for (const id of wanted) inFlight.current.add(id)
    let cancelled = false
    fetchFollowStates(viewerId, wanted)
      .then((found) => {
        if (cancelled) return
        setEdges((prev) => {
          const next = new Map(prev)
          for (const [id, state] of found) next.set(id, state)
          return next
        })
      })
      // Deliberately silent and deliberately not recorded. See the header.
      .catch(() => undefined)
      .finally(() => {
        for (const id of wanted) inFlight.current.delete(id)
      })

    return () => {
      cancelled = true
    }
    // `key` rather than the array identity: a new array of the same ids on
    // every render would restart this effect for ever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId, key])

  const toggle = useCallback(
    async (authorId: string, next: "follow" | "unfollow"): Promise<FollowState> => {
      const before = edges.get(authorId) ?? "none"
      // Optimistic, but never optimistic about WHICH outcome a follow had:
      // "requested" is only ever written from the server's own answer, because
      // guessing it wrong in either direction misinforms somebody about
      // whether they are going to see this person's posts.
      setEdges((prev) => new Map(prev).set(authorId, next === "follow" ? "following" : "none"))
      try {
        const settled = await setFollow(authorId, next)
        setEdges((prev) => new Map(prev).set(authorId, settled))
        return settled
      } catch (error) {
        setEdges((prev) => new Map(prev).set(authorId, before))
        throw error
      }
    },
    [edges]
  )

  return { edges, toggle }
}
