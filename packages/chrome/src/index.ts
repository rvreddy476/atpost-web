/**
 * @momentum/chrome — the frame every social surface wears.
 *
 *   import { AppFrame } from "@momentum/chrome"
 *   <AppFrame basePath="/social">{children}</AppFrame>
 *
 * The header, the search box, the destination strip, the identity rail, the
 * suggestions rail and the profile menu. One frame, mounted by apps/social and
 * apps/reels, so that clicking Reels lands somewhere that looks like the place
 * you left rather than a different product.
 *
 * ── Why this is a package and not something apps/reels imports from social ─
 * Zones depend on packages and never on each other. That is not a style rule:
 * the zones deploy independently, on different ports behind the shell's
 * rewrite table, and a cross-app import would make apps/reels un-buildable
 * without apps/social's `@/*` path alias, its tsconfig and its env. The rule
 * is also why this package exists NOW and did not exist a week ago — the
 * chrome sat in apps/social while apps/social was its only consumer, and it
 * moved on the day the second one appeared. A shared abstraction with one
 * caller is a guess; with two it is a fact.
 *
 * ── This is the one package allowed to import @atpost/api-client ──────────
 * Deliberately, narrowly, and worth stating so it is not copied. Every other
 * @momentum/* package is network-free — that is what lets @momentum/player be
 * tested without a server and @momentum/content be rendered by a zone that
 * fetches however it likes. The chrome is different in kind: its subject IS
 * the viewer. The header draws whether anyone is signed in, the rail draws
 * their name and counts, the menu signs them out, and the suggestions rail is
 * an endpoint with a list of people in it. A prop-driven version would be
 * every one of those threaded through both apps identically, which is the
 * duplication this package removes.
 *
 * The dependency is two things and stays two things: `useSession()` /
 * `signOut()` from @atpost/api-client/session, and the three URLs in ./api.
 *
 * ── What a zone has to tell it ────────────────────────────────────────────
 * Its `basePath`, and nothing else. See ./zone.ts for why that is a prop
 * rather than an environment variable, and for the link arithmetic that
 * depends on it.
 */

export { AppFrame } from "./AppFrame"
export type { AppFrameProps } from "./AppFrame"

/**
 * The pieces, for a surface that wants the header without the three columns.
 *
 * Nothing mounts these on their own today. They are exported because the frame
 * is a composition rather than a black box, and a future surface — a full-
 * bleed watch page that still wants the top bar — should be able to take the
 * header alone instead of forking it.
 */
export { AppHeader } from "./AppHeader"
export { LeftRail } from "./LeftRail"
export { RightRail } from "./RightRail"
export { ProfileMenu } from "./ProfileMenu"
export { SearchBox } from "./SearchBox"
export { HeaderNavIcon, RailNavItem } from "./NavItem"

/**
 * The places this product has, as data.
 *
 * Exported so a zone can answer "does the web serve X yet" from the same list
 * the navigation draws from, rather than from a second one that can disagree.
 */
export {
  APP_ONLY_REASON,
  DESTINATIONS,
  HOME_PATH,
  currentDestinationId,
  isActionable,
} from "./destinations"
export type { AppDestination } from "./destinations"

/**
 * The zone arithmetic, and the search query.
 *
 * `normalizeQuery` is exported for the SEARCH RESULTS PAGE, which has to agree
 * with the box about what an empty query is. apps/social re-exports it from
 * its own search contract so that page's imports did not have to move; the
 * definition is here because the box is what puts the string on the wire.
 * ./zone.ts has the argument in full.
 */
export {
  SEARCH_PATH,
  normalizeQuery,
  searchHref,
  signInHref,
  zonePath,
  zoneRelative,
} from "./zone"

/** The viewer, as the rail reads them. */
export type { Suggestion, ViewerProfile } from "./api"
