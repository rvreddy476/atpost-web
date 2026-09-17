"use client"

import { useRef, useState } from "react"
import { ArrowBigDown, ArrowBigUp } from "lucide-react"
import { applyVote, nextVote, type VoteState } from "@/qa/votes"
import type { QAVoteType } from "@/qa/wire"

export interface VoteControlProps {
  initial: VoteState
  /** Tell the server. `null` clears the vote. Rejects on failure. */
  perform: (next: QAVoteType | null) => Promise<void>
  /** Called with the thrown error after the optimistic change is rolled back. */
  onError: (error: unknown) => void
  signedIn: boolean
  signInHref: string
  /** "question" or "answer", for the accessible labels. */
  subject: string
}

/**
 * Up / score / down. The press moves the count at once and rolls back — with
 * a reason, via `onError` — if the server refuses (CANNOT_VOTE_OWN on your
 * own post, a 401, a network failure). Signed out, the arrows are links to
 * sign-in rather than buttons that fail.
 */
export function VoteControl({ initial, perform, onError, signedIn, signInHref, subject }: VoteControlProps) {
  const [state, setState] = useState<VoteState>(initial)
  const inFlight = useRef(false)

  const press = (pressed: QAVoteType) => {
    if (inFlight.current) return
    inFlight.current = true
    const before = state
    setState(applyVote(before, pressed))
    perform(nextVote(before.viewerVote, pressed))
      .catch((error: unknown) => {
        setState(before)
        onError(error)
      })
      .finally(() => {
        inFlight.current = false
      })
  }

  return <VoteView state={state} onPress={signedIn ? press : undefined} signInHref={signInHref} subject={subject} />
}

/** The pure view, rendered by tests with renderToStaticMarkup. */
export function VoteView({
  state,
  onPress,
  signInHref,
  subject,
}: {
  state: VoteState
  onPress?: (pressed: QAVoteType) => void
  signInHref: string
  subject: string
}) {
  const base =
    "inline-flex h-9 w-9 items-center justify-center rounded-mo-pill transition-colors duration-150 ease-mo hover:bg-mo-raised"
  const up = state.viewerVote === "up"
  const down = state.viewerVote === "down"

  return (
    <div className="inline-flex items-center gap-0.5 rounded-mo-pill border border-mo bg-mo-sunken px-1" role="group" aria-label={`Vote on this ${subject}`}>
      {onPress ? (
        <button type="button" aria-pressed={up} aria-label={`Upvote ${subject}`} onClick={() => onPress("up")} className={`${base} ${up ? "text-mo-cyan" : "text-mo-body"}`}>
          <ArrowBigUp aria-hidden="true" className="h-5 w-5" fill={up ? "currentColor" : "none"} />
        </button>
      ) : (
        <a href={signInHref} aria-label={`Sign in to upvote ${subject}`} className={`${base} text-mo-body`}>
          <ArrowBigUp aria-hidden="true" className="h-5 w-5" />
        </a>
      )}
      <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums text-mo-ink" aria-live="polite" aria-label={`Score ${state.score}`}>
        {state.score}
      </span>
      {onPress ? (
        <button type="button" aria-pressed={down} aria-label={`Downvote ${subject}`} onClick={() => onPress("down")} className={`${base} ${down ? "text-mo-purple" : "text-mo-body"}`}>
          <ArrowBigDown aria-hidden="true" className="h-5 w-5" fill={down ? "currentColor" : "none"} />
        </button>
      ) : (
        <a href={signInHref} aria-label={`Sign in to downvote ${subject}`} className={`${base} text-mo-body`}>
          <ArrowBigDown aria-hidden="true" className="h-5 w-5" />
        </a>
      )}
    </div>
  )
}
