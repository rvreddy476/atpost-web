"use client"

/**
 * The front door, wired.
 *
 * Everything visible here comes from a package. What this file adds is the
 * part that cannot be shared: which endpoint, which analytics surface, what
 * happens when a signed URL goes stale, and how a like reaches the gateway.
 * If a component in here starts growing layout, it belongs in
 * @momentum/content instead — that is the line the zone is thin on one side of.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import {
  FeedEmpty,
  FeedEnd,
  FeedError,
  FeedSkeleton,
  InfiniteFeed,
  PostCard,
  useDwellTracker,
} from "@momentum/content"
import { prefersReducedMotion, useAutoplayCoordinator } from "@momentum/player"
import { fetchFeedPage, setBookmark, setRepost, toggleLike } from "./api"
import { useFeedAnalytics } from "./useFeedAnalytics"

type Status = "loading" | "ready" | "error"

export function HomeFeed() {
  const { signedIn, status: sessionStatus } = useSession()

  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [errorMessage, setErrorMessage] = useState("")
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)

  /**
   * Muted until asked otherwise.
   *
   * Not a default that can be flipped by config: a browser refuses to autoplay
   * anything with sound, and the refusal arrives as a rejected promise rather
   * than an exception — so an unmuted autoplay is not "louder", it is a video
   * that silently never starts. One control for the whole feed, because
   * per-card mute means scrolling changes the volume.
   */
  const [muted, setMuted] = useState(true)

  /**
   * Read once, on mount.
   *
   * `prefersReducedMotion()` touches `matchMedia`, which does not exist during
   * the server render — reading it in state initialisation would make the
   * server and client HTML disagree and React would throw a hydration error on
   * the front page of the product.
   */
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => setReducedMotion(prefersReducedMotion()), [])

  const analytics = useFeedAnalytics()

  /**
   * Put this zone's prefix on a gateway path.
   *
   * The feed hands out `hls_url` / `playback_url` as `/v1/media/{id}/hls/...`,
   * and the master playlist's children are absolute paths of the same shape.
   * Both resolve against the ORIGIN, so under `basePath: "/social"` they land
   * on `/v1/...` — a path this zone does not serve. The visible symptom is a
   * video that fetches its master playlist, reports no error, and never plays.
   *
   * ── It must handle an ALREADY-ABSOLUTE url ────────────────────────────────
   * The obvious implementation is `url.startsWith("/v1/")`, and it silently
   * does nothing for the case that matters. hls.js resolves each child
   * playlist against the master's url while PARSING the manifest, so by the
   * time a loader sees one it is `http://localhost:3004/v1/media/...` — a
   * full url that starts with "http", not with "/v1/". Every child request
   * then goes to the origin unprefixed and 404s. So this works on the parsed
   * pathname, and only for this origin: the segment urls inside a child
   * playlist are absolute links to the MEDIA host, already signed, and
   * prefixing one would break it.
   *
   * The prefix is the same one axios uses, so there is one answer to "where is
   * the gateway" per deployment rather than two that can disagree.
   */
  const resolveUrl = useCallback((url: string) => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || ""
    if (!base) return url
    try {
      const parsed = new URL(url, window.location.href)
      if (parsed.origin !== window.location.origin) return url
      if (!parsed.pathname.startsWith("/v1/")) return url
      parsed.pathname = `${base}${parsed.pathname}`
      return parsed.toString()
    } catch {
      return url
    }
  }, [])

  /**
   * How much of the top of the window is behind chrome — measured, not known.
   * See `useTopChromeInset`.
   */
  const topInset = useTopChromeInset()
  const viewportInset = { top: topInset }

  /**
   * The one playing item, resolved by STABLE ID.
   *
   * Disabled entirely under reduced motion, which is the accessible reading of
   * the setting: not "autoplay more gently" but "do not start video on your
   * own". Every card still plays on demand.
   *
   * The inset is what stops the coordinator crediting a card for the strip of
   * it that is behind the sticky header. Both trackers get the same number
   * from the same measurement, because an impression and a play have to agree
   * about what "on screen" means.
   */
  const coordinator = useAutoplayCoordinator({ enabled: !reducedMotion, viewportInset })
  const activeId = coordinator.activeId

  // Positions are 1-based ranks in the feed as delivered, and are looked up by
  // id — never by array index at the point of use, so a prepended page cannot
  // shift what a card thinks it is.
  const positionOf = useCallback(
    (item: FeedItem) => items.findIndex((i) => i.id === item.id) + 1,
    [items]
  )

  /* ── Impressions ──────────────────────────────────────────────────────── */
  const dwell = useDwellTracker(
    useCallback(
      (id: string, visibleMs: number) => {
        const index = items.findIndex((i) => i.id === id)
        if (index === -1) return
        analytics.recordImpression(items[index], index + 1, visibleMs, id === activeId)
      },
      [items, analytics, activeId]
    ),
    { viewportInset }
  )

  /**
   * One ref per card, cached, feeding both trackers.
   *
   * Each package already caches its own registrar, but composing them in an
   * inline arrow would throw that away — the combined closure would be new on
   * every render and React would detach and re-attach every card's ref, which
   * is precisely the churn the caches exist to prevent. So the composition is
   * cached too, keyed by the same stable post id.
   */
  const cardRefs = useRef(new Map<string, (el: HTMLElement | null) => void>()).current
  const registerAutoplay = coordinator.register
  const registerDwell = dwell.register
  const cardRef = useCallback(
    (id: string) => {
      let fn = cardRefs.get(id)
      if (!fn) {
        fn = (el: HTMLElement | null) => {
          registerAutoplay(id)(el)
          registerDwell(id)(el)
        }
        cardRefs.set(id, fn)
      }
      return fn
    },
    [cardRefs, registerAutoplay, registerDwell]
  )

  /* ── Fetching ─────────────────────────────────────────────────────────── */

  const inFlight = useRef(false)

  const load = useCallback(
    async (nextCursor: string | null, mode: "replace" | "append") => {
      if (inFlight.current) return
      inFlight.current = true
      if (mode === "append") setLoadingMore(true)

      try {
        const page = await fetchFeedPage(nextCursor)
        setItems((prev) => {
          if (mode === "replace") return page.items
          // The ranker can repeat an item across pages. Deduping by id here
          // rather than trusting the cursor keeps React keys unique, which is
          // otherwise a silent rendering corruption rather than a visible bug.
          const seen = new Set(prev.map((i) => i.id))
          return [...prev, ...page.items.filter((i) => !seen.has(i.id))]
        })
        setCursor(page.nextCursor)
        // No cursor means the page came back short, which on this endpoint IS
        // the end-of-feed signal rather than a missing field.
        setReachedEnd(!page.nextCursor)
        setStatus("ready")
      } catch (err: unknown) {
        const e = err as { response?: { status?: number } }
        if (mode === "replace") {
          setStatus("error")
          setErrorMessage(
            e.response?.status === 401
              ? "Your session has expired. Sign in again to see your feed."
              : "The feed did not answer. It may be a moment before it does."
          )
        }
        // A failed NEXT page keeps the feed that is already on screen. Blanking
        // twenty posts someone is reading because page three failed is the
        // worst possible response to a transient error.
      } finally {
        inFlight.current = false
        setLoadingMore(false)
      }
    },
    []
  )

  useEffect(() => {
    if (sessionStatus === "unknown") return
    if (!signedIn) {
      setStatus("error")
      setErrorMessage("Sign in to see your feed.")
      return
    }
    void load(null, "replace")
  }, [signedIn, sessionStatus, load])

  /**
   * Signed URLs expire in five minutes.
   *
   * When a card says its media has gone stale — the deadline passed, or an
   * image 404ed on a signature — the fix is a fresh page rather than a
   * per-image retry: the gateway signs the whole response at once, so one
   * refetch re-signs everything and twenty retries would re-sign nothing.
   *
   * Rate-limited to once every thirty seconds. Twenty cards noticing the same
   * expiry in the same frame must produce one request, and `/v1/feed/home` is
   * capped at 120 requests a minute per user — a refetch loop would spend that
   * budget in seconds and take the feed down for the person it was helping.
   */
  const lastRefresh = useRef(0)
  const handleStale = useCallback(() => {
    const now = Date.now()
    if (now - lastRefresh.current < 30_000) return
    lastRefresh.current = now
    void load(null, "replace")
  }, [load])

  /* ── Interactions ─────────────────────────────────────────────────────── */

  /**
   * The server's answer replaces the optimistic guess, in the list as well as
   * in the button. Without writing it back, scrolling a liked post out of view
   * and back would re-mount the card from stale props and show it unliked.
   */
  const patch = useCallback((id: string, changes: Partial<FeedItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)))
  }, [])

  const onLike = useCallback(
    // `_next` is ignored on purpose: the route is a TOGGLE with no body, so
    // what the caller wanted is not something the server can be told. Its
    // answer is the state.
    async (item: FeedItem, _next: boolean) => {
      const result = await toggleLike(item.id)
      patch(item.id, {
        has_reacted: result.on,
        counts: { ...item.counts, likes: result.count },
      })
      if (result.on) analytics.recordEngagement("like", item, positionOf(item))
      return result
    },
    [patch, analytics, positionOf]
  )

  const onSave = useCallback(
    async (item: FeedItem, next: boolean) => {
      const result = await setBookmark(item.id, next)
      patch(item.id, { is_bookmarked: result.on })
      if (result.on) analytics.recordEngagement("save", item, positionOf(item))
      return result
    },
    [patch, analytics, positionOf]
  )

  const onRepost = useCallback(
    async (item: FeedItem, next: boolean) => {
      const result = await setRepost(item.id, next)
      patch(item.id, {
        has_reposted: result.on,
        repost_count: Math.max(0, (item.repost_count ?? 0) + (result.on ? 1 : -1)),
      })
      // Reported as `share`. The contract has thirteen types and no `repost`,
      // and a repost is the platform's own form of sharing — so it goes in the
      // bucket the creator dashboard already counts rather than being dropped
      // for want of an exact name.
      if (result.on) analytics.recordEngagement("share", item, positionOf(item))
      return result
    },
    [patch, analytics, positionOf]
  )

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (status === "loading") {
    return (
      <Shell muted={muted} onToggleMuted={() => setMuted((m) => !m)} showMute={false}>
        <FeedSkeleton />
      </Shell>
    )
  }

  if (status === "error") {
    return (
      <Shell muted={muted} onToggleMuted={() => setMuted((m) => !m)} showMute={false}>
        <FeedError message={errorMessage} onRetry={() => void load(null, "replace")} />
      </Shell>
    )
  }

  if (items.length === 0) {
    return (
      <Shell muted={muted} onToggleMuted={() => setMuted((m) => !m)} showMute={false}>
        <FeedEmpty onRefresh={() => void load(null, "replace")} />
      </Shell>
    )
  }

  return (
    <Shell muted={muted} onToggleMuted={() => setMuted((m) => !m)} showMute>
      <InfiniteFeed
        hasMore={!reachedEnd}
        loading={loadingMore}
        onLoadMore={() => void load(cursor, "append")}
        loadingIndicator={
          <div className="pt-4">
            <FeedSkeleton count={1} />
          </div>
        }
        endIndicator={<FeedEnd />}
      >
        {items.map((item, index) => {
          const session = activeId === item.id ? analytics.sessionFor(item, index + 1) : undefined
          return (
            <PostCard
              key={item.id}
              item={item}
              // Both trackers bind to the same element and the same stable id,
              // through ONE cached callback — see `cardRef`.
              containerRef={cardRef(item.id)}
              active={activeId === item.id}
              muted={muted}
              onToggleMuted={() => setMuted((m) => !m)}
              session={session}
              onWatchEvent={
                session ? (event) => analytics.recordWatch(item, session, event) : undefined
              }
              resolveUrl={resolveUrl}
              onLike={onLike}
              onSave={onSave}
              onRepost={onRepost}
              onStale={handleStale}
            />
          )
        })}
      </InfiniteFeed>
    </Shell>
  )
}

/**
 * How many pixels at the top of the window are covered by chrome.
 *
 * ── Why this is measured and not written down ─────────────────────────────
 * The zone's header is `sticky top-0` with `h-14` and a 1px bottom border, so
 * "56.67" is a number someone could type here and it would be wrong the moment
 * the header gains a row, loses a border, changes at a breakpoint, or is
 * rendered at a device pixel ratio that lands the border on 0.67px — which is
 * exactly what this measures on the live page at 1440×900. A constant is also
 * wrong for the more ordinary reason that AppHeader lives in another
 * directory: nothing would make the two change together, and nothing would
 * fail if they stopped agreeing. The player would just quietly go back to
 * paying creators for pixels behind a bar.
 *
 * ── How the number is obtained ────────────────────────────────────────────
 * By asking the browser what is painted over the top edge of the viewport.
 * `elementsFromPoint(centreX, 0)` hit-tests that point and returns the whole
 * stack there, ancestors included; anything in it that is `position: fixed` or
 * `sticky` and pinned at or above the top is chrome, and the lowest edge among
 * them is where content starts. That is not a reading of the header's markup —
 * it is a reading of the pixels — so it cannot drift from the header for the
 * same reason a photograph cannot drift from its subject. It needs no
 * agreement with another file, no shared constant, and no CSS variable that
 * could itself be edited apart from the thing it describes.
 *
 * A full-screen overlay is `fixed` too, and would otherwise report the whole
 * window as chrome; anything covering more than a third of the height is not a
 * bar and is ignored. When nothing qualifies — no chrome, or a browser without
 * `elementsFromPoint` — the answer is 0, which is precisely the behaviour this
 * had before it could measure anything.
 *
 * Re-measured on resize (a breakpoint can change the header's height), once
 * the webfonts have settled (a fallback face can change it too), and when the
 * document resizes. Not on scroll: a sticky bar occludes the same strip at
 * every offset, and this is a hit test, not something to run per frame.
 */
const MAX_CHROME_FRACTION = 1 / 3

function measureTopChromeInset(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0
  if (typeof document.elementsFromPoint !== "function") return 0

  const viewportHeight = window.innerHeight
  if (viewportHeight <= 0) return 0
  const x = Math.max(0, Math.floor(window.innerWidth / 2))

  let inset = 0
  for (const el of document.elementsFromPoint(x, 0)) {
    const position = window.getComputedStyle(el).position
    if (position !== "fixed" && position !== "sticky") continue
    const rect = el.getBoundingClientRect()
    // Pinned to the top, and actually covering something.
    if (rect.top > 0.5 || rect.bottom <= 0) continue
    if (rect.bottom > viewportHeight * MAX_CHROME_FRACTION) continue
    if (rect.bottom > inset) inset = rect.bottom
  }
  return inset
}

function useTopChromeInset(): number {
  // 0 on the server and on the first client render, which is the same value on
  // both — reading layout during render would be a hydration mismatch on the
  // front page, the same trap `reducedMotion` above is written around.
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return
    let frame = 0
    let live = true

    const measure = () => {
      frame = 0
      const next = measureTopChromeInset()
      // Sub-pixel jitter is not a change worth re-rendering the feed for, but
      // it IS worth keeping the value itself exact once it does change.
      setInset((prev) => (Math.abs(next - prev) < 0.5 ? prev : next))
    }
    const schedule = () => {
      if (frame || !live) return
      frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener("resize", schedule, { passive: true })
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null
    resizeObserver?.observe(document.documentElement)
    // A webfont swapping in can change a bar's height after first paint.
    document.fonts?.ready.then(schedule).catch(() => {})

    return () => {
      live = false
      window.removeEventListener("resize", schedule)
      resizeObserver?.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return inset
}

/**
 * The feed's own heading, and the one global control.
 *
 * This used to BE the column — `<main className="mx-auto max-w-xl">`, its own
 * width, its own centring, its own page padding. It is not any more: the zone
 * grew a three-column frame (src/chrome/AppFrame.tsx) and that frame owns the
 * `<main>`, the centre track's 600px cap and the page's rhythm. Two things
 * deciding how wide the feed is would have been two things to disagree, and
 * the nested `<main>` would have been a second landmark of the same kind
 * inside the first.
 *
 * What is left here is what only the feed can decide: what the column is
 * called, and whether the videos in it have sound.
 */
function Shell({
  children,
  muted,
  onToggleMuted,
  showMute,
}: {
  children: React.ReactNode
  muted: boolean
  onToggleMuted: () => void
  showMute: boolean
}) {
  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Home
        </h1>
        {showMute && (
          <button
            type="button"
            onClick={onToggleMuted}
            // `aria-pressed` rather than a label that changes meaning: the
            // button IS the mute control, and its state is whether it is on.
            aria-pressed={muted}
            aria-label={muted ? "Unmute videos" : "Mute videos"}
            className="rounded-mo-pill border border-mo px-3 py-1.5 text-sm text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised"
          >
            {muted ? (
              <VolumeX aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Volume2 aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        )}
      </header>
      {children}
    </div>
  )
}
