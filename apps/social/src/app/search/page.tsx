import { Suspense } from "react"
import type { Metadata } from "next"
import { BRAND } from "@momentum/brand"
import { FeedSkeleton } from "@momentum/content"
import { SearchResults } from "@/search/SearchResults"

/**
 * `/social/search?q=…` — the results page.
 *
 * ── Why this route ────────────────────────────────────────────────────────
 * A path segment plus a query string, and each half was a decision:
 *
 *   · `/search` under this zone, not a new zone. The shell rewrites
 *     `/social/:path*` here already (apps/shell/next.config.ts), so a nested
 *     route needs no change to the shell's table — and the results ARE social
 *     content, rendered with the social zone's cards, tokens and session. A
 *     top-level `/search` would need a fifth zone to serve one page.
 *
 *   · `?q=`, not `/search/[q]`. The query is user text: it contains spaces,
 *     slashes, "#" and "%" and is edited far more often than it is typed
 *     fresh. A query string is the shape browsers, forms and every other
 *     search product already agree on — a bare `<form method="get">` produces
 *     exactly this URL with no JavaScript at all, which is why the header's
 *     box still works if the bundle never arrives. A path segment would need
 *     double encoding, and would make `?kind=` a second, differently-shaped
 *     way of saying the same sort of thing.
 *
 * ── Server component, one client child ────────────────────────────────────
 * The same shape as `app/page.tsx`: there is nothing here the server can
 * usefully render that the layout has not already done, and the results are a
 * session-scoped, cursor-paged surface. This is the mount point.
 *
 * The `<Suspense>` is required, not decorative: `SearchResults` reads
 * `useSearchParams()`, and a client component that does so must sit under a
 * boundary or it opts the whole route out of static rendering at build time.
 * The fallback is the same skeleton the page shows while a query is in
 * flight, so the hand-off is invisible.
 */
export const metadata: Metadata = {
  title: `Search · ${BRAND.name}`,
  description: `Find posts, people and tags across ${BRAND.name}.`,
}

export default function SearchPage() {
  return (
    <Suspense fallback={<FeedSkeleton count={3} />}>
      <SearchResults />
    </Suspense>
  )
}
