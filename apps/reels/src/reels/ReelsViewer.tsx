"use client"

/**
 * Reels: a full-screen vertical scroller, one reel at a time, snapped.
 *
 * ── The mute question, and which model this surface takes ─────────────────
 * The phone has ONE session mute, on the rail, unlabelled — press it and every
 * reel for the rest of the session is silent. The web feed has per-player
 * mute, plus a document-wide "sound is armed" default that only moves when
 * somebody presses a speaker. Those look like two different products, and the
 * obvious reading is that a full-screen one-at-a-time surface should take the
 * phone's model.
 *
 * It already has, and adding a rail mute would take it away.
 *
 * Read what `MomentumVideo`'s speaker actually does. It records `userMuted`
 * for THAT player — final, never overruled again — AND it moves the default
 * every untouched player starts from, through `armSound`/`disarmSound` in
 * `soundPreference.ts`. On a surface where you watch one reel and swipe to the
 * next, every reel you have not personally pressed the speaker on is
 * untouched, so muting reel 3 starts reel 4, 5 and 6 muted too. That is the
 * phone's session mute, delivered by the mechanism the web already has.
 *
 * What the web keeps on top of it is a memory the phone does not have: swipe
 * BACK to a reel you personally silenced and it is still silent, even if you
 * have since unmuted the session. That is strictly more information, not less,
 * and throwing it away to match the phone would mean overriding a person's
 * explicit choice about a specific video with a global one.
 *
 * So: no mute on the rail, and the player's own transport carries it. This is
 * the one place the surface deviates from `ReelsScreen.kt` on purpose, and it
 * has a second benefit — a browser will not start an unmuted video before the
 * document has had a gesture, so on the web "sound is ON when Reels opens"
 * (founder, 2026-09-05) is not a promise this platform can keep on the first
 * reel. `armSound` makes it true from the first gesture onwards, which is as
 * close as the web gets, and the speaker glyph never lies about which it is.
 *
 * ── Consequences of keeping the player's transport ────────────────────────
 * The transport also brings play/pause and a draggable scrubber, hidden while
 * playing and revealed on hover or focus with a 3s auto-hide. So:
 *
 *   · Android's single-tap-to-pause is the player's picture click, already.
 *   · Android's playhead ring around the avatar is not drawn — the scrubber is
 *     the playhead here, and it can be dragged and reached by keyboard, which
 *     the ring cannot.
 *   · Space, k, m, ←, →, Home, End and the digits are the player's, on the
 *     focused reel. This file claims only ↑/↓, PageUp/PageDown and j/k, none
 *     of which the player takes. See `./keys.ts`.
 *
 * Android's double-tap "full mode", which hides the header and the shell's
 * bottom bar, has no counterpart: this zone's only chrome is a 48px bar that
 * is already the minimum way back out of a full-screen surface, and hiding it
 * on a gesture with no visible affordance would strand a mouse user in it.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import { useDwellTracker } from "@momentum/content"
import { prefersReducedMotion, useAutoplayCoordinator, type WatchEvent } from "@momentum/player"
import { Reel } from "./Reel"
import { moveTarget, reelKeyAction } from "./keys"
import { setBookmark, toggleLike } from "./api"
import { useFollowStates } from "./useFollowStates"
import { useReelsAnalytics } from "./useReelsAnalytics"
import { useReelsFeed } from "./useReelsFeed"
import { ReelsEmpty, ReelsError, ReelsLoading, ReelsSignedOut } from "./states"

export function ReelsViewer({ initialPostId }: { initialPostId?: string }) {
  const session = useSession()
  // Not `session.signedIn`: that is false while the status is still "unknown",
  // and a zone that waited for certainty before its first fetch would add a
  // round trip to every visit. `signedOut` is the only state that is known to
  // be pointless to ask from.
  const feed = useReelsFeed(initialPostId, !session.signedOut)
  const analytics = useReelsAnalytics()

  const scroller = useRef<HTMLDivElement | null>(null)
  const header = useRef<HTMLElement | null>(null)
  const [index, setIndex] = useState(0)

  /**
   * Reduced motion, read after mount.
   *
   * `matchMedia` does not exist on the server, and reading it during render
   * would make the server and client HTML disagree. Under reduced motion the
   * coordinator is disabled entirely — the accessible reading of the setting
   * is "do not start video on your own", not "autoplay more gently" — and
   * every reel still plays on demand from its own transport.
   */
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => setReducedMotion(prefersReducedMotion()), [])

  /**
   * How much of the top of the window is covered by chrome — MEASURED.
   *
   * apps/social arrives at 110 by adding a 57px header to a 53px tab strip.
   * Neither number applies here: this zone has no tab strip (Reels is one
   * surface — there are no For You / Following tabs, by the same decision the
   * phone made) and its header is a different, shorter bar. So it is measured
   * from the element that is actually on screen rather than copied.
   *
   * Measured on the live page at 1440×900: the bar's own box is 48px tall and
   * sits flush at y=0, so the band the trackers use starts at 48. `bottom` is
   * 0 — nothing is docked at the foot of this zone.
   *
   * It is measured rather than written down because a constant here is a
   * constant in two places: the number the CSS produces and the number the
   * trackers believe. The one that matters is what the coordinator subtracts
   * before deciding which reel is "most visible", and what the dwell tracker
   * subtracts before deciding a reel was seen — watch time is what a creator
   * is paid on, so an inset that has drifted from the real chrome is money
   * moving on a false reading.
   */
  const [insetTop, setInsetTop] = useState(0)
  useLayoutEffect(() => {
    const el = header.current
    if (!el) return
    const measure = () => setInsetTop(Math.round(el.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const viewportInset = useMemo(() => ({ top: insetTop }), [insetTop])

  const coordinator = useAutoplayCoordinator({ enabled: !reducedMotion, viewportInset })
  const activeId = coordinator.activeId

  const items = feed.items
  const authorIds = useMemo(() => items.map((i) => i.author_id).filter(Boolean), [items])
  const follows = useFollowStates(session.userId, authorIds)

  /* ── Impressions ──────────────────────────────────────────────────────── */
  const dwell = useDwellTracker(
    useCallback(
      (id: string, visibleMs: number) => {
        const at = items.findIndex((i) => i.id === id)
        if (at === -1) return
        analytics.recordImpression(items[at], at + 1, visibleMs, id === activeId)
      },
      [items, analytics, activeId]
    ),
    { viewportInset }
  )

  /**
   * One ref per reel, cached, feeding both trackers.
   *
   * Each package caches its own registrar, and composing them in an inline
   * arrow would throw that away: the combined closure would be new on every
   * render and React would detach and re-attach every reel's ref, which is
   * exactly the churn the caches exist to prevent. So the composition is
   * cached too, keyed by the stable post id.
   */
  const registrars = useRef(new Map<string, (el: HTMLElement | null) => void>()).current
  const registerRef = useCallback(
    (id: string) => {
      const cached = registrars.get(id)
      if (cached) return cached
      const autoplay = coordinator.register(id)
      const impression = dwell.register(id)
      const combined = (el: HTMLElement | null) => {
        autoplay(el)
        impression(el)
      }
      registrars.set(id, combined)
      return combined
    },
    [coordinator, dwell, registrars]
  )

  /* ── Which reel is on screen ──────────────────────────────────────────── */

  /**
   * The index is derived from the SCROLL POSITION, not from `activeId`.
   *
   * They agree almost always, and the exception is the one that matters: under
   * reduced motion the coordinator is disabled and `activeId` is null for
   * ever, so an index derived from it would freeze at the first reel and the
   * keyboard would stop working for exactly the people most likely to be using
   * it.
   */
  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const height = el.clientHeight
    if (height <= 0) return
    const at = Math.round(el.scrollTop / height)
    setIndex((prev) => (prev === at ? prev : at))
  }, [])

  // `feed.noteIndex` and NOT `feed`. The hook returns a fresh object every
  // render, so depending on it runs this on every render — which, since
  // `noteIndex` can start a fetch, is a page request per render for as long as
  // the surface is near its end. That is not hypothetical: it is what this did
  // before the dependency was narrowed.
  const noteIndex = feed.noteIndex
  useEffect(() => {
    noteIndex(index)
  }, [index, noteIndex])

  /**
   * Move to a reel and let the scroller snap.
   *
   * `scrollTo` on the container rather than `scrollIntoView` on the child:
   * `scrollIntoView` walks up and scrolls every scrollable ancestor, which on
   * a page whose body also scrolls produces a second, competing scroll.
   */
  const moveTo = useCallback((next: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" })
  }, [])

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  /**
   * The handler sits on the SCROLLER and catches keys that bubble, including
   * from a focused player — which is safe precisely because the player calls
   * `stopPropagation` on every key it claims, so nothing reaches here that it
   * wanted. The mapping, and the reasoning about the overlap, is in ./keys.ts.
   *
   * The container is `tabIndex={-1}`: focusable programmatically so the keys
   * work from the moment the page opens, but NOT a tab stop, so an untouched
   * surface still has none of its own.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const action = reelKeyAction(event.key, {
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
      })
      if (!action) return
      // Only once the key is known to be ours. ↑/↓ would otherwise be
      // prevented from scrolling anything else on the page.
      event.preventDefault()
      const next = moveTarget(index, action.delta, items.length)
      if (next !== index) moveTo(next)
    },
    [index, items.length, moveTo]
  )

  useEffect(() => {
    // Focus the scroller so the arrows work without a click first. Not an
    // autofocus on a control — this moves focus to a container, which is what
    // a full-screen viewer is.
    scroller.current?.focus({ preventScroll: true })
  }, [])

  /* ── The deep link ────────────────────────────────────────────────────── */

  /**
   * Jump once, without animation, when the linked reel turns up.
   *
   * `behavior: "auto"` rather than "smooth": arriving at /reels/{id} should
   * put that reel on screen, not scroll past everything in front of it while
   * the person watches.
   */
  const jumped = useRef(false)
  useEffect(() => {
    if (jumped.current || feed.deepLinkIndex === null) return
    const el = scroller.current
    if (!el || el.clientHeight <= 0) return
    jumped.current = true
    el.scrollTo({ top: feed.deepLinkIndex * el.clientHeight, behavior: "auto" })
    setIndex(feed.deepLinkIndex)
  }, [feed.deepLinkIndex])

  /* ── The action bar's handlers ────────────────────────────────────────── */

  const positionOf = useCallback(
    (item: FeedItem) => items.findIndex((i) => i.id === item.id) + 1,
    [items]
  )

  const onLike = useCallback(
    (item: FeedItem) => {
      const wanted = !item.has_reacted
      // Optimistic. The server's own count replaces ours when it answers —
      // other people have been liking this too, so our ±1 is not the truth.
      feed.patch(item.id, {
        has_reacted: wanted,
        counts: {
          ...item.counts,
          likes: Math.max(0, (item.counts?.likes ?? 0) + (wanted ? 1 : -1)),
        },
      })
      toggleLike(item.id)
        .then((result) => {
          feed.patch(item.id, {
            has_reacted: result.on,
            counts: { ...item.counts, likes: result.count },
          })
        })
        .catch(() => feed.patch(item.id, { has_reacted: item.has_reacted, counts: item.counts }))
    },
    [feed]
  )

  const onSave = useCallback(
    (item: FeedItem) => {
      const wanted = !item.is_bookmarked
      feed.patch(item.id, { is_bookmarked: wanted })
      setBookmark(item.id, wanted)
        .then((result) => {
          feed.patch(item.id, { is_bookmarked: result.on })
          if (result.on) analytics.recordEngagement("save", item, positionOf(item))
        })
        .catch(() => feed.patch(item.id, { is_bookmarked: item.is_bookmarked }))
    },
    [analytics, feed, positionOf]
  )

  /**
   * Share is a link to the reel, which is why the deep link had to exist.
   *
   * `navigator.share` where the browser has it, the clipboard where it does
   * not. Nothing is invented when neither works — the button reports that it
   * could not, rather than pretending.
   */
  const [notice, setNotice] = useState<string | null>(null)
  const onShare = useCallback(
    (item: FeedItem) => {
      const url = `${window.location.origin}${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/${item.id}`
      const done = () => {
        analytics.recordEngagement("share", item, positionOf(item))
      }
      if (navigator.share) {
        navigator
          .share({ url, title: `Reel by ${item.author?.display_name ?? "someone"}` })
          .then(done)
          // An abort is the person changing their mind, not a failure.
          .catch(() => undefined)
        return
      }
      navigator.clipboard
        ?.writeText(url)
        .then(() => {
          setNotice("Link copied.")
          done()
        })
        .catch(() => setNotice("Could not copy the link."))
    },
    [analytics, positionOf]
  )

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2_500)
    return () => window.clearTimeout(id)
  }, [notice])

  /**
   * Comments are not built on this surface yet, and the control says so.
   *
   * `@momentum/content` ships a `CommentSheet` and apps/social has it wired
   * against the real endpoints, so this is a composition away rather than a
   * missing capability — but a sheet that opens over a playing reel has its
   * own set of decisions about pausing and focus, and half of one is worse
   * than an honest note. The control is not hidden: a reel's comment count is
   * real and worth seeing.
   */
  const onComment = useCallback(() => {
    setNotice(`Comments open in the ${BRAND.mobileApp} for now.`)
  }, [])

  const onFollow = useCallback(
    async (authorId: string, next: "follow" | "unfollow") => {
      try {
        const settled = await follows.toggle(authorId, next)
        if (next === "follow") {
          const item = items.find((i) => i.author_id === authorId)
          // `follow_from_content` is exactly this: somebody followed an author
          // because of a piece of content, from the content. It is one of the
          // thirteen events the server accepts and this is the surface it was
          // named for.
          if (item) analytics.recordEngagement("follow_from_content", item, positionOf(item))
        }
        return settled
      } catch (error) {
        // The button is keyed on the edge, so the rollback inside `toggle`
        // has already unmounted it before it could show its own failure. Say
        // so here instead of letting the label quietly snap back with no
        // explanation.
        setNotice(next === "follow" ? "Could not follow them." : "Could not unfollow them.")
        throw error
      }
    },
    [analytics, follows, items, positionOf]
  )

  const handlers = useMemo(
    () => ({ onLike, onSave, onShare, onComment, onFollow }),
    [onLike, onSave, onShare, onComment, onFollow]
  )

  const onWatchEvent = useCallback(
    (item: FeedItem, event: WatchEvent) => {
      const info = analytics.sessionFor(item, positionOf(item))
      if (info) analytics.recordWatch(item, info, event)
    },
    [analytics, positionOf]
  )

  /* ── What is on screen ────────────────────────────────────────────────── */

  const body = () => {
    if (session.signedOut) return <ReelsSignedOut />
    if (feed.loading) return <ReelsLoading />
    if (feed.error && items.length === 0) return <ReelsError message={feed.error} onRetry={feed.retry} />
    if (feed.deepLinkMissing && items.length === 0) return <ReelsError message="That reel is not in your reels." />
    if (items.length === 0) return <ReelsEmpty />
    return null
  }

  const fallback = body()

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-mo-bg">
      {/* The zone's whole chrome. Over the reel on its own scrim, the way the
          phone's header is, and 48px tall — which is the number `insetTop`
          measures rather than the number it assumes. */}
      <header
        ref={header}
        className="absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-4"
      >
        {/*
          Back to the BROWSE PAGE. Two things about this line were wrong.

          The destination: it said `/social`, from when `/reels` itself WAS
          this surface and there was nowhere else in the zone to return to. Now
          that /reels is a page of reels, sending somebody out of the zone
          entirely — straight past the thing they were browsing — is the wrong
          end of the journey. Expand and back are one gesture and its undo.

          The href: `<Link href="/social">` never went to /social. `next/link`
          prefixes the zone's basePath, so it asked for `/reels/social`, which
          nothing serves — a 404 sitting in the only control on this surface.
          `"/"` is right for the same reason: Next makes it `/reels`.

          `router.back()` was considered and rejected. It is correct when there
          is history and silently wrong when there is not: a shared
          /reels/{id} opened cold has no previous page in this app, and Back
          would either do nothing or leave the site. A link lands somewhere
          real either way.
        */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-mo-pill px-2 py-1 text-sm font-semibold text-white hover:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Reels
        </Link>
        <span className="font-mo-display text-sm font-semibold text-white/80">{BRAND.name}</span>
      </header>

      {fallback ? (
        <div className="flex h-full w-full items-center justify-center px-6">{fallback}</div>
      ) : (
        <div
          ref={scroller}
          tabIndex={-1}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          // `h-full` on a `h-dvh` parent, so one reel is exactly one viewport
          // and `scrollTop / clientHeight` is a reel index rather than an
          // approximation of one. `overscroll-contain` stops a swipe past the
          // last reel becoming the browser's pull-to-refresh.
          className="reels-scroller h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none"
          aria-roledescription="carousel"
          aria-label="Reels"
        >
          {items.map((item, at) => (
            <Reel
              key={item.id}
              item={item}
              position={at + 1}
              total={items.length}
              active={item.id === activeId}
              current={at === index}
              // The current reel and its immediate neighbours, and nothing
              // else. `beyondViewportPageCount = 1`, in the web's units.
              mounted={Math.abs(at - index) <= 1}
              viewerId={session.userId}
              followState={follows.edges.get(item.author_id)}
              session={analytics.sessionFor(item, at + 1)}
              onWatchEvent={(event) => onWatchEvent(item, event)}
              registerRef={registerRef(item.id)}
              handlers={handlers}
            />
          ))}
          {/* An honest end, rather than a spinner that never resolves. */}
          {feed.ended && (
            <div className="flex h-full w-full snap-start items-center justify-center px-6 text-center">
              <p className="text-sm text-mo-body">
                That is every reel for now. Scroll back up for another look.
              </p>
            </div>
          )}
        </div>
      )}

      {/* One line, over everything, for the things a button did rather than
          the thing it failed at. `role="status"` so it is announced without
          stealing focus from the reel. */}
      {notice && (
        <p
          role="status"
          className="absolute inset-x-0 bottom-6 z-30 mx-auto w-fit rounded-mo-pill bg-mo-overlay px-4 py-2 text-sm text-mo-ink shadow-mo"
        >
          {notice}
        </p>
      )}
    </div>
  )
}
