/**
 * Where a search result can take you, and where it honestly cannot.
 *
 * The rule and its wording come from `packages/ui/src/RoleSwitcher.tsx` and
 * `src/chrome/destinations.ts`, which made this decision first: a thing the
 * web cannot open is PRESENT, NAMED and UNUSABLE — never dropped, and never an
 * `href` to a route that would 404. Dropping it silently is the failure those
 * files are written to avoid; someone who searched for a friend by name, saw
 * nothing, and concluded the platform has no record of them is exactly as
 * misled as the delivery partner whose role vanished from the menu.
 *
 * ── Checked, not assumed ──────────────────────────────────────────────────
 * `apps/social/src/app` serves ONE page (`page.tsx`, the feed) plus API
 * routes, and the shell's rewrite table is four zones — /shop, /admin, /social,
 * /apps (apps/shell/next.config.ts, and the same list again in
 * apps/shell/src/lib/moduleRedirect.ts). There is therefore:
 *
 *   · no profile zone anywhere on the web, so a person result opens nothing;
 *   · no tag page, so a hashtag result opens nothing;
 *   · no post permalink in this zone either — and that one is DIFFERENT, which
 *     is why there is no entry for it below.
 *
 * ── Why a post has no entry here ──────────────────────────────────────────
 * A person row is a stub: a name, a handle, an avatar. The thing it stands for
 * — the profile — is elsewhere, and on the web that elsewhere does not exist,
 * so the row has to say so. A post row is not a stub. The response carries the
 * whole post: the full text (not a snippet — verified, a 340-character caption
 * came back entire), the title, the tags, the counts and the attachment. The
 * card IS the post. There is no elsewhere to go and so nothing to apologise
 * for, and adding "opens in the app" under a post you are already reading
 * would be a false shortage.
 *
 * ── Data and pure functions only ──────────────────────────────────────────
 * No JSX, no hooks, no network — the same discipline as ./contract.ts and
 * src/chrome/destinations.ts. That is what lets "a result without an href is
 * never rendered as a link" be asserted without a browser, and that assertion
 * is the one that matters here.
 */

import { BRAND } from "@momentum/brand"

/**
 * Somewhere a result can send you.
 *
 * `href` null is the ONLY way to say "not available", and `unavailableReason`
 * is required exactly then — deliberately no `disabled` flag that could
 * disagree with an href.
 */
export interface ResultDestination {
  href: string | null
  unavailableReason: string | null
}

/** A person. No profile zone exists on the web. */
export const PERSON_DESTINATION: ResultDestination = {
  href: null,
  unavailableReason: `Profiles are only in the ${BRAND.mobileApp} — the web has no zone for them yet.`,
}

/**
 * A hashtag.
 *
 * There is no tag page, and the tempting substitute — link it back to this
 * same search with "#tag" as the query — is rejected. It looks like a
 * destination and is not one: `#coffee` as a query is matched against post
 * TEXT by the multi_match, so it finds posts that happen to have typed the
 * hash and misses every post whose tag lives in the `hashtags` field. A link
 * that quietly returns a different, worse set of results than the one it
 * appears to promise is the pretence this file exists to prevent.
 */
export const HASHTAG_DESTINATION: ResultDestination = {
  href: null,
  unavailableReason: `Tag pages are only in the ${BRAND.mobileApp} — the web has no zone for them yet.`,
}

/**
 * Can this result be opened from a browser?
 *
 * The single predicate every surface asks, so no two of them can disagree
 * about what "available" means.
 */
export function isReachable(destination: ResultDestination): boolean {
  return typeof destination.href === "string" && destination.href.length > 0
}
