"use client"

/**
 * Momentum Tube's application shell.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS INSTEAD OF `<AppFrame basePath="/tube">`
 *
 * Tube shipped wearing @momentum/chrome — the same top bar and the same
 * three-column feed layout as /social and /reels — and that is the thing the
 * founder rejected:
 *
 *     "When you click on that long video, it should redirect to the new page,
 *      because it's a completely isolated application from the feed. It's
 *      Momentum Tube. So it should be completely isolated. It did open like in
 *      YouTube completely — channel, subscriptions, settings at the left side,
 *      and videos. And recommendations, next videos."
 *
 * Two things about the shared frame make it the wrong frame here, and neither
 * is a matter of taste:
 *
 *   · ITS NAVIGATION IS THE PRODUCT'S. Home, Reels, Messages, Friends,
 *     Explore, Shop — six other places, four of which are `aria-disabled`.
 *     That is the right list for a surface of the social app and the wrong
 *     list for an app of its own, whose destinations are Subscriptions, the
 *     channels you watch, and your own videos.
 *
 *   · ITS CENTRE TRACK IS 600px, IN EVERY ZONE, ON PURPOSE. AppFrame's own
 *     header says so in as many words, and gives the reason: the founder
 *     asked that Reels "load normally … as Feed page", and a centre column
 *     that is 600px on one tab and 840px on the next is the opposite of that.
 *     A 600px track fits two 16:9 posters across at 292px each. A video
 *     browse grid is the one surface in the product for which that constraint
 *     is actively wrong, and asking AppFrame to relax it would break the
 *     promise it exists to keep for the two zones that do want it.
 *
 * So this shell is written fresh rather than parameterised. What was carried
 * over is the DISCIPLINE, and each piece is credited where it is used:
 * `basePath` stated once and never read from the environment, `aria-disabled`
 * and never `disabled` for a destination that does not exist yet, a plain
 * `<a>` for anything outside this zone, and one fetch of the viewer for the
 * whole frame rather than one per component.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LAYOUT
 *
 *     ┌──────────────────────────────────────────────────────────────┐
 *     │ ☰  Momentum Tube      [ search ]         Upload      ( you ) │  56px, sticky
 *     ├──────────┬───────────────────────────────────────────────────┤
 *     │ Home     │                                                   │
 *     │ Subs     │   the page                                        │
 *     │ ──────   │                                                   │
 *     │ channels │                                                   │
 *     │ ──────   │                                                   │
 *     │ You      │                                                   │
 *     └──────────┴───────────────────────────────────────────────────┘
 *       240 / 76                        everything else
 *
 * A rail and ONE content track that takes the rest, rather than three fixed
 * columns. There is no right rail: the thing that would go in it —
 * recommendations, next videos — belongs beside the PLAYER on the watch page,
 * which is where the founder put it in the same sentence, and drawing a
 * second one on the browse grid would be a rail of suggestions next to a page
 * that is already nothing but suggestions.
 *
 * The content track is capped at 1600px and centred. Uncapped, a 16:9 grid on
 * a 3440px monitor gives seven cards a row at 480px each, which stops being a
 * grid and becomes a wall; 1600 is five cards at ~300px, which is the size
 * these posters are for.
 *
 * ── The rail's collapsed state, and the first paint ───────────────────────
 * `collapsed` starts false on the server and on the first client render, then
 * the effect reads storage. It cannot be read during render: `localStorage`
 * does not exist on the server, and a value read in a `useState` initialiser
 * makes the server's HTML and the client's first render disagree, which React
 * resolves by throwing away the tree. So a viewer who prefers the icon rail
 * sees the wide rail for one frame. That is the correct trade — the
 * alternative is a shell that hydration-errors — and it is one frame rather
 * than a visible jump because nothing below the rail is laid out against it.
 */

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "@atpost/api-client/session"
import { TubeRailColumn, TubeRailDrawer } from "./TubeRail"
import { TubeTopBar } from "./TubeTopBar"
import { readCollapsed, writeCollapsed } from "./railStorage"
import { useTubeViewer } from "./useTubeViewer"
import { TUBE_SIGN_IN_HREF } from "./links"

export function TubeFrame({ children }: { children: React.ReactNode }) {
  const { signedIn, user } = useSession()
  const pathname = usePathname()
  const viewer = useTubeViewer()

  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Per viewer, so two people sharing a machine do not inherit each other's
  // rail. Re-read when the account changes for the same reason.
  useEffect(() => {
    setCollapsed(readCollapsed(user?.id ?? null))
  }, [user?.id])

  // A route change closes the drawer. Without this, following a link inside
  // it leaves an overlay covering the page that was just navigated to — and
  // on a phone that reads as a navigation that did nothing.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const onToggleRail = useCallback(() => {
    // `matchMedia` rather than a resize listener and a width in state: the
    // question is only asked when the button is pressed, so there is nothing
    // to keep in sync and nothing to re-render on. 1024px is Tailwind's `lg`,
    // which is the breakpoint the column itself is drawn at — the two must
    // agree, or the button toggles a column that is not on screen.
    const wide =
      typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
    if (!wide) {
      setDrawerOpen((open) => !open)
      return
    }
    setCollapsed((was) => {
      const next = !was
      writeCollapsed(user?.id ?? null, next)
      return next
    })
  }, [user?.id])

  const railProps = {
    pathname,
    // The session's own answer, seeded on the server from this request's
    // cookie — so the rail is the right SHAPE in the first byte of HTML
    // rather than one effect later.
    signedIn,
    ownChannelRef: viewer.ownChannelRef,
    channels: viewer.channels,
    channelsLoading: viewer.channelsLoading,
    signInHref: TUBE_SIGN_IN_HREF,
  }

  return (
    <>
      <TubeTopBar
        displayName={viewer.displayName}
        ownChannelRef={viewer.ownChannelRef}
        signInHref={TUBE_SIGN_IN_HREF}
        railCollapsed={collapsed}
        drawerOpen={drawerOpen}
        onToggleRail={onToggleRail}
      />

      <div className="flex w-full items-start">
        <TubeRailColumn {...railProps} collapsed={collapsed} />
        <TubeRailDrawer {...railProps} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {/* `min-w-0` is not tidiness. A flex item's default `min-width: auto`
            refuses to shrink below its content, and one wide child — a long
            unbroken title, a table, a video at its natural size — would push
            the rail off screen and grow the page a horizontal scrollbar. It
            is the single most common way a rail-and-content layout breaks and
            it does not show up until real content arrives. */}
        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </>
  )
}
