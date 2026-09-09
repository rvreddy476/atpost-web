"use client"

/**
 * The HashTag tab's first screen: today's tags, most-used first.
 *
 * ── This tab is not a third timeline ──────────────────────────────────────
 * That is the thing to know before reading the rest. Android's `FeedScreen.kt`
 * branches here — For You and Following are one endpoint narrowed server-side,
 * HashTag shows `TrendingHashtagsList` and pushes a tag's posts when a row is
 * tapped. The web has no push, so the tag's posts open in place and the tag
 * goes in the URL (`?tab=hashtag&tag=momentum`), which makes a tag's feed a
 * link somebody can send — something the phone cannot do at all.
 *
 * ── A plain list on purpose ───────────────────────────────────────────────
 * The tag, its count, a chevron. No cards, no previews. The row's only job is
 * to say what it opens, and what it opens is another list; a preview here
 * would be the same posts twice on two screens.
 *
 * ── Empty is the ordinary case on a small deployment ──────────────────────
 * See `fetchTrendingTags`: the window is 24 hours in both the Redis path and
 * the SQL fallback, so a stack where nobody posted today answers with an empty
 * list and a 200. The copy says "today" for that reason — "no tags" would read
 * as "this product has no tags", which is not what the server said.
 */

import { ChevronRight, Hash } from "lucide-react"
import type { TrendingTag } from "./tabApi"
import { SectionEmpty, SectionError } from "./TabStates"

export interface TrendingTagsProps {
  status: "loading" | "ready" | "error"
  tags: TrendingTag[]
  onOpen: (tag: string) => void
  onRetry: () => void
}

export function TrendingTags({ status, tags, onOpen, onRetry }: TrendingTagsProps) {
  if (status === "loading") return <TagsSkeleton />

  if (status === "error") {
    return (
      <SectionError
        title="We could not load trending tags"
        detail="The tag list did not answer. Your feed is fine — this is the list on this tab."
        action={{ label: "Try again", onClick: onRetry }}
      />
    )
  }

  if (tags.length === 0) {
    return (
      <SectionEmpty
        icon={Hash}
        title="No trending tags today"
        detail="Tags people post with today show up here, most used first. Nobody has posted with one yet."
        action={{ label: "Check again", onClick: onRetry }}
      />
    )
  }

  return (
    // `border-t` on every row but the first rather than `divide-y`: the divide
    // utilities take their colour from `divideColor`, which this preset extends
    // `borderColor` without extending, and a class that silently resolves to
    // nothing is worse than one more word here.
    <ul className="overflow-hidden rounded-mo border border-mo bg-mo-surface shadow-mo">
      {tags.map((tag, i) => (
        <li key={tag.name} className={i === 0 ? "" : "border-t border-mo"}>
          <button
            type="button"
            onClick={() => onOpen(tag.name)}
            className="flex w-full cursor-default items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mo"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-mo-ink">{tag.label}</span>
              <span className="block text-sm text-mo-body">{postCountLabel(tag.postCount)}</span>
            </span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * "1 post" / "12 posts".
 *
 * Exported because it is the kind of thing that is silently wrong forever —
 * the singular is the case a seeded dev stack almost never produces and a real
 * one produces constantly.
 */
export function postCountLabel(count: number): string {
  return count === 1 ? "1 post" : `${count} posts`
}

/**
 * Rows, at the row's real height, rather than a spinner.
 *
 * Same reasoning as `FeedSkeleton`: a placeholder whose proportions differ
 * from the content causes a jump on arrival, and the jump is most of what
 * makes a loading state feel cheap.
 */
function TagsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-mo border border-mo bg-mo-surface shadow-mo"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={["space-y-2 px-4 py-3", i === 0 ? "" : "border-t border-mo"].join(" ")}
        >
          <div className="h-3.5 w-28 animate-pulse rounded-mo-pill bg-mo-raised" />
          <div className="h-3 w-16 animate-pulse rounded-mo-pill bg-mo-raised" />
        </div>
      ))}
    </div>
  )
}
