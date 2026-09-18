"use client"

/**
 * Who you are, and where you can go.
 *
 * ── Two sources, because they answer different questions ──────────────────
 * `useSession()` owns "is anyone signed in, and which account" — it reads the
 * presence cookie and `GET /v1/auth/me`, and the layout seeds it from the
 * request's own cookies so this rail is the right SHAPE in the first byte of
 * HTML rather than one effect later. What it does not carry is a name: /me is
 * identity (id, email, roles, account status) and has no display name, no
 * avatar and no counts in it at all. Those come from `/v1/profiles/me`, which
 * is fetched once by the frame and handed down — see ./AppFrame.
 *
 * So the rail renders in two beats and neither of them is wrong: the account
 * appears immediately with its email, and the name and the counts fill in when
 * the profile lands. That is the same trade `session.tsx` makes for the whole
 * app, and it is what removes the layout jump.
 *
 * ── Sticky, and scrollable on its own ─────────────────────────────────────
 * `top-14` is the header's height, so the rail parks directly under it. Its
 * own `overflow-y-auto` matters more than it looks: without it, a rail taller
 * than the window can never reach its own bottom rows, because a sticky
 * element does not scroll with the page once it has stuck.
 */

import { useCallback, useEffect, useId, useRef } from "react"
import { Smartphone, X } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { Avatar, avatarSrc } from "@momentum/content"
import { APP_ONLY_REASON, DESTINATIONS, isActionable } from "./destinations"
import { RailNavItem } from "./NavItem"
import { signInHref } from "./zone"
import type { ViewerProfile } from "./api"

/**
 * How many rows the web cannot open. Decides whether the note is shown.
 *
 * ── Where the shared id went ──────────────────────────────────────────────
 * A plain `const APP_ONLY_ID = "mo-rail-app-only"` used to live here, and its
 * note said `useId()` "would be the right answer for a component that can
 * appear twice; this one cannot". It can now: `LeftRail` is the column and
 * `LeftRailDrawer` is the same content below `lg`, and the frame renders both
 * — the column is `hidden`, not unmounted. Two elements with one id is a
 * document where `aria-describedby` resolves to whichever the browser found
 * first, which is the hidden one. So the id is generated per instance in
 * `RailContent` and threaded to the rows, exactly as that note said it would
 * have to be.
 */
const appOnlyCount = DESTINATIONS.filter((d) => !isActionable(d)).length

/**
 * A count, or null when there is no count to print.
 *
 * ── The bug this is the whole of ──────────────────────────────────────────
 * What stood at the one call site was `value.toLocaleString()`, against a
 * prop typed `number` from a field ./api typed `number` — and
 * `/v1/profiles/me` does not promise any of the four. An absent
 * `friend_count` is `undefined`, `undefined.toLocaleString()` is a TypeError,
 * and the throw happens inside a component the FRAME renders: the rail is a
 * child of AppFrame, so there is no boundary between it and the document root
 * and React unmounts the entire tree. One missing number blanked the page —
 * the feed, the header, the way to sign out, all of it — in two zones.
 *
 * So the rule is: nothing formats a count except this, and this takes
 * `unknown`. `typeof === "number"` and not a truthiness test, because 0 is a
 * real count and the most common one on a new account; `Number.isFinite` as
 * well, because a JSON `null` coerced somewhere upstream, or a NaN from
 * arithmetic on a missing field, would otherwise print "NaN" under
 * "Followers" — which is worse than printing nothing, since it looks like a
 * number somebody could act on.
 */
export function statText(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : null
}

function Stat({ label, value }: { label: string; value?: number | null }) {
  const text = statText(value)
  return (
    <div className="min-w-0">
      {/* A count is display type, so it is set in the display face and large
          enough that the eye lands on the number rather than the word. */}
      <p className="font-mo-display text-base font-semibold tabular-nums text-mo-ink">
        {text ?? (
          <>
            {/* An em dash is the sighted reader's "we do not know", and it
                holds the row's height so the three columns stay level when one
                of them is missing. It is `aria-hidden` and paired with a word,
                because a screen reader announcing "dash, Friends" is a
                punctuation mark read aloud, not an answer. */}
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not available</span>
          </>
        )}
      </p>
      <p className="truncate text-xs text-mo-body">{label}</p>
    </div>
  )
}

/**
 * The three counts.
 *
 * Its own component so a payload can be rendered against it in a test without
 * a session, a provider or a network — which is the thing that was missing
 * when the crash above shipped. Not re-exported from ./index: this is the
 * package's own seam, not its public surface.
 */
export function ViewerStats({ profile }: { profile: ViewerProfile }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-mo pt-3">
      <Stat label="Posts" value={profile.post_count} />
      <Stat label="Followers" value={profile.follower_count} />
      <Stat label="Friends" value={profile.friend_count} />
    </div>
  )
}


/** What both shapes of the rail are drawn from. */
export interface LeftRailProps {
  /** The zone this rail is drawn in, so "Sign in" comes back to it. */
  basePath: string
  profile: ViewerProfile | null
  currentId: string | null
}

/**
 * The card, the list and the footer — the rail's whole contents, once.
 *
 * Rendered by BOTH the ≥lg column and the <lg drawer, so a destination added
 * here appears in both and cannot appear in one. That is the same discipline
 * `TubeRailContent` keeps in apps/tube, and for the same reason: two copies of
 * a navigation list drift, and the one that drifts is always the one nobody
 * opens on a desktop.
 *
 * `onNavigate` is how the drawer shuts itself when a row is followed. The
 * column passes nothing, because there is nothing to shut.
 */
function RailContent({
  basePath,
  profile,
  currentId,
  onNavigate,
}: LeftRailProps & { onNavigate?: () => void }) {
  const { signedIn, user } = useSession()
  const appOnlyId = useId()

  return (
    <>
      {signedIn ? (
        <section className="rounded-mo border border-mo bg-mo-surface p-4 shadow-mo">
          <div className="flex items-center gap-3">
            {/* The viewer's own face. `/v1/profiles/me` sends
                `avatar_media_id` and — alone among the profile routes — no
                `avatar_url`, because that handler serialises the raw store
                row rather than the public DTO. So the URL is built from the
                id, through the same one rule every other surface uses. */}
            <Avatar
              name={profile?.display_name}
              id={user?.id}
              src={avatarSrc({ mediaId: profile?.avatar_media_id }, basePath)}
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-mo-ink">
                {/* The email is not a placeholder for the name, it is the other
                    true thing we have until the profile lands. */}
                {profile?.display_name || user?.email || "Your account"}
              </p>
              {profile?.bio ? (
                <p className="truncate text-xs text-mo-body">{profile.bio}</p>
              ) : (
                <p className="truncate text-xs text-mo-body">On {BRAND.name}</p>
              )}
            </div>
          </div>

          {profile && <ViewerStats profile={profile} />}
        </section>
      ) : (
        <section className="rounded-mo border border-mo bg-mo-surface p-4 shadow-mo">
          <p className="font-semibold text-mo-ink">You are signed out</p>
          <p className="mt-1 text-sm text-mo-body">
            Sign in to see your feed and the people you follow.
          </p>
          <a
            href={signInHref(basePath)}
            // --brand-accent: the interactive colour of whichever scope this
            // is, cyan on the dark ground and green under `.mo-light`, where
            // cyan has been reassigned to --mo-info. On a card that is 6.74
            // dark and 6.61 light. 44px because it is a real control.
            className="mt-3 inline-flex min-h-[44px] items-center rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised"
          >
            Sign in
          </a>
        </section>
      )}

      {/* `onClick` on the <nav> rather than on each row: every row inside is a
          real anchor and a click on any of them is a navigation, so one
          handler on the container closes the drawer for all of them —
          including the app-only rows, where the "navigation" is a person
          discovering the row does nothing and wanting the overlay gone. */}
      <nav aria-label="Destinations" className="mt-4" onClick={onNavigate}>
        <ul className="space-y-0.5">
          {DESTINATIONS.map((destination) => (
            <RailNavItem
              key={destination.id}
              destination={destination}
              current={destination.id === currentId}
              reasonId={appOnlyId}
            />
          ))}
        </ul>
        {/* One note for every phone-marked row, exactly as RoleSwitcher does
            it — and rendered only when there is a row that needs it, so the
            day Reels and Tube get web zones this sentence disappears on its
            own rather than becoming a lie nobody noticed. */}
        {appOnlyCount > 0 && (
          <p
            id={appOnlyId}
            className="mt-3 flex items-start gap-2 border-t border-mo px-3 pt-3 text-xs leading-snug text-mo-body"
          >
            <Smartphone aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mo-muted-lg" />
            <span>{APP_ONLY_REASON}</span>
          </p>
        )}
      </nav>

      <p className="mt-5 px-3 text-xs text-mo-body">
        One {BRAND.name} account, every part of the platform.
      </p>
    </>
  )
}

/** The rail as a column — 1024px and up, which is where there is room for it. */
export function LeftRail(props: LeftRailProps) {
  return (
    <aside
      aria-label="You and your destinations"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-5 pr-2 lg:block"
    >
      <RailContent {...props} />
    </aside>
  )
}

/** Everything a person can put focus on, in the order Tab would reach it. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

/**
 * The rail as a drawer — below 1024px, where there is no room for a column.
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 * Because below `lg` the rail simply vanished, and ./AppFrame's own header
 * argued at length that this was fine: the destination strip in ./AppHeader
 * "IS the bottom bar's content", so a second navigation would print the same
 * seven entries twice. The argument is sound and the conclusion was still
 * wrong, because what the strip carries is seven GLYPHS in a horizontally
 * scrolling band — no labels, no descriptions, no "this one is app-only and
 * here is why", and no account card at all. On a 360px phone the last of them
 * sit off screen behind a scroll nobody is told about.
 *
 * So there is still exactly ONE navigation below `lg`: this drawer. The strip
 * is now `lg:` and up, where it stops being the only thing on the page and
 * becomes a shortcut beside a rail that is already open. apps/tube reached the
 * same shape from the other direction — see `TubeRailDrawer`, whose own note
 * observes that this package "drops its left rail below `lg` and gets away
 * with it". It did not.
 *
 * ── The four things a drawer has to get right ─────────────────────────────
 *   · UNMOUNTED when closed, not `hidden`. Out of the accessibility tree, out
 *     of the focus order, out of find-in-page, and — the part `hidden` cannot
 *     give — out of the DOM, so this rail's ids and the column's never coexist
 *     on a page that renders both. `inert` would serve as well; unmounting is
 *     the version with no attribute left to forget.
 *   · FOCUS GOES IN. On open, to the close button: the first thing in the
 *     drawer and the way back out of it.
 *   · FOCUS STAYS IN. Tab off either end wraps. Without it a drawer over a
 *     page that is still mounted puts focus on links behind the backdrop,
 *     where the person cannot see what they have landed on.
 *   · FOCUS COMES BACK. On close — by Escape, by the backdrop, by the button,
 *     by following a row — to the trigger that opened it. `returnFocusTo` is
 *     the hamburger's own ref rather than a remembered `document.activeElement`
 *     on purpose: Safari does not focus a <button> on press, so the remembered
 *     element there is <body> and the restore is a silent no-op.
 */
export function LeftRailDrawer({
  open,
  ...props
}: LeftRailProps & {
  open: boolean
  onClose: () => void
  returnFocusTo?: React.RefObject<HTMLElement | null>
}) {
  // The panel is a separate component so that CLOSING it is an unmount, which
  // is what makes the focus restore below exact — see `DrawerPanel`. Rendering
  // null from inside one component would leave its hooks mounted and there
  // would be no unmount to hang the restore on.
  return open ? <DrawerPanel {...props} /> : null
}

function DrawerPanel({
  onClose,
  returnFocusTo,
  ...content
}: LeftRailProps & {
  onClose: () => void
  returnFocusTo?: React.RefObject<HTMLElement | null>
}) {
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  /**
   * Focus in on mount, and back to the trigger on unmount.
   *
   * ── One effect for every way out ──────────────────────────────────────
   * There are five: Escape, the backdrop, the close button, following a row,
   * and a route change closing it from ./AppFrame. Restoring focus in each
   * handler means five places to forget, and the route-change one has no
   * handler here to put it in at all. An unmount cleanup is the single event
   * all five share.
   *
   * It is also the only version with no timer in it. Restoring from the click
   * handler has to outrun React removing the focused node — which blurs the
   * document to <body> — so it needs a `requestAnimationFrame` or a
   * `setTimeout`, and rAF does not fire at all in a background tab. React
   * runs this cleanup during the commit that removes the node, so by the time
   * `focus()` is called there is nothing left to be blurred out of.
   *
   * `returnFocusTo` is the hamburger's own ref rather than a remembered
   * `document.activeElement`, because Safari does not focus a <button> on
   * press: the remembered element there is <body> and the restore would be a
   * silent no-op on exactly the platform this drawer exists for.
   */
  useEffect(() => {
    closeRef.current?.focus()
    const trigger = returnFocusTo
    return () => {
      trigger?.current?.focus()
    }
  }, [returnFocusTo])

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== "Tab") return
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!items || items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      // Only the two ends need handling. Everything between them is the
      // browser's own order, which is the order the markup already reads in.
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    },
    [close]
  )

  return (
    <>
      {/* The backdrop is a real <button> and not a <div> with an onClick: a
          div that dismisses things is invisible to everything except a mouse,
          and a control with no accessible name is one a screen reader reads as
          nothing at all. `tabIndex={-1}` because the KEYBOARD way out is
          Escape and the close button — a third tab stop also called "Close",
          before the drawer's own, is one job announced twice. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close navigation"
        onClick={close}
        className="fixed inset-0 z-40 cursor-default bg-mo-scrim/70 lg:hidden"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="You and your destinations"
        onKeyDown={onKeyDown}
        className="fixed left-0 top-0 z-50 flex h-full w-[min(88vw,300px)] flex-col overflow-y-auto border-r border-mo bg-mo-bg px-4 pb-6 shadow-mo-lift lg:hidden"
      >
        {/* `h-14` to match the header it is drawn over, so the close control
            lands where the hamburger that opened it was standing. */}
        <div className="flex h-14 shrink-0 items-center">
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close navigation"
            // 44px, with `-ml-2` so the box keeps its glyph on the same 16px
            // gutter the cards below it use — the trick ./AppHeader plays on
            // the lockup, for the same reason.
            className="-ml-2 grid h-11 w-11 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <RailContent {...content} onNavigate={close} />
      </aside>
    </>
  )
}
