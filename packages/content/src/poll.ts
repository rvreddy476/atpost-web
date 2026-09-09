/**
 * A poll's arithmetic, its states, and the sentence a refusal gets.
 *
 * No React, no DOM, no transport — the same boundary `carousel.ts` and
 * `comments.ts` hold, and for the same reason: everything interesting about a
 * poll is a decision about which of five states it is in, and a state machine
 * is worth testing as a table rather than as a screenshot.
 *
 * ── The server contract, verified against the running gateway ─────────────
 * Signed in as momentum.sso.test@example.com, against the one poll in the
 * corpus (post 23e22ab6-a5ff-463c-8361-1af192604067, "Which_color_wins", two
 * options, single-choice, no end date):
 *
 *   GET  /v1/posts/{id}/poll                  200, and works UNAUTHENTICATED
 *        {"data":{"question":"Which_color_wins","allows_multiple":false,
 *                 "options":[{"id":"27c38f13-…","label":"Teal",
 *                             "vote_count":1,"percentage":50}, …],
 *                 "total_votes":2,
 *                 "viewer_votes":["c4adbb00-…"],   // omitted when none
 *                 "has_ended":false}}
 *
 *   POST /v1/posts/{id}/poll/vote  {"option_id":"…"}
 *        200  {"data":{"ok":true}}
 *        401  UNAUTHORIZED     "Invalid user ID"      (not signed in)
 *        400  INVALID_REQUEST  missing / non-uuid option_id
 *        400  VOTE_ERROR       "already voted or invalid option: ERROR:
 *                               duplicate key value violates unique
 *                               constraint \"poll_votes_pkey\" …"
 *        400  VOTE_ERROR       "poll has ended"
 *
 *   GET  /v1/posts/{id}/poll/results          200, a FLAT array
 *        [{"option_id":…,"option_text":…,"vote_count":…}]
 *
 * ── Two things that follow from that, and shape everything below ──────────
 *
 * RESULTS ARE NOT HIDDEN. `GET /poll` answers full counts and percentages to
 * an anonymous caller. So a client that concealed them until you voted would
 * not be protecting anything — it would be a curtain in front of a public
 * document, defeated by one devtools tab, and it would be lying to the person
 * who trusted it. The counts are shown to everybody, always.
 *
 * "ALREADY VOTED" IS NOT A FAILURE. It is `ACTIVE_REPORT_EXISTS` wearing a
 * different code: the server is refusing a request because the state the
 * person wanted is already true. Painting that red teaches people that voting
 * is broken. `isAlreadyVoted` is what lets the zone turn it into a refetch —
 * see `castPollVote` in the social zone's api.ts.
 *
 * ── One server defect found and NOT worked around here ────────────────────
 * `POST /poll/vote` does not enforce `allows_multiple`. `CastPollVote` skips
 * the service-layer check that `POST /v1/posts/{id}/vote` performs and inserts
 * straight against a primary key of (post_id, user_id, option_id) — which
 * stops the SAME option twice and nothing else. Verified live: on this
 * single-choice poll one account voted Teal and then Orange, both 200, and
 * `viewer_votes` came back with two entries. This module is where the client
 * refuses to send the second vote (`canVote` below); it cannot make the server
 * refuse it, and that is written up in the handover rather than patched over.
 */

import type { FeedPoll, FeedPollOption } from "@atpost/types/feed"

/** One option, with everything a row needs and nothing undefined. */
export interface PollRow {
  id: string
  label: string
  votes: number
  /** 0–100, rounded. See `sharePercent`. */
  share: number
  /** Did the viewer choose this one? */
  chosen: boolean
}

/**
 * What the card is allowed to do about this poll.
 *
 *   open      nothing chosen yet, and choosing is possible
 *   voted     the viewer has chosen, and cannot choose again
 *   adding    multiple-choice, already chosen at least one, more available
 *   closed    the poll ended. Nobody may vote, whatever else is true
 *   anonymous nobody is signed in, so the server would answer 401
 *   inert     nothing is wired to send a vote
 *
 * `closed` outranks everything because it is the one condition no state on
 * this machine can change, and `anonymous`/`inert` outrank `open` because a
 * pressable option that is certain to be refused is the dead glyph this card
 * already got rid of once.
 */
export type PollStage = "open" | "voted" | "adding" | "closed" | "anonymous" | "inert"

export function pollStage(
  poll: FeedPoll,
  input: { signedIn: boolean; votable: boolean }
): PollStage {
  if (poll.has_ended) return "closed"
  if (!input.votable) return "inert"
  if (!input.signedIn) return "anonymous"
  const chosen = poll.viewer_votes?.length ?? 0
  if (chosen === 0) return "open"
  // A multiple-choice poll with an option left is still something you can act
  // on; one where every box is ticked is not, and must not look like it is.
  if (poll.allows_multiple && chosen < (poll.options?.length ?? 0)) return "adding"
  return "voted"
}

/** May the viewer press THIS option right now? */
export function canVote(poll: FeedPoll, optionId: string, stage: PollStage): boolean {
  if (stage !== "open" && stage !== "adding") return false
  return !hasVotedFor(poll, optionId)
}

export function hasVotedFor(poll: FeedPoll, optionId: string): boolean {
  return (poll.viewer_votes ?? []).includes(optionId)
}

/**
 * A whole number, and never one that adds up to something a person can argue
 * with.
 *
 * The server sends `percentage` as an unrounded float (50, 66.66666666666666),
 * and it is not used: an optimistic vote has to recompute the shares anyway,
 * and computing them in one place from the counts is the only way the bar
 * under a row cannot disagree with the number printed on it.
 */
export function sharePercent(votes: number, total: number): number {
  if (!Number.isFinite(votes) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((Math.max(0, votes) / total) * 100)
}

/** The rows, in the author's order, with the viewer's choices marked. */
export function pollRows(poll: FeedPoll): PollRow[] {
  const total = poll.total_votes ?? 0
  return (poll.options ?? []).map((option: FeedPollOption) => {
    const votes = option.vote_count ?? 0
    return {
      id: option.id,
      // An option with no label is a server defect, not a reason to render a
      // blank row that cannot be told apart from its neighbour.
      label: option.label || "Untitled option",
      votes,
      share: sharePercent(votes, total),
      chosen: hasVotedFor(poll, option.id),
    }
  })
}

/**
 * The poll as it will be once the server agrees — drawn immediately.
 *
 * The optimistic half of `useOptimisticToggle`'s bargain, and it makes the
 * same promise: this is a GUESS made to fill 200ms, and the server's answer
 * replaces it wholesale rather than being reconciled with it. Other people
 * have been voting too, so the arithmetic below is right about one vote and
 * says nothing about theirs.
 */
export function applyVote(poll: FeedPoll, optionId: string): FeedPoll {
  if (hasVotedFor(poll, optionId)) return poll
  return {
    ...poll,
    total_votes: (poll.total_votes ?? 0) + 1,
    viewer_votes: [...(poll.viewer_votes ?? []), optionId],
    options: (poll.options ?? []).map((option) =>
      option.id === optionId
        ? { ...option, vote_count: (option.vote_count ?? 0) + 1 }
        : option
    ),
  }
}

/** "2 votes", and "1 vote". */
export function voteCountLabel(total: number): string {
  const n = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0
  return `${n} ${n === 1 ? "vote" : "votes"}`
}

/**
 * Is this refusal the server saying the vote is already cast?
 *
 * The message is load-bearing and there is no way around that: `VOTE_ERROR` is
 * the ONE code `POST /poll/vote` uses for every rejection it produces — a
 * duplicate, a closed poll and an option id from another poll all arrive under
 * it — so the code alone cannot tell them apart. What comes back for a
 * duplicate is the raw driver error, `already voted or invalid option: ERROR:
 * duplicate key value violates unique constraint "poll_votes_pkey"
 * (SQLSTATE 23505)`, and 23505 is the part of it that means something.
 *
 * Matching on a message is fragile, so this is deliberately conservative: it
 * must be a `VOTE_ERROR`, and it must carry one of the two duplicate markers.
 * A message that changes shape stops matching and the vote comes back as a
 * plain failure — which is the safe direction to be wrong in, because the
 * alternative is silently swallowing a real error as a success.
 */
export function isAlreadyVoted(
  code: string | undefined,
  status: number | undefined,
  message: string | undefined
): boolean {
  if (status !== 400 || code !== "VOTE_ERROR") return false
  const text = (message ?? "").toLowerCase()
  return text.includes("23505") || text.includes("duplicate key")
}

/**
 * Why a vote was refused, in a sentence.
 *
 * A table, pure, and tested as one — the shape `commentErrorMessage` already
 * has in this package and `feedbackNotice`/`reportNotice` have in the zone. No
 * axios in here: the zone digs the status and the code out of whatever was
 * thrown and passes them in.
 *
 * `already voted` still has a sentence even though the zone turns that case
 * into a refetch rather than an error. It is reachable if a message ever stops
 * matching `isAlreadyVoted`, and a person who sees it should be told the
 * useful thing — their vote is counted — rather than "that did not save".
 */
export function pollErrorMessage(
  code: string | undefined,
  status: number | undefined,
  message: string | undefined
): string {
  if (isAlreadyVoted(code, status, message)) {
    return "You have already voted on this poll."
  }
  const text = (message ?? "").toLowerCase()
  if (text.includes("poll has ended")) return "This poll has closed."
  if (text.includes("poll not found")) return "This poll is no longer here."

  if (status === 401) return "Sign in to vote."
  if (status === 403) return "You cannot vote on this poll."
  if (status === 404 || code === "NOT_FOUND") return "This poll is no longer here."
  if (status === 429) return "That is a lot of votes at once. Try again in a moment."
  // Nothing a person did produces a 400 from this card — the option ids come
  // from the poll itself — so it does not ask them to try again.
  if (code === "INVALID_REQUEST" || code === "INVALID_ID") {
    return "That vote did not count — the app asked for something the poll refuses."
  }
  if (status === undefined) return "No answer from the poll. Your vote was not counted."
  if (status >= 500) return "The poll did not answer. Your vote was not counted."
  return "That vote did not save. Try again."
}
