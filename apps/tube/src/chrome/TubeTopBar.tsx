"use client"

/**
 * The bar across the top of Momentum Tube.
 *
 *     ☰  [M] Momentum Tube        [ search videos and channels ]      ⬆ Upload   ( )
 *
 * ── What is NOT in it, and that is the change ─────────────────────────────
 * There is no icon strip of Home / Reels / Messages / Friends / Explore /
 * Shop. That strip is @momentum/chrome's `AppHeader`, it is correct in the
 * social and reels zones, and it is precisely what the founder rejected here:
 * Tube shipped wearing the feed's chrome, and "it should be completely
 * isolated" is the note. A bar that offers six other products is a bar that
 * says this is a tab, not an app.
 *
 * The way back to the rest of Momentum has not been removed — it has been put
 * where a leave control belongs rather than where six competing destinations
 * used to be. See EXIT_ITEM in ./rail.ts for the three places that were
 * considered and why the rail's last row won.
 *
 * ── The hamburger does two different things, on purpose ───────────────────
 * One control, because there is one mental model — "show me less / more of
 * the rail" — and two implementations because the rail is two things:
 *
 *   · ≥1024px it toggles the column between 240px and a 76px icon rail, and
 *     the choice is remembered per viewer (./railStorage.ts).
 *   · <1024px there is no column at all, so it opens the rail as a drawer.
 *
 * This is YouTube's own behaviour and it is worth matching rather than
 * inventing: the gesture is already in people's hands.
 *
 * ── It is sticky, and nothing here has to tell the player about it ────────
 * @momentum/chrome's header carries a long note about `viewportInset`, because
 * a sticky bar makes the autoplay coordinator credit pixels hidden behind it
 * and that error flows into `watch_heartbeat`, which is what a creator is
 * paid on. None of that applies to the surfaces this bar is drawn over: the
 * browse grid, the subscriptions grid and the channel page mount ZERO
 * `<video>` elements between them, so there is no coordinator and no watch
 * measurement for a wrong inset to corrupt. The watch page measures its own
 * chrome off the element. This note exists so nobody wonders whether an inset
 * was forgotten.
 */

import Link from "next/link"
import { Menu, Upload } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { TubeProfileMenu } from "./TubeProfileMenu"
import { TubeSearch } from "./TubeSearch"

/**
 * Upload. A real control as of the upload studio, and it was not one before.
 *
 * ── What this used to be, and why the note is worth keeping ───────────────
 * Until the studio shipped this was an `aria-disabled` span carrying
 * TUBE_APP_ONLY_REASON, because the claim was true: there was no composer
 * anywhere in this repository, no upload form, and no `POST /v1/posts` call
 * outside the Android client. This zone's rule — stated in ./rail.ts and
 * followed by every other unavailable row — is that an entry becomes a link
 * on the day something serves it, and not one day before. `/upload` is
 * served, so this is a link.
 *
 * The href is zone-relative, like every other destination inside this shell.
 * An absolute "/tube/upload" would work from here and break the moment the
 * zone is mounted anywhere else, and next/link resolves a relative href
 * against the current route rather than the zone root — which is the exact
 * bug that sent the reels back control to /reels/social.
 *
 * The studio itself handles the signed-out and no-channel cases, so this
 * control does not gate on either. Somebody who clicks Upload while signed
 * out should land on the thing they asked for and be told what it needs, not
 * find the button inert with no explanation.
 */
function UploadControl() {
  return (
    <>
      <Link
        href="/upload"
        className="hidden h-10 shrink-0 items-center gap-2 rounded-mo-pill border border-mo px-4 text-sm font-semibold text-mo-body transition-colors hover:border-mo-strong hover:text-mo-ink sm:flex"
      >
        <Upload aria-hidden="true" className="h-4 w-4" />
        Upload
      </Link>
      {/* The narrow version keeps the glyph and drops the word, and keeps a
          real accessible name so it is not announced as an unlabelled box. */}
      <Link
        href="/upload"
        aria-label="Upload"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-mo-pill border border-mo text-mo-body transition-colors hover:border-mo-strong hover:text-mo-ink sm:hidden"
      >
        <Upload aria-hidden="true" className="h-4 w-4" />
      </Link>
    </>
  )
}

export function TubeTopBar({
  displayName,
  ownChannelRef,
  signInHref,
  railCollapsed,
  drawerOpen,
  onToggleRail,
}: {
  displayName?: string | null
  ownChannelRef: string | null
  signInHref: string
  railCollapsed: boolean
  drawerOpen: boolean
  onToggleRail: () => void
}) {
  const { signedIn } = useSession()

  return (
    <header className="sticky top-0 z-40 border-b border-mo bg-mo-bg">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={onToggleRail}
          // Two states, one control: below lg it is a disclosure for the
          // drawer, at lg and above it widens and narrows the column. The
          // expanded state describes whichever of the two is on screen, which
          // is why it reads the drawer OR the collapse flag.
          aria-expanded={drawerOpen || !railCollapsed}
          aria-label="Toggle navigation"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-surface hover:text-mo-ink"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        {/* ── The lockup, which means TUBE HOME ─────────────────────────────
            `next/link` and a zone-relative "/" — this is the one lockup in
            the product that stays inside its own app. Next adds the basePath,
            so this asks for /tube. Making it mean "leave Tube" instead was
            considered and rejected; ./rail.ts has the argument. */}
        <Link
          href="/"
          aria-label="Momentum Tube home"
          className="flex shrink-0 items-center gap-2 rounded-mo outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
        >
          {/* The one ember surface on the page. `bg-mo-primary` UNDER
              `bg-mo-ember` is not belt and braces: they are different CSS
              properties (background-color and background-image), and the
              gradient alone leaves the colour transparent — an invisible
              glyph in forced-colors mode. The red end is the solid fallback,
              and `text-mo-ember-label font-bold` is the size floor dark ink
              on it needs to clear 4.03. */}
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-mo-sm bg-mo-primary bg-mo-ember text-mo-ember-label font-bold text-mo-on-primary shadow-mo-ember"
          >
            {BRAND.initial}
          </span>
          <span className="hidden font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink sm:inline">
            {BRAND.name}
            {/* "Tube" carried in the accent, so the lockup reads as one name
                and still says which of the product's apps this is. */}
            <span className="ml-1 text-mo-cyan">Tube</span>
          </span>
        </Link>

        {/* The search box takes the middle and absorbs the slack, which is
            what makes the bar look like a video app's rather than a feed's. */}
        <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
          <TubeSearch />
        </div>

        <UploadControl />

        <div className="flex shrink-0 items-center">
          {signedIn ? (
            <TubeProfileMenu
              displayName={displayName}
              ownChannelRef={ownChannelRef}
              signInHref={signInHref}
            />
          ) : (
            <a
              href={signInHref}
              className="rounded-mo-pill border border-mo-strong px-3 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-surface sm:px-4"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
