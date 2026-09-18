/**
 * Which feed a viewer is looking at, and which tabs they are offered.
 *
 * No React, no network, no DOM: the mapping from "who is this and what did
 * they press" to "which endpoint" is the part worth asserting, and it can be
 * asserted without either.
 *
 * ── Three sources, two tabs, and why those numbers differ ─────────────────
 * `GET /v1/feed/flicks` is 401 for an anonymous browser — it ranks against a
 * viewer, so there is no signed-out version of it. The signed-out surface is
 * `GET /v1/posts/recent?content_type=flick,reel`, which is unranked and newest
 * first. That is a genuinely different product, so it is a third SOURCE rather
 * than a third tab: a signed-out viewer has no choice to make and is shown no
 * control, because a tab strip whose two tabs both go to the same place is a
 * lie about what the surface can do.
 *
 * ── `following_only` fails CLOSED, which is the whole argument for a tab ───
 * It filters the candidate set to authors the viewer follows and returns an
 * EMPTY array for an account that follows nobody, rather than backfilling with
 * strangers. That is the correct server behaviour, and it is exactly why the
 * parameter may only be sent from a control the viewer can see and switch back
 * off. Before this file existed the zone deliberately never sent it, for the
 * good reason that there was no tab: "A zone that silently sent
 * `following_only=true` would show a new account an empty Reels for ever with
 * nothing on screen to explain it." The fix is the tab, not the parameter.
 *
 * The empty case still needs its own words — "you don't follow anyone who
 * posts shorts" is a different sentence from "nothing has been ranked for
 * you" — which is what `emptyCopy` below is for.
 */

/** The endpoint a page comes from. Not a tab: see the header. */
export type FeedSource = "flicks" | "following" | "recent"

/** What the strip offers. Absent entirely when signed out. */
export type ReelsTab = "for-you" | "following"

export interface TabSpec {
  id: ReelsTab
  label: string
}

/**
 * The founder's references both lead with the ranked feed and put the followed
 * one second, and so does the phone. The order is the reading order.
 */
export const TABS: TabSpec[] = [
  { id: "for-you", label: "For you" },
  { id: "following", label: "Following" },
]

/**
 * The tabs to draw.
 *
 * Empty for a signed-out browser, and empty is what the viewer must render
 * rather than a disabled strip: `following_only` needs a session and
 * `/v1/posts/recent` has no "following" of its own to offer, so both tabs
 * would be the same list. A greyed control says "not yet"; an absent one says
 * "not here", which is the truth.
 *
 * `signedOut` rather than `signedIn` on purpose, matching every other entry
 * point in this zone: the session status is "unknown" for the first beat on a
 * page that was not seeded from the request cookie, and a strip that waited
 * for certainty would flicker into existence after the first paint.
 */
export function tabsFor(signedOut: boolean): TabSpec[] {
  return signedOut ? [] : TABS
}

/** The endpoint for a viewer on a tab. */
export function sourceFor(signedOut: boolean, tab: ReelsTab): FeedSource {
  if (signedOut) return "recent"
  return tab === "following" ? "following" : "flicks"
}

export interface EmptyCopy {
  title: string
  body: string
}

/**
 * What an empty answer means, which depends entirely on where it came from.
 *
 * Three different facts, and saying the wrong one invents something that is
 * not true:
 *
 *   · `flicks` empty means the RANKER had nothing for this account. It does
 *     NOT mean the platform has no shorts, and copy that implied it would be
 *     making a claim about the platform out of a fact about one viewer.
 *   · `following` empty means the people this account follows have not posted
 *     shorts. The way out is the other tab, and the copy says so.
 *   · `recent` empty is the only one that really is about the platform — it is
 *     an unranked, unfiltered, newest-first list, so nothing in it means
 *     nothing published.
 */
export function emptyCopy(source: FeedSource): EmptyCopy {
  switch (source) {
    case "following":
      return {
        title: "Nothing from the people you follow",
        body: "Shorts from accounts you follow show up here. For you has the rest.",
      }
    case "recent":
      return {
        title: "No shorts yet",
        body: "Nothing has been published recently. Sign in to see shorts picked for you.",
      }
    default:
      return {
        title: "No shorts for you yet",
        body: "Shorts are ranked for each account, so this fills up as you follow people and watch things. Nothing has been picked for you so far.",
      }
  }
}

/**
 * Whether this source lets the viewer act on a short at all.
 *
 * `recent` is the signed-out surface, and every write on this rail — react,
 * save, share, comment, follow, feedback, report — needs a session. The rail
 * still DRAWS them: a control that vanishes when you are signed out hides the
 * fact that the product has it, and the founder's references both show a full
 * rail to a logged-out visitor. What changes is what a press does, which is
 * to send them to sign in rather than to fire a request that will 401.
 */
export function canWrite(signedOut: boolean): boolean {
  return !signedOut
}
