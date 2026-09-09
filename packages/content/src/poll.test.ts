import { describe, expect, it } from "vitest"
import type { FeedPoll } from "@atpost/types/feed"
import {
  applyVote,
  canVote,
  hasVotedFor,
  isAlreadyVoted,
  pollErrorMessage,
  pollRows,
  pollStage,
  sharePercent,
  voteCountLabel,
} from "./poll"

/**
 * The poll below is the real one — the only poll in a corpus of 484 posts —
 * copied from what the live gateway answered for
 * `GET /v1/posts/23e22ab6-a5ff-463c-8361-1af192604067/poll`, signed in as the
 * test account after it had voted Orange. The ids are the real ids, and the
 * shape is the shape: `label`, `vote_count`, `viewer_votes`, `has_ended`.
 */
const TEAL = "27c38f13-13bb-4647-a3a9-d4d8e644860a"
const ORANGE = "c4adbb00-e73c-47f6-b865-12b4d416e4ea"

const LIVE: FeedPoll = {
  question: "Which_color_wins",
  allows_multiple: false,
  options: [
    { id: TEAL, label: "Teal", vote_count: 1, percentage: 50 },
    { id: ORANGE, label: "Orange", vote_count: 1, percentage: 50 },
  ],
  total_votes: 2,
  viewer_votes: [ORANGE],
  has_ended: false,
}

/** The same poll as it arrives for somebody who has not voted. */
const UNVOTED: FeedPoll = {
  ...LIVE,
  options: [
    { id: TEAL, label: "Teal", vote_count: 1, percentage: 100 },
    { id: ORANGE, label: "Orange", vote_count: 0, percentage: 0 },
  ],
  total_votes: 1,
  viewer_votes: undefined,
}

const WIRED = { signedIn: true, votable: true }

describe("pollStage", () => {
  it("is open when somebody signed in has not chosen anything yet", () => {
    expect(pollStage(UNVOTED, WIRED)).toBe("open")
  })

  it("is voted once a single-choice poll has an answer", () => {
    expect(pollStage(LIVE, WIRED)).toBe("voted")
  })

  it("lets a multiple-choice poll keep taking answers until they run out", () => {
    const multi = { ...LIVE, allows_multiple: true }
    expect(pollStage(multi, WIRED)).toBe("adding")
    expect(pollStage({ ...multi, viewer_votes: [TEAL, ORANGE] }, WIRED)).toBe("voted")
  })

  it("puts closed above everything, because nothing here can undo it", () => {
    const ended = { ...UNVOTED, has_ended: true }
    expect(pollStage(ended, WIRED)).toBe("closed")
    // Even for somebody who has not voted and could otherwise.
    expect(pollStage({ ...ended, allows_multiple: true }, WIRED)).toBe("closed")
  })

  it("distinguishes nobody-signed-in from nothing-wired", () => {
    expect(pollStage(UNVOTED, { signedIn: false, votable: true })).toBe("anonymous")
    expect(pollStage(UNVOTED, { signedIn: true, votable: false })).toBe("inert")
    // Nothing wired wins: a signed-out person on a surface that cannot vote
    // should not be invited to sign in for a control that does not exist.
    expect(pollStage(UNVOTED, { signedIn: false, votable: false })).toBe("inert")
  })
})

describe("canVote", () => {
  it("offers every option to somebody who has not voted", () => {
    const stage = pollStage(UNVOTED, WIRED)
    expect(canVote(UNVOTED, TEAL, stage)).toBe(true)
    expect(canVote(UNVOTED, ORANGE, stage)).toBe(true)
  })

  /**
   * The one the SERVER gets wrong. `POST /poll/vote` accepts a second option
   * on a single-choice poll — verified live, both 200, `viewer_votes` came
   * back with two entries — because it only has a primary key to stop it. The
   * client refuses to send it.
   */
  it("offers nothing more once a single-choice poll has been answered", () => {
    const stage = pollStage(LIVE, WIRED)
    expect(canVote(LIVE, TEAL, stage)).toBe(false)
    expect(canVote(LIVE, ORANGE, stage)).toBe(false)
  })

  it("offers the untaken options of a multiple-choice poll and not the taken ones", () => {
    const multi = { ...LIVE, allows_multiple: true }
    const stage = pollStage(multi, WIRED)
    expect(canVote(multi, TEAL, stage)).toBe(true)
    expect(canVote(multi, ORANGE, stage)).toBe(false)
  })

  it("offers nothing at all when the poll is closed, signed out, or unwired", () => {
    for (const input of [
      { poll: { ...UNVOTED, has_ended: true }, ctx: WIRED },
      { poll: UNVOTED, ctx: { signedIn: false, votable: true } },
      { poll: UNVOTED, ctx: { signedIn: true, votable: false } },
    ]) {
      expect(canVote(input.poll, TEAL, pollStage(input.poll, input.ctx))).toBe(false)
    }
  })
})

describe("hasVotedFor", () => {
  it("reads the array the server sends, and copes with it being absent", () => {
    expect(hasVotedFor(LIVE, ORANGE)).toBe(true)
    expect(hasVotedFor(LIVE, TEAL)).toBe(false)
    expect(hasVotedFor(UNVOTED, ORANGE)).toBe(false)
  })
})

describe("sharePercent", () => {
  it("rounds to a whole number a person can read", () => {
    expect(sharePercent(1, 3)).toBe(33)
    expect(sharePercent(2, 3)).toBe(67)
    expect(sharePercent(1, 2)).toBe(50)
  })

  it("is zero rather than NaN before anybody has voted", () => {
    // A bar of width NaN% is a bar of no width and no error, which is how a
    // poll ends up looking broken with nothing in the console.
    expect(sharePercent(0, 0)).toBe(0)
    expect(sharePercent(3, 0)).toBe(0)
  })

  it("survives the numbers a server should never send", () => {
    expect(sharePercent(Number.NaN, 10)).toBe(0)
    expect(sharePercent(5, Number.POSITIVE_INFINITY)).toBe(0)
    expect(sharePercent(-4, 10)).toBe(0)
  })
})

describe("pollRows", () => {
  it("keeps the author's order and marks the viewer's own choice", () => {
    const rows = pollRows(LIVE)
    expect(rows.map((r) => r.label)).toEqual(["Teal", "Orange"])
    expect(rows.map((r) => r.chosen)).toEqual([false, true])
    expect(rows.map((r) => r.share)).toEqual([50, 50])
    expect(rows.map((r) => r.votes)).toEqual([1, 1])
  })

  /**
   * The bug the whole poll pass exists for. The card used to read
   * `option.text` and `option.votes`, which the server does not send, so every
   * row rendered blank at 0% — "I'm not able to get anything on it".
   */
  it("reads label and vote_count, which are the names on the wire", () => {
    const rows = pollRows({
      options: [{ id: "a", label: "Teal", vote_count: 3 }],
      total_votes: 4,
    })
    expect(rows[0].label).toBe("Teal")
    expect(rows[0].votes).toBe(3)
    expect(rows[0].share).toBe(75)
  })

  it("never renders a row a person cannot tell from its neighbour", () => {
    const rows = pollRows({ options: [{ id: "a" }, { id: "b" }], total_votes: 0 })
    expect(rows.map((r) => r.label)).toEqual(["Untitled option", "Untitled option"])
  })

  it("is an empty list, not a crash, for a poll with no options at all", () => {
    expect(pollRows({})).toEqual([])
  })
})

describe("applyVote", () => {
  it("moves the bar on the press, and moves only the one that was pressed", () => {
    const next = applyVote(UNVOTED, ORANGE)
    expect(next.total_votes).toBe(2)
    expect(next.viewer_votes).toEqual([ORANGE])
    expect(next.options?.map((o) => o.vote_count)).toEqual([1, 1])
    expect(pollRows(next).map((r) => r.share)).toEqual([50, 50])
  })

  it("does not mutate the poll it was given", () => {
    applyVote(UNVOTED, ORANGE)
    expect(UNVOTED.total_votes).toBe(1)
    expect(UNVOTED.viewer_votes).toBeUndefined()
    expect(UNVOTED.options?.[1].vote_count).toBe(0)
  })

  it("adds a second choice on a multiple-choice poll", () => {
    const multi = { ...LIVE, allows_multiple: true }
    const next = applyVote(multi, TEAL)
    expect(next.viewer_votes).toEqual([ORANGE, TEAL])
    expect(next.total_votes).toBe(3)
  })

  it("is a no-op for an option already chosen, so a double press cannot count twice", () => {
    expect(applyVote(LIVE, ORANGE)).toBe(LIVE)
  })
})

describe("voteCountLabel", () => {
  it("counts in English", () => {
    expect(voteCountLabel(0)).toBe("0 votes")
    expect(voteCountLabel(1)).toBe("1 vote")
    expect(voteCountLabel(2)).toBe("2 votes")
  })

  it("does not print a fraction or a negative number of votes", () => {
    expect(voteCountLabel(Number.NaN)).toBe("0 votes")
    expect(voteCountLabel(-3)).toBe("0 votes")
  })
})

/**
 * The strings below are verbatim from the live gateway. The duplicate one in
 * particular is the raw pgx error the handler passes through, and it is the
 * only thing separating "your vote is already counted" from a real failure.
 */
const DUPLICATE =
  'already voted or invalid option: ERROR: duplicate key value violates unique constraint "poll_votes_pkey" (SQLSTATE 23505)'

describe("isAlreadyVoted", () => {
  it("recognises the duplicate the server actually sends", () => {
    expect(isAlreadyVoted("VOTE_ERROR", 400, DUPLICATE)).toBe(true)
  })

  it("does not claim success for the other things VOTE_ERROR covers", () => {
    // One code for every rejection this route has, which is why the message
    // has to be read at all.
    expect(isAlreadyVoted("VOTE_ERROR", 400, "poll has ended")).toBe(false)
    expect(isAlreadyVoted("VOTE_ERROR", 400, "poll not found: no rows in result set")).toBe(false)
  })

  it("refuses to guess from a message with no code or the wrong status", () => {
    expect(isAlreadyVoted(undefined, 400, DUPLICATE)).toBe(false)
    expect(isAlreadyVoted("VOTE_ERROR", 500, DUPLICATE)).toBe(false)
    expect(isAlreadyVoted("VOTE_ERROR", 400, undefined)).toBe(false)
  })

  it("fails towards showing an error rather than swallowing one", () => {
    // A reworded message stops matching, and a real failure is then surfaced
    // instead of being silently treated as a vote that landed.
    expect(isAlreadyVoted("VOTE_ERROR", 400, "you have already answered")).toBe(false)
  })
})

describe("pollErrorMessage", () => {
  it("tells somebody their vote is counted rather than that it failed", () => {
    expect(pollErrorMessage("VOTE_ERROR", 400, DUPLICATE)).toBe(
      "You have already voted on this poll."
    )
  })

  it("names the two other things this route refuses", () => {
    expect(pollErrorMessage("VOTE_ERROR", 400, "poll has ended")).toBe("This poll has closed.")
    expect(pollErrorMessage("VOTE_ERROR", 400, "poll not found: x")).toBe(
      "This poll is no longer here."
    )
  })

  it("asks an anonymous voter to sign in", () => {
    expect(pollErrorMessage("UNAUTHORIZED", 401, "Invalid user ID")).toBe("Sign in to vote.")
  })

  it("does not tell somebody to retry a request only the app can fix", () => {
    const text = pollErrorMessage("INVALID_REQUEST", 400, "invalid UUID length: 4")
    expect(text).toContain("the poll refuses")
    expect(text).not.toContain("Try again")
  })

  it("separates a dead network from a server that answered badly", () => {
    expect(pollErrorMessage(undefined, undefined, undefined)).toBe(
      "No answer from the poll. Your vote was not counted."
    )
    expect(pollErrorMessage("INTERNAL_ERROR", 500, "boom")).toBe(
      "The poll did not answer. Your vote was not counted."
    )
  })

  it("says not-yet rather than never for a rate limit", () => {
    expect(pollErrorMessage("RATE_LIMITED", 429, "slow down")).toContain("in a moment")
  })

  it("always says something, even for a status nothing predicted", () => {
    expect(pollErrorMessage(undefined, 418, undefined)).toBe("That vote did not save. Try again.")
  })
})
