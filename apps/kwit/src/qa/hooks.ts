"use client"

/**
 * React Query hooks over ./api.ts. Every read runs in the browser.
 *
 * Session-only reads (For you, Following, My questions, Saved, settings) wait
 * for `useSession().status !== "unknown"` and are never issued signed out —
 * asking would only 401.
 */
import { useEffect, useState } from "react"
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query"
import { useSession } from "@atpost/api-client/session"
import {
  fetchAnswers,
  fetchComments,
  fetchFeed,
  fetchMyQuestions,
  fetchQuestion,
  fetchSavedQuestions,
  fetchSettings,
  fetchSimilar,
  fetchTopic,
  fetchTopicQuestions,
  fetchTopics,
  searchQuestions,
  type AnswerSort,
  type FeedKind,
  type TopicSort,
} from "./api"
import { nextOffset } from "./paging"
import { canSearch, shouldCheckSimilar } from "./rules"
import type { AskQuestionSummary } from "./wire"

export const qaKeys = {
  all: ["qa"] as const,
  feed: (kind: FeedKind) => ["qa", "feed", kind] as const,
  question: (id: string) => ["qa", "question", id] as const,
  answers: (id: string, sort: AnswerSort) => ["qa", "answers", id, sort] as const,
  answersAll: (id: string) => ["qa", "answers", id] as const,
  comments: (answerId: string) => ["qa", "comments", answerId] as const,
  topics: (featured: boolean) => ["qa", "topics", featured ? "featured" : "all"] as const,
  topic: (id: string) => ["qa", "topic", id] as const,
  topicQuestions: (id: string, sort: TopicSort) => ["qa", "topic-questions", id, sort] as const,
  search: (q: string) => ["qa", "search", q] as const,
  similar: (title: string) => ["qa", "similar", title] as const,
  mine: ["qa", "mine"] as const,
  saved: ["qa", "saved"] as const,
  settings: ["qa", "settings"] as const,
}

function usePagedQuestions(
  key: readonly unknown[],
  load: (offset: number) => Promise<AskQuestionSummary[]>,
  enabled: boolean,
) {
  return useInfiniteQuery<AskQuestionSummary[], Error, InfiniteData<AskQuestionSummary[], number>, readonly unknown[], number>({
    queryKey: key,
    queryFn: ({ pageParam }) => load(pageParam),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
  })
}

export function useViewer() {
  const session = useSession()
  return {
    known: session.status !== "unknown",
    signedIn: session.signedIn,
    signedOut: session.signedOut,
    userId: session.userId,
  }
}

const SESSION_FEEDS: readonly FeedKind[] = ["for-you", "following"]

export function useFeed(kind: FeedKind, active = true) {
  const viewer = useViewer()
  const needsSession = SESSION_FEEDS.includes(kind)
  const enabled = active && viewer.known && (!needsSession || viewer.signedIn)
  return usePagedQuestions(qaKeys.feed(kind), (offset) => fetchFeed(kind, { offset }), enabled)
}

export function useQuestion(id: string) {
  return useQuery({ queryKey: qaKeys.question(id), queryFn: () => fetchQuestion(id) })
}

export function useAnswers(id: string, sort: AnswerSort, enabled = true) {
  return useQuery({ queryKey: qaKeys.answers(id, sort), queryFn: () => fetchAnswers(id, { sort }), enabled })
}

export function useComments(answerId: string, enabled: boolean) {
  return useQuery({ queryKey: qaKeys.comments(answerId), queryFn: () => fetchComments(answerId), enabled })
}

export function useTopics(featured = false) {
  return useQuery({
    queryKey: qaKeys.topics(featured),
    queryFn: () => fetchTopics(featured ? { featured: true } : {}),
  })
}

export function useTopic(id: string) {
  return useQuery({ queryKey: qaKeys.topic(id), queryFn: () => fetchTopic(id) })
}

export function useTopicQuestions(id: string, sort: TopicSort) {
  return usePagedQuestions(qaKeys.topicQuestions(id, sort), (offset) => fetchTopicQuestions(id, { sort, offset }), true)
}

export function useSearch(q: string) {
  const query = q.trim()
  return usePagedQuestions(qaKeys.search(query), (offset) => searchQuestions(query, { offset }), canSearch(query))
}

export function useMyQuestions(active = true) {
  const viewer = useViewer()
  return usePagedQuestions(qaKeys.mine, (offset) => fetchMyQuestions({ offset }), active && viewer.signedIn)
}

export function useSavedQuestions(active = true) {
  const viewer = useViewer()
  return usePagedQuestions(qaKeys.saved, (offset) => fetchSavedQuestions({ offset }), active && viewer.signedIn)
}

export function useSettings() {
  const viewer = useViewer()
  return useQuery({ queryKey: qaKeys.settings, queryFn: fetchSettings, enabled: viewer.signedIn })
}

/**
 * Duplicate detection while typing a title. A courtesy, never a gate: a
 * failure is silent and yields no suggestions.
 */
export function useSimilar(title: string) {
  const debounced = useDebounced(title.trim(), 400)
  const enabled = shouldCheckSimilar(debounced)
  return useQuery({
    queryKey: qaKeys.similar(debounced),
    queryFn: () => fetchSimilar(debounced),
    enabled,
    retry: false,
    placeholderData: (previous) => (enabled ? previous : undefined),
  })
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
