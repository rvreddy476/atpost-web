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

/**
 * The one button the empty and the error state share.
 *
 * ── Why `text-brand-accent` and not `text-mo-cyan` ────────────────────────
 * This is the interesting line in the file, so it gets the room. The class
 * that stood here was `text-mo-cyan`, with a comment saying cyan is the
 * interactive colour and measures 6.75 on a card. Both halves were true of the
 * dark theme and exactly one of them survived the light one:
 *
 *   · the MEASUREMENT survives. --mo-cyan is retuned to #0C6E86 under
 *     `.mo-light` and reads 5.84 on a white card, comfortably AA at this size.
 *   · the ROLE does not. tokens.css moves cyan off interactivity in a light
 *     zone and gives the job to green: "CYAN is no longer the interactive
 *     colour — green is, and a page cannot have two." Cyan there means
 *     --mo-info, a neutral notice. A retry button painted the colour of a
 *     notice, sitting on a page whose links and primary button are green, is
 *     legible and says the wrong thing.
 *
 * So the class has to name the ROLE and let each scope supply the colour, and
 * there is already a token that does exactly that without inventing a new one:
 * --brand-accent is --mo-cyan in :root and --mo-primary (green) under
 * `.mo-light`. It is the @atpost/ui contract rather than the mo-* vocabulary,
 * which is the one reason to hesitate — but it is the only variable in the
 * package that means "interactive in whichever scope this is", it is declared
 * in both, and tokens.css names that as its purpose in both blocks.
 *
 *   dark:  #06B6D4 on #1F1D33 card ... 6.74  AA at any size
 *   light: #0B6B37 on #FFFFFF card ... 6.61  AA at any size
 *
 * Two grounds, two colours, one role, and the two numbers are within 0.13 of
 * each other — which is a coincidence, but a pleasing one.
 *
 * `min-h-[44px]`: this is frequently the ONLY control on the screen, and on a
 * phone it is the only thing to aim at.
 */
export function StateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-mo-pill border border-mo-strong px-5 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
    >
      {label}
    </button>
  )
}

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
    <div className="rounded-mo border border-mo bg-mo-surface p-6 text-center shadow-mo sm:p-8">
      {/* Purple is the PRESENCE hue and this is a non-text mark, which is the
          only job it has in either scope: #8B5CF6 on a dark card is 3.86 and
          #6D28D9 on a white one is 7.10, both past the 3.0 a glyph needs.
          32px on a 360px screen is already generous, so it does not scale. */}
      <Compass aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        Your feed is warming up
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        There is nothing here yet. Follow a few people and their posts will show
        up first — until then we will keep suggesting things.
      </p>
      {onRefresh && (
        <StateButton label="Check again" onClick={onRefresh} />
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
    <div role="alert" className="rounded-mo border border-mo bg-mo-surface p-6 text-center shadow-mo sm:p-8">
      {/* --mo-warn is #FCD376 on the dark card (11.48) and #7A5C00 on the white
          one (6.25) — a pale butter and a dark olive-gold, which is what it
          takes for "pending" to exist on both grounds. Either way it is far
          past the 3.0 bar a glyph is held to. */}
      <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        We could not load your feed
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">{message}</p>
      {onRetry && (
        <StateButton label="Try again" onClick={onRetry} />
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
