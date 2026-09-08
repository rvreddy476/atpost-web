/**
 * What the overflow menu contains, as data — no React, no DOM, no JSX.
 *
 * The menu is the one surface on a card where "what is on it" is a question
 * with a dozen answers and every wrong one is a promise the product cannot
 * keep: a Report row that files nothing, an Unfollow on your own post, a Copy
 * link that copies a URL to a page that does not exist. So the rows are
 * computed here, from the post and from which handlers the zone actually
 * supplied, and tested as a list rather than as a screenshot.
 *
 * ── Transcribed from the phone, not invented ──────────────────────────────
 * The row set, the grouping and the order are `UsPostMoreState.kt`'s
 * `rowGroups()` (core/ui, Android). Three groups for someone else's post —
 * save/link/share, then the ranking signals, then the graph and the report —
 * one group plus a red Delete for your own. Labels are the phone's, verbatim.
 *
 * ── The rule inherited from PostCard: absent, not disabled ────────────────
 * A control the server will refuse is not rendered. `no_comments` and
 * `hide_share` are permissions — posting to a `no_comments` post is a 403
 * COMMENTS_DISABLED — and a disabled button says "not yet" where the truth is
 * "not here". The phone's reels rail reaches the same conclusion in
 * `railVisibility()` and for the same reason: on a picture, a greyed glyph
 * reads as broken where an absent one reads as a choice.
 *
 * That rule is extended here to HANDLERS. A row whose action the zone did not
 * wire is not shown either, because a menu item that does nothing is the same
 * broken promise as one the server will reject — it just fails later.
 */

/* ── Reporting ───────────────────────────────────────────────────────────── */

/**
 * The reasons `POST /v1/reports` accepts, with the phone's own wording.
 *
 * The values are trust-safety-service's canonical set
 * (`validReportCategories`, internal/service/moderation.go). The service also
 * accepts four legacy aliases — `hate_speech`, `violence`, `nudity`,
 * `false_info` — and rewrites them; a new client sends the canonical value and
 * those aliases appear nowhere here.
 *
 * `child_safety` is the one row the Android sheet does NOT have, and it is
 * included deliberately. It is a category the server keeps and routes, and a
 * report menu with no way to say it is a safety gap rather than a difference
 * of styling. Flagged in the handover so the phone can catch up rather than
 * the web quietly diverging.
 */
export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "sexual_content", label: "Nudity or sexual content" },
  { value: "violence_threat", label: "Violence" },
  { value: "hate_abuse", label: "Hate speech" },
  { value: "misinformation", label: "False information" },
  { value: "scam_fraud", label: "Scam or fraud" },
  { value: "impersonation", label: "Impersonation" },
  { value: "self_harm", label: "Self-harm" },
  { value: "child_safety", label: "Child safety" },
  { value: "intellectual_property", label: "Intellectual property" },
  { value: "other", label: "Other" },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]["value"]

/** Only "Other" asks for words, exactly as the phone's sheet does. */
export function reportNeedsDetails(reason: ReportReason): boolean {
  return reason === "other"
}

/**
 * A report reason, expressed in the analytics contract's vocabulary.
 *
 * The two enums are not the same list and were never going to be: the report
 * categories are a moderation taxonomy the trust-and-safety queue routes on,
 * and `NegativeReason` is a ranking signal. Five overlap. The rest are passed
 * through as their canonical string, which the ingest endpoint stores as
 * "unspecified" — see the note on `NegativeReason` in @momentum/analytics.
 * That is deliberately preferred to dropping the event: a report is a strong
 * negative signal whatever its category, and the category is on the report
 * row anyway.
 */
export function analyticsReasonFor(reason: ReportReason): string {
  switch (reason) {
    case "spam":
      return "spam"
    case "sexual_content":
      return "nudity"
    case "violence_threat":
      return "violence"
    case "hate_abuse":
      return "hate"
    case "misinformation":
      return "misinformation"
    default:
      return reason
  }
}

/* ── The rows ────────────────────────────────────────────────────────────── */

export type PostMenuRowId =
  | "why"
  | "save"
  | "copy-link"
  | "share"
  | "interested"
  | "not-interested"
  | "mute-author"
  | "report"

export interface PostMenuRow {
  id: PostMenuRowId
  label: string
  /** Rendered in `--mo-bad`, and always last in its group. */
  destructive?: boolean
}

/**
 * Everything the menu needs to know, flattened so this stays testable.
 *
 * `isOwn` is separate from "we do not know whose post this is". The feed item
 * carries `author_id` but the zone is the only thing that knows the viewer, so
 * an unwired `isOwn` is `false` and the menu shows the stranger's rows — which
 * is the safe direction to be wrong in: offering Report on your own post is
 * mildly silly, offering Delete on someone else's is a bug with consequences.
 */
export interface PostMenuInput {
  isOwn: boolean
  hideShare: boolean
  /** `reason_text` — the server's own sentence, never one we compose. */
  hasReason: boolean
  /** Which actions the zone actually wired. See the header. */
  can: {
    save?: boolean
    copyLink?: boolean
    share?: boolean
    feedback?: boolean
    report?: boolean
  }
}

/**
 * The groups, in order, with the empty ones dropped.
 *
 * Returned as groups rather than a flat list because the dividers are load-
 * bearing: "Not interested" and "Report" doing visibly different kinds of
 * thing is what stops somebody reaching for the second when they meant the
 * first.
 */
export function postMenuGroups(input: PostMenuInput): PostMenuRow[][] {
  const { can } = input

  const first: PostMenuRow[] = []
  if (input.hasReason) first.push({ id: "why", label: "Why you're seeing this post" })
  if (can.save) first.push({ id: "save", label: "Save" })
  if (can.copyLink) first.push({ id: "copy-link", label: "Copy link" })
  // The author's switch, honoured here as well as on the action bar — a Share
  // row on a `hide_share` post would be the same offer the bar refused to make.
  if (can.share && !input.hideShare) first.push({ id: "share", label: "Share" })

  // Your own post is not a thing you tell the ranker you are not interested
  // in, and not a thing you report. The phone stops here too.
  if (input.isOwn) return [first].filter((group) => group.length > 0)

  const second: PostMenuRow[] = []
  if (can.feedback) {
    second.push({ id: "interested", label: "Interested" })
    second.push({ id: "not-interested", label: "Not interested" })
    second.push({ id: "mute-author", label: "Don't recommend this account" })
  }

  const third: PostMenuRow[] = []
  if (can.report) third.push({ id: "report", label: "Report", destructive: true })

  return [first, second, third].filter((group) => group.length > 0)
}

/**
 * The label the Save row shows.
 *
 * A separate function because the row's identity does not change with the
 * state — the menu is rebuilt on every open and a caller that swapped the id
 * would break keyboard focus restoration for no gain.
 */
export function saveLabel(isSaved: boolean): string {
  return isSaved ? "Unsave" : "Save"
}
