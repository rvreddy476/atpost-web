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

import { Menu } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { NotificationBell } from "@momentum/notifications"
import { HOME_PATH } from "./destinations"
import { ProfileMenu } from "./ProfileMenu"
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
  avatarMediaId,
  navOpen,
  onToggleNav,
  navButtonRef,
}: {
  /** The zone this header is drawn in. See ./zone.ts. */
  basePath: string
  displayName?: string | null
  /** The viewer's avatar asset id, from `/v1/profiles/me`. Not a URL. */
  avatarMediaId?: string | null
  /** Whether ./LeftRail's drawer is open, for the trigger's `aria-expanded`. */
  navOpen?: boolean
  /** Opens the drawer. Omit and no hamburger is drawn at all. */
  onToggleNav?: () => void
  /** The frame's handle on the trigger, so the drawer can hand focus back. */
  navButtonRef?: React.Ref<HTMLButtonElement>
}) {
  const { signedIn } = useSession()

  return (
    <header className="sticky top-0 z-40 border-b border-mo bg-mo-bg">
      {/* `gap-2` at phone width and `gap-3` once there is room: at 360px the
          strip, the bell and the account menu are competing for every pixel,
          and 4px per gap across six gaps is a whole target. `px-4 sm:px-6`
          matches the frame's gutters below so the lockup lines up with the
          left edge of the rail and the header does not look inset by a
          different amount from the page. */}
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {/* ── The way into the navigation, below lg ─────────────────────────
            Drawn only under 1024, which is exactly where ./LeftRail's column
            is not. Above it the rail is already open beside the page and a
            button that opens it again would be a control with nothing to do.

            `-ml-2` for the reason the lockup beside it carries the same trick:
            a 44px box whose glyph has to stay on the 16px gutter. Without it
            the hamburger sits 8px further in than the wordmark below it and
            the whole bar looks inset by a different amount from the page. */}
        {onToggleNav && (
          <button
            ref={navButtonRef}
            type="button"
            onClick={onToggleNav}
            aria-label="Navigation"
            aria-expanded={navOpen ?? false}
            className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
        )}

        {/* ── Left: the lockup and search ───────────────────────────────── */}
        {/* A plain <a> and an absolute path, because from the reels zone this
            is a different Next app behind the shell's rewrite table — and
            `next/link` would prefix this zone's basePath and ask for
            /reels/social. See ./NavItem.tsx, which made the same decision
            first, and ./zone.ts for the arithmetic. */}
        <a
          href={HOME_PATH}
          aria-label={`${BRAND.name} home`}
          // `min-h-[44px]` on the anchor rather than on the mark inside it:
          // the ember square is a 36px visual and should stay one — it sits
          // beside a 44px icon strip and a 44px avatar, and growing it would
          // make the lockup the loudest thing in the bar. The TARGET grows
          // instead, which is the part a thumb interacts with.
          // `-ml-1 px-1` is what makes a 36px mark a 44px-wide target without
          // moving it: the padding grows the hit area outward and the negative
          // margin puts the mark's left edge back where the gutter wants it.
          className="-ml-1 flex min-h-[44px] shrink-0 items-center gap-2 px-1"
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

        {/*
          ── ONE search box, and ONE navigation — both of them in the rail ──

          What stood here was a search box and, after it, a strip of eight
          destination glyphs. Both are gone, and both for the same reason: each
          was a SECOND copy of something the left rail already draws, on the
          same screen at the same time.

          · SEARCH. Two boxes, both reading "Search Momentum", both submitting
            to the one results page. The founder's reference puts search in the
            rail under the brand card, so the rail's is the one that stays.
            `RailSearchBox` also binds "/" as a shortcut, which is only
            unambiguous while exactly one of them is mounted.

          · DESTINATIONS. The strip was the rail's own list again, as
            unlabelled glyphs. The reference has no zone icons in the header at
            all — the rail IS the navigation — and a shortcut row for a list
            already open beside it is a row nobody needs.

          ── What this costs below 1024px, stated rather than hidden ─────────
          There the rail is a drawer, so both are one tap behind the hamburger
          instead of on the bar. That is a real change, and it is the same one
          for both, which is what keeps it explicable: the bar carries the
          product, what is new, and you — everything else is in the one place
          the navigation lives.

          ── And what it means for apps/reels and apps/kwit ──────────────────
          They mount this same header and lose the same two things. Both keep a
          complete navigation, because both also mount `AppFrame`: the rail is
          a column from 1024px up and the drawer below it, and every
          destination — including the one they are in, marked — is in it.
          Neither zone had a search box of its own to lose; the rail's is one
          they gain.
        */}
        <div className="flex-1" />

        {/* ── The destination strip that used to be here ────────────────────

            ── `hidden lg:flex`, and why this strip stopped being the phone's
               navigation ────────────────────────────────────────────────────
            It was the ONLY navigation below 1024, and ./AppFrame's header made
            a careful argument for that: the strip is the same seven
            destinations a bottom bar would carry, so a second one would print
            them twice. What the argument missed is what the strip actually
            carries — seven unlabelled glyphs in a band that scrolls, with no
            descriptions, no marker for the four rows the web cannot open, and
            no account on it anywhere. ./LeftRail's drawer is those rows with
            their names on, and it is now what a phone gets. Two navigations
            was never the plan; this is still one, and it is the better one.

            Above `lg` the rail is open beside the page and this is a shortcut
            row rather than the way through, which is the job it is good at.

            ── The scrollbar, and where a PACKAGE can put the fix ─────────────
            apps/tube solved the same slab with a `.mo-hscroll` helper in its
            own globals.css. This package cannot have one: it ships source, not
            CSS, every zone compiles its own stylesheet, and a class defined in
            one zone's globals is an undeclared dependency that fails silently
            in the next — apps/social's globals.css declares no classes at all
            and apps/reels only declares `.reels-scroller`, so the helper would
            simply not exist in either zone that mounts this header.

            Inline styles cannot do it either: `scrollbarWidth` is a real React
            style property, but `::-webkit-scrollbar` is a pseudo-element and
            there is no inline form of one, so the bar would stay in every
            WebKit browser.

            So it is written as Tailwind arbitrary variants, which compile into
            whichever zone's stylesheet scans this file — and both of them
            already glob `packages/chrome/src` for exactly this reason. Same
            two declarations as `.mo-hscroll`, with no shared class to keep in
            step.

            All of that is kept as the record of a thing that is no longer
            drawn. `HeaderNavIcon` still exists in ./NavItem.tsx and is still
            exported, because it is the only component that knows how to draw a
            destination as a glyph — and the next surface that wants a compact
            destination row (a full-bleed watch page, say) should take it
            rather than write a third one. */}

        {/* ── Right: what is new, then you ──────────────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* The bell sits before the account menu rather than among the
              destinations: it is not a place, it is a count, and a count
              that changes belongs next to the one control that is about the
              viewer. It draws nothing while signed out, and it says so
              itself; `signedIn` is passed rather than read inside the
              package so the inbox couples to no zone's session plumbing. */}
          <NotificationBell signedIn={signedIn} />
          {signedIn ? (
            <ProfileMenu
              basePath={basePath}
              displayName={displayName}
              avatarMediaId={avatarMediaId}
            />
          ) : (
            <a
              // Back to the zone they were sent away from, not always to
              // /social — somebody who hits Sign in from Reels should land
              // back on Reels.
              href={signInHref(basePath)}
              // --brand-accent, not --mo-cyan: this is the most pressable
              // thing in the bar and cyan stops meaning "pressable" inside
              // `.mo-light`, where it is --mo-info. The alias is #06B6D4 in
              // :root and #0B6B37 there — 8.01 and 6.61 against their own page
              // ground. Hover is --mo-raised rather than --mo-surface for the
              // same reason it is everywhere else in this package: a surface
              // is the page's own white in a light zone, so the hover did not
              // exist.
              //
              // `min-h-[44px]` and a flex box, because `py-2` on 14px text is
              // 36px and this is the one control a signed-out phone visitor
              // has to hit.
              className="inline-flex min-h-[44px] items-center rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
