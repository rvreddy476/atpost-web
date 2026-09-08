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

/** What a handler must answer with. The server's truth, not a boolean. */
export interface ToggleResult {
  on: boolean
  count?: number
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
        setState({
          on: result.on,
          // A handler that cannot report a count (a plain 204) keeps the
          // optimistic one rather than resetting it to zero.
          count: result.count ?? Math.max(0, restore.count + (result.on ? 1 : -1)),
        })
      })
      .catch(() => {
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
