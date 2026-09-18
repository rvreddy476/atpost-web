import type { Metadata } from "next"
import { TubeTrending } from "@/trending/TubeTrending"

/**
 * `/tube/trending`: a full page in the Tube application.
 *
 * A mount point and nothing else, exactly like ../subscriptions/page.tsx. A
 * static segment beside `[postId]`, safe because Next resolves static
 * segments first — "/tube/trending" lands here and never on the watch page
 * with `postId: "trending"`.
 *
 * This is one of the two new pages that IS indexable. `GET /v1/posts/trending`
 * is public, the page renders real videos for a browser with no session, and a
 * search result pointing at it is a search result pointing at content. Every
 * other page added in this change is one person's list behind a session, and
 * carries `noindex` for the reason ../history/page.tsx gives.
 */
export const metadata: Metadata = {
  title: "Trending",
  description: "The long videos getting the most attention on Momentum right now.",
}

export default function TrendingPage() {
  return <TubeTrending />
}
