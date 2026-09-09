"use client"

/**
 * Picking up where somebody stopped, and saying where they got to.
 *
 * The rules are in ./progress.ts and are asserted there; this is the wiring —
 * one fetch on mount, one seek when the duration is known, and a throttled POST
 * for as long as the video plays.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SEEK HAPPENS EXACTLY ONCE, AND ONLY BEFORE ANYBODY HAS MOVED
 *
 * Two things arrive on their own schedule: the stored position, from the
 * network, and the element's duration, from the media. The resume is applied
 * when both are in — which may be after playback has already started, and that
 * is fine, because starting at 0 and jumping to 11:00 a beat later is a far
 * better failure than a black player waiting for a request.
 *
 * `applied` latches. Without it, the effect would re-run on the next
 * `durationchange` — which HLS fires as it refines the duration — and drag the
 * playhead back to the stored position after somebody had already scrubbed
 * away from it. That is the bug that makes a video feel haunted.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTHING IS SENT FOR A SIGNED-OUT VIEWER
 *
 * Not "it fails harmlessly": `POST /v1/videos/{id}/progress` reads `X-User-Id`
 * and 401s without it, and every 401 costs a failed token refresh behind it in
 * the api-client's interceptor. The check is in `shouldSaveProgress` so it is
 * asserted rather than merely intended, and it is repeated here before the
 * fetch for the same reason.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchWatchProgress, saveWatchProgress, type WatchProgress } from "./api"
import { completedFromEnd, resumeTargetMs, shouldSaveProgress } from "./progress"

export interface Resume {
  /** Where the viewer was put, in ms, or null if they were not moved. */
  resumedAtMs: number | null
}

export interface ResumeInput {
  postId: string
  signedIn: boolean
  /** From ./usePlayhead.ts — the ELEMENT's clock, not the post's metadata. */
  positionMs: number
  durationMs: number
  ended: boolean
  seek: (ms: number) => void
}

export function useResume({
  postId,
  signedIn,
  positionMs,
  durationMs,
  ended,
  seek,
}: ResumeInput): Resume {
  const [stored, setStored] = useState<WatchProgress | null>(null)
  const [resumedAtMs, setResumedAtMs] = useState<number | null>(null)

  const applied = useRef(false)
  const lastSavedPositionMs = useRef<number | null>(null)
  const lastSavedAtMs = useRef<number | null>(null)

  /**
   * The stored position. `404` is the normal answer for a video nobody has
   * watched and ./api.ts turns it into `null`; anything else is swallowed here
   * because a resume point that could not be read is a page that starts at the
   * beginning, which is exactly what it would have done anyway.
   */
  useEffect(() => {
    applied.current = false
    lastSavedPositionMs.current = null
    lastSavedAtMs.current = null
    setStored(null)
    setResumedAtMs(null)

    if (!signedIn || !postId) return
    let live = true
    fetchWatchProgress(postId)
      .then((row) => {
        if (live) setStored(row)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [postId, signedIn])

  /** Apply it, once, as soon as the element knows how long the video is. */
  useEffect(() => {
    if (applied.current) return
    if (!stored || durationMs <= 0) return
    applied.current = true
    const target = resumeTargetMs(stored, durationMs)
    if (target === null) return
    seek(target)
    setResumedAtMs(target)
    // The viewer has been put there; treat it as already saved so the first
    // periodic save is a real advance rather than an echo of what we just read.
    lastSavedPositionMs.current = target
    lastSavedAtMs.current = Date.now()
  }, [stored, durationMs, seek])

  /* ── Saving ───────────────────────────────────────────────────────────── */

  const save = useCallback(
    (position: number, duration: number, final: boolean, complete?: true) => {
      lastSavedPositionMs.current = position
      lastSavedAtMs.current = Date.now()
      void saveWatchProgress(postId, {
        positionMs: position,
        // 0 is legal and meaningful — the server falls back to the duration it
        // already knows rather than recording 0%. See ./api.ts.
        durationMs: duration > 0 ? duration : 0,
        ...(complete ? { completed: complete } : {}),
      }).catch(() => {
        // A dropped save is one lost resume point, not a broken page. It is not
        // retried: the next tick sends a newer position, which is strictly
        // better than the one that failed.
        void final
      })
    },
    [postId]
  )

  /**
   * The periodic save, driven by the playhead rather than by a timer.
   *
   * A timer would keep firing over a PAUSED video and over a tab in the
   * background, where the position has not changed and there is nothing to say.
   * `shouldSaveProgress` is what refuses those; this effect only offers.
   */
  useEffect(() => {
    if (
      !shouldSaveProgress({
        positionMs,
        durationMs,
        lastSavedPositionMs: lastSavedPositionMs.current,
        lastSavedAtMs: lastSavedAtMs.current,
        nowMs: Date.now(),
        signedIn,
        final: false,
      })
    ) {
      return
    }
    save(positionMs, durationMs, false)
  }, [positionMs, durationMs, signedIn, save])

  /** The video reached its end. The one case the client knows `completed`. */
  useEffect(() => {
    if (!ended) return
    if (
      !shouldSaveProgress({
        positionMs,
        durationMs,
        lastSavedPositionMs: lastSavedPositionMs.current,
        lastSavedAtMs: lastSavedAtMs.current,
        nowMs: Date.now(),
        signedIn,
        final: true,
      })
    ) {
      return
    }
    save(positionMs, durationMs, true, completedFromEnd(true))
  }, [ended, positionMs, durationMs, signedIn, save])

  /**
   * Leaving.
   *
   * The most important save there is — it carries the position somebody
   * actually stopped at, which is the whole feature. Read from refs rather than
   * from the render's values so the handler does not have to be re-registered
   * four times a second, and `pagehide` rather than `beforeunload` because
   * bfcache and mobile Safari do not reliably fire the latter.
   */
  const latest = useRef({ positionMs, durationMs, signedIn })
  latest.current = { positionMs, durationMs, signedIn }

  useEffect(() => {
    const onLeave = () => {
      const now = latest.current
      if (
        !shouldSaveProgress({
          positionMs: now.positionMs,
          durationMs: now.durationMs,
          lastSavedPositionMs: lastSavedPositionMs.current,
          lastSavedAtMs: lastSavedAtMs.current,
          nowMs: Date.now(),
          signedIn: now.signedIn,
          final: true,
        })
      ) {
        return
      }
      save(now.positionMs, now.durationMs, true)
    }
    window.addEventListener("pagehide", onLeave)
    document.addEventListener("visibilitychange", onLeave)
    return () => {
      window.removeEventListener("pagehide", onLeave)
      document.removeEventListener("visibilitychange", onLeave)
      // Unmount is a leave too, and it is the one an in-page navigation to
      // another video takes — neither event above fires for that.
      onLeave()
    }
  }, [save])

  return { resumedAtMs }
}
