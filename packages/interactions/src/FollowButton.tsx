"use client"

/**
 * Follow, and the state nobody remembers to design for.
 *
 * `POST /v1/graph/follow` answers `{"status":"followed"}` OR
 * `{"status":"requested"}` — a private account turns a follow into a request
 * that a person has to accept. A button that renders "Following" on a
 * `requested` is telling someone they are seeing posts they will not see.
 * So there are three states here, not two.
 *
 * No network, same as the rest of this package: the caller supplies a handler
 * that returns which of the three happened.
 */

import { useCallback, useState } from "react"

export type FollowState = "none" | "following" | "requested"

export interface FollowButtonProps {
  state: FollowState
  displayName?: string
  /** Resolves to the state the server says is now true. */
  onToggle: (next: "follow" | "unfollow") => Promise<FollowState>
  /**
   * The three words, when "Follow" is the wrong one for the surface.
   *
   * ── Why this is a prop and not a second component ─────────────────────
   * Momentum Tube calls this act SUBSCRIBING. That is the founder's word,
   * it is the word on the channel page's own count ("1.2K subscribers"),
   * and a control saying "Follow" directly under it would be two names for
   * one thing on one screen. The EDGE is identical — there is no
   * subscription route on this gateway, `POST /v1/graph/follow` is what
   * both surfaces call, verified — so what differs is vocabulary and
   * nothing else.
   *
   * Copying this component into apps/tube to change three strings would be
   * a second implementation of the optimistic update, the rollback and the
   * three-state rule above, and a second place for them to drift. So the
   * words are a parameter and the behaviour is not.
   *
   * Omit it and the labels are the product's default, which is what
   * apps/social and apps/reels pass by not passing anything.
   */
  labels?: Partial<Record<FollowState, string>>
  className?: string
}

const LABEL: Record<FollowState, string> = {
  none: "Follow",
  following: "Following",
  requested: "Requested",
}

export function FollowButton({
  state,
  displayName,
  onToggle,
  labels,
  className,
}: FollowButtonProps) {
  const words: Record<FollowState, string> = { ...LABEL, ...labels }
  const [current, setCurrent] = useState<FollowState>(state)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const click = useCallback(() => {
    if (pending) return
    setPending(true)
    setFailed(false)
    const previous = current
    const next = current === "none" ? "follow" : "unfollow"
    // Optimistic, but never optimistic about WHICH of the two outcomes a
    // follow produced — "requested" is only ever set from the server's answer,
    // because guessing it wrong in either direction misinforms.
    setCurrent(next === "follow" ? "following" : "none")

    onToggle(next)
      .then(setCurrent)
      .catch(() => {
        setCurrent(previous)
        setFailed(true)
      })
      .finally(() => setPending(false))
  }, [current, pending, onToggle])

  const active = current !== "none"

  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      aria-pressed={active}
      aria-label={
        displayName ? `${words[current]} ${displayName}` : words[current]
      }
      className={[
        "rounded-mo-pill border px-3 py-1 text-sm font-semibold transition-colors duration-150 ease-mo",
        active
          ? // Following is a settled state, not an invitation. It recedes.
            "border-mo text-mo-body hover:bg-mo-raised"
          : // Cyan is the interactive colour, and this is small text — the one
            // accent in the palette that survives small text on a card (6.75).
            "border-mo-strong text-mo-cyan hover:bg-mo-raised",
        failed ? "border-mo-bad" : "",
        className ?? "",
      ].join(" ")}
    >
      {failed ? "Try again" : words[current]}
    </button>
  )
}
