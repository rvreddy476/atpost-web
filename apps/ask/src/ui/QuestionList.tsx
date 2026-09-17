"use client"

import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query"
import { FeedEnd, InfiniteFeed } from "@momentum/content"
import { flattenPages } from "@/qa/paging"
import type { AskQuestionSummary } from "@/qa/wire"
import { QuestionCard } from "./QuestionCard"
import { EmptyState, ErrorState, ListSkeleton, queryFallback } from "./states"

/**
 * An infinite list of question cards with every state: skeleton, gate,
 * error with retry, empty, and the end marker. A failure while loading a
 * LATER page keeps the rows already shown and offers a retry under them.
 */
export function QuestionList({
  query,
  viewerId,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  query: UseInfiniteQueryResult<InfiniteData<AskQuestionSummary[], number>, Error>
  viewerId: string | null
  emptyTitle: string
  emptyBody?: string
  emptyAction?: React.ReactNode
}) {
  const rows = flattenPages(query.data?.pages)

  if (rows.length === 0) {
    const fallback = queryFallback(query)
    if (fallback) return <>{fallback}</>
    return (
      <EmptyState title={emptyTitle} body={emptyBody}>
        {emptyAction}
      </EmptyState>
    )
  }

  return (
    <div>
      <InfiniteFeed
        hasMore={!!query.hasNextPage && !query.isFetchNextPageError}
        loading={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        loadingIndicator={<ListSkeleton count={1} />}
        endIndicator={query.isFetchNextPageError ? null : <FeedEnd />}
      >
        {rows.map((question) => (
          <QuestionCard key={question.id} question={question} viewerId={viewerId} />
        ))}
      </InfiniteFeed>
      {query.isFetchNextPageError ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={() => void query.fetchNextPage()} />
        </div>
      ) : null}
    </div>
  )
}
