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

/**
 * The one button both states use.
 *
 * Cyan on a card is 6.75 and this is small text — the accent that holds up at
 * this size, which is why `FeedEmpty` uses exactly this and why copying it was
 * safer than choosing again.
 */
function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
    >
      {label}
    </button>
  )
}

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
