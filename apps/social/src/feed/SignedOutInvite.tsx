"use client"

/**
 * Nobody is signed in. That is not an error, and this is not an alert.
 *
 * ── What was here before ──────────────────────────────────────────────────
 * `<FeedError message="Sign in to see your feed." />`. Which is to say: a
 * `role="alert"` — interrupting a screen reader mid-sentence — under a warning
 * triangle and the heading "We could not load your feed", for the one state
 * on this page where nothing whatsoever has gone wrong. The reader is told
 * the product is broken, told to check back, and given no way in: the box
 * carried no sign-in control at all, and the left rail's — the only one on
 * the page — is `hidden lg:block`. Below 1024px, which is most phones and
 * every narrow window, a signed-out visitor to the front door of the platform
 * could not sign in from it.
 *
 * ── What it says instead ──────────────────────────────────────────────────
 * What the page is, and one action. No `role`, because an invitation is the
 * ordinary content of the page for a signed-out reader, not an interruption;
 * the heading is an `<h2>` under the column's `<h1>`, so it is reachable by
 * heading navigation like any other section.
 *
 * ── Why an `<a>` and not a `<Link>` ───────────────────────────────────────
 * `/login` is served by the SHELL, never by a zone, and `next/link` prefixes
 * this zone's basePath onto every href it is given — so a `<Link>` here would
 * ask for `/social/login`, which nothing serves. ./NavItem.tsx in
 * @momentum/chrome has the paragraph; `signInHref` is that package's own
 * answer, including the redirect back to this zone.
 */

import { LogIn } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { signInHref } from "@momentum/chrome"

export function SignedOutInvite({ basePath }: { basePath: string }) {
  return (
    <section className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {/* Purple is the presence colour and this is a non-text mark — 3.87 on
          a card, over the 3.0 bar. Not the warning amber this used to wear:
          nothing here is a warning. */}
      <LogIn aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        Sign in to see your feed
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        Home is what the people you follow are posting, and what {BRAND.name} thinks
        you will want next. It needs to know who you are before it can show you either.
      </p>
      <a
        href={signInHref(basePath)}
        // Visible at every width — the left rail's own sign-in link is
        // `hidden lg:block`, which is the half of this bug nobody could see.
        // Cyan is the interactive colour and holds up at this size on a card.
        // --brand-accent, not --mo-cyan: cyan is --mo-info inside `.mo-light` and
        // green is what pressable means there. 6.74 dark / 6.61 light on a card.
        className="mt-5 inline-flex min-h-[44px] items-center rounded-mo-pill border border-mo-strong px-5 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
      >
        Sign in
      </a>
      <p className="mx-auto mt-4 max-w-sm text-xs text-mo-body">
        One {BRAND.name} account, every part of the platform.
      </p>
    </section>
  )
}
