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

import { Search } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { DESTINATIONS, SEARCH_UNAVAILABLE_REASON } from "./destinations"
import { HeaderNavIcon } from "./NavItem"
import { ProfileMenu } from "./ProfileMenu"

const SEARCH_REASON_ID = "mo-search-unavailable"

/**
 * Search, in its real shape and not pretending to work.
 *
 * `GET /v1/search?q=` is live — it answers with posts, users and hashtags —
 * and this zone has nowhere to put the answer. A field that swallows a query
 * and navigates nowhere is the single most confusing thing a header can do, so
 * this is a control with an accessible name, a visible reason, and no input
 * to type into. A BUTTON and not a `searchbox`: it is honestly a thing you
 * would press, and announcing an editable role for something with no editing
 * in it is its own small lie. `aria-disabled` rather than `disabled` for the
 * reason RoleSwitcher wrote down — `disabled` would put it out of the focus
 * order and the explanation would be announced to nobody.
 */
function SearchControl() {
  return (
    <>
      <button
        type="button"
        aria-disabled="true"
        aria-label="Search"
        aria-describedby={SEARCH_REASON_ID}
        // No onClick at all. `aria-disabled` is a promise to assistive tech
        // and nothing else stops the press, so the absence of a handler is
        // what actually keeps it inert.
        className="hidden h-10 w-full max-w-[260px] cursor-default items-center gap-2 rounded-mo-pill border border-mo bg-mo-sunken px-3.5 text-left text-sm text-mo-body sm:flex"
      >
        {/* --mo-muted-lg over --mo-sunken, measured on the rendered page at
            3.68 — over the 3.0 bar this glyph is held to as a non-text mark,
            and sunken is one of the two grounds tokens.css allows it on. */}
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-muted-lg" />
        <span className="truncate">Search {BRAND.name}</span>
      </button>
      <span id={SEARCH_REASON_ID} className="sr-only">
        {SEARCH_UNAVAILABLE_REASON}
      </span>
    </>
  )
}

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

        <SearchControl />

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
