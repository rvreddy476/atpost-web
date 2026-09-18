"use client"

/**
 * MShorts: a full-screen vertical scroller, one short at a time, snapped.
 *
 * ── What this file owns ───────────────────────────────────────────────────
 * The queue, the tab strip, the keyboard, the sound answer, every write on the
 * rail, the comments panel and the "…" sheet. What it does NOT own is anything
 * about one short's picture — that is ./Reel.tsx — or any URL, which is
 * ./api.ts.
 *
 * ── Sound is ONE answer for the surface, not one per player ───────────────
 * The web feed has per-player mute because it shows twenty videos at once and
 * silencing one means that one. A surface that shows exactly one video at a
 * time is the phone's case: "the sound is off" is a statement about the
 * session, and the next short is silent too. `useSoundPreference` holds it and
 * moves `@momentum/player`'s shared default with it, so the next short STARTS
 * in the state the person chose rather than starting loud and being silenced a
 * frame later. The full argument is in ./useReelTransport.ts.
 *
 * The web cannot promise "sound is ON when MShorts opens" and the speaker
 * never pretends otherwise: a browser refuses to start an unmuted video before
 * the document has had a gesture, and the refusal arrives as a video that
 * silently never plays. One press of the speaker is that gesture, and from then
 * on every short starts with sound.
 *
 * ── The chrome is 48px drawn OVER the video ──────────────────────────────
 * Not a bar that takes layout: a full-screen video surface whose chrome takes
 * layout is not full screen. `insetTop` measures it rather than assuming it,
 * because the number the trackers believe has to be the number the CSS
 * produced — watch time is what a creator is paid on, and an inset that has
 * drifted from the real chrome is money moving on a false reading.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { signInHref } from "@momentum/chrome"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import { pickThumb, useDwellTracker } from "@momentum/content"
import { prefersReducedMotion, useAutoplayCoordinator } from "@momentum/player"
import { ZONE } from "@/zone"
import { Reel } from "./Reel"
import { CommentsPanel } from "./CommentsPanel"
import { ReelMenu } from "./ReelMenu"
import { moveTarget, reelKeyAction } from "./keys"
import { applyCount, optimisticCount } from "./rail"
import { feedbackNotice, reportOutcome, type ReelMenuRowId } from "./menu"
import { stateAnnouncement } from "./transport"
import {
  failureOf,
  fetchAudioTrack,
  fileReport,
  hidePost,
  muteAuthor,
  recordShare,
  sendFeedback,
  setReaction,
  setSaved,
} from "./api"
import { canWrite as canWriteFor, emptyCopy, sourceFor, tabsFor, type ReelsTab } from "./source"
import { useFollowStates } from "./useFollowStates"
import { useComments } from "./useComments"
import { useReelsAnalytics } from "./useReelsAnalytics"
import { useReelsFeed } from "./useReelsFeed"
import { useSoundPreference } from "./useReelTransport"
import { ReelsEmpty, ReelsError, ReelsLoading, ReelsSignInPill } from "./states"

/**
 * A short's audio track id.
 *
 * `FeedItem` in @atpost/types does not declare it — that package is shared and
 * is another agent's to widen — so it is read through a local widening rather
 * than with a cast at the point of use. Optional, because most shorts do not
 * carry one and an absent track is the ordinary case rather than a gap.
 */
type WithAudio = FeedItem & { audio_track_id?: string }

export function ReelsViewer({ initialPostId }: { initialPostId?: string }) {
  const session = useSession()
  /**
   * `signedOut` and not `!signedIn`.
   *
   * `signedIn` is false while the status is still "unknown", and a zone that
   * waited for certainty before its first fetch would add a round trip to
   * every visit. `signedOut` is the only state that is KNOWN, and the layout
   * seeds the session provider from the request's own cookie so it is known
   * before the first paint rather than after a round trip.
   */
  const signedOut = session.signedOut
  const canWrite = canWriteFor(signedOut)

  const [tab, setTab] = useState<ReelsTab>("for-you")
  const source = sourceFor(signedOut, tab)
  /**
   * The deep link belongs to the ranked feed and to nothing else.
   *
   * Switching to Following after arriving at `/reels/{id}` must not make the
   * new list hunt through twelve pages for a short whose author the viewer does
   * not follow — the walk would run to its bound and then say "we could not
   * find it" over a perfectly good feed.
   */
  const deepLinkId = tab === "for-you" ? initialPostId : undefined
  const feed = useReelsFeed(source, deepLinkId)
  const analytics = useReelsAnalytics()
  const sound = useSoundPreference()

  const scroller = useRef<HTMLDivElement | null>(null)
  const header = useRef<HTMLElement | null>(null)
  const [index, setIndex] = useState(0)

  /**
   * Reduced motion, read after mount.
   *
   * `matchMedia` does not exist on the server, and reading it during render
   * would make the server and client HTML disagree. Under reduced motion the
   * coordinator is disabled entirely — the accessible reading of the setting is
   * "do not start video on your own", not "autoplay more gently" — and the
   * double-tap heart is not drawn at all, because it is pure animation and
   * carries nothing the rail's own heart does not. Every short still plays on
   * demand from the play button and from Space.
   */
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => setReducedMotion(prefersReducedMotion()), [])

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

  const current = items[index] as WithAudio | undefined

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
   * One ref per short, cached, feeding both trackers.
   *
   * Each package caches its own registrar, and composing them in an inline
   * arrow would throw that away: the combined closure would be new on every
   * render and React would detach and re-attach every ref, which is exactly the
   * churn the caches exist to prevent. So the composition is cached too, keyed
   * by the stable post id.
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

  /* ── Which short is on screen ─────────────────────────────────────────── */

  /**
   * The index is derived from the SCROLL POSITION, not from `activeId`.
   *
   * They agree almost always, and the exception is the one that matters: under
   * reduced motion the coordinator is disabled and `activeId` is null for ever,
   * so an index derived from it would freeze at the first short and the keyboard
   * would stop working for exactly the people most likely to be using it.
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
  // the surface is near its end.
  const noteIndex = feed.noteIndex
  useEffect(() => {
    noteIndex(index)
  }, [index, noteIndex])

  /** A tab switch is a new list, so the scroller goes back to the top. */
  useEffect(() => {
    setIndex(0)
    scroller.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [source])

  /**
   * Move to a short and let the scroller snap.
   *
   * `scrollTo` on the container rather than `scrollIntoView` on the child:
   * `scrollIntoView` walks up and scrolls every scrollable ancestor, which on a
   * page whose body also scrolls produces a second, competing scroll.
   */
  const moveTo = useCallback((next: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" })
  }, [])

  /* ── What the surface says about itself ───────────────────────────────── */

  /**
   * One line, over everything, for what a control DID.
   *
   * `role="status"` so it is announced without stealing focus from the video,
   * and re-keyed on every message so the same sentence twice is announced
   * twice — a live region re-rendered with an identical string is silent in
   * some engines and repeats in others, and "Liked" that does not speak the
   * second time is worse than one that speaks too often.
   *
   * Nothing about the PLAYHEAD goes in here. A region announcing a position
   * four times a second is a screen reader that cannot be used; the position
   * lives on the slider's own `aria-valuetext`, on demand. See ./transport.ts.
   */
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null)
  const noticeKey = useRef(0)
  const say = useCallback((text: string) => {
    noticeKey.current += 1
    setNotice({ text, key: noticeKey.current })
  }, [])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2_500)
    return () => window.clearTimeout(id)
  }, [notice])

  /** A write that needs a session, attempted without one. */
  const needSignIn = useCallback(() => {
    say("Sign in to do that.")
  }, [say])

  /* ── The deep link ────────────────────────────────────────────────────── */

  /**
   * Jump once, without animation, when the linked short turns up.
   *
   * `behavior: "auto"` rather than "smooth": arriving at /reels/{id} should put
   * that short on screen, not scroll past everything in front of it while the
   * person watches.
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

  /* ── The audio line ──────────────────────────────────────────────────── */

  /**
   * The track name for the short on screen, and only for that one.
   *
   * One request per distinct track, cached for the life of the surface, and
   * never fired for a neighbour: the line is one row of text, so prefetching it
   * for shorts nobody has reached is two requests bought for nothing. A failure
   * leaves the id out of the map for ever rather than retrying — a missing audio
   * line looks exactly like a short with no track, which is the honest fallback.
   */
  const [audioNames, setAudioNames] = useState<Map<string, string>>(new Map())
  const audioAsked = useRef(new Set<string>())
  const audioId = current?.audio_track_id
  useEffect(() => {
    if (!audioId || audioAsked.current.has(audioId)) return
    audioAsked.current.add(audioId)
    let cancelled = false
    void fetchAudioTrack(audioId).then((track) => {
      if (cancelled || !track) return
      const name = track.title?.trim()
      if (!name) return
      const artist = (track.artist || track.artist_name)?.trim()
      setAudioNames((prev) =>
        new Map(prev).set(audioId, artist ? `${name} · ${artist}` : name)
      )
    })
    return () => {
      cancelled = true
    }
  }, [audioId])

  /* ── The rail's handlers ─────────────────────────────────────────────── */

  const positionOf = useCallback(
    (item: FeedItem) => items.findIndex((i) => i.id === item.id) + 1,
    [items]
  )

  /**
   * Like, or unlike.
   *
   * Optimistic, with a rollback that puts BOTH halves back — the flag and the
   * count — from the values the item had when the press happened. Rolling back
   * only the flag leaves a heart that is dark over a count that went up, which
   * is the state people screenshot.
   *
   * The server's own count replaces ours when it answers, because other people
   * have been liking this too and our ±1 was a fast approximation rather than
   * the truth. When it answers without a count the guess is kept; `applyCount`
   * in ./rail.ts is that rule.
   */
  const onLike = useCallback(
    (item: FeedItem) => {
      if (!canWrite) return needSignIn()
      const before = { has_reacted: item.has_reacted, counts: item.counts }
      const wanted = !item.has_reacted
      const guess = optimisticCount(item.counts?.likes ?? 0, wanted)
      feed.patch(item.id, {
        has_reacted: wanted,
        counts: { ...item.counts, likes: guess },
      })
      say(stateAnnouncement(wanted ? "liked" : "unliked"))
      setReaction(item.id, wanted)
        .then((result) => {
          feed.patch(item.id, {
            has_reacted: result.on,
            counts: { ...item.counts, likes: applyCount(guess, result.count) },
          })
          // No engagement event: `AnalyticsEventType` has no "like" arm, and
          // the server counts reactions from the reaction endpoint itself. A
          // made-up type would be stored as "other" and pollute a dimension a
          // creator is paid on.
        })
        .catch(() => {
          feed.patch(item.id, before)
          say("That like did not go through.")
        })
    },
    [canWrite, feed, needSignIn, say]
  )

  const onSave = useCallback(
    (item: FeedItem) => {
      if (!canWrite) return needSignIn()
      const wanted = !item.is_bookmarked
      feed.patch(item.id, { is_bookmarked: wanted })
      say(stateAnnouncement(wanted ? "saved" : "unsaved"))
      setSaved(item.id, wanted)
        .then((result) => {
          feed.patch(item.id, { is_bookmarked: result.on })
          if (result.on) analytics.recordEngagement("save", item, positionOf(item))
        })
        .catch(() => {
          feed.patch(item.id, { is_bookmarked: item.is_bookmarked })
          say("That could not be saved.")
        })
    },
    [analytics, canWrite, feed, needSignIn, positionOf, say]
  )

  /** The canonical link for a short, which is what makes Share mean anything. */
  const linkFor = useCallback(
    (item: FeedItem) =>
      `${window.location.origin}${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/${item.id}`,
    []
  )

  /**
   * Share.
   *
   * `navigator.share` where the browser has it, the clipboard where it does
   * not. Nothing is invented when neither works — the control reports that it
   * could not, rather than pretending. The share is recorded on the SERVER only
   * once the link has actually left: an abort is somebody changing their mind,
   * and crediting a creator for a dialog that was dismissed is a number that
   * does not correspond to anything.
   */
  const onShare = useCallback(
    (item: FeedItem) => {
      const url = linkFor(item)
      const done = () => {
        void recordShare(item.id)
        analytics.recordEngagement("share", item, positionOf(item))
      }
      if (navigator.share) {
        navigator
          .share({ url, title: `Short by ${item.author?.display_name ?? "someone"}` })
          .then(done)
          .catch(() => undefined)
        return
      }
      navigator.clipboard
        ?.writeText(url)
        .then(() => {
          say("Link copied.")
          done()
        })
        .catch(() => say("Could not copy the link."))
    },
    [analytics, linkFor, positionOf, say]
  )

  const onFollow = useCallback(
    async (authorId: string, next: "follow" | "unfollow") => {
      if (!canWrite) {
        needSignIn()
        throw new Error("signed out")
      }
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
        // The button is keyed on the edge, so the rollback inside `toggle` has
        // already unmounted it before it could show its own failure. Say so
        // here instead of letting the label quietly snap back.
        say(next === "follow" ? "Could not follow them." : "Could not unfollow them.")
        throw error
      }
    },
    [analytics, canWrite, follows, items, needSignIn, positionOf, say]
  )

  /* ── Comments ────────────────────────────────────────────────────────── */

  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const commentsItem = items.find((i) => i.id === commentsFor)
  /**
   * The count on the rail moves with the panel.
   *
   * The panel is the only place a comment can be written on this surface, so if
   * the rail's number did not move the person would have to reload to see their
   * own comment counted — and the number under the glyph is exactly what people
   * check to decide whether it posted.
   */
  const onCommentCount = useCallback(
    (delta: number) => {
      if (!commentsFor) return
      const item = items.find((i) => i.id === commentsFor)
      if (!item) return
      feed.patch(commentsFor, {
        counts: { ...item.counts, comments: Math.max(0, (item.counts?.comments ?? 0) + delta) },
      })
    },
    [commentsFor, feed, items]
  )
  const thread = useComments({
    reelId: commentsFor,
    viewerId: session.userId,
    canWrite,
    onCountChange: onCommentCount,
  })

  const onComment = useCallback((item: FeedItem) => {
    // Opened for a signed-out viewer too: reads on this endpoint do not need a
    // session, and hiding the conversation from somebody who arrived on a
    // shared link hides most of what makes the link worth sharing. The composer
    // is what says they need an account.
    setCommentsFor(item.id)
  }, [])

  /* ── The "…" sheet ───────────────────────────────────────────────────── */

  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuItem = items.find((i) => i.id === menuFor)
  const onMenu = useCallback((item: FeedItem) => setMenuFor(item.id), [])

  const onMenuRow = useCallback(
    (row: Exclude<ReelMenuRowId, "report">) => {
      const item = menuItem
      if (!item) return
      if (row === "copy-link") {
        navigator.clipboard
          ?.writeText(linkFor(item))
          .then(() => say("Link copied."))
          .catch(() => say("Could not copy the link."))
        return
      }
      if (row === "not-interested") {
        // Removed from the queue straight away, because the person has just
        // said they do not want to see it. Both calls go out: the FEEDBACK
        // teaches the ranker, and `hide` takes this post out of the page the
        // ranker has already scored — without it the short comes back on the
        // next page, which reads as the button having done nothing.
        feed.remove(item.id)
        void hidePost(item.id).catch(() => undefined)
        sendFeedback({ kind: "post", id: item.id }, "not_interested")
          .then(() => say(feedbackNotice("not-interested", true)))
          .catch(() => say(feedbackNotice("not-interested", false)))
        analytics.recordEngagement("not_interested", item, positionOf(item))
        return
      }
      // "Don't recommend this account" — everything they have posted goes, not
      // just this one, which is what the row promises.
      for (const other of items.filter((i) => i.author_id === item.author_id)) {
        feed.remove(other.id)
      }
      muteAuthor(item.author_id)
        .then(() => say(feedbackNotice("mute-author", true)))
        .catch(() => say(feedbackNotice("mute-author", false)))
    },
    [analytics, feed, items, linkFor, menuItem, positionOf, say]
  )

  const onReport = useCallback(
    (reason: string, details: string) => {
      const item = menuItem
      if (!item) return
      fileReport(item.id, reason, details)
        .then(() => say(reportOutcome(undefined).notice))
        .catch((error) => say(reportOutcome(failureOf(error).status).notice))
    },
    [menuItem, say]
  )

  /* ── Sound ───────────────────────────────────────────────────────────── */

  /**
   * One object for every short, cached.
   *
   * `Reel` is not memoised, so this is not about skipping renders — it is
   * about the `useCallback`s INSIDE it, which take `handlers` as a dependency.
   * A fresh object per render makes every one of them fresh too, including the
   * gesture handler that holds the double-tap timer, and a handler rebuilt
   * mid-gesture is a double-tap that becomes two single taps.
   */
  const handlers = useMemo(
    () => ({ onLike, onSave, onShare, onComment, onMenu, onFollow, onAnnounce: say }),
    [onComment, onFollow, onLike, onMenu, onSave, onShare, say]
  )

  const onToggleMuted = useCallback(() => {
    const next = !sound.muted
    sound.setMuted(next)
    say(stateAnnouncement(next ? "muted" : "unmuted"))
  }, [say, sound])

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  /**
   * The `<video>` each mounted short is currently showing.
   *
   * Reported up by the short that owns it, from `MomentumVideo`'s `videoRef`.
   * This replaced a `scroller.querySelector('[data-reel-id=…] video')` — the
   * same DOM hunt the package added `videoRef` to retire, one level further
   * out, with the same failure mode the day an element moves inside it.
   *
   * The registrar is cached per id exactly as `registerRef` is: a fresh closure
   * every render would make the effect in `Reel` that calls it re-run every
   * render, which on a playing video is a null-then-set on every frame of a
   * scroll.
   */
  const videos = useRef(new Map<string, HTMLVideoElement>()).current
  const videoRegistrars = useRef(new Map<string, (el: HTMLVideoElement | null) => void>()).current
  const registerVideo = useCallback(
    (id: string) => {
      const cached = videoRegistrars.get(id)
      if (cached) return cached
      const set = (el: HTMLVideoElement | null) => {
        if (el) videos.set(id, el)
        else videos.delete(id)
      }
      videoRegistrars.set(id, set)
      return set
    },
    [videoRegistrars, videos]
  )

  /** Play or pause the short on screen. */
  const togglePlayback = useCallback(() => {
    const item = items[index]
    if (!item) return
    const video = videos.get(item.id)
    // Outside the mount window, or not attached yet. Nothing to press, and
    // nothing worth saying about it.
    if (!video) return
    if (video.paused) {
      const started = video.play()
      if (started && typeof started.catch === "function") started.catch(() => {})
      say(stateAnnouncement("playing"))
    } else {
      video.pause()
      say(stateAnnouncement("paused"))
    }
  }, [index, items, say, videos])

  /**
   * The handler sits on the SCROLLER and catches keys that bubble.
   *
   * This surface has exactly one keyboard owner now: `controls={false}` leaves
   * the player `tabIndex={-1}` with no key handler of its own, so nothing has
   * to be negotiated with it. The comments panel and the "…" sheet both call
   * `stopPropagation` on every key, which is what keeps a `c` typed into a
   * comment from opening the panel it was typed in.
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
      // Only once the key is known to be ours. ↑/↓ and Space would otherwise be
      // prevented from scrolling anything else on the page.
      event.preventDefault()

      const item = items[index]
      switch (action.kind) {
        case "move": {
          const next = moveTarget(index, action.delta, items.length)
          if (next !== index) moveTo(next)
          return
        }
        case "playPause":
          togglePlayback()
          return
        case "mute":
          onToggleMuted()
          return
        case "like":
          if (item) onLike(item)
          return
        case "comments":
          if (item) onComment(item)
          return
      }
    },
    [index, items, moveTo, onComment, onLike, onToggleMuted, togglePlayback]
  )

  useEffect(() => {
    // Focus the scroller so the arrows work without a click first. Not an
    // autofocus on a control — this moves focus to a container, which is what a
    // full-screen viewer is.
    scroller.current?.focus({ preventScroll: true })
  }, [])

  /* ── The next poster, fetched before it is needed ─────────────────────── */

  /**
   * Warm the next short's poster.
   *
   * The short after this one has a player mounted, so it is already buffering —
   * but a player paints its `poster` only when it has it, and on a slow
   * connection the poster loses the race with the swipe. One `Image()` per
   * neighbour, never awaited, never rendered: the browser's own cache is the
   * whole mechanism, and a failure is a poster that paints a beat later rather
   * than anything to report.
   */
  useEffect(() => {
    const next = items[index + 1]
    const media = next?.media?.find((m) => m.kind === "video")
    // `pickThumb` and not `variants["thumb_150"]`: the variant names differ by
    // kind and are not a fixed set, and the picker is the one place that
    // ordering lives. `pickPoster` is the wrong one here — it refuses a 150px
    // still for a video on purpose, because stretching one across a 600px card
    // looks like a fault, and this is not being drawn at all.
    const poster = media ? pickThumb(media) : null
    if (!poster || typeof Image === "undefined") return
    const img = new Image()
    img.src = poster
  }, [index, items])

  /* ── What is on screen ────────────────────────────────────────────────── */

  const tabs = tabsFor(signedOut)

  const body = () => {
    if (feed.loading) return <ReelsLoading />
    if (feed.error && items.length === 0) {
      return <ReelsError message={feed.error} onRetry={feed.retry} />
    }
    if (feed.deepLinkMissing && items.length === 0) {
      return <ReelsError message="That short is not in your feed." />
    }
    if (items.length === 0) {
      const copy = emptyCopy(source)
      return <ReelsEmpty title={copy.title} body={copy.body} offerSignIn={signedOut} />
    }
    return null
  }

  const fallback = body()

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-mo-bg">
      {/* The zone's whole chrome. Over the short on its own scrim, the way the
          phone's header is, and 48px tall — which is the number `insetTop`
          measures rather than the number it assumes. */}
      <header
        ref={header}
        className="absolute inset-x-0 top-0 z-30 flex h-12 items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-4"
      >
        {/*
          Back to the BROWSE PAGE, and `"/"` is right because `next/link`
          prefixes this zone's basePath — Next makes it `/reels`. Expand and
          back are one gesture and its undo.

          `router.back()` was considered and rejected. It is correct when there
          is history and silently wrong when there is not: a shared /reels/{id}
          opened cold has no previous page in this app, and Back would either do
          nothing or leave the site. A link lands somewhere real either way.
        */}
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 rounded-mo-pill px-2 py-1 text-sm font-semibold text-white hover:bg-white/10"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          <span className="sr-only">Back to </span>
          {BRAND.name}
        </Link>

        {/* The strip, centred, and absent entirely when signed out — see
            ./source.ts. A `tablist` rather than two buttons, so the arrows
            move between them and a screen reader says "1 of 2". */}
        {tabs.length > 0 && (
          <div role="tablist" aria-label="Shorts feeds" className="mx-auto flex items-center gap-1">
            {tabs.map((spec) => {
              const selected = spec.id === tab
              return (
                <button
                  key={spec.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(spec.id)}
                  className={[
                    "rounded-mo-pill px-3 py-1 text-sm font-semibold transition-colors duration-150 ease-mo",
                    selected ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {spec.label}
                </button>
              )
            })}
          </div>
        )}

        {signedOut && <ReelsSignInPill />}
      </header>

      {fallback ? (
        <div className="flex h-full w-full items-center justify-center px-6">{fallback}</div>
      ) : (
        <div
          ref={scroller}
          tabIndex={-1}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          // `h-full` on a `h-dvh` parent, so one short is exactly one viewport
          // and `scrollTop / clientHeight` is an index rather than an
          // approximation of one. `overscroll-contain` stops a swipe past the
          // last short becoming the browser's pull-to-refresh.
          className="reels-scroller h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none"
          aria-roledescription="carousel"
          aria-label="Shorts"
        >
          {items.map((item, at) => (
            <Reel
              key={item.id}
              item={item}
              position={at + 1}
              total={items.length}
              active={item.id === activeId}
              current={at === index}
              // The current short and its immediate neighbours, and nothing
              // else. `beyondViewportPageCount = 1`, in the web's units.
              mounted={Math.abs(at - index) <= 1}
              viewerId={session.userId}
              followState={follows.edges.get(item.author_id)}
              session={analytics.sessionFor(item, at + 1)}
              muted={sound.muted}
              onToggleMuted={onToggleMuted}
              reducedMotion={reducedMotion}
              audioName={audioNames.get((item as WithAudio).audio_track_id ?? "") ?? null}
              onWatchEvent={(event) => {
                const info = analytics.sessionFor(item, at + 1)
                if (info) analytics.recordWatch(item, info, event)
              }}
              registerRef={registerRef(item.id)}
              onVideoElement={registerVideo(item.id)}
              handlers={handlers}
            />
          ))}
          {/* An honest end, rather than a spinner that never resolves. */}
          {feed.ended && (
            <div className="flex h-full w-full snap-start items-center justify-center px-6 text-center">
              <p className="text-sm text-mo-body">
                That is every short for now. Scroll back up for another look.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Both of these are siblings of the scroller and not children of a
          short, which is the whole reason the video keeps playing while they
          are open — and keeps its watch session, which matters beyond
          politeness: a session torn down and remade halfway through a view is
          two half-views in a creator's payout data. */}
      <CommentsPanel
        open={Boolean(commentsFor)}
        onClose={() => setCommentsFor(null)}
        thread={thread}
        authorName={commentsItem?.author?.display_name || "someone"}
        postAuthorId={commentsItem?.author_id}
        viewerId={session.userId}
        canWrite={canWrite}
        signInHref={signInHref(ZONE)}
        commentsClosed={Boolean(commentsItem?.no_comments)}
      />

      <ReelMenu
        open={Boolean(menuFor)}
        onClose={() => setMenuFor(null)}
        label={`the short by ${menuItem?.author?.display_name || "someone"}`}
        isOwn={Boolean(session.userId && menuItem?.author_id === session.userId)}
        canWrite={canWrite}
        onRow={onMenuRow}
        onReport={onReport}
      />

      {notice && (
        <p
          key={notice.key}
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-mo-pill bg-mo-overlay px-4 py-2 text-sm text-mo-ink shadow-mo"
        >
          {notice.text}
        </p>
      )}
    </div>
  )
}
