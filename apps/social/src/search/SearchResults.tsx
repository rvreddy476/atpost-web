"use client"

/**
 * The results page, wired.
 *
 * Everything visible here that can be shared already is: the card, the pager
 * and the loading skeleton come from `@momentum/content`, the avatar from the
 * same place, the disabled-row pattern from `src/chrome/NavItem.tsx`. What
 * this file adds is the part that cannot be shared — which endpoint, what the
 * URL means, and which of the four outcomes is on screen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE URL IS THE STATE
 *
 * `?q=` and `?kind=` are read from the address bar and never mirrored into
 * component state that could disagree with them. A result page is therefore
 * linkable, survives a refresh, survives the back button, and can be pasted
 * into a chat — which is most of what a search page is for. The tabs are real
 * `<Link>`s for the same reason: "posts matching X" is a place, and a place
 * should have an address.
 *
 * ── Grouped, not blended, and the reason is in the response ───────────────
 * The obvious design is one relevance-ordered list with posts and people
 * interleaved. The service cannot support it and it is not a near miss:
 *
 *   · Every entity runs its OWN `function_score` query against its OWN index
 *     (search-service, buildFunctionScoreQuery). A post's score and a person's
 *     score are computed from different fields with different boosts and are
 *     not on a common scale. Interleaving them would need a cross-entity
 *     ranking the server never computed — so the client would be inventing the
 *     relevance order and presenting it as the search engine's.
 *   · Cursors are PER ENTITY and independent (`cursor.posts`, `cursor.users`).
 *     A blended list has one scroll position and would have to advance two
 *     offsets against an ordering nothing defines.
 *
 * So: sections, one per kind, in a fixed order. And because paging only means
 * anything inside a kind, paging lives in the single-kind tabs — "All" is a
 * PREVIEW that answers "what sort of thing did I find?" in one screen, and
 * each section hands off to the tab that can page.
 *
 * ── Which kinds get a tab ─────────────────────────────────────────────────
 * Posts and People. Not Tags: `hashtags_v1` answered empty for every probe
 * against the live service, including for tags that appear in indexed post
 * text, so a Tags tab would be a permanently empty room. The bucket is still
 * REQUESTED on the All view and the section draws itself the day it fills —
 * which is the difference between not building a tab and not supporting the
 * kind. Products, communities and channels are not requested at all; see
 * ./contract.ts for why.
 *
 * ── Nothing autoplays here ────────────────────────────────────────────────
 * No `useAutoplayCoordinator`, and every card gets `active={false}`. A feed is
 * a thing you watch and a result list is a thing you scan; starting video
 * under someone who is reading titles is the wrong default for the surface.
 * Every card still plays on demand — `active` gates autoplay, not playback —
 * and this page therefore also sidesteps the sticky-header measurement error
 * documented at the top of `src/chrome/AppHeader.tsx` rather than inheriting
 * it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FeedSkeleton, InfiniteFeed, PostCard } from "@momentum/content"
import { BRAND } from "@momentum/brand"
import { setBookmark, toggleLike } from "@/feed/api"
import { LIST_LIMIT, PREVIEW_LIMIT, runSearch, SearchFailure } from "./api"
import {
  itemsOf,
  MAX_QUERY_BYTES,
  nextCursorOf,
  normalizeQuery,
  queryTooLong,
  rowToFeedItem,
  type SearchHashtagRow,
  type SearchKind,
  type SearchPostRow,
  type SearchUserRow,
} from "./contract"
import { HashtagList, PeopleList } from "./ResultRows"
import { PeopleSkeleton, SearchBroken, SearchNothing, SearchPrompt } from "./states"

/* ── The tabs ─────────────────────────────────────────────────────────────── */

type Tab = "all" | "posts" | "people"

interface TabSpec {
  id: Tab
  label: string
  /** Which buckets this tab asks the service for. */
  kinds: readonly SearchKind[]
  /** How many rows of each. A preview is short on purpose; a list is a list. */
  limit: number
}

const TABS: readonly TabSpec[] = [
  { id: "all", label: "All", kinds: ["posts", "users", "hashtags"], limit: PREVIEW_LIMIT },
  { id: "posts", label: "Posts", kinds: ["posts"], limit: LIST_LIMIT },
  { id: "people", label: "People", kinds: ["users"], limit: LIST_LIMIT },
] as const

/** An unknown `?kind=` is not an error — it is a URL, and it means "All". */
function tabFrom(raw: string | null): TabSpec {
  return TABS.find((tab) => tab.id === raw) ?? TABS[0]
}

/** A tab's address, with the query carried across. */
function tabHref(query: string, tab: Tab): string {
  const params = new URLSearchParams({ q: query })
  if (tab !== "all") params.set("kind", tab)
  return `/search?${params.toString()}`
}

/* ── What is on screen ────────────────────────────────────────────────────── */

interface Results {
  posts: SearchPostRow[]
  users: SearchUserRow[]
  hashtags: SearchHashtagRow[]
  cursors: { posts: string | null; users: string | null }
}

const NO_RESULTS: Results = {
  posts: [],
  users: [],
  hashtags: [],
  cursors: { posts: null, users: null },
}

type Status = "prompt" | "loading" | "ready" | "failed"

/** A failure the person can do something about, and one they cannot. */
interface Failure {
  message: string
  retryable: boolean
}

export function SearchResults() {
  const params = useSearchParams()
  const query = normalizeQuery(params.get("q"))
  const tab = tabFrom(params.get("kind"))

  const [status, setStatus] = useState<Status>(query ? "loading" : "prompt")
  const [results, setResults] = useState<Results>(NO_RESULTS)
  const [failure, setFailure] = useState<Failure>({ message: "", retryable: true })
  const [loadingMore, setLoadingMore] = useState(false)

  /**
   * Bumped to re-run the current search without changing the URL.
   *
   * Two things need that: the "Try again" button on a failure, and a card
   * whose signed thumbnail URL has expired. Neither is a navigation — the
   * query and the tab are unchanged — so neither may touch the address bar.
   */
  const [attempt, setAttempt] = useState(0)

  /**
   * How wide the next fetch should be, and which list it belongs to.
   *
   * A re-run must not silently shorten a list someone has already paged
   * through. The cursor is a plain `from` offset, so asking for `limit = what
   * is on screen` in ONE request reconstructs exactly the same rows with newly
   * signed media URLs — which is what a stale-URL refresh has to do.
   *
   * The key is `query|tab`, and it is compared INSIDE the fetch effect rather
   * than reset by a second effect. Two effects would run in declaration order,
   * so the fetch would read the previous list's width on the render that
   * changed tabs — the kind of ordering bug that only shows up once someone
   * has scrolled.
   */
  const list = useRef({ key: "", limit: tab.limit })

  const tabId = tab.id
  const tabKinds = tab.kinds
  const tabLimit = tab.limit

  useEffect(() => {
    if (!query) {
      setStatus("prompt")
      setResults(NO_RESULTS)
      return
    }
    // Checked here rather than left to the 400, so the page can say the true
    // thing ("too long") instead of showing a generic failure — and so a query
    // the service is certain to reject is never sent at all. The service counts
    // BYTES; so does `queryTooLong`.
    if (queryTooLong(query)) {
      setFailure({
        message: `That search is too long. Keep it under ${MAX_QUERY_BYTES} characters.`,
        retryable: false,
      })
      setStatus("failed")
      return
    }

    const key = `${query}|${tabId}`
    if (list.current.key !== key) list.current = { key, limit: tabLimit }

    const controller = new AbortController()
    setStatus("loading")
    setLoadingMore(false)

    runSearch({
      query,
      kinds: tabKinds,
      limit: Math.min(Math.max(list.current.limit, tabLimit), 100),
      signal: controller.signal,
    })
      .then((body) => {
        if (controller.signal.aborted) return
        setResults({
          posts: itemsOf(body.results?.posts),
          users: itemsOf(body.results?.users),
          hashtags: itemsOf(body.results?.hashtags),
          cursors: {
            posts: nextCursorOf(body.results?.posts),
            users: nextCursorOf(body.results?.users),
          },
        })
        setStatus("ready")
      })
      .catch((err: unknown) => {
        // A superseded request is not a failure and must not paint one over a
        // newer query's results.
        if (controller.signal.aborted) return
        setFailure({
          message:
            err instanceof SearchFailure ? err.message : "That search could not be run.",
          retryable: true,
        })
        setStatus("failed")
      })

    return () => controller.abort()
  }, [query, tabId, tabKinds, tabLimit, attempt])

  const rerun = useCallback(() => setAttempt((n) => n + 1), [])

  /**
   * The next page of the tab's one kind.
   *
   * Only reachable from a single-kind tab: `cursor` is null on "All", so the
   * pager is never armed there. Failures here are deliberately quiet — the
   * results already on screen are still true, and replacing them with an error
   * panel because page three did not arrive would throw away a working answer.
   * The pager simply stops.
   */
  const loadMore = useCallback(() => {
    if (tabId === "all" || loadingMore || !query) return
    const kind: SearchKind = tabId === "posts" ? "posts" : "users"
    const cursor = tabId === "posts" ? results.cursors.posts : results.cursors.users
    if (!cursor) return

    setLoadingMore(true)
    runSearch({
      query,
      kinds: [kind],
      limit: LIST_LIMIT,
      cursors: kind === "posts" ? { posts: cursor } : { users: cursor },
    })
      .then((body) => {
        setResults((current) => {
          const next: Results =
            kind === "posts"
              ? {
                  ...current,
                  posts: [...current.posts, ...itemsOf(body.results?.posts)],
                  cursors: { ...current.cursors, posts: nextCursorOf(body.results?.posts) },
                }
              : {
                  ...current,
                  users: [...current.users, ...itemsOf(body.results?.users)],
                  cursors: { ...current.cursors, users: nextCursorOf(body.results?.users) },
                }
          list.current.limit = Math.max(next.posts.length, next.users.length, tabLimit)
          return next
        })
      })
      .catch(() => {
        // Stop paging. See above.
        setResults((current) => ({
          ...current,
          cursors:
            kind === "posts"
              ? { ...current.cursors, posts: null }
              : { ...current.cursors, users: null },
        }))
      })
      .finally(() => setLoadingMore(false))
  }, [tabId, loadingMore, query, results.cursors.posts, results.cursors.users, tabLimit])

  /* ── Handlers the card needs ────────────────────────────────────────────── */

  /**
   * Put this zone's prefix on a gateway path.
   *
   * A verbatim copy of the feed's `resolveUrl`, and it should not stay one —
   * `src/feed/HomeFeed.tsx` owns the original and the two will drift. It is
   * duplicated rather than lifted because that file is not this change's to
   * edit; extracting it is a one-file follow-up and is in the report.
   *
   * Why it exists: `playback_url` is `/v1/media/{id}/hls/master.m3u8`, and the
   * master playlist's children are absolute paths of the same shape. Both
   * resolve against the ORIGIN, so under `basePath: "/social"` they land on a
   * path this zone does not serve. It must handle an ALREADY-ABSOLUTE url,
   * because hls.js resolves each child against the master's url while parsing.
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
   * Like and save, against the same routes the feed uses.
   *
   * They are the real endpoints, not stubs — the post is right there, and
   * refusing to let someone like it would be a worse lie than the one below.
   *
   * The lie: the search index carries NO viewer state, so every row starts in
   * the "not liked, not saved" position whatever the truth is. `like` is a
   * server-side TOGGLE that ignores what the client wanted and answers with
   * what is now true, so the first press on an already-liked post reads as
   * "unlike" and the card settles onto the server's answer within one round
   * trip rather than staying wrong. `save` is a pair of idempotent setters, so
   * pressing it lands on saved and stays there. Neither is ideal and both are
   * self-correcting; the fix is a `has_reacted` on the search row, or a
   * PostCard that can be told the viewer state is unknown. Both are in the
   * report.
   */
  const onLike = useCallback(
    (item: { id: string }, _next: boolean) => toggleLike(item.id),
    []
  )

  const onSave = useCallback(
    (item: { id: string }, next: boolean) => setBookmark(item.id, next),
    []
  )

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          {/* The query is text content, never markup, and never spliced into a
              className or an href. */}
          {query ? `Results for “${query}”` : "Search"}
        </h1>
        {query && (
          <p className="mt-1 text-sm text-mo-body">
            Posts, people and tags across {BRAND.name}.
          </p>
        )}
      </header>

      {query && <Tabs query={query} current={tabId} />}

      {status === "prompt" && <SearchPrompt />}

      {status === "failed" && (
        <SearchBroken
          message={failure.message}
          // No "Try again" on a query the service will reject however many
          // times it is sent. A button that cannot work is its own small lie.
          onRetry={failure.retryable ? rerun : undefined}
        />
      )}

      {status === "loading" &&
        (tabId === "people" ? <PeopleSkeleton /> : <FeedSkeleton count={3} />)}

      {status === "ready" && (
        <Body
          tab={tabId}
          query={query}
          results={results}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          resolveUrl={resolveUrl}
          onLike={onLike}
          onSave={onSave}
          onStale={rerun}
        />
      )}
    </div>
  )
}

/* ── The tab strip ────────────────────────────────────────────────────────── */

/**
 * Links, not buttons.
 *
 * Each tab is a distinct set of results and therefore a distinct address:
 * bookmarkable, shareable, and reachable with the back button. `aria-current`
 * says which one you are on, in the same word `NavItem` uses — "page", not
 * "true", because these are locations.
 */
function Tabs({ query, current }: { query: string; current: Tab }) {
  return (
    <nav aria-label="Filter results" className="mb-5 flex items-center gap-1 border-b border-mo">
      {TABS.map((tab) => {
        const active = tab.id === current
        return (
          <Link
            key={tab.id}
            href={tabHref(query, tab.id)}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ease-mo",
              active
                ? // Cyan is the interactive colour and the only mark here that
                  // means "this one" — 8.01 on the ground.
                  "border-mo-focus text-mo-cyan"
                : "border-transparent text-mo-body hover:text-mo-ink",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

/* ── The results themselves ───────────────────────────────────────────────── */

interface BodyProps {
  tab: Tab
  query: string
  results: Results
  loadingMore: boolean
  onLoadMore: () => void
  resolveUrl: (url: string) => string
  onLike: (item: { id: string }, next: boolean) => Promise<{ on: boolean; count?: number }>
  onSave: (item: { id: string }, next: boolean) => Promise<{ on: boolean }>
  onStale: () => void
}

function Body(props: BodyProps) {
  const { tab, query, results } = props
  const empty =
    tab === "all"
      ? results.posts.length === 0 && results.users.length === 0 && results.hashtags.length === 0
      : tab === "posts"
        ? results.posts.length === 0
        : results.users.length === 0

  if (empty) {
    return (
      <SearchNothing
        query={query}
        scope={tab === "posts" ? "posts" : tab === "people" ? "people" : undefined}
      />
    )
  }

  if (tab === "posts") {
    return (
      <InfiniteFeed
        hasMore={Boolean(results.cursors.posts)}
        loading={props.loadingMore}
        onLoadMore={props.onLoadMore}
        loadingIndicator={
          <div className="pt-4">
            <FeedSkeleton count={1} />
          </div>
        }
        endIndicator={<Exhausted text="That is every post we found." />}
      >
        {results.posts.map((row) => (
          <Card key={row.id || row.post_id} row={row} {...props} />
        ))}
      </InfiniteFeed>
    )
  }

  if (tab === "people") {
    return (
      <InfiniteFeed
        hasMore={Boolean(results.cursors.users)}
        loading={props.loadingMore}
        onLoadMore={props.onLoadMore}
        loadingIndicator={
          <div className="pt-4">
            <PeopleSkeleton count={2} />
          </div>
        }
        endIndicator={<Exhausted text="That is everyone we found." />}
      >
        <PeopleList users={results.users} noteId="mo-search-people-note" />
      </InfiniteFeed>
    )
  }

  /*
   * "All": a preview of each kind that has anything, in a fixed order.
   *
   * People first. Someone who types a name is looking for a person, and the
   * post corpus is roughly ten times the size of the user corpus — so ordering
   * by volume would bury the answer under the thing that merely has more of
   * it. Tags next, and only when the index has any (see the file header).
   * Posts last, because they are the tall rows and a preview of five of them
   * would push everything else off the screen.
   */
  return (
    <div className="space-y-8">
      {results.users.length > 0 && (
        <Section title="People" seeAll={tabHref(query, "people")} seeAllLabel="See all people">
          <PeopleList users={results.users} noteId="mo-search-people-note" />
        </Section>
      )}

      {results.hashtags.length > 0 && (
        <Section title="Tags">
          <HashtagList tags={results.hashtags} noteId="mo-search-tags-note" />
        </Section>
      )}

      {results.posts.length > 0 && (
        <Section title="Posts" seeAll={tabHref(query, "posts")} seeAllLabel="See all posts">
          <div className="space-y-4">
            {results.posts.map((row) => (
              <Card key={row.id || row.post_id} row={row} {...props} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

/**
 * One post, as a post.
 *
 * The whole point of the mapping in ./contract.ts: a post found by searching
 * looks exactly like a post found by scrolling, because it is the same
 * component with the same tokens and the same action bar.
 *
 * ── What is deliberately NOT passed ───────────────────────────────────────
 *   · `permalink`. Its own note says "no prop, no row — never a guess", and
 *     there is no post detail route in this zone to point one at. Omitting it
 *     drops "Copy link" from the overflow menu, which is the correct outcome:
 *     there is no link to copy.
 *   · `onComment` / `comments`. Comments are a surface this page does not
 *     have and does not fetch; the card drops the control rather than leaving
 *     a dead glyph. Wiring it here is the same four functions the feed passes
 *     and is a follow-up, not a gap in the card.
 *   · `isOwnPost` / `onFeedback` / `onReport`. This page has no session read
 *     and no negative-signal handlers, so the overflow menu here is Save
 *     alone. That is the menu computing its own rows from what was wired, not
 *     a decision made twice.
 *
 * There is no `onToggleMuted` to omit any more: `muted` is the value each
 * player STARTS from, every player owns its sound after that, and the prop
 * that used to let a surface overrule them is gone from `PostCardProps`. It
 * starts muted because a browser refuses to autoplay sound and answers the
 * attempt with a rejected promise rather than an error.
 */
function Card({ row, ...props }: { row: SearchPostRow } & BodyProps) {
  return (
    <PostCard
      item={rowToFeedItem(row)}
      // Nothing on this page autoplays. See the file header.
      active={false}
      muted
      resolveUrl={props.resolveUrl}
      onLike={props.onLike}
      onSave={props.onSave}
      // A signed thumbnail URL has expired. Re-running the search is what
      // re-signs it — this endpoint has no per-post refresh.
      onStale={props.onStale}
    />
  )
}

/**
 * A titled group on the All view.
 *
 * The "see all" link is the hand-off to the tab that can page, and it is only
 * offered where such a tab exists — Tags has none, so it gets a heading and
 * nothing more rather than a link to a room that is not there.
 */
function Section({
  title,
  seeAll,
  seeAllLabel,
  children,
}: {
  title: string
  seeAll?: string
  seeAllLabel?: string
  children: React.ReactNode
}) {
  const headingId = `mo-search-section-${title.toLowerCase()}`
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id={headingId}
          className="font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink"
        >
          {title}
        </h2>
        {seeAll && (
          <Link
            href={seeAll}
            className="shrink-0 text-sm font-semibold text-mo-cyan hover:underline"
          >
            {seeAllLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** Said once, quietly, rather than a pager that spins forever. */
function Exhausted({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-mo-body">{text}</p>
}
