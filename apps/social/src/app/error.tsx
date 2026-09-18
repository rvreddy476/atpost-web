"use client"

/**
 * A render threw. Without this file the zone answered with a blank page.
 *
 * ── What "blank" meant here ───────────────────────────────────────────────
 * Next's default error boundary for a route segment is nothing at all: React
 * unmounts the subtree, and with no `error.tsx` anywhere above it the whole
 * app shell goes with it. The front door of the platform became an empty
 * white document with a stack trace in the console — no header, no rails, no
 * way to try again, and nothing to say what happened. Every state below this
 * one is a state the feed itself can describe; this is the state where the
 * feed no longer exists to describe anything, which is exactly why it needs a
 * file rather than being the one case nobody wrote.
 *
 * ── `reset` is the retry, and it is the point ─────────────────────────────
 * It re-renders the segment. That is a real recovery for the failure this
 * most often is — a component that threw on one malformed item in one page of
 * a feed — because the refetch that follows is a different page. A reload
 * link is offered beside it for the case where it is not, and it is a plain
 * `<a>` to the zone's own root: `next/link` prefixes the basePath onto every
 * href it is given, so `<Link href="/social">` inside this zone would ask for
 * `/social/social`.
 *
 * ── `role="alert"` here, unlike the signed-out state ──────────────────────
 * This one has genuinely gone wrong and what is on screen is not the page
 * that was asked for, which is the distinction @momentum/content's `FeedError`
 * draws and the reason the signed-out branch no longer borrows it.
 *
 * The thrown value is deliberately not printed. In production Next replaces
 * it with a generic message and a digest anyway, and a stack trace on the
 * page is a sentence nobody can act on next to one they can.
 */

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { BRAND } from "@momentum/brand"

export default function FeedZoneError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The console is where this belongs: it is for whoever is looking at the
    // browser's tools, not for the person trying to read their feed. The
    // digest is what ties it to the server-side log entry in production.
    console.error("social zone render failed", error)
  }, [error])

  return (
    <div
      role="alert"
      className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo"
    >
      <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
      <h1 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
        This page stopped working
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-mo-body">
        Something here failed while it was being drawn. Nothing you did caused it,
        and nothing you posted has been lost.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          // --brand-accent, not --mo-cyan: cyan stops meaning "interactive" inside
          // `.mo-light` (it is --mo-info there) and green takes the role. The
          // alias is #06B6D4 in :root and #0B6B37 under the light scope — 6.74
          // and 6.61 on a card. 44px is the pointer-target floor.
          className="inline-flex min-h-[44px] items-center rounded-mo-pill border border-mo-strong px-5 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
        >
          Try again
        </button>
        <a
          href="/social"
          className="rounded-mo-pill px-4 py-2 text-sm font-semibold text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
        >
          Back to Home
        </a>
      </div>
      {error.digest && (
        // The one identifier worth showing: it is what support can match
        // against the server's log, and it is not an error message.
        <p className="mt-4 text-xs text-mo-body">
          Reference {error.digest} — {BRAND.supportEmail}
        </p>
      )}
    </div>
  )
}
