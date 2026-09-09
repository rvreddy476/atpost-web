"use client"

/**
 * The bar across the top: the lockup, search, the destinations, and you.
 *
 * ── It is sticky, and the player is told what that costs ──────────────────
 * `useAutoplayCoordinator` measures every card against the VIEWPORT, and a
 * sticky bar means the top of the window is not part of it: without being
 * told, the coordinator credits a card for the strip of it sitting behind
 * this header, by exactly `insetTop / min(cardHeight, viewportHeight)` — up
 * to 6.7 points on a 900px window. That error flows through `activeId` into
 * `watch_heartbeat`, which is what a creator is paid on.
 *
 * That is fixed, in the player, where the geometry belongs: `AutoplayOptions`
 * takes a `viewportInset` (`{top, bottom}`, layout pixels) and
 * `visibleFraction` measures against the band that is left. Raising
 * `minRatio` to compensate was considered and rejected — the error is a
 * function of the window's height, so any constant is right at one window
 * size and wrong at every other.
 *
 * Nothing about the number lives in this file. `useTopChromeInset` in
 * apps/social/src/feed/HomeFeed.tsx MEASURES the real chrome by hit-testing
 * the top edge of the viewport, so it cannot drift from this header the way a
 * shared constant would — see its own note for why it is a photograph rather
 * than a reading of the markup. That is also why this header can now be
 * mounted in a second zone without an inset constant following it around:
 * apps/reels' browse page plays nothing and therefore needs no inset at all,
 * and its immersive viewer measures its own 48px bar off the element.
 *
 * ── Why the header does not scroll away ───────────────────────────────────
 * Below 1024px the left rail is gone, so this bar is the only navigation on
 * screen. A header that leaves takes every destination with it exactly where
 * there is nothing else to reach them by.
 */

import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { DESTINATIONS, HOME_PATH } from "./destinations"
import { HeaderNavIcon } from "./NavItem"
import { ProfileMenu } from "./ProfileMenu"
import { SearchBox } from "./SearchBox"
import { signInHref } from "./zone"

/**
 * ── Search is no longer inert ─────────────────────────────────────────────
 * What stood here was a `<button aria-disabled>` with no handler and an
 * `sr-only` sentence saying that `GET /v1/search` was live and this zone had
 * nowhere to put the answer. `/social/search` is now that somewhere, so the
 * control is a real `role="search"` form — the same pill, the same sunken
 * well, the same glyph, the same `sm:` breakpoint and the same 260px cap. Only
 * the promise behind the shape changed.
 *
 * It lives in ./SearchBox.tsx rather than here because it grew a submit
 * handler, a no-JavaScript fallback and a Suspense boundary for the prefill,
 * and this file is a layout.
 *
 * `SEARCH_UNAVAILABLE_REASON` went with it: a sentence explaining why search
 * cannot be used, kept alive next to a search box that works, is the kind of
 * thing that gets read as current and put back on screen.
 */

export function AppHeader({
  basePath,
  displayName,
  currentId,
}: {
  /** The zone this header is drawn in. See ./zone.ts. */
  basePath: string
  displayName?: string | null
  currentId: string | null
}) {
  const { signedIn } = useSession()

  return (
    <header className="sticky top-0 z-40 border-b border-mo bg-mo-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        {/* ── Left: the lockup and search ───────────────────────────────── */}
        {/* A plain <a> and an absolute path, because from the reels zone this
            is a different Next app behind the shell's rewrite table — and
            `next/link` would prefix this zone's basePath and ask for
            /reels/social. See ./NavItem.tsx, which made the same decision
            first, and ./zone.ts for the arithmetic. */}
        <a
          href={HOME_PATH}
          aria-label={`${BRAND.name} home`}
          className="flex shrink-0 items-center gap-2"
        >
          {/* The ONE ember surface on this page. The initial is set at 19px
              bold — `text-mo-ember-label` IS that floor, and tokens.css
              records why: dark ink on the red end of the gradient measures
              4.03, which is legible only as large text.

              `bg-mo-primary` UNDER `bg-mo-ember` is not belt and braces. The
              two Tailwind utilities are different properties — background-color
              and background-image — and `bg-mo-ember` alone leaves the colour
              transparent. Measured on the rendered page in exactly that state:
              --mo-on-primary against the page ground is 1.00:1, an invisible
              glyph, which is what a browser in forced-colors mode or one that
              dropped the gradient would draw. The red end is the solid
              fallback for precisely this, and tokens.css says so — it is why
              --mo-primary is the RED end and not the orange one, so the
              fallback lands on the case the type size was chosen for. */}
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-mo-sm bg-mo-primary bg-mo-ember text-mo-ember-label font-bold text-mo-on-primary shadow-mo-ember"
          >
            {BRAND.initial}
          </span>
          <span className="hidden font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink md:inline">
            {BRAND.name}
          </span>
        </a>

        <SearchBox basePath={basePath} />

        {/* ── Centre: the destinations ──────────────────────────────────── */}
        <nav
          aria-label="Momentum destinations"
          className="mx-auto flex min-w-0 items-center gap-0.5 overflow-x-auto"
        >
          {DESTINATIONS.map((destination) => (
            <HeaderNavIcon
              key={destination.id}
              destination={destination}
              current={destination.id === currentId}
            />
          ))}
        </nav>

        {/* ── Right: you ────────────────────────────────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center">
          {signedIn ? (
            <ProfileMenu basePath={basePath} displayName={displayName} />
          ) : (
            <a
              // Back to the zone they were sent away from, not always to
              // /social — somebody who hits Sign in from Reels should land
              // back on Reels.
              href={signInHref(basePath)}
              className="rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-surface"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
