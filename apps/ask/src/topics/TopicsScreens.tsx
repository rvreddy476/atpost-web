"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { FollowButton, type FollowState } from "@momentum/interactions"
import { formatCount } from "@momentum/content"
import { useToast } from "@atpost/ui"
import { askSignInHref } from "@/chrome/links"
import { setTopicFollowed, type TopicSort } from "@/qa/api"
import { COPY } from "@/qa/copy"
import { classifyError, errorMessage } from "@/qa/errors"
import { useTopic, useTopicQuestions, useTopics, useViewer } from "@/qa/hooks"
import type { AskTopic } from "@/qa/wire"
import { QuestionList } from "@/ui/QuestionList"
import { EmptyState, ListSkeleton, queryFallback } from "@/ui/states"
import { CARD, H1, H2, PILL_ACTION } from "@/ui/styles"

/** `/ask/topics` — the topic directory. Topics are moderator-created; there is no create UI. */
export function TopicsScreen() {
  const topics = useTopics()
  const viewer = useViewer()

  return (
    <div className="space-y-5">
      <header>
        <h1 className={H1}>{COPY.topicsTitle}</h1>
        <p className="mt-1 text-sm text-mo-body">{COPY.topicsIntro}</p>
      </header>
      {topics.data ? (
        topics.data.length === 0 ? (
          <EmptyState title={COPY.emptyTopicsTitle} body={COPY.emptyTopicsBody} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {topics.data.map((topic) => (
              <li key={topic.id}>
                <TopicCard topic={topic} signedIn={viewer.signedIn} />
              </li>
            ))}
          </ul>
        )
      ) : (
        queryFallback(topics)
      )}
    </div>
  )
}

function TopicCard({ topic, signedIn }: { topic: AskTopic; signedIn: boolean }) {
  return (
    <article className={`${CARD} flex h-full flex-col gap-2`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className={`${H2} min-w-0 truncate`}>
          <Link href={`/topics/${topic.id}`} className="hover:text-mo-cyan">
            {topic.name}
          </Link>
        </h2>
        <TopicFollow topic={topic} signedIn={signedIn} />
      </div>
      {topic.description ? <p className="line-clamp-2 text-sm text-mo-body">{topic.description}</p> : null}
      <p className="mt-auto text-xs text-mo-body">
        {formatCount(topic.question_count)} questions · {formatCount(topic.follower_count)} followers
      </p>
    </article>
  )
}

/**
 * Follow a topic. Signed out it is a sign-in link. `is_following` is null
 * for a signed-out read; signed in, a null reads as not following.
 */
function TopicFollow({ topic, signedIn }: { topic: AskTopic; signedIn: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  if (!signedIn) {
    return (
      <a href={askSignInHref(`/topics/${topic.id}`)} className={`${PILL_ACTION} py-1`}>
        {COPY.follow}
      </a>
    )
  }
  const state: FollowState = topic.is_following ? "following" : "none"
  return (
    <FollowButton
      key={state}
      state={state}
      displayName={topic.name}
      onToggle={async (next) => {
        try {
          await setTopicFollowed(topic.id, next === "follow")
          void queryClient.invalidateQueries({ queryKey: ["qa", "feed"] })
          return next === "follow" ? "following" : "none"
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      }}
    />
  )
}

const TOPIC_SORTS: { id: TopicSort; label: string }[] = [
  { id: "newest", label: COPY.sortNewest },
  { id: "votes", label: COPY.sortVotes },
]

/** `/ask/topics/[id]` — a topic's header and its questions. */
export function TopicScreen({ topicId }: { topicId: string }) {
  const topic = useTopic(topicId)
  const viewer = useViewer()
  const [sort, setSort] = useState<TopicSort>("newest")
  const questions = useTopicQuestions(topicId, sort)

  if (!topic.data) {
    if (topic.isError && classifyError(topic.error).kind === "notFound") {
      return <EmptyState title="Topic not found" body="It may have been removed, or the link is wrong." />
    }
    return <>{queryFallback(topic, <ListSkeleton count={2} />)}</>
  }

  return (
    <div className="space-y-5">
      <header className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className={`${H1} min-w-0`}>{topic.data.name}</h1>
          <TopicFollow topic={topic.data} signedIn={viewer.signedIn} />
        </div>
        {topic.data.description ? <p className="mt-2 text-mo-body">{topic.data.description}</p> : null}
        <p className="mt-2 text-sm text-mo-body">
          {formatCount(topic.data.question_count)} questions · {formatCount(topic.data.follower_count)} followers
        </p>
      </header>

      <div className="flex items-center justify-between gap-2">
        <h2 className={H2}>Questions</h2>
        <div role="group" aria-label="Sort questions" className="inline-flex rounded-mo-pill border border-mo p-0.5">
          {TOPIC_SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={sort === option.id}
              onClick={() => setSort(option.id)}
              className={`rounded-mo-pill px-3 py-1 text-sm font-semibold transition-colors duration-150 ease-mo ${
                sort === option.id ? "bg-mo-raised text-mo-ink" : "text-mo-body hover:text-mo-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <QuestionList
        query={questions}
        viewerId={viewer.userId}
        emptyTitle={COPY.emptyTopicQuestionsTitle}
        emptyBody={COPY.emptyTopicQuestionsBody}
        emptyAction={
          <Link href="/new" className="text-sm font-semibold text-mo-cyan hover:underline">
            {COPY.askTitle}
          </Link>
        }
      />
    </div>
  )
}
