"use client"

/**
 * "Trending Topics" — the founder's second card in the right column.
 *
 * ── The same data as the tag browser, drawn the other way round ───────────
 * `GET /v1/hashtags/trending` is one endpoint and ./TrendingTags.tsx already
 * draws it as a full-width list in the centre column. This is the rail's
 * version: a heading with a trend glyph, a "See all" link, and rows of the tag
 * in semibold with its count underneath and an arrow at the right.
 *
 * They share `fetchTrendingTags` and `postCountLabel` rather than either one
 * re-deriving the shape or the singular — "1 post" is the case a seeded dev
 * stack almost never produces and a real one produces constantly, and it is
 * the kind of thing that ends up wrong in the second copy.
 *
 * ── Why the card lives in the ZONE and is passed INTO the chrome ──────────
 * @momentum/chrome owns three URLs, and all three have the VIEWER as their
 * subject — the profile, the suggestions, the connection. Trending hashtags
 * are post-service's and are this zone's; @momentum/chrome's own api.ts states
 * the boundary and apps/reels and apps/kwit mount the same rail without asking
 * for this card. So it is handed to `AppFrame` as `rightRailExtra`.
 *
 * ── An empty list is a QUIET DAY, not a failure ───────────────────────────
 * Both the Redis path and the SQL fallback behind that endpoint are 24-hour
 * windows, so a stack where nobody posted today answers `{"hashtags":[]}` with
 * a 200. The copy says "today" for that reason. See `fetchTrendingTags`.
 *
 * ── It is signed-out-safe ─────────────────────────────────────────────────
 * Trending tags are public, so this fetches whatever the session is — which is
 * why the rail keeps its track for a signed-out visitor rather than rendering
 * an empty aside. A failure is one quiet sentence and never an alert: a rail
 * that could not load is not worth interrupting somebody mid-post for.
 */

import { useEffect, useState } from "react"
import { ChevronRight, TrendingUp } from "lucide-react"
import { fetchTrendingTags, type TrendingTag } from "./tabApi"
import { postCountLabel } from "./TrendingTags"

/** Where "See all" goes: the tag browser, at the URL it has always had. */
export const ALL_TAGS_HREF = "?tab=hashtag"

/** Five. The rail is 300px and a sixth row pushes the card past the fold. */
const RAIL_TAG_LIMIT = 5

type Status = "loading" | "ready" | "error"

export function TrendingTopics() {
  const [tags, setTags] = useState<TrendingTag[]>([])
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    let live = true
    fetchTrendingTags(RAIL_TAG_LIMIT)
      .then((next) => {
        if (!live) return
        setTags(next)
        setStatus("ready")
      })
      .catch(() => {
        if (live) setStatus("error")
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="rounded-mo-lg border border-mo bg-mo-surface p-4 shadow-mo-sm">
      <div className="flex items-center gap-2">
        <TrendingUp aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
        <h2 className="min-w-0 flex-1 truncate font-mo-display text-base font-semibold tracking-mo-display text-mo-ink">
          Trending Topics
        </h2>
        {/*
          "See all" is a real link to a real view — the tag browser the third
          tab used to be. A plain <a> rather than next/link because the href is
          a query string on this same route and the browser resolves it
          correctly against the zone's basePath without any help; it is also
          what makes middle-click and open-in-new-tab work.

          --brand-accent: the interactive colour of whichever scope this is,
          #0B6B37 under `.mo-light` (6.61 on a white card) and #06B6D4 in
          :root (6.74 on a dark one). Green, like every other pressable thing
          in this product.
        */}
        <a
          href={ALL_TAGS_HREF}
          className="shrink-0 rounded-mo-pill px-1 text-xs font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
        >
          See all
        </a>
      </div>

      {status === "loading" && (
        // Rows at the row's real height rather than a spinner: a placeholder
        // whose proportions differ from the content causes a jump on arrival,
        // and the jump is most of what makes a loading state feel cheap.
        <ul aria-hidden="true" className="mt-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2 py-2.5">
              <div className="h-3.5 w-24 animate-pulse rounded-mo-pill bg-mo-raised" />
              <div className="h-2.5 w-16 animate-pulse rounded-mo-pill bg-mo-raised" />
            </li>
          ))}
        </ul>
      )}

      {status === "error" && (
        <p className="mt-2 text-sm text-mo-body">
          Trending topics did not answer. They will be here next time.
        </p>
      )}

      {status === "ready" && tags.length === 0 && (
        <p className="mt-2 text-sm text-mo-body">
          Nothing is trending today. Tags people post with show up here, most
          used first.
        </p>
      )}

      {status === "ready" && tags.length > 0 && (
        <ul className="mt-1 divide-y divide-mo">
          {tags.map((tag) => (
            <li key={tag.name}>
              {/*
                The whole row is the link, which is what makes the count line
                part of the target rather than dead space beside it. 44px via
                the padding on two lines of text.
              */}
              <a
                href={`?tab=hashtag&tag=${encodeURIComponent(tag.name)}`}
                className="-mx-2 flex min-h-[44px] items-center gap-3 rounded-mo px-2 py-2.5 transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mo"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-mo-ink">
                    {tag.label}
                  </span>
                  <span className="block truncate text-xs text-mo-body">
                    {postCountLabel(tag.postCount)}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
