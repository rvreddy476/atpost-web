/**
 * Optimistic vote arithmetic. Pure, so every transition is a table test.
 *
 * Pressing the direction you already voted clears the vote — a DELETE, not a
 * second POST (the server stores one row per user and target, so re-POSTing
 * the same direction is a no-op the reader sees as a stuck button).
 */
import type { QAVoteType } from "./wire"

export interface VoteState {
  viewerVote: QAVoteType | null
  score: number
  up: number
  down: number
}

/** What the server should be told when `pressed` is clicked from `current`. `null` = clear. */
export function nextVote(current: QAVoteType | null, pressed: QAVoteType): QAVoteType | null {
  return current === pressed ? null : pressed
}

export function applyVote(state: VoteState, pressed: QAVoteType): VoteState {
  const next = nextVote(state.viewerVote, pressed)
  let { up, down } = state
  if (state.viewerVote === "up") up -= 1
  if (state.viewerVote === "down") down -= 1
  if (next === "up") up += 1
  if (next === "down") down += 1
  const weight = (v: QAVoteType | null) => (v === "up" ? 1 : v === "down" ? -1 : 0)
  return {
    viewerVote: next,
    score: state.score - weight(state.viewerVote) + weight(next),
    up: Math.max(0, up),
    down: Math.max(0, down),
  }
}

export function voteStateOf(row: {
  viewer_vote: QAVoteType | null
  vote_score: number
  upvote_count: number
  downvote_count: number
}): VoteState {
  return { viewerVote: row.viewer_vote, score: row.vote_score, up: row.upvote_count, down: row.downvote_count }
}
