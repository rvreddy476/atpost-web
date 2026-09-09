"use client"

/**
 * A poll you can actually vote in.
 *
 * ── What was here before ──────────────────────────────────────────────────
 * A read-only summary, with a comment saying voting "belongs in a later pass"
 * and that showing options with no button was the honest thing to do. The
 * intent was right and the result was not: it read `option.text` and
 * `option.votes`, which are not fields the server sends (see the note on
 * `FeedPoll` in @atpost/types), so what a person actually got was a question,
 * two blank rows, 0% on both, and a total underneath that disagreed with them.
 * There was nothing to press and nothing to read. Both halves are fixed here.
 *
 * ── The boundary, unchanged ───────────────────────────────────────────────
 * This package may not import api-client. `onVote` arrives as a prop, it
 * answers with THE SERVER'S poll, and the zone owns every URL — the same
 * arrangement `CommentApi` has, for the same reason: reels, tube and a post
 * detail page have to be able to mount this.
 *
 * ── Optimistic, and visibly wrong when it was wrong ───────────────────────
 * `useOptimisticToggle`'s bargain, applied to a poll rather than a heart, and
 * every clause of it is deliberate:
 *
 *   · the bar moves on the press, because a vote that waits for a round trip
 *     feels broken on a phone on a train;
 *   · the SERVER'S numbers replace the guess when they arrive, because other
 *     people have been voting too and our ±1 was never the whole truth;
 *   · a failure rolls back AND says so. A silent revert is worse than not
 *     being optimistic: it shows somebody a state that was never true and
 *     never tells them;
 *   · while a vote is in flight the next press is DROPPED rather than queued.
 *
 * The one thing that is not modelled as a failure is "you have already voted".
 * That is the server saying the state the person wanted is already true — the
 * same shape as `ACTIVE_REPORT_EXISTS` in the zone's `reportNotice` — and the
 * zone turns it into a refetch, so what the person sees is their vote, marked.
 *
 * ── Results are shown to everyone, always ─────────────────────────────────
 * `GET /v1/posts/{id}/poll` answers full counts to an anonymous caller, so
 * hiding them until you vote would be a curtain in front of a public document.
 * The header of `poll.ts` carries the argument and the verification.
 */

import { useCallback, useRef, useState } from "react"
import { Check } from "lucide-react"
import type { FeedPoll } from "@atpost/types/feed"
import {
  applyVote,
  canVote,
  pollRows,
  pollStage,
  voteCountLabel,
  type PollRow,
} from "./poll"

export interface PostPollProps {
  poll: FeedPoll
  /** Names the group for a screen reader. The post's author, usually. */
  label?: string
  /**
   * Is anybody signed in?
   *
   * Not derived from `viewer_votes`: a viewer who has not voted and a viewer
   * who is not there both send no ids, and the two want completely different
   * cards. Only the zone knows the answer.
   */
  signedIn: boolean
  /**
   * Cast one vote, and answer with the poll AS THE SERVER NOW HAS IT.
   *
   * Returning the poll rather than a bare ok is what makes the counts real:
   * `POST /poll/vote` answers `{"ok":true}` and nothing else, so somebody has
   * to read the totals back, and the zone is where the second request belongs.
   *
   * Absent means no voting — and the options are then not pressable at all,
   * because a control whose handler nobody wired is the dead glyph this card
   * has spent two passes removing.
   */
  onVote?: (optionId: string) => Promise<FeedPoll>
  /** Turns whatever `onVote` rejected with into a sentence. The zone owns transport. */
  errorMessage?: (error: unknown) => string
  /**
   * Print the question inside the box. On by default.
   *
   * Off when the caller has already printed the same sentence — which is the
   * live corpus's only poll, whose post text and poll question are the same
   * string, so the card said "Which_color_wins" twice in a row. The heading is
   * dropped rather than the post's own text: the text is the post's body and
   * belongs to the card, and a poll whose question genuinely differs still
   * gets its heading. Whether they match is the caller's question to answer;
   * this component only ever sees the poll.
   */
  showQuestion?: boolean
}

export function PostPoll({
  poll: incoming,
  label,
  signedIn,
  onVote,
  errorMessage,
  showQuestion = true,
}: PostPollProps) {
  /**
   * The poll this card is drawing, which is the prop until somebody votes.
   *
   * Re-seeded when the PROP changes identity — a refetched feed page, a
   * feedback removal, a fresh cold load — so a vote cast here is not preserved
   * on top of newer data from the server. Adjusting state during render is the
   * documented way to do this and is cheaper than an effect, which would paint
   * the stale poll for one frame first.
   */
  const [poll, setPoll] = useState<FeedPoll>(incoming)
  const seed = useRef(incoming)
  if (seed.current !== incoming) {
    seed.current = incoming
    setPoll(incoming)
  }

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Same guard as `useOptimisticToggle`: a second press mid-flight is dropped. */
  const inFlight = useRef(false)

  const stage = pollStage(poll, { signedIn, votable: Boolean(onVote) })
  const rows = pollRows(poll)
  const total = poll.total_votes ?? 0

  const vote = useCallback(
    (optionId: string) => {
      if (!onVote || inFlight.current) return
      inFlight.current = true
      setPendingId(optionId)
      setError(null)

      // Captured before the optimistic write, so a rollback restores what was
      // actually on screen rather than whatever a later render produced.
      let restore: FeedPoll = poll
      setPoll((prev) => {
        restore = prev
        return applyVote(prev, optionId)
      })

      onVote(optionId)
        .then((truth) => {
          // The server's numbers, wholesale. Other people have been voting.
          setPoll(truth)
        })
        .catch((err: unknown) => {
          setPoll(restore)
          setError(errorMessage?.(err) ?? "That vote did not save. Try again.")
        })
        .finally(() => {
          inFlight.current = false
          setPendingId(null)
        })
    },
    [onVote, errorMessage, poll]
  )

  return (
    <div
      className="space-y-2 rounded-mo border border-mo bg-mo-raised p-3"
      // A group rather than a list of nothing: the question is the label and
      // the options are its contents.
      role="group"
      aria-label={poll.question || (label ? `Poll on ${label}` : "Poll")}
      aria-busy={pendingId !== null}
    >
      {showQuestion && poll.question && (
        <p className="font-semibold text-mo-ink">{poll.question}</p>
      )}

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id}>
            <PollOptionRow
              row={row}
              pressable={canVote(poll, row.id, stage)}
              pending={pendingId === row.id}
              onVote={() => vote(row.id)}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-mo-body">
        {voteCountLabel(total)}
        {/*
          One line of status, and only when it says something the marks and the
          numbers do not. "You voted" is already on screen as a tick, so the
          voted state adds nothing here; the other three are facts a person
          cannot see anywhere else on the card.
        */}
        {stage === "closed" && " · Final results"}
        {stage === "anonymous" && " · Sign in to vote"}
        {stage === "adding" && " · Choose as many as you like"}
      </p>

      {/*
        The visible half of "optimistic". A rollback nobody is told about is a
        lie the interface told and then quietly retracted.

        `role="status"` rather than `alert`, matching the action bar: worth
        hearing, but it must not interrupt what a screen reader is already
        saying about the post.
      */}
      {error && (
        <p role="status" className="text-xs text-mo-bad">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * One option — a button when it can be pressed, and a plain row when it cannot.
 *
 * Two branches rather than a `disabled` button, which is this card's rule
 * everywhere else: a disabled control says "not yet" where the truth is "not
 * here". A closed poll's options are never going to become pressable, and a
 * greyed-out row of them says the opposite.
 *
 * The bar behind the label is `aria-hidden` and the number beside it is not:
 * the width of a rectangle is not information a screen reader can use, and the
 * percentage next to it is the same fact in a form that is.
 */
function PollOptionRow({
  row,
  pressable,
  pending,
  onVote,
}: {
  row: PollRow
  pressable: boolean
  pending: boolean
  onVote: () => void
}) {
  const bar = (
    <div
      aria-hidden="true"
      className={[
        "absolute inset-y-0 left-0 transition-[width] duration-300 ease-mo motion-reduce:transition-none",
        // The viewer's own choice is the cyan the product already uses for
        // "interactive, and yours"; everyone else's share is the same colour
        // at a third of the weight, so the row reads as a share of a whole
        // rather than as two different kinds of thing.
        row.chosen ? "bg-mo-cyan/35" : "bg-mo-cyan/15",
      ].join(" ")}
      style={{ width: `${row.share}%` }}
    />
  )

  const body = (
    <div className="relative flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-mo-ink">
        {row.chosen && (
          <>
            <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-mo-cyan" />
            <span className="sr-only">Your vote. </span>
          </>
        )}
        <span className="truncate">{row.label}</span>
      </span>
      <span className="shrink-0 tabular-nums text-mo-body">
        <span className="text-mo-ink">{row.share}%</span>{" "}
        <span className="text-xs">{voteCountLabel(row.votes)}</span>
      </span>
    </div>
  )

  if (!pressable) {
    return (
      <div className="relative overflow-hidden rounded-mo-sm bg-mo-sunken">
        {bar}
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onVote}
      className={[
        "relative block w-full overflow-hidden rounded-mo-sm bg-mo-sunken text-left",
        // Tailwind 3's preflight leaves a `<button>` on the arrow cursor, which
        // is the whole affordance question in one property: a row that looks
        // like a result and behaves like a result under the pointer is a row
        // nobody presses. This is the same explicit `cursor-pointer` the
        // player's scrubber and the ui package's controls carry.
        "cursor-pointer",
        "transition-colors duration-150 ease-mo motion-reduce:transition-none",
        // A hairline that only appears under the cursor: the row already has a
        // filled bar behind it, so a hover background would fight the share it
        // is drawing. A ring says "this is pressable" without repainting it.
        "ring-1 ring-inset ring-transparent hover:ring-mo",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo",
        pending ? "opacity-70" : "",
      ].join(" ")}
    >
      {bar}
      {body}
    </button>
  )
}
