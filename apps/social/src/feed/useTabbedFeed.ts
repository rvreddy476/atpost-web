"use client"

/**
 * One paged list per section, all of them alive at once.
 *
 * ── Why a map and not `useState` reset on switch ──────────────────────────
 * The obvious implementation keeps one `items`/`cursor` pair and clears it
 * when the tab changes. It has two failure modes and the first is the one the
 * brief calls out:
 *
 *   · **The wrong posts under the new heading.** Clearing state is a render
 *     apart from switching tabs, so for one frame the previous tab's twenty
 *     posts sit under the new tab's name. Keeping them in separate buckets
 *     makes that frame impossible rather than unlikely: the list rendered is
 *     addressed BY the tab, so it can never be another tab's.
 *   · **A refetch on every return.** Flipping to Following and back would
 *     throw away For You's four loaded pages and drop the reader to the top of
 *     a freshly ranked feed — losing their place and, because the ranker is not
 *     stable, losing the posts they were reading. Android reached the same
 *     conclusion from the other end (`cachedIn` per tab, in FeedViewModel) for
 *     the same reason.
 *
 * The cost is memory: three tabs' pages instead of one tab's. That is bounded
 * by how far a person actually scrolls and is the cheaper half of the trade.
 *
 * ── Requests are keyed, not counted ───────────────────────────────────────
 * The in-flight guard is a Set of keys rather than a single boolean, because
 * two tabs may legitimately be loading at once — arrowing across the strip
 * starts Following's first page while For You's next page is still in the air,
 * and a shared boolean would silently drop one of them.
 *
 * ── A tag is a key too ────────────────────────────────────────────────────
 * `tag:momentum` and `tag:test` are separate buckets. One bucket for "the
 * hashtag tab" would show the previous tag's posts under the new tag's name,
 * which is the first failure above wearing a different hat.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchFeedPage } from "./api"
import {
  fetchHashtagPage,
  fetchHomePage,
  fetchTrendingTags,
  type LoadedPage,
  type TrendingTag,
} from "./tabApi"
import { failureOf, type Failure } from "./outcomes"

export type ListStatus = "loading" | "ready" | "error"

export interface ListState {
  items: FeedItem[]
  cursor: string | null
  status: ListStatus
  /** Why the FIRST page failed. Null unless `status` is "error". */
  failure: Failure | null
  loadingMore: boolean
  reachedEnd: boolean
  /**
   * Why the NEXT page failed, when one did. Null otherwise.
   *
   * Separate from `failure` because the two mean opposite things about what
   * is on screen. A failed first page means the list is not the truth and is
   * replaced by an error. A failed next page means the list is still true and
   * merely shorter, so the posts stay and the caller shows a line under them
   * — which is the half that was missing: this used to be caught, discarded,
   * and the loading flag cleared, leaving a list that simply stopped growing
   * with nothing on screen to say why.
   *
   * It is also what the pager's sentinel is disarmed on. Leaving the observer
   * armed after a failure turns one dead connection into a request every time
   * it re-arms.
   */
  loadMoreFailure: Failure | null
  /**
   * True when the page's author names could not be looked up. Only the
   * hashtag lists can set it — see `hydrateAuthors` in ./tabApi.ts.
   */
  authorsUnresolved: boolean
}

const BLANK: ListState = {
  items: [],
  cursor: null,
  status: "loading",
  failure: null,
  loadingMore: false,
  reachedEnd: false,
  loadMoreFailure: null,
  authorsUnresolved: false,
}

/**
 * Which request a key means.
 *
 * `for-you` deliberately calls `fetchFeedPage` from `./api` rather than a
 * local equivalent: that function is where the "always `ranked`, because the
 * front door must not be blank for a new account" decision is written down,
 * and moving the call would move the decision away from its reasoning. The
 * other two are in `./tabApi` — see the long note there on why Following must
 * NOT send `ranked`.
 */
function pageFor(key: string, cursor: string | null): Promise<LoadedPage> {
  if (key === "for-you") return fetchFeedPage(cursor)
  if (key === "following") return fetchHomePage("following", cursor)
  if (key.startsWith("tag:")) return fetchHashtagPage(key.slice("tag:".length), cursor)
  return Promise.reject(new Error(`no request is defined for feed list "${key}"`))
}

/* ── The transitions, pulled out so they can be checked ───────────────────── */

/**
 * Which of the two requests a list can make.
 *
 * They are not two flavours of the same thing. `replace` is "this list, from
 * the top" — the first visit and the reader's own retry — and its failure
 * means the screen is not the truth. `append` is "the next page", and its
 * failure means the screen is true and merely shorter. Everything below turns
 * on that difference, which is why it is a parameter and not an inference.
 */
export type LoadMode = "replace" | "append"

/**
 * The state a request starts from.
 *
 * `loadMoreFailure` is cleared on the ATTEMPT rather than on its outcome: a
 * retry button and the sentence explaining why it is there must not both sit
 * on screen while that very retry is in the air.
 */
export function startLoading(current: ListState, mode: LoadMode): ListState {
  return { ...current, loadingMore: mode === "append", loadMoreFailure: null }
}

/**
 * The state a page landing produces.
 *
 * Two things here are easy to get wrong and both are tested:
 *
 *   · **Dedupe by id, not by cursor.** The ranker can repeat an item across
 *     pages. Trusting the cursor would put two cards with the same React key
 *     in one list, which is a silent rendering corruption rather than a
 *     visible bug.
 *   · **`authorsUnresolved` is sticky across an append.** A later page whose
 *     names DID resolve does not make the earlier page's unnamed cards named,
 *     and the notice is about what is on screen rather than about the last
 *     request. A `replace` takes the page's answer outright, which is what
 *     makes the reader's "Try again" able to clear it.
 */
export function applyPage(current: ListState, page: LoadedPage, mode: LoadMode): ListState {
  const seen = new Set(current.items.map((i) => i.id))
  const items =
    mode === "replace"
      ? page.items
      : [...current.items, ...page.items.filter((i) => !seen.has(i.id))]
  return {
    items,
    cursor: page.nextCursor,
    status: "ready",
    failure: null,
    loadingMore: false,
    // No cursor means the page came back short, which on these endpoints IS
    // the end-of-list signal rather than a missing field.
    reachedEnd: !page.nextCursor,
    loadMoreFailure: null,
    authorsUnresolved:
      Boolean(page.authorsUnresolved) || (mode === "append" && current.authorsUnresolved),
  }
}

/**
 * The state a rejection produces — and the whole point of the split.
 *
 * A failed NEXT page keeps the list that is already on screen: blanking
 * twenty posts somebody is reading because page three failed is the worst
 * possible response to a transient error. What it must not also do is keep
 * QUIET, which is what this used to do — the error was caught, discarded, the
 * loading flag cleared, and the list simply stopped growing with nothing
 * anywhere to say why. It is recorded now, and the caller draws the retry.
 *
 * A failed FIRST page is the other case: there is nothing true on screen to
 * protect, so the list goes to `error` and the caller replaces it.
 */
export function applyFailure(current: ListState, failure: Failure, mode: LoadMode): ListState {
  if (mode === "append") {
    return { ...current, loadingMore: false, loadMoreFailure: failure }
  }
  return { ...current, status: "error", failure, loadingMore: false }
}

export interface TabbedFeed {
  /** The active key's list. `BLANK` while a key has never been asked for. */
  list: ListState
  /** Next page of the active list. A no-op when it has no cursor. */
  loadMore: () => void
  /** First page again, keeping whatever is on screen until it lands. */
  reload: () => void
  /**
   * Edit the active list in place; get back the undo.
   *
   * The undo is a closure rather than the old array, and that is not a style
   * choice. React defers a `setState` updater, so the list as it ACTUALLY was
   * is only knowable inside the updater — after `mutate` has returned. Handing
   * back a value read at call time would hand back a stale one, which is
   * precisely the rollback bug this exists to avoid: "Not interested" refused
   * by the server would restore a feed from two renders ago.
   */
  mutate: (update: (items: FeedItem[]) => FeedItem[]) => () => void
}

export function useTabbedFeed(key: string | null, enabled: boolean): TabbedFeed {
  const [lists, setLists] = useState<Record<string, ListState>>({})
  const inFlight = useRef(new Set<string>()).current

  const load = useCallback(
    async (k: string, mode: LoadMode, cursor: string | null) => {
      if (inFlight.has(k)) return
      inFlight.add(k)

      setLists((prev) => ({ ...prev, [k]: startLoading(prev[k] ?? BLANK, mode) }))

      try {
        const page = await pageFor(k, mode === "append" ? cursor : null)
        setLists((prev) => ({ ...prev, [k]: applyPage(prev[k] ?? BLANK, page, mode) }))
      } catch (error: unknown) {
        setLists((prev) => ({
          ...prev,
          [k]: applyFailure(prev[k] ?? BLANK, failureOf(error), mode),
        }))
      } finally {
        inFlight.delete(k)
      }
    },
    [inFlight]
  )

  /**
   * First visit to a key fetches; every later visit does not.
   *
   * The condition is "no bucket yet", not "no items yet" — a section that
   * legitimately has nothing (Following, for someone who follows nobody) would
   * otherwise refetch its empty answer every single time the tab was touched.
   */
  useEffect(() => {
    if (!enabled || !key) return
    if (lists[key]) return
    void load(key, "replace", null)
  }, [enabled, key, lists, load])

  const list = (key && lists[key]) || BLANK

  const loadMore = useCallback(() => {
    if (!key) return
    void load(key, "append", list.cursor)
  }, [key, load, list.cursor])

  const reload = useCallback(() => {
    if (!key) return
    void load(key, "replace", null)
  }, [key, load])

  const mutate = useCallback(
    (update: (items: FeedItem[]) => FeedItem[]) => {
      if (!key) return () => {}
      let previous: FeedItem[] | null = null
      setLists((prev) => {
        const current = prev[key] ?? BLANK
        previous = current.items
        return { ...prev, [key]: { ...current, items: update(current.items) } }
      })
      return () => {
        setLists((prev) => {
          const current = prev[key] ?? BLANK
          // `previous` is null only if the undo somehow ran before React
          // processed the change it undoes, in which case there is nothing to
          // put back and leaving the list alone is the correct no-op.
          return previous === null ? prev : { ...prev, [key]: { ...current, items: previous } }
        })
      }
    },
    [key]
  )

  return { list, loadMore, reload, mutate }
}

/* ── The HashTag tab's other half ─────────────────────────────────────────── */

export interface TrendingState {
  status: ListStatus
  tags: TrendingTag[]
  reload: () => void
}

/**
 * The trending tags, fetched the first time the tab is shown.
 *
 * Not at mount. Two of three readers never open this tab, and a request fired
 * on the front door for a list most of them will not see is one more thing
 * competing with the feed's own first page for the connection that matters.
 * Android makes the same call in `FeedViewModel.init` and for the same reason.
 *
 * Once fetched it is kept: coming back to the tab replays the list rather than
 * asking again, because a 24-hour trending window does not move between two
 * clicks. `reload` is the reader's own explicit "check again".
 */
export function useTrendingTags(active: boolean): TrendingState {
  const [state, setState] = useState<{ status: ListStatus; tags: TrendingTag[] }>({
    status: "loading",
    tags: [],
  })
  const requested = useRef(false)

  const fetchTags = useCallback(() => {
    requested.current = true
    setState((prev) => ({ ...prev, status: "loading" }))
    fetchTrendingTags()
      .then((tags) => setState({ status: "ready", tags }))
      .catch(() => setState({ status: "error", tags: [] }))
  }, [])

  useEffect(() => {
    if (!active || requested.current) return
    fetchTags()
  }, [active, fetchTags])

  return { status: state.status, tags: state.tags, reload: fetchTags }
}
