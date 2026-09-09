/**
 * What a failed request actually was, and the sentence a person gets for it.
 *
 * ── Why this is a file and not four `catch` blocks ────────────────────────
 * Three of the routes wired into the feed fail in ways that mean genuinely
 * different things, and the tempting shape — one `catch`, one "Something went
 * wrong" — is wrong in all three:
 *
 *   · `403 COMMENTS_DISABLED` is not a fault. The author switched comments
 *     off. "Try again" is advice that cannot work.
 *   · `429 RATE_LIMITED` is "not yet", not "never" and not "again now".
 *   · `409 ACTIVE_REPORT_EXISTS` is closer to SUCCESS than to failure. The
 *     person wanted the post reported; it is reported. Painting that red
 *     teaches people that reporting is broken, and the next thing they do is
 *     report it again.
 *
 * So the classification is a table, it is pure, and it is tested as a table —
 * the same shape `commentErrorMessage` already has in @momentum/content, and
 * for the same reason: no transport, no axios, no React, so the interesting
 * half can be checked without a browser or a network.
 *
 * ── Every status here was observed, not assumed ───────────────────────────
 * Against the running gateway with the test account:
 *
 *   POST /v1/feed/feedback  {post_id, author_id, signal}  -> 400 INVALID_REQUEST
 *                           {signal} alone                -> 400 INVALID_REQUEST
 *                           {post_id, "not_interested"}   -> 200
 *                           {post_id, "interested"}       -> 200  (undoes it)
 *   POST /v1/reports        first time                    -> 200, NOT 201
 *                           same post again               -> 409 ACTIVE_REPORT_EXISTS
 *                           an unknown reason             -> 500 INTERNAL_ERROR
 *
 * The last of those is a server defect — an unrecognised category is a client
 * error and answers 500 — and it is unreachable from here because the reasons
 * come from `REPORT_REASONS`, which is the server's own allowlist. It is in
 * the report rather than worked around.
 */

/** What a rejected request says about itself, however it was rejected. */
export interface Failure {
  /** Absent when the request never got an answer — offline, or a dead proxy. */
  status?: number
  /** `error.code` from the gateway envelope, when there was one. */
  code?: string
  /**
   * `error.message` from the envelope, and it is normally NOT worth reading:
   * a code is a contract and a message is prose that can change on any deploy.
   *
   * It is carried because one route leaves no alternative. Poll voting answers
   * every rejection it has under a single `VOTE_ERROR` — a duplicate, a closed
   * poll and an option id from somewhere else all arrive under it — so the
   * only thing separating "you already voted", which is good news, from a real
   * failure is the text. `isAlreadyVoted` in @momentum/content is where that
   * is decided, conservatively and in one place.
   */
  message?: string
}

/**
 * Dig the status and the code out of whatever axios threw.
 *
 * Written against the envelope rather than against axios's own types so that
 * a rejection from anywhere — a mock, a fetch wrapper, a thrown string — is
 * handled instead of crashing the handler that was trying to report it.
 */
export function failureOf(error: unknown): Failure {
  const e = error as
    | { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } }
    | undefined
  return {
    status: e?.response?.status,
    code: e?.response?.data?.error?.code,
    message: e?.response?.data?.error?.message,
  }
}

/**
 * One line of feedback for the person, and whether it is bad news.
 *
 * `tone` is not styling for its own sake: it decides whether the pill reads as
 * a confirmation or as a problem, and the whole point of the 409 case is that
 * it is a confirmation.
 */
export interface Notice {
  tone: "good" | "bad"
  text: string
}

export type FeedbackSignal = "interested" | "not_interested"
export type FeedbackTarget = "post" | "author"

/**
 * The answer to "Interested" / "Not interested" / "Don't recommend this
 * account", said back in the words of what actually changed.
 *
 * The confirmations are specific because the three rows do visibly different
 * things: one post goes, or every post by an account goes, or nothing goes and
 * the ranker is told to lean the other way. "Thanks for the feedback" would
 * cover all three and inform nobody.
 */
export function feedbackNotice(
  signal: FeedbackSignal,
  target: FeedbackTarget,
  failure?: Failure
): Notice {
  if (!failure) {
    if (target === "author") {
      return {
        tone: "good",
        text:
          signal === "not_interested"
            ? "You won't be recommended this account."
            : "This account can be recommended again.",
      }
    }
    return {
      tone: "good",
      text:
        signal === "not_interested"
          ? "You'll see fewer posts like this."
          : "You'll see more posts like this.",
    }
  }

  const { status, code } = failure
  if (status === 401) return { tone: "bad", text: "Sign in to change what you see." }
  if (status === 404 || code === "NOT_FOUND") {
    return { tone: "bad", text: "That post is no longer here, so there was nothing to answer." }
  }
  if (status === 429) {
    return { tone: "bad", text: "That is a lot of feedback at once. Try again in a moment." }
  }
  // A 400 on this route is one of ours: both ids, neither id, or a signal the
  // endpoint does not take. Nothing the person did can cause it and nothing
  // they can do will fix it, so it does not ask them to try again.
  if (status === 400 || code === "INVALID_REQUEST") {
    return { tone: "bad", text: "That did not record — the app asked for something the feed refuses." }
  }
  if (status === undefined) {
    return { tone: "bad", text: "No answer from the feed. Nothing was recorded." }
  }
  return { tone: "bad", text: "The feed did not take that. It may be a moment before it does." }
}

/**
 * The answer to a filed report.
 *
 * The 409 is the case this function exists for. `ACTIVE_REPORT_EXISTS` means
 * an open report by this person against this post is already in the queue —
 * which is exactly the state they were trying to reach. It is `good`, and it
 * says the report is still open so that nobody files a third one.
 */
export function reportNotice(failure?: Failure): Notice {
  if (!failure) return { tone: "good", text: "Thanks — this is with moderation now." }

  const { status, code } = failure
  if (code === "ACTIVE_REPORT_EXISTS" || status === 409) {
    return { tone: "good", text: "You have already reported this. It is still with moderation." }
  }
  if (status === 401) return { tone: "bad", text: "Sign in to report this post." }
  if (status === 404) return { tone: "bad", text: "That post is no longer here to report." }
  if (status === 429) {
    return { tone: "bad", text: "That is a lot of reports at once. Try again in a moment." }
  }
  if (status === undefined) {
    return { tone: "bad", text: "No answer from moderation. Nothing was filed." }
  }
  // Everything else, 400 and 500 alike, has one thing in common that the
  // person needs to know and one thing they do not: nothing was filed, and
  // whose fault it was.
  return { tone: "bad", text: "That report did not file. Nothing was sent — try again." }
}
