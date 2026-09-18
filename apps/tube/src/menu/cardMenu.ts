/**
 * What the three-dot menu on a video card contains, as data.
 *
 * ── Why this is not @momentum/content's postMenu.ts ───────────────────────
 * That module is excellent and it is the SOCIAL card's menu: Save, Copy link,
 * Share, Interested, Not interested, Don't recommend this account, Report. Its
 * discipline is copied here verbatim and its reasoning is worth restating:
 *
 *   · a control the server will refuse is NOT rendered, and neither is one
 *     whose handler the surface did not wire. A menu item that does nothing is
 *     the same broken promise as one the server rejects — it just fails later.
 *   · the rows come back in GROUPS, because the dividers are load-bearing:
 *     "Not interested" and "Report" doing visibly different kinds of thing is
 *     what stops somebody reaching for the second when they meant the first.
 *
 * What is different is the CONTENTS, and the difference is the whole reason
 * this file exists. A long video has two lists a post does not — Watch later
 * and playlists — and it has a CHANNEL where a post has an account. The social
 * menu's "Save" is one bookmark toggle; Tube needs three distinct saves
 * (bookmark, the reserved queue, any playlist) and they are three different
 * routes. Bending the shared module into a superset would give the social card
 * three rows it cannot serve.
 *
 * ── What is deliberately NOT on it ────────────────────────────────────────
 *   · DISLIKE. There is no dislike route on this gateway. `POST /v1/posts/
 *     {id}/like` is a toggle and there is no counterpart.
 *   · "Interested". The positive signal is real (`signal: "interested"`) and
 *     it is the UNDO for "Not interested", not a standalone act: a menu that
 *     offers both at once asks somebody to rate a video they have not watched.
 *     It is sent, by the undo control on the notice the grid shows.
 *   · DOWNLOAD. No route, no offline story, no player that could use one.
 *   · "Not interested" and "Don't recommend" on YOUR OWN video. feed-service
 *     rejects the viewer's own id with a 400, so the rows are dropped rather
 *     than rendered to fail.
 *
 * Pure — no React, no network, no DOM — so the row set is a table that can be
 * asserted without a browser. ./cardMenu.test.ts is that assertion.
 */

export type CardMenuRowId =
  | "watch-later"
  | "save-playlist"
  | "save-bookmark"
  | "share"
  | "not-interested"
  | "mute-channel"
  | "report"

export interface CardMenuRow {
  id: CardMenuRowId
  label: string
  /** Rendered in `--mo-bad`, and always last in its group. */
  destructive?: boolean
}

/**
 * Everything the menu needs to know, flattened so this stays testable.
 *
 * `isOwn` is separate from "we do not know whose video this is". A feed row
 * carries `author_id` but only the zone knows the viewer, so an unwired
 * `isOwn` is false and the menu shows the stranger's rows — the safe direction
 * to be wrong in, exactly as @momentum/content's `PostMenuInput` argues:
 * offering Report on your own video is mildly silly, offering Delete on
 * somebody else's is a bug with consequences.
 */
export interface CardMenuInput {
  isOwn: boolean
  /** Already in the reserved queue: the row becomes a remove. */
  inWatchLater?: boolean
  /** Already bookmarked: the row becomes an unsave. */
  isSaved?: boolean
  /** Which actions the surface actually wired. See the header. */
  can: {
    watchLater?: boolean
    savePlaylist?: boolean
    saveBookmark?: boolean
    share?: boolean
    feedback?: boolean
    report?: boolean
  }
}

/** The word on the Watch later row. A separate function so the ID never moves. */
export function watchLaterLabel(inWatchLater: boolean): string {
  return inWatchLater ? "Remove from Watch later" : "Save to Watch later"
}

/** The word on the bookmark row — the same list the rail calls Saved. */
export function saveLabel(isSaved: boolean): string {
  return isSaved ? "Remove from Saved" : "Save"
}

/**
 * The groups, in order, with the empty ones dropped.
 *
 * Three groups, and the boundaries mean something:
 *
 *   1. THE LISTS. Watch later, a playlist, Saved. Three ways to keep a video
 *      and they sit together because a person choosing one is choosing
 *      between them.
 *   2. SHARE. Its own group because it is the one row that leaves the page.
 *   3. THE NEGATIVE SIGNALS, then Report last and red. Same shape as the
 *      social menu, same reason.
 *
 * A row whose id does not change with its state is deliberate: the menu is
 * rebuilt on every open, and an id that moved with the label would break
 * keyboard focus restoration for no gain. `watchLaterLabel` and `saveLabel`
 * carry the state instead.
 */
export function cardMenuGroups(input: CardMenuInput): CardMenuRow[][] {
  const { can } = input

  const lists: CardMenuRow[] = []
  if (can.watchLater) {
    lists.push({ id: "watch-later", label: watchLaterLabel(Boolean(input.inWatchLater)) })
  }
  if (can.savePlaylist) lists.push({ id: "save-playlist", label: "Save to playlist" })
  if (can.saveBookmark) {
    lists.push({ id: "save-bookmark", label: saveLabel(Boolean(input.isSaved)) })
  }

  const share: CardMenuRow[] = []
  if (can.share) share.push({ id: "share", label: "Share" })

  // Your own video is not a thing you tell the ranker you are not interested
  // in, and not a thing you report. feed-service enforces the first with a
  // 400 on your own author id; the menu agrees rather than rendering rows
  // that exist to fail.
  if (input.isOwn) return [lists, share].filter((group) => group.length > 0)

  const signals: CardMenuRow[] = []
  if (can.feedback) {
    signals.push({ id: "not-interested", label: "Not interested" })
    signals.push({ id: "mute-channel", label: "Don't recommend this channel" })
  }

  const report: CardMenuRow[] = []
  if (can.report) report.push({ id: "report", label: "Report", destructive: true })

  return [lists, share, signals, report].filter((group) => group.length > 0)
}

/**
 * The sentence the grid shows after a feedback press, and whether it worked.
 *
 * The two are separate on purpose. The TONE is how the notice looks; `ok` is
 * whether the thing happened, and it is what the optimistic removal is rolled
 * back on. A failed "Not interested" that read as success would leave a card
 * hidden on screen and present on the next refetch, which is the most
 * confusing possible outcome.
 */
export function feedbackNotice(
  target: "post" | "author",
  ok: boolean
): { text: string; tone: "good" | "bad" } {
  if (!ok) {
    return {
      text:
        target === "post"
          ? "That video could not be hidden. Nothing was changed."
          : "That channel could not be hidden. Nothing was changed.",
      tone: "bad",
    }
  }
  return {
    text:
      target === "post"
        ? "Hidden. You will not see this video again."
        : "Hidden. Videos from this channel will not be recommended.",
    tone: "good",
  }
}

/**
 * Which item the arrow keys move to, given where focus is now.
 *
 * Pure because it is the part of a menu that is genuinely easy to get wrong
 * and impossible to see: off-by-one at the ends, a wrap that goes the wrong
 * way, Home and End that do nothing. `count` is the number of FOCUSABLE rows
 * across every group flattened, because a divider is not a stop.
 *
 * Wrapping in both directions is what `role="menu"` is expected to do, and it
 * is what @momentum/content's menu does — matching it matters more than
 * whichever behaviour is nicer, because a person learns one menu and uses
 * both.
 */
export function nextMenuIndex(
  current: number,
  count: number,
  key: "ArrowDown" | "ArrowUp" | "Home" | "End"
): number {
  if (count <= 0) return -1
  switch (key) {
    case "ArrowDown":
      return current < 0 || current >= count - 1 ? 0 : current + 1
    case "ArrowUp":
      return current <= 0 ? count - 1 : current - 1
    case "Home":
      return 0
    case "End":
      return count - 1
  }
}
