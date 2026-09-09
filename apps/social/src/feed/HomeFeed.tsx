"use client"

/**
 * The front door, wired.
 *
 * Everything visible here comes from a package. What this file adds is the
 * part that cannot be shared: which endpoint, which analytics surface, what
 * happens when a signed URL goes stale, and how a like reaches the gateway.
 * If a component in here starts growing layout, it belongs in
 * @momentum/content instead — that is the line the zone is thin on one side of.
 *
 * ── It has sections now ───────────────────────────────────────────────────
 * "For You | Following | HashTag", the same three Android shipped and in the
 * same order — see `./tabs.ts`, which copies the set rather than inventing one.
 * The mechanics are split out so this file stays about wiring: `./tabs.ts` is
 * the vocabulary and the URL, `./useFeedRoute.ts` puts the selection in the
 * address bar, `./useTabbedFeed.ts` keeps one paged list per section, and
 * `./FeedTabs.tsx` is the strip. What is left here is what only the feed can
 * decide: which section asks for what, what each says when it is empty, and
 * what the strip costs the player.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import {
  FeedEmpty,
  FeedEnd,
  FeedError,
  FeedSkeleton,
  InfiniteFeed,
  PostCard,
  analyticsReasonFor,
  useDwellTracker,
  type CommentRow,
  type ReportReason,
} from "@momentum/content"
import { prefersReducedMotion, useAutoplayCoordinator } from "@momentum/player"
import { ArrowLeft, Hash, UserPlus } from "lucide-react"
import {
  castPollVote,
  commentFailureMessage,
  createComment,
  fetchComments,
  fileReport,
  pollFailureMessage,
  sendFeedback,
  setBookmark,
  setRepost,
  toggleLike,
} from "./api"
import { FeedTabs, panelId, tabId } from "./FeedTabs"
import type { Notice } from "./outcomes"
import { SectionEmpty, SectionError } from "./TabStates"
import { listKey, type FeedTabId } from "./tabs"
import { TrendingTags } from "./TrendingTags"
import { useFeedAnalytics } from "./useFeedAnalytics"
import { useFeedRoute } from "./useFeedRoute"
import { useTabbedFeed, useTrendingTags } from "./useTabbedFeed"

/**
 * The sound a video starts with, and the last thing in this file that has an
 * opinion about it.
 *
 * A browser refuses to autoplay anything with sound, and the refusal arrives
 * as a rejected promise rather than an exception — so an unmuted autoplay is
 * not "louder", it is a video that silently never starts. Every player begins
 * here and then owns its own sound: once somebody has used the control on a
 * video, their choice wins for that video and nothing above it may overrule
 * them. That is why this is a constant and not state, and why the one mute
 * button that used to sit in the header — silencing twenty players at once,
 * and fighting each player's own setting the moment either was touched — is
 * gone rather than kept alongside.
 */
const STARTS_MUTED = true

export function HomeFeed() {
  /**
   * `userId` is the whole mechanism behind `isOwnPost`.
   *
   * There is no "this is yours" flag on a feed item — `author_id` is on every
   * post and says nothing about who is looking. The viewer comes from
   * `GET /v1/auth/me` through the session provider, which is the only thing on
   * the page that knows, and it is null until that request lands. So the
   * predicate below is false for a moment on every page load, and false is the
   * safe direction to be wrong in: the menu shows a stranger's rows, which
   * means an offer to report your own post rather than an offer to act on
   * somebody else's.
   */
  const { signedIn, status: sessionStatus, userId } = useSession()

  /* ── Which section ────────────────────────────────────────────────────── */

  const [route, go] = useFeedRoute()
  const key = listKey(route)
  const feed = useTabbedFeed(key, signedIn && sessionStatus !== "unknown")
  const trending = useTrendingTags(route.tab === "hashtag" && signedIn)
  const items = feed.list.items

  const selectTab = useCallback(
    (tab: FeedTabId) => {
      // A tab switch is a change of view, not a navigation — see the note on
      // `useFeedRoute`. Returning to HashTag returns to the TAG LIST rather
      // than to whichever tag was last open: the tab's own name is the list,
      // and re-entering a tag silently would make the strip's third label mean
      // two different screens depending on history.
      go({ tab, tag: null }, "replace")
    },
    [go]
  )

  const openTag = useCallback((tag: string) => go({ tab: "hashtag", tag }, "push"), [go])
  const closeTag = useCallback(() => go({ tab: "hashtag", tag: null }, "replace"), [go])

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
   *
   * TWO things are pinned up there now, and both have to be in this number.
   * `useTopChromeInset` reads the header by hit-testing the top edge of the
   * window; the tab strip sits BELOW the header, so that hit test cannot see
   * it and reports the header alone. The strip therefore reports its own
   * height (`onHeightChange`) and it is added here.
   *
   * ── Why this is not a detail ──────────────────────────────────────────────
   * The number is what the autoplay coordinator subtracts before deciding
   * which card is "most visible", and what the dwell tracker subtracts before
   * deciding a card was seen. Leave the strip out and a video that is entirely
   * behind it counts as on screen: it starts playing where nobody can see it
   * and sends watch heartbeats for pixels that were never painted. Watch time
   * is what a creator is paid on, so an under-measured inset is not a cosmetic
   * bug — it is money moving on a false reading.
   *
   * Measured on the live page at 1440×900, scrolled so the strip is stuck:
   * the header's bottom edge is 57, the strip is 53 tall and sits at exactly
   * 57 with no gap, so the band the trackers use starts at 110 rather than 57.
   * `elementsFromPoint(720, 0)` at that moment returns the header alone — the
   * 53 pixels the strip covers are invisible to it, which is the whole reason
   * for the addition.
   *
   * The sum is very slightly conservative before the reader has scrolled — the
   * strip is `sticky`, so at the top of the page it is sitting at y=129 under
   * the Home heading rather than over any post, and those 53 pixels are not
   * yet covering anything. Erring towards "not yet visible" is the safe
   * direction for both trackers, so this does not try to be cleverer than that.
   */
  const headerInset = useTopChromeInset()
  const [tabsHeight, setTabsHeight] = useState(0)
  const viewportInset = { top: headerInset + tabsHeight }

  /**
   * The one playing item, resolved by STABLE ID.
   *
   * Disabled entirely under reduced motion, which is the accessible reading of
   * the setting: not "autoplay more gently" but "do not start video on your
   * own". Every card still plays on demand.
   *
   * The inset is what stops the coordinator crediting a card for the strip of
   * it that is behind the sticky chrome. Both trackers get the same number
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
   *
   * Keying by post id is still right across sections even though one post can
   * appear in two of them: only one section's list is mounted at a time, so
   * there is only ever one element per id, and switching sections unmounts the
   * old cards — which calls each ref with null and unregisters them — before
   * the new ones mount.
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
  const reload = feed.reload
  const handleStale = useCallback(() => {
    const now = Date.now()
    if (now - lastRefresh.current < 30_000) return
    lastRefresh.current = now
    reload()
  }, [reload])

  /* ── Interactions ─────────────────────────────────────────────────────── */

  /**
   * The server's answer replaces the optimistic guess, in the list as well as
   * in the button. Without writing it back, scrolling a liked post out of view
   * and back would re-mount the card from stale props and show it unliked.
   */
  const mutate = feed.mutate
  const patch = useCallback(
    (id: string, changes: Partial<FeedItem>) => {
      mutate((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)))
    },
    [mutate]
  )

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

  /* ── Comments ─────────────────────────────────────────────────────────── */

  /**
   * The two functions the sheet needs, and nothing else.
   *
   * Identity matters here: `CommentSheet` reloads whenever `api` changes,
   * because `load` depends on it. An object literal built in the JSX below
   * would be a new object on every render of the feed — every like, every
   * scroll — and the open sheet would refetch page one each time. Neither
   * function closes over anything, so one object for the life of the zone is
   * correct as well as cheap.
   */
  const comments = useMemo(() => ({ list: fetchComments, create: createComment }), [])

  /**
   * The server accepted a comment.
   *
   * Two things follow, and they are separate on purpose. The count on the
   * action bar is the post's, so it is patched into the item — otherwise
   * scrolling the card out of view and back would re-mount it from stale
   * props and show the old number. The event is the analytics contract's, and
   * `comment_create` is the one engagement type the server does NOT collapse
   * per session, which is why `recordEngagement` gives it an empty dedupe key
   * and why a second and third comment are counted.
   */
  const onCommentCreated = useCallback(
    (item: FeedItem, _row: CommentRow) => {
      patch(item.id, {
        counts: { ...item.counts, comments: (item.counts?.comments ?? 0) + 1 },
      })
      analytics.recordEngagement("comment_create", item, positionOf(item))
    },
    [patch, analytics, positionOf]
  )

  /* ── Polls ────────────────────────────────────────────────────────────── */

  /**
   * A vote, and the poll the server hands back for it.
   *
   * Patched into the item for the same reason a like's count is: the card is
   * seeded from `item.poll`, so a poll that was only ever updated in local
   * component state would go back to its old numbers the moment the card
   * scrolled out of the render window and mounted again.
   *
   * NOT recorded as an engagement. The analytics contract has thirteen types
   * and no vote among them; putting one in the `like` bucket to have somewhere
   * to put it would inflate a number the creator dashboard treats as real. A
   * vote is unmeasured here until the contract has a name for it, which is the
   * same call `repost` did NOT get to make — that one is genuinely a share.
   */
  const onVote = useCallback(
    async (item: FeedItem, optionId: string) => {
      const poll = await castPollVote(item.id, optionId)
      patch(item.id, { poll })
      return poll
    },
    [patch]
  )

  /* ── Steering the feed ────────────────────────────────────────────────── */

  /**
   * The one line of feedback the overflow menu leaves behind.
   *
   * The menu closes the moment a row is pressed — that is what a menu does —
   * so it is not where the answer can be shown, and the card may be about to
   * be removed from the list, so it cannot be shown there either. It goes
   * here, above the feed, and it is cleared on a timer.
   */
  const [notice, setNotice] = useState<Notice | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 5_000)
    return () => window.clearTimeout(id)
  }, [notice])

  /**
   * "Interested", "Not interested", "Don't recommend this account".
   *
   * ── Removed on the press, put back if it was refused ──────────────────────
   * `not_interested` is enforced at the hydration tail of every surface, so
   * the post (or every post by that author) is gone from the NEXT fetch — but
   * the next fetch is minutes away in an infinite feed, and feed-service's own
   * note names the failure exactly: "a 'Not interested' the viewer has to
   * scroll past for five more minutes is a broken button".
   *
   * So the card goes immediately and comes back if the server refuses, which
   * is `useOptimisticToggle`'s bargain applied to a list instead of a boolean
   * — including the half that is easy to skip: the rollback is accompanied by
   * a sentence, because a post that reappears with no explanation reads as a
   * bug rather than as a request that did not land.
   *
   * The undo comes back from `mutate` as a closure rather than as the old
   * array; the note on `TabbedFeed.mutate` says why a value read here would be
   * a render out of date.
   *
   * `interested` removes nothing. It is a ranking hint, not a hide.
   */
  const onFeedback = useCallback(
    (item: FeedItem, signal: "interested" | "not_interested", target: "post" | "author") => {
      const position = positionOf(item)
      const hides = signal === "not_interested"
      let undo: () => void = () => {}

      if (hides) {
        undo = mutate((prev) =>
          prev.filter((i) =>
            target === "author" ? i.author_id !== item.author_id : i.id !== item.id
          )
        )
        // The reasons are the analytics contract's own vocabulary, not the
        // menu's. "Not interested" on a post is `irrelevant`; on an account it
        // is `dislike_creator`, which is what the row means. The event type
        // stays `not_interested` for both — `block_creator` is a block, and
        // "don't recommend" is not one.
        analytics.recordNegative(
          "not_interested",
          item,
          position,
          target === "author" ? "dislike_creator" : "irrelevant"
        )
      }

      void sendFeedback(
        { kind: target, id: target === "author" ? item.author_id : item.id },
        signal
      ).then(({ ok, notice: answer }) => {
        if (!ok && hides) undo()
        setNotice(answer)
      })
    },
    [analytics, positionOf, mutate]
  )

  /**
   * A report, filed.
   *
   * Nothing is removed and nothing is optimistic: a report is a request for
   * somebody to look, not a hide, and the post staying where it is is the
   * truth. The one thing that must not happen is the 409 being painted as a
   * failure — see `reportNotice`, where "you have already reported this" is
   * classified as the confirmation it is.
   *
   * The negative signal is recorded whatever the report's fate. A report is a
   * strong ranking signal in its own right and the queue is a different
   * system; losing the signal because moderation was briefly unreachable
   * would be the wrong trade.
   */
  const onReport = useCallback(
    (item: FeedItem, reason: ReportReason, details: string) => {
      analytics.recordNegative("report", item, positionOf(item), analyticsReasonFor(reason))
      void fileReport(item.id, reason, details).then(setNotice)
    },
    [analytics, positionOf]
  )

  /**
   * Whether the viewer wrote this. See `userId` at the top of the component.
   *
   * `Boolean(userId)` is not redundant with the comparison: `userId` is null
   * until `/v1/auth/me` answers, and an item whose `author_id` is somehow
   * absent would otherwise make `undefined === null` — no, but a future shape
   * where both are missing would compare equal and hand a stranger the
   * author's menu. The check costs nothing and closes that off.
   */
  const isOwnPost = useCallback(
    (item: FeedItem) => Boolean(userId) && item.author_id === userId,
    [userId]
  )

  /* ── Render ───────────────────────────────────────────────────────────── */

  /**
   * Signed out, and no strip.
   *
   * The tabs are three ways of asking a question that needs a session; showing
   * them over a sign-in message would be three controls that all do the same
   * nothing. This is the one branch that renders no `tablist` at all.
   */
  if (sessionStatus !== "unknown" && !signedIn) {
    return (
      <Shell notice={notice}>
        <FeedError message="Sign in to see your feed." />
      </Shell>
    )
  }

  return (
    <Shell notice={notice}>
      <FeedTabs
        selected={route.tab}
        onSelect={selectTab}
        top={headerInset}
        onHeightChange={setTabsHeight}
      />
      <div
        role="tabpanel"
        id={panelId(route.tab)}
        aria-labelledby={tabId(route.tab)}
        /*
          Focusable because a panel is allowed to be, and this one sometimes
          has to be: the skeleton and two of the empty states contain no
          focusable element at all, and a panel with no way into it is a panel
          a keyboard reader cannot reach.
        */
        tabIndex={0}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mo"
      >
        {route.tab === "hashtag" && !route.tag ? (
          <TrendingTags
            status={trending.status}
            tags={trending.tags}
            onOpen={openTag}
            onRetry={trending.reload}
          />
        ) : (
          <>
            {route.tag && <TagHeading tag={route.tag} onBack={closeTag} />}
            <FeedBody
              tab={route.tab}
              tag={route.tag}
              feed={feed}
              onBrowseForYou={() => selectTab("for-you")}
              render={(item, index) => {
                const session =
                  activeId === item.id ? analytics.sessionFor(item, index + 1) : undefined
                return (
                  <PostCard
                    key={item.id}
                    item={item}
                    // Both trackers bind to the same element and the same
                    // stable id, through ONE cached callback — see `cardRef`.
                    containerRef={cardRef(item.id)}
                    active={activeId === item.id}
                    // The value every player on this card STARTS from. Nothing
                    // above a player can change its sound any more; see
                    // `STARTS_MUTED`.
                    muted={STARTS_MUTED}
                    session={session}
                    onWatchEvent={
                      session ? (event) => analytics.recordWatch(item, session, event) : undefined
                    }
                    resolveUrl={resolveUrl}
                    onLike={onLike}
                    onSave={onSave}
                    onRepost={onRepost}
                    onStale={handleStale}
                    /*
                      The comment surface. `comments` is what makes the bar's
                      comment control appear at all — the card drops it when
                      nothing is wired rather than leaving the dead glyph this
                      feed shipped with — and `onComment` is deliberately NOT
                      passed, because that prop means "navigate somewhere
                      instead" and this zone has nowhere to go.
                    */
                    comments={comments}
                    viewerId={userId ?? undefined}
                    onCommentCreated={onCommentCreated}
                    commentError={commentFailureMessage}
                    /*
                      Voting. `viewerId` above is what tells the card whether
                      anybody is signed in — a viewer who has not voted and a
                      viewer who is not there send the same empty
                      `viewer_votes`, and the two want different cards.
                    */
                    onVote={onVote}
                    pollError={pollFailureMessage}
                    /*
                      The overflow menu. `permalink` stays absent for the reason
                      its own note gives — there is no post detail route in this
                      zone, so "Copy link" would copy a link to a page that does
                      not exist and the menu drops the row instead.
                    */
                    isOwnPost={isOwnPost}
                    onFeedback={onFeedback}
                    onReport={onReport}
                  />
                )
              }}
            />
          </>
        )}
      </div>
    </Shell>
  )
}

/**
 * One section's list: its skeleton, its own empty and error states, its posts.
 *
 * ── Three sections, three different sentences ─────────────────────────────
 * This is the part that is easiest to get lazily wrong, and it is not a tone
 * question. An empty **Following** describes a world that is working perfectly
 * and names the one thing that changes it; an empty **For You** means the
 * ranker had nothing right now; a failed fetch means the screen is not the
 * truth. Merge them and the reader loses the ability to tell whether to act or
 * to wait — "we could not load your feed" over a Following tab that loaded
 * fine and honestly contains nothing is a false alarm that sends someone to
 * check their connection instead of following somebody.
 *
 * For You keeps `FeedEmpty` and `FeedError` from @momentum/content verbatim.
 * The other two cannot: those components hardcode their headings. See the note
 * at the top of `./TabStates.tsx` for the props that would remove the
 * duplication, and why this branch does not add them.
 */
function FeedBody({
  tab,
  tag,
  feed,
  onBrowseForYou,
  render,
}: {
  tab: FeedTabId
  tag: string | null
  feed: ReturnType<typeof useTabbedFeed>
  onBrowseForYou: () => void
  render: (item: FeedItem, index: number) => React.ReactNode
}) {
  const { list, loadMore, reload } = feed

  if (list.status === "loading") return <FeedSkeleton />

  if (list.status === "error") {
    // 401 is the one failure worth telling apart by hand: it is not "the feed
    // is down", it is "you are no longer who you were", and the next step is
    // different. Everything else gets one sentence on purpose — a reader
    // cannot act on a status code.
    const expired = list.failure?.status === 401

    if (tag) {
      return (
        <SectionError
          title={`We could not load #${tag}`}
          detail={
            expired
              ? "Your session has expired. Sign in again to see this tag."
              : "The tag's posts did not answer. It may be a moment before they do."
          }
          action={{ label: "Try again", onClick: reload }}
        />
      )
    }
    return (
      <FeedError
        message={
          expired
            ? "Your session has expired. Sign in again to see your feed."
            : "The feed did not answer. It may be a moment before it does."
        }
        onRetry={reload}
      />
    )
  }

  if (list.items.length === 0) {
    if (tag) {
      return (
        <SectionEmpty
          icon={Hash}
          title={`No posts with #${tag} yet`}
          detail="Nothing has been posted with this tag. Be the first."
          action={{ label: "Check again", onClick: reload }}
        />
      )
    }
    if (tab === "following") {
      return (
        <SectionEmpty
          icon={UserPlus}
          // Says what is true, and what changes it. It also says where to go
          // meanwhile, because the honest answer to "this tab is empty" on a
          // new account is "the other tab is not".
          title="Nothing from people you follow yet"
          detail="This tab shows posts from accounts you follow. Follow a few people and they will show up here."
          action={{ label: "Browse For You", onClick: onBrowseForYou }}
        />
      )
    }
    return <FeedEmpty onRefresh={reload} />
  }

  return (
    <InfiniteFeed
      hasMore={!list.reachedEnd}
      loading={list.loadingMore}
      onLoadMore={loadMore}
      loadingIndicator={
        <div className="pt-4">
          <FeedSkeleton count={1} />
        </div>
      }
      endIndicator={<FeedEnd />}
    >
      {list.items.map(render)}
    </InfiniteFeed>
  )
}

/**
 * Which tag is open, and the way back to the list.
 *
 * The tag is an `<h2>` under the page's `<h1>`: it is a section of Home, not a
 * page of its own, and the heading outline should say so to anyone reading by
 * headings. The back control is a button rather than a link because the
 * destination is a state of this page, and it REPLACES rather than pushes so
 * that the browser's own Back still lands on the tag list exactly once instead
 * of walking back through list, tag, list.
 */
function TagHeading({ tag, onBack }: { tag: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to trending tags"
        className="inline-flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <h2 className="min-w-0 truncate font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink">
        #{tag}
      </h2>
    </div>
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
 * ── What it CANNOT see, and who covers that ───────────────────────────────
 * The hit test is at y = 0, so it only ever finds the topmost bar. The feed's
 * tab strip pins BELOW the header — its own top is at 56.67, not 0 — so it is
 * invisible to this and always will be. That is not a bug to fix here by
 * probing further down the page: whether the strip is currently covering
 * anything depends on the scroll offset, and this is deliberately a
 * measurement that does not run per frame. The strip reports its own height
 * instead, and the caller adds the two. See `viewportInset` above.
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
 * The feed's own heading, and whatever the feed last had to say.
 *
 * This used to BE the column — `<main className="mx-auto max-w-xl">`, its own
 * width, its own centring, its own page padding. It is not any more: the zone
 * grew a three-column frame (@momentum/chrome) and that frame owns the
 * `<main>`, the centre track's 600px cap and the page's rhythm. Two things
 * deciding how wide the feed is would have been two things to disagree, and
 * the nested `<main>` would have been a second landmark of the same kind
 * inside the first.
 *
 * ── The mute button that used to sit here is gone ─────────────────────────
 * One control, wired to one `muted` state, passed to twenty cards. Sound is a
 * property of a player now: each one starts from `STARTS_MUTED` and then owns
 * its own, so a header switch could only either be ignored — a control that
 * does nothing — or override a choice somebody had already made on a video
 * they were watching. Both are worse than the button not being there, and the
 * per-player control is the one that is actually where the sound is.
 *
 * What is left is what only the feed can decide: what the column is called,
 * and the answer to the last thing that was asked of it.
 */
function Shell({ children, notice }: { children: React.ReactNode; notice: Notice | null }) {
  return (
    <div>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Home
        </h1>
      </header>
      {/*
        Always rendered, so a screen reader has a live region to announce INTO
        — a `role="status"` that appears at the same moment as its text is a
        region the announcement can be missed by. `role="status"` rather than
        `alert` because none of these interrupts anything: the worst of them
        says a ranking hint did not record.

        In flow rather than floating: a pill fixed to the bottom of the window
        would sit over the action bar of whatever card is down there, and this
        column already has a top the eye returns to after using the menu.
      */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && (
          <p
            className={[
              "mb-4 rounded-mo border border-mo bg-mo-raised px-3 py-2 text-sm",
              notice.tone === "good" ? "text-mo-good" : "text-mo-bad",
            ].join(" ")}
          >
            {notice.text}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}
