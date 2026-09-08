/**
 * The screens that are not results — and the reason there are four of them.
 *
 * `@momentum/content` already exports `FeedSkeleton`, `FeedEmpty` and
 * `FeedError`, and the skeleton is reused here verbatim. The other two are
 * not, and it is worth writing down why rather than leaving it to look like an
 * oversight:
 *
 *   FeedEmpty  is headed "Your feed is warming up" and offers to keep
 *              suggesting things. That sentence is TRUE of a ranked feed with
 *              no graph behind it and false of a query that matched nothing —
 *              nothing is warming up, the corpus simply has no "quantum
 *              gardening" in it. Its heading is hardcoded, not a prop.
 *   FeedError  is headed "We could not load your feed". Also hardcoded; also
 *              about a different surface.
 *
 * So the two states the brief insists must not look alike are written here,
 * where their words can be about searching. Both would be one-line reuses if
 * those components took a heading — that is in the report, not in a fork of
 * the package.
 *
 * ── They must not look alike, and they do not ─────────────────────────────
 * "Nothing matched" is a normal, expected outcome of a working search: quiet,
 * no alert role, purple (presence, not alarm), and the useful offer is to
 * change the query. "Search failed" is the screen in front of you not being
 * the truth: `role="alert"`, the warn colour, and the useful offer is to try
 * the same query again. Same rules `FeedError` follows, for the same reasons.
 */

import { AlertTriangle, Search, SearchX } from "lucide-react"
import { BRAND } from "@momentum/brand"

/** Shared frame, so the three states cannot drift apart from each other. */
function Panel({
  children,
  alert,
}: {
  children: React.ReactNode
  alert?: boolean
}) {
  return (
    <div
      // A screen reader is interrupted for a failure and not for an empty
      // result, which is the difference between "what you are looking at is
      // wrong" and "what you are looking at is a real, correct answer".
      role={alert ? "alert" : undefined}
      className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo"
    >
      {children}
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
      {children}
    </h2>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  // --mo-body, 6.22 on a card. Small secondary text may not use --mo-muted-lg
  // (3.01 here), however much it reads as the right shade of quiet.
  return <p className="mx-auto mt-2 max-w-sm text-mo-body">{children}</p>
}

/**
 * `/search` with nothing to search for.
 *
 * A real state and not a redirect: this URL is bookmarkable, it is what the
 * header's form posts to before anything is typed, and sending someone back to
 * the feed for arriving here would lose the page they asked for.
 */
export function SearchPrompt() {
  return (
    <Panel>
      {/* Cyan is the interactive colour and this is a non-text mark: 8.01 on
          the ground, 6.75 on this card. */}
      <Search aria-hidden="true" className="mx-auto h-8 w-8 text-mo-cyan" />
      <Heading>Search {BRAND.name}</Heading>
      <Body>
        Type a name, a word from a post, or a tag into the box at the top of the
        page.
      </Body>
    </Panel>
  )
}

/**
 * The search ran, and the answer was nothing.
 *
 * The query is quoted back, because "no results" without it is unfalsifiable —
 * a person cannot tell a typo from an empty corpus, and quoting the string is
 * how they spot the typo. It is rendered as text content, never as markup.
 */
export function SearchNothing({ query, scope }: { query: string; scope?: string }) {
  return (
    <Panel>
      {/* Purple is presence, not alarm. Nothing has gone wrong here. 3.87 on a
          card, which clears the 3.0 bar this glyph is held to as a non-text
          mark. */}
      <SearchX aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Heading>Nothing matched</Heading>
      <Body>
        {scope ? `No ${scope} for ` : "No results for "}
        <span className="break-words font-semibold text-mo-ink">“{query}”</span>. Try
        fewer words, or check the spelling.
      </Body>
    </Panel>
  )
}

/**
 * The search did not run.
 *
 * `message` is passed in rather than composed here for the reason `FeedError`
 * gives: "you are offline", "that query is too long" and "search is down" need
 * different things from the person reading, and only the caller knows which
 * happened.
 */
export function SearchBroken({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Panel alert>
      <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
      <Heading>Search did not run</Heading>
      <Body>{message}</Body>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          Try again
        </button>
      )}
    </Panel>
  )
}

/**
 * A list of people, loading.
 *
 * `FeedSkeleton` is used for anything that will arrive as cards, and is not
 * used here: it draws a 4:3 media block, and a placeholder whose proportions
 * differ from the content is most of what makes a loading state feel cheap —
 * `states.tsx` in @momentum/content says so, and this is that rule applied
 * rather than ignored. A person row is an avatar and two lines, so this is an
 * avatar and two lines.
 */
export function PeopleSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-mo border border-mo bg-mo-surface p-4">
          <div className="h-10 w-10 animate-pulse rounded-mo-pill bg-mo-raised" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded-mo-pill bg-mo-raised" />
            <div className="h-2.5 w-24 animate-pulse rounded-mo-pill bg-mo-raised" />
          </div>
        </div>
      ))}
    </div>
  )
}
