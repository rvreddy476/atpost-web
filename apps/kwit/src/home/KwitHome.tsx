"use client"

import { useState } from "react"
import Link from "next/link"
import { Tabs, type TabItem } from "@atpost/ui"
import { COPY } from "@/qa/copy"
import type { FeedKind } from "@/qa/api"
import { useFeed, useTopics, useViewer } from "@/qa/hooks"
import { QuestionList } from "@/ui/QuestionList"
import { TopicChip } from "@/ui/QuestionCard"
import { SearchBox } from "@/ui/SearchBox"
import { ListSkeleton } from "@/ui/states"
import { H2, PRIMARY } from "@/ui/styles"

interface FeedTab {
  id: FeedKind
  label: string
  emptyTitle: string
  emptyBody: string
  session: boolean
}

export const FEED_TABS: readonly FeedTab[] = [
  { id: "for-you", label: COPY.tabForYou, emptyTitle: COPY.emptyForYouTitle, emptyBody: COPY.emptyForYouBody, session: true },
  { id: "following", label: COPY.tabFollowing, emptyTitle: COPY.emptyFollowingTitle, emptyBody: COPY.emptyFollowingBody, session: true },
  { id: "trending", label: COPY.tabTrending, emptyTitle: COPY.emptyTrendingTitle, emptyBody: COPY.emptyTrendingBody, session: false },
  { id: "unanswered", label: COPY.tabUnanswered, emptyTitle: COPY.emptyUnansweredTitle, emptyBody: COPY.emptyUnansweredBody, session: false },
]

/** The tabs a reader can see: For you and Following need an account. */
export function feedTabsFor(signedIn: boolean): readonly FeedTab[] {
  return FEED_TABS.filter((tab) => signedIn || !tab.session)
}

/** `/kwit` — the home feeds, search, the ask-a-question CTA and the featured topics rail. */
export function KwitHome() {
  const viewer = useViewer()
  const tabs = feedTabsFor(viewer.signedIn)
  const [chosen, setChosen] = useState<FeedKind | null>(null)
  const active = tabs.find((t) => t.id === chosen) ?? tabs[0]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <SearchBox />
        </div>
        <Link href="/new" className={`${PRIMARY} shrink-0`}>
          {COPY.askTitle}
        </Link>
      </div>

      <TopicsRail />

      {viewer.known ? (
        <Tabs
          aria-label="Question feeds"
          items={tabs.map<TabItem>((t) => ({ id: t.id, label: t.label }))}
          value={active.id}
          onChange={(id) => setChosen(id as FeedKind)}
        >
          <FeedPanel key={active.id} tab={active} viewerId={viewer.userId} />
        </Tabs>
      ) : (
        <ListSkeleton />
      )}
    </div>
  )
}

function FeedPanel({ tab, viewerId }: { tab: FeedTab; viewerId: string | null }) {
  const query = useFeed(tab.id)
  return (
    <QuestionList
      query={query}
      viewerId={viewerId}
      emptyTitle={tab.emptyTitle}
      emptyBody={tab.emptyBody}
      emptyAction={
        <Link href={tab.id === "for-you" || tab.id === "following" ? "/topics" : "/new"} className="text-sm font-semibold text-mo-cyan hover:underline">
          {tab.id === "for-you" || tab.id === "following" ? "Browse topics" : COPY.askTitle}
        </Link>
      }
    />
  )
}

/**
 * Featured topics first, then the rest, capped. Silent on failure — the feed
 * below already says whether Know It is available, and a rail that shouts the
 * same thing twice is noise.
 */
function TopicsRail() {
  const topics = useTopics()
  if (!topics.data || topics.data.length === 0) return null
  const ordered = [...topics.data].sort((a, b) => Number(b.is_featured) - Number(a.is_featured)).slice(0, 12)

  return (
    <section aria-labelledby="ask-featured-topics">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="ask-featured-topics" className={`${H2} text-base`}>
          {COPY.featuredTopics}
        </h2>
        <Link href="/topics" className="text-sm font-semibold text-mo-cyan hover:underline">
          {COPY.allTopics}
        </Link>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {ordered.map((topic) => (
          <li key={topic.id} className="shrink-0">
            <TopicChip topic={topic} />
          </li>
        ))}
      </ul>
    </section>
  )
}
