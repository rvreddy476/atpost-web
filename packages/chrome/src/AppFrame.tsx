"use client"

/**
 * The three columns, and the rules for when there are fewer.
 *
 * ── The shape ─────────────────────────────────────────────────────────────
 * A left rail of identity and navigation, the feed, and a right rail of
 * people. The founder asked for "three-four-three", which is the Facebook
 * proportion, and the tracks below are that idea with one correction applied:
 * the rails are FIXED and the centre absorbs the slack.
 *
 * A literal 30/40/30 puts the feed at 40% of the window — 410px at 1024,
 * 512px at 1280. A post's text at 410px is roughly 50 characters a line, and
 * a 16:9 image in it is 230px tall. That is not a feed, it is a column of
 * thumbnails. Fixed rails give the same visual rhythm (two flanking bands
 * about half the centre's width) while guaranteeing the thing the brief is
 * emphatic about: the middle never gets squeezed, because it is the only
 * track that grows.
 *
 *     268px │ 600px │ 300px      with 24px gutters
 *
 * 600px is the centre's cap for the ordinary reason: at the body size that is
 * ~70 characters a line, the top of the range prose stays comfortable in. The
 * left rail is 268 because its longest row — "Messages" with a reason under
 * it — needs about that; the right is 300 because a name, a reason line and
 * an "Add" button do not fit in less without the button wrapping.
 *
 * ── The breakpoints, and the arithmetic behind them ───────────────────────
 * These are not the framework's defaults chosen for tidiness. Each one is the
 * width at which the next track stops fitting:
 *
 *   ≥ 1280 (xl)   three columns.  268 + 24 + 600 + 24 + 300 + 32 padding
 *                                 = 1248, so a 1280 laptop fits all three
 *                                 with room. This is the ordinary case.
 *   1024–1279 (lg) two columns.   268 + 24 + 600 + 32 = 924, comfortable at
 *                                 1024. The RIGHT rail goes first because
 *                                 suggestions are discovery and the left rail
 *                                 is navigation and identity — when space is
 *                                 short, knowing where you are and how to
 *                                 leave beats being shown someone new.
 *   < 1024        one column.     Both rails gone. The header still carries
 *                                 every destination, which is why it is
 *                                 sticky and why it holds the full icon strip
 *                                 rather than a hamburger.
 *
 * ── Why there is no bottom bar, having looked at adding one ───────────────
 * The obvious phone pattern, and it was measured rather than dismissed. The
 * strip in the header IS the bottom bar's content: the same seven
 * destinations, the same glyphs, the same active mark, already sticky and
 * already the thing every zone mounting this frame shares. Adding a second
 * navigation below 1024 would put those seven entries on screen TWICE — once
 * in a bar that does not scroll away and once in a bar pinned to the other
 * edge — and it would do it in apps/reels and apps/kwit as well, since both
 * mount this component and neither asked for it.
 *
 * What the phone case actually needed was not a second bar but for the one
 * that exists to be usable: 44px targets that do not compress (./NavItem, and
 * its `shrink-0` note is the older half of the same fix), a strip that scrolls
 * rather than squeezes, and a wordmark that gets out of the way under md. That
 * is what changed. If the destination list ever grows past what a 360px strip
 * can scroll comfortably, the answer is fewer destinations in the chrome, not
 * a third place to put them.
 *
 * ── The centre column keeps its measure at every width ────────────────────
 * `max-w-[600px]` with `mx-auto` on `main`, under a grid track that is already
 * `minmax(0, 600px)`. Belt and braces on purpose: the track caps it in the two
 * and three column layouts, and the `max-w` caps it in the ONE column layout,
 * where the track is `1fr` and would otherwise let a post's text run the full
 * width of a 1023px tablet at about 140 characters a line — twice the measure
 * prose is comfortable at, and the exact failure a single-column breakpoint
 * usually ships with.
 *
 * The centre is `minmax(0, 600px)` and not `600px` in every one of them.
 * `minmax(0, …)` is what lets a grid ITEM shrink below its content's
 * intrinsic width — without it a wide element inside a card (a long unbroken
 * URL, a table, a video at its natural size) blows the track out and the whole
 * page grows a horizontal scrollbar. It is the single most common way a
 * three-column layout breaks and it does not show up until real content
 * arrives.
 *
 * ── The centre track is 600px in every zone that mounts this ──────────────
 * Including reels, whose browse grid could plausibly have asked for more room.
 * It does not get its own width, and that is the point of the frame: the
 * founder's ask was that Reels "load normally … as Feed page", and a centre
 * column that is 600px on one tab and 840px on the next is the opposite of
 * that. Three tiles across 600px is 184px each — the same order as a profile
 * grid cell on any of the products this borrows from — and the grid decides
 * its own column count against the track rather than the track bending for it.
 *
 * ── One request for the viewer, not two ───────────────────────────────────
 * `/v1/profiles/me` is fetched HERE and handed to both the header and the
 * rail. Two components each calling `useSomething()` is how a page ends up
 * making the same request twice on every mount; the session's own `/me` is
 * deduped by a module-level in-flight promise for exactly this reason, and
 * this file is the cheaper version of the same discipline.
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "@atpost/api-client/session"
import { AppHeader } from "./AppHeader"
import { LeftRail } from "./LeftRail"
import { RightRail } from "./RightRail"
import { currentDestinationId } from "./destinations"
import { zonePath } from "./zone"
import { fetchViewerProfile, type ViewerProfile } from "./api"

export interface AppFrameProps {
  /**
   * The basePath of the zone this frame is mounted in — "/social", "/reels".
   *
   * Required, and stated at each mount point rather than read out of
   * NEXT_PUBLIC_API_BASE_URL as it used to be. ./zone.ts carries the whole
   * argument; the short version is that a component drawing links into five
   * zones has to be TOLD which one it is in, because getting it wrong produces
   * a header that looks perfect and navigates nowhere.
   */
  basePath: string
  children: React.ReactNode
}

export function AppFrame({ basePath, children }: AppFrameProps) {
  const { signedIn, status: sessionStatus } = useSession()
  const pathname = usePathname()
  const currentId = currentDestinationId(zonePath(basePath, pathname))

  const [profile, setProfile] = useState<ViewerProfile | null>(null)

  useEffect(() => {
    if (sessionStatus === "unknown") return
    if (!signedIn) {
      setProfile(null)
      return
    }
    let live = true
    fetchViewerProfile()
      .then((next) => {
        if (live) setProfile(next)
      })
      .catch(() => {
        // A profile that did not load is a missing NAME, not a missing
        // session. The rail already has the email and the session already
        // knows who this is; blanking either over a failed side request would
        // be a bigger lie than the gap.
      })
    return () => {
      live = false
    }
  }, [signedIn, sessionStatus])

  return (
    <>
      <AppHeader
        basePath={basePath}
        displayName={profile?.display_name}
        avatarMediaId={profile?.avatar_media_id}
        currentId={currentId}
      />
      <div
        className={[
          // 16px gutters on a phone, 24px once there is room for them. The
          // narrower one is what keeps a 600px card readable at 360px rather
          // than 328px of it.
          "mx-auto grid w-full max-w-[1600px] justify-center gap-x-6 px-4 sm:px-6",
          "grid-cols-1",
          "lg:grid-cols-[268px_minmax(0,600px)]",
          "xl:grid-cols-[268px_minmax(0,600px)_300px]",
        ].join(" ")}
      >
        <LeftRail basePath={basePath} profile={profile} currentId={currentId} />
        {/* `min-w-0` for the same reason `minmax(0, …)` is on the track: a
            grid item's default `min-width: auto` refuses to shrink below its
            content, and one wide child would push the rails off screen. */}
        {/* `pb-24` rather than `pb-16`: the last card in a feed wants clear
            air under it on a phone, where the browser's own bottom chrome
            appears and disappears as the page scrolls and a 64px tail can put
            "You are all caught up" underneath it. */}
        <main className="mx-auto w-full min-w-0 max-w-[600px] pb-24 pt-4 sm:pt-5">{children}</main>
        <RightRail basePath={basePath} />
      </div>
    </>
  )
}
