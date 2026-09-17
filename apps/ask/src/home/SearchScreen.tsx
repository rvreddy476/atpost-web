"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { COPY } from "@/qa/copy"
import { useSearch, useViewer } from "@/qa/hooks"
import { canSearch } from "@/qa/rules"
import { QuestionList } from "@/ui/QuestionList"
import { SearchBox } from "@/ui/SearchBox"
import { EmptyState } from "@/ui/states"
import { H1 } from "@/ui/styles"

/** `/ask/search?q=` — search results. */
export function SearchScreen() {
  const params = useSearchParams()
  const q = (params.get("q") ?? "").trim()
  const viewer = useViewer()
  const query = useSearch(q)

  return (
    <div className="space-y-5">
      {/* Keyed so a new query from the header resets the box. */}
      <SearchBox key={q} initial={q} />
      <h1 className={H1}>{q ? `Results for “${q}”` : COPY.searchShort}</h1>
      {canSearch(q) ? (
        <QuestionList
          query={query}
          viewerId={viewer.userId}
          emptyTitle={COPY.emptySearchTitle}
          emptyBody={COPY.emptySearchBody}
          emptyAction={
            <Link href="/new" className="text-sm font-semibold text-mo-cyan hover:underline">
              {COPY.askTitle}
            </Link>
          }
        />
      ) : (
        <EmptyState title={COPY.searchShort} body={COPY.searchTooShort} />
      )}
    </div>
  )
}
