"use client"

/**
 * A toggle that answers instantly and admits it when it was wrong.
 *
 * ── Why optimistic at all ─────────────────────────────────────────────────
 * A like that waits for a round trip feels broken on a phone on a train. The
 * heart has to fill on the tap.
 *
 * ── Why the failure has to be VISIBLE ─────────────────────────────────────
 * The tempting version silently reverts. That is worse than not being
 * optimistic: someone taps like, sees it fill, scrolls on, and the post is not
 * liked — they were shown a state that was never true and never told. So a
 * failure here rolls the value back AND surfaces an error the caller must
 * render. `error` is part of the return type rather than an optional callback
 * for exactly that reason: it is hard to ignore by accident.
 *
 * ── Why the server's number wins ──────────────────────────────────────────
 * `POST /v1/posts/{id}/like` answers `{liked, count}`, and that count is the
 * real one — other people have been liking the post too. The optimistic
 * ±1 is a guess made to fill 200ms; when the truth arrives it replaces the
 * guess rather than being reconciled with it.
 *
 * ── A guess that is never corrected is the bug this used to have ──────────
 * Two halves, and only one of them was here.
 *
 * The first is the `count ?? ±1` below. It is the LAST resort and not a
 * design: a handler whose route cannot report a number (the repost DELETE
 * answers 204 with no body at all) should read the authoritative one back and
 * answer with it, which is the zone's business because the zone owns the
 * URLs. See `setRepost` in apps/social/src/feed/api.ts, which now does.
 *
 * The second is that the read-back had nowhere to land. This state was seeded
 * from `initial` ONCE — `useState(initial)` ignores every later prop — so a
 * zone that fetched the true count and wrote it back onto the item was
 * talking to a component that had stopped listening, and the card kept the
 * guess for as long as it stayed mounted. A NEW `initial` is now adopted, on
 * the one condition that nothing is in flight: a value arriving from above
 * mid-request is a render behind the request's own answer, and the answer is
 * the newer truth. This is React's own "adjusting state when a prop changes"
 * — a set during render of this same component, not an effect, so there is no
 * frame where the card shows a number it has already been told is wrong.
 *
 * ── Why it is not a toggle race ───────────────────────────────────────────
 * Tapping like four times quickly must not send four requests whose responses
 * arrive out of order and leave the UI showing whichever landed last. While a
 * request is in flight the control is `pending` and further taps are dropped.
 * Dropping is deliberate rather than queueing: the last thing anyone wants
 * from a double-tap is two round trips whose net effect is nothing.
 */

import { useCallback, useRef, useState } from "react"

export interface ToggleState {
  on: boolean
  count: number
}

/**
 * What a handler must answer with. The server's truth, not a boolean.
 *
 * `count` is optional because some routes cannot report one, NOT because it
 * is optional to know. A handler that omits it leaves the control on an
 * uncorrected local guess for the life of the mount; if the write itself
 * answers no number, read it back and put it here.
 */
export interface ToggleResult {
  on: boolean
  count?: number
}

/** Whether two seeds are the same value — a prop change worth adopting. */
function sameState(a: ToggleState, b: ToggleState): boolean {
  return a.on === b.on && a.count === b.count
}

export interface OptimisticToggle extends ToggleState {
  pending: boolean
  /** Non-null when the last attempt failed. Render it. */
  error: string | null
  toggle: () => void
  dismissError: () => void
}

export function useOptimisticToggle(
  initial: ToggleState,
  perform: (next: boolean) => Promise<ToggleResult>,
  options: { errorMessage?: string } = {}
): OptimisticToggle {
  const [state, setState] = useState<ToggleState>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  // The last seed this control accepted. See "A guess that is never
  // corrected" above: without this, a count the zone read back from the
  // server and wrote onto the item never reaches the number on screen.
  const seed = useRef(initial)
  if (!inFlight.current && !sameState(seed.current, initial)) {
    seed.current = initial
    setState(initial)
  }

  const toggle = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)

    // Captured before the optimistic write so the rollback restores what was
    // actually there, not a value some other render produced.
    let restore: ToggleState = state
    const next = !state.on
    setState((prev) => {
      restore = prev
      return {
        on: next,
        count: Math.max(0, prev.count + (next ? 1 : -1)),
      }
    })

    perform(next)
      .then((result) => {
        const settled = {
          on: result.on,
          // The last resort, and it is exactly that — see the header. A
          // handler that cannot report a count keeps the optimistic one
          // rather than resetting a real number to zero, but it leaves this
          // control holding a guess nothing will correct.
          count: result.count ?? Math.max(0, restore.count + (result.on ? 1 : -1)),
        }
        // The answer becomes the seed too. Otherwise the very next render
        // would see `initial` still differing from it and adopt the stale
        // prop back over the number the server just gave us.
        seed.current = settled
        setState(settled)
      })
      .catch(() => {
        seed.current = restore
        setState(restore)
        setError(options.errorMessage ?? "That did not save. Try again.")
      })
      .finally(() => {
        inFlight.current = false
        setPending(false)
      })
  }, [state, perform, options.errorMessage])

  const dismissError = useCallback(() => setError(null), [])

  return { ...state, pending, error, toggle, dismissError }
}
