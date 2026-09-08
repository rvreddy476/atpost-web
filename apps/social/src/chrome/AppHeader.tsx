"use client"

/**
 * The bar across the top: the lockup, search, the destinations, and you.
 *
 * ── It is sticky, and that has a cost the player has to be told about ─────
 * `useAutoplayCoordinator` measures every card against the VIEWPORT — see
 * `visibleFraction` in packages/player/src/autoplay.ts, which clamps with
 * `Math.max(box.top, 0)` and divides by `window.innerHeight`. It has no notion
 * of an occluded region, and there is no option to give it one: `AutoplayOptions`
 * is `{ enabled, minRatio }` and nothing else.
 *
 * So a 56px sticky header makes the coordinator credit up to 56px of a card
 * that is behind chrome. On a 900px viewport that is 6.2 points of
 * `visibleFraction`, which means a card measured at the 0.6 bar can be as
 * little as ~0.54 genuinely visible. It is bounded and it is not the
 * catastrophic version of this bug — nothing plays while fully hidden, and a
 * card that has scrolled off the top still falls away as before — but it is
 * real, and it is written here rather than discovered later.
 *
 * The fix belongs in the player and is deliberately NOT hacked around from
 * this side. Raising `minRatio` to compensate was considered and rejected: the
 * error is `inset / viewportHeight`, so any constant would over-correct on a
 * tall window and under-correct on a short one, and it would silently change
 * the hand-off behaviour `minRatio` was tuned for. See the report; the shape
 * the player needs is an inset, not a bigger threshold.
 *
 * ── Why the header does not scroll away ───────────────────────────────────
 * Below 1024px the left rail is gone, so this bar is the only navigation on
 * screen. A header that leaves takes every destination with it exactly where
 * there is nothing else to reach them by.
 */

import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { DESTINATIONS } from "./destinations"
import { HeaderNavIcon } from "./NavItem"
import { ProfileMenu } from "./ProfileMenu"
import { SearchBox } from "./SearchBox"

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
 * `SEARCH_UNAVAILABLE_REASON` in ./destinations.ts is now stale and no longer
 * imported. It is left in place rather than deleted, because that file is not
 * this change's to edit; removing it is a one-line follow-up and is in the
 * report.
 */

export function AppHeader({
  displayName,
  currentId,
}: {
  displayName?: string | null
  currentId: string | null
}) {
  const { signedIn } = useSession()

  return (
    <header className="sticky top-0 z-40 border-b border-mo bg-mo-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        {/* ── Left: the lockup and search ───────────────────────────────── */}
        <a
          href="/social"
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

        <SearchBox />

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
            <ProfileMenu displayName={displayName} />
          ) : (
            <a
              href="/login?redirect=%2Fsocial"
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
