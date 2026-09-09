import { AppFrame } from "@momentum/chrome"
import { ZONE } from "@/zone"

/**
 * The chrome, for the browse page and nothing else.
 *
 * ── Why a route group and not the root layout ─────────────────────────────
 * This zone serves two surfaces with opposite requirements, and they are one
 * route apart:
 *
 *   /reels        the browse page. Header, both rails, the destination strip
 *                 — the same frame apps/social wears, because the founder's
 *                 ask was that it "load normally … as Feed page".
 *   /reels/{id}   the immersive viewer. Full-screen video whose only chrome is
 *                 48 pixels of translucent bar drawn OVER the reel, because a
 *                 full-screen surface whose chrome takes layout is not full
 *                 screen.
 *
 * Putting `AppFrame` in the root layout would wrap both, and the viewer would
 * then have to escape a 600px centre track it was never inside — a `fixed`
 * overlay over a page that is still scrolling behind it, with two headers.
 * `(browse)` is a route GROUP: it contributes no path segment, so this file
 * gives ../page.tsx a layout without moving it off `/reels`.
 *
 * The root layout keeps what both share and neither should have twice: the
 * document, the fonts, and the session seeded from the request's own cookie.
 *
 * ── The frame needs to know which zone it is in ───────────────────────────
 * `basePath` is a required prop rather than an environment read. It is what
 * marks Reels as the current destination in the strip, what makes "Sign in"
 * come back HERE rather than to the feed, and what tells the search box that
 * its results page is in another zone and must be a document navigation. See
 * @momentum/chrome's zone.ts.
 */
export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame basePath={ZONE}>{children}</AppFrame>
}
