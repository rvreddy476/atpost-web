/**
 * A path this zone does not serve.
 *
 * The zone has exactly two routes — `/` and `/search` — and the shell
 * rewrites everything under `/social/:path*` here, so a mistyped or stale
 * link inside the social namespace lands on this file rather than on the
 * shell's own 404. Without it Next renders its unstyled default page, on the
 * dark ground this zone sets, outside the three-column frame.
 *
 * ── It does not apologise and it does not guess ───────────────────────────
 * No "did you mean", because nothing here knows. What it offers is the two
 * destinations that certainly exist in this zone, as plain `<a>` elements to
 * absolute paths: `next/link` prefixes this zone's basePath onto every href
 * it is given, so `<Link href="/social">` here would ask for `/social/social`
 * — the failure @momentum/chrome's NavItem.tsx has a paragraph about and the
 * one apps/reels actually shipped.
 *
 * Not a `role="alert"`. A page that does not exist is an answer to a
 * question, not an interruption; the heading is an `<h1>` because this IS the
 * page, which is the difference between it and the states the feed draws
 * inside itself.
 */

import { Compass } from "lucide-react"
import { BRAND } from "@momentum/brand"

export default function NotFound() {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <Compass aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <h1 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        There is nothing at this address
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        That link does not lead anywhere on {BRAND.name}. It may have been moved,
        or it may never have existed.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/social"
          // --brand-accent, not --mo-cyan: cyan stops meaning "interactive" inside
          // `.mo-light` (it is --mo-info there) and green takes the role. The
          // alias is #06B6D4 in :root and #0B6B37 under the light scope — 6.74
          // and 6.61 on a card. 44px is the pointer-target floor.
          className="inline-flex min-h-[44px] items-center rounded-mo-pill border border-mo-strong px-5 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
        >
          Go to Home
        </a>
        <a
          href="/social/search"
          className="rounded-mo-pill px-4 py-2 text-sm font-semibold text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
        >
          Search
        </a>
      </div>
    </div>
  )
}
