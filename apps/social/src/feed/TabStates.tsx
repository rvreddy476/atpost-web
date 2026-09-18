"use client"

/**
 * Empty and broken, said once per section instead of once for the feed.
 *
 * ── Why these are here and not in @momentum/content ───────────────────────
 * That package already ships `FeedEmpty` and `FeedError`, and they are good —
 * this file borrows their layout, their icon size, their button and their
 * spacing deliberately, so a reader cannot tell which file drew the box. What
 * it cannot borrow is their WORDS. `FeedEmpty` hardcodes "Your feed is warming
 * up"; `FeedError` hardcodes the heading "We could not load your feed" and
 * takes only the body sentence as a prop. Both are exactly right for the one
 * screen they were written for and wrong for two of the three here:
 *
 *   · "Your feed is warming up" under **Following** is a lie with a pleasant
 *     tone. The feed is not warming up. You follow nobody, and the only thing
 *     that will change it is following somebody — which is a different
 *     sentence and a different next step.
 *   · "We could not load your feed" over the **HashTag** tab's trending list
 *     names the wrong thing entirely. The feed loaded. The tag list did not.
 *
 * The distinction the brief asks for — "you do not follow anyone yet" is not
 * "the feed failed" — is not one of tone. An empty state describes a world
 * that is working and tells you what to do in it; an error state says the
 * screen in front of you is not the truth. Collapsing them costs the reader
 * the ability to tell whether to act or to wait.
 *
 * **What would remove this file**: `title` and `detail` props on `FeedEmpty`,
 * and a `title` prop on `FeedError`, both defaulting to today's strings so no
 * existing caller changes. That is a change to a package this branch may not
 * touch; it is reported rather than made.
 *
 * ── `role="alert"` on the error, and nothing on the empty ─────────────────
 * Copied from `FeedError`, and the asymmetry is the interesting half: an error
 * means what is on screen is not the truth and is worth interrupting a screen
 * reader for. An empty section is simply the answer to the question that was
 * asked, and interrupting for it would be noise.
 */

import type { LucideIcon } from "lucide-react"
import { AlertTriangle } from "lucide-react"
import { StateButton } from "@momentum/content"

/**
 * The one button all three states use.
 *
 * It is `StateButton` from @momentum/content, re-exported under the local name
 * this file already used. The note at the top of the file explains why the
 * COPY could not be borrowed; the BUTTON always could, and now that the shared
 * one has been pulled out of `FeedEmpty` into a component of its own there is
 * nothing left here to copy.
 *
 * That also means this zone cannot drift from it. The old copy was
 * `text-mo-cyan` with a comment saying cyan is the accent that holds up at
 * this size on a card — true of the dark theme, and half-true here: cyan is
 * still legible on white (5.84) but tokens.css reassigns it to --mo-info in a
 * light zone and gives interactivity to green. The shared button now names
 * --brand-accent, which is cyan in :root and green under `.mo-light`, so it is
 * 6.74 on a dark card and 6.61 on a white one and says "press me" in both.
 * Had this file kept its own copy, the feed would have had a notice-coloured
 * retry button beside a green one in @momentum/content's own empty state.
 */
const ActionButton = StateButton

export interface SectionStateProps {
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
}

export function SectionEmpty({
  icon: Icon,
  title,
  detail,
  action,
}: SectionStateProps & { icon: LucideIcon }) {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      <Icon aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">{detail}</p>
      {action && <ActionButton label={action.label} onClick={action.onClick} />}
    </div>
  )
}

export function SectionError({ title, detail, action }: SectionStateProps) {
  return (
    <div
      role="alert"
      className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo"
    >
      <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">{detail}</p>
      {action && <ActionButton label={action.label} onClick={action.onClick} />}
    </div>
  )
}

/**
 * The next page did not arrive.
 *
 * ── Why this is not the big error box ─────────────────────────────────────
 * Everything already on screen is true. Page three failing does not make
 * pages one and two a lie, which is why `useTabbedFeed` keeps them and why
 * this is a line under the list rather than a screen replacing it. It is also
 * why the role is `status` and not `alert`: nothing needs interrupting, but
 * something does need saying — before this, a failed next page cleared the
 * loading flag, dropped the error on the floor, and the list simply stopped
 * with nothing on screen to explain why.
 *
 * ── Why it has a button and the sentinel is switched off ──────────────────
 * The pager's sentinel is 800px below the fold and fires whenever it is
 * visible and nothing is loading, so leaving it armed after a failure turns
 * one dead connection into a request every time the observer re-arms. The
 * caller sets `hasMore={false}` while this is showing and the reader's own
 * press is what tries again.
 */
export function NextPageError({
  detail,
  onRetry,
}: {
  detail: string
  onRetry: () => void
}) {
  return (
    <div
      role="status"
      className="mt-4 rounded-mo border border-mo bg-mo-surface px-4 py-3 text-center shadow-mo"
    >
      <p className="text-sm text-mo-body">{detail}</p>
      <ActionButton label="Try again" onClick={onRetry} />
    </div>
  )
}

/**
 * The posts arrived; the names did not.
 *
 * post-service's posts-by-tag route does not hydrate `author`, so the zone
 * re-hydrates a page from `POST /v1/profiles/batch`. That request used to be
 * allowed to fail SILENTLY — the reasoning being that a page of posts with no
 * names is still a page of posts, and that there was nothing the reader could
 * do. The first half is right and is why the posts are still shown. The
 * second half was wrong: there is something to do, it is "try again", and
 * without being told, twenty cards reading `Unknown account` are
 * indistinguishable from a product that has lost everybody's name.
 *
 * `status` rather than `alert` for the same reason as above: the posts are
 * real, and the missing half is worth saying without interrupting.
 */
export function AuthorsUnresolved({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-mo border border-mo bg-mo-raised px-3 py-2"
    >
      <p className="text-sm text-mo-body">
        We could not load who wrote these. The posts are real; the names are missing.
      </p>
      <button
        type="button"
        onClick={onRetry}
        // Two swaps. --brand-accent for --mo-cyan, because green is what
        // pressable means under `.mo-light`.
        //
        // And `hover:bg-mo-overlay` for `hover:bg-mo-surface`. This banner is
        // the one element in the zone sitting ON --mo-raised, so its hover has
        // to be a step ABOVE raised, and --mo-surface is not one in either
        // scope: it is DARKER than raised on the dark theme (#1F1D33 under
        // #2A2745) and it is the page's own white on the light one. --mo-overlay
        // is a step up in both — #332F55 over #2A2745, #FFFFFF over #F1F4F2 —
        // which is the only token here that is.
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-mo-pill border border-mo-strong px-4 text-xs font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
      >
        Try again
      </button>
    </div>
  )
}
