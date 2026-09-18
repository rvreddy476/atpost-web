/**
 * What the "…" on the rail contains, as data — no React, no DOM, no JSX.
 *
 * The menu is the one control on this surface where "what is on it" has a
 * dozen answers and every wrong one is a promise the product cannot keep: a
 * Report row that files nothing, a "Don't recommend" on your own short, a Copy
 * link that copies a URL to a page nobody serves. So the rows are computed
 * here, from the short and from what the viewer is allowed to do, and tested
 * as a list rather than as a screenshot.
 *
 * ── Why not @momentum/content's `postMenuGroups` ──────────────────────────
 * It is the same idea and very nearly the same rows, and it is built for a
 * CARD: it carries Save and Share, which on this surface are their own rail
 * buttons, and an "Interested" row that the founder's reference does not have.
 * Reusing it would put Save in two places on one short and make the rail and
 * the menu disagree about which of them owns an action. The four rows below
 * are the brief's four. The `REPORT_REASONS` list, which is the part that
 * genuinely must not drift from trust-safety-service, IS taken from that
 * package rather than restated.
 *
 * ── Absent, not disabled ──────────────────────────────────────────────────
 * The rule this whole zone holds. A row whose endpoint will refuse is not
 * rendered: a greyed item says "not yet" where the truth is "not here". So a
 * signed-out viewer gets Copy link and nothing else — the three write rows all
 * need a session — and nobody is offered "Don't recommend this account" about
 * themselves.
 */

export type ReelMenuRowId = "not-interested" | "mute-author" | "report" | "copy-link"

export interface ReelMenuRow {
  id: ReelMenuRowId
  label: string
  /** Rendered in `--mo-bad`, and always last in its group. */
  destructive?: boolean
}

export interface ReelMenuInput {
  /** The viewer's own short. They do not tell the ranker about themselves. */
  isOwn: boolean
  /** False for a signed-out browser: every write row below needs a session. */
  canWrite: boolean
}

/**
 * The groups, in order, with the empty ones dropped.
 *
 * Returned as groups rather than a flat list because the dividers are
 * load-bearing: "Not interested" and "Report" doing visibly different kinds of
 * thing is what stops somebody reaching for the second when they meant the
 * first. Copy link is in its own group at the top for the opposite reason — it
 * is the only harmless row, and it is the one people open this menu for.
 */
export function reelMenuGroups(input: ReelMenuInput): ReelMenuRow[][] {
  // Always. A short's permalink is public and copying it needs nothing from
  // the server, so this is the one row that survives every condition.
  const first: ReelMenuRow[] = [{ id: "copy-link", label: "Copy link" }]

  if (!input.canWrite || input.isOwn) return [first]

  const second: ReelMenuRow[] = [
    { id: "not-interested", label: "Not interested" },
    { id: "mute-author", label: "Don't recommend this account" },
  ]
  const third: ReelMenuRow[] = [{ id: "report", label: "Report", destructive: true }]

  return [first, second, third]
}

/**
 * What the surface says after a report was filed.
 *
 * ── 409 is not a failure ──────────────────────────────────────────────────
 * `POST /v1/reports` answers **200** rather than 201, and a second report of
 * the same post by the same person answers **409 ACTIVE_REPORT_EXISTS** —
 * which means their report is already open in the moderation queue. That is
 * the state they were trying to reach, so it is confirmed rather than
 * apologised for. Telling somebody their report failed when it is sitting in
 * the queue is how a person reports the same video four times.
 *
 * Everything else is an honest failure, because the one thing worse than "we
 * could not file that" is a thank-you for a report that was never filed.
 */
export function reportOutcome(status: number | undefined): { ok: boolean; notice: string } {
  if (status === undefined) return { ok: true, notice: "Thanks — that's been reported." }
  if (status === 409) return { ok: true, notice: "You've already reported this. It's in the queue." }
  if (status === 401 || status === 403) {
    return { ok: false, notice: "Sign in to report this." }
  }
  return { ok: false, notice: "That report could not be filed. Try again." }
}

/**
 * What the surface says after one of the two ranking rows.
 *
 * `not_interested` on a post removes it from every surface on the next fetch;
 * mute on an author removes everything they post from what is recommended. The
 * copy says which of the two happened, because "Done" over a menu with two
 * similar rows leaves somebody unsure which one they pressed.
 */
export function feedbackNotice(row: "not-interested" | "mute-author", ok: boolean): string {
  if (!ok) return "That didn't go through. Try again."
  return row === "not-interested"
    ? "Thanks — you'll see fewer like this."
    : "You won't be recommended this account."
}
