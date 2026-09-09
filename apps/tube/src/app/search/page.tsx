import type { Metadata } from "next"
import { TubeSearchResults } from "@/search/TubeSearchResults"
import { normalizeTubeQuery } from "@/chrome/search"

/**
 * `/tube/search` — Tube's own results page.
 *
 * The query is read HERE, on the server, from `searchParams`, and handed down
 * as a prop. `useSearchParams()` in the client component would be the other
 * way and would need its own Suspense boundary for a value the server already
 * has — the top bar's box pays that cost because it is in the layout and is
 * therefore on every route; a page does not have to.
 *
 * `normalizeTubeQuery` is applied on both sides on purpose. The box trims
 * before it navigates, and this trims before it renders, because a bookmark
 * or a hand-typed `?q=%20%20` never passed through the box at all —
 * search-service trims before deciding a query is empty, so a page that
 * rendered results for "   " would be showing results for a string the
 * service never saw.
 */
export const metadata: Metadata = {
  title: "Search",
}

export default async function TubeSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <TubeSearchResults query={normalizeTubeQuery(q)} />
}
