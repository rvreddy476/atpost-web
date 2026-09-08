/**
 * The three screens that are not a feed: loading, empty, and broken.
 *
 * They get real design because they are what a new account sees. The empty
 * state in particular is the one screen most likely to be someone's first
 * impression of the product, and "No posts" in grey is a dead end that reads
 * like a failure.
 *
 * ── The skeleton has the card's shape ─────────────────────────────────────
 * Not three grey bars: a header row, a body, a media block at the same aspect
 * ratio a card uses. A skeleton whose proportions differ from the content
 * causes a jump on arrival, which is most of what makes a loading state feel
 * cheap. The pulse is a Tailwind animation and `tokens.css` already reduces
 * every animation to nothing under `prefers-reduced-motion`.
 */

import { AlertTriangle, Compass } from "lucide-react"

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-mo border border-mo bg-mo-surface p-4 shadow-mo">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-mo-pill bg-mo-raised" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded-mo-pill bg-mo-raised" />
              <div className="h-2.5 w-20 animate-pulse rounded-mo-pill bg-mo-raised" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full animate-pulse rounded-mo-pill bg-mo-raised" />
            <div className="h-3 w-4/5 animate-pulse rounded-mo-pill bg-mo-raised" />
          </div>
          {i % 2 === 0 && (
            <div className="mt-4 aspect-[4/3] w-full animate-pulse rounded-mo bg-mo-raised" />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Nothing to show.
 *
 * Worth being precise about what this means, because on this endpoint it
 * almost never means "there is no content on the platform": the server's
 * DEFAULT feed mode is chronological, which is posts from accounts you follow,
 * so a new account gets an empty array. The feed asks for `ranked` precisely
 * so this screen is rare — when it does appear, the honest reading is "the
 * ranker had nothing for you right now", and the useful thing to offer is a
 * way to go and find people rather than an apology.
 */
export function FeedEmpty({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <Compass aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        Your feed is warming up
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        There is nothing here yet. Follow a few people and their posts will show
        up first — until then we will keep suggesting things.
      </p>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          // Cyan is the interactive colour and this is small text: the one
          // accent that holds up at this size on a card (6.75).
          className="mt-5 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          Check again
        </button>
      )}
    </div>
  )
}

/**
 * Something failed.
 *
 * `role="alert"`, because unlike a per-card rollback this one means the screen
 * in front of you is not the truth and a screen reader should be interrupted.
 * The message is passed in rather than composed here so it can say which of
 * "you are signed out" and "the feed is down" happened — they need different
 * things from the person reading.
 */
export function FeedError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        We could not load your feed
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          Try again
        </button>
      )}
    </div>
  )
}

/** The end of the feed. Said once, quietly, rather than spinning forever. */
export function FeedEnd() {
  return (
    <p className="py-8 text-center text-sm text-mo-body">You are all caught up.</p>
  )
}
