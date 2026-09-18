/**
 * One function per qa-service route the web uses (`/v1/qa/...`, through this
 * zone's same-origin proxy). Mirrors Android's QaApi.kt / QaRepository.kt.
 *
 * Every function unwraps the envelope's `data` and parses it. Failures are
 * thrown as axios errors and classified by ./errors.ts at the screen.
 * Listings tolerate `data: null` — qa-service's scan helpers return a nil
 * slice for an empty list.
 *
 * Browser only: nothing here runs during server rendering.
 */
import api from "@atpost/api-client"
import type {
  CreateAnswerRequest,
  CreateQuestionRequest,
  CreateReportRequest,
  QASettings,
  QAVoteType,
} from "@atpost/types/qa"
import {
  parseAnswer,
  parseAnswers,
  parseComment,
  parseComments,
  parseQuestion,
  parseQuestionPage,
  parseQuestionSummaries,
  parseSettings,
  parseTopic,
  parseTopics,
  settingsPutBody,
} from "./parse"
import { PAGE_SIZE, SIMILAR_LIMIT } from "./rules"
import type {
  AskAnswer,
  AskComment,
  AskQuestion,
  AskQuestionPage,
  AskQuestionSummary,
  AskTopic,
} from "./wire"

interface Envelope {
  data?: unknown
}

const Q = "/v1/qa"

async function get(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
  const res = await api.get<Envelope>(path, { params })
  return res.data?.data
}

async function post(path: string, body?: unknown): Promise<unknown> {
  const res = await api.post<Envelope>(path, body ?? {})
  return res.data?.data
}

async function put(path: string, body: unknown): Promise<unknown> {
  const res = await api.put<Envelope>(path, body)
  return res.data?.data
}

async function del(path: string): Promise<unknown> {
  const res = await api.delete<Envelope>(path)
  return res.data?.data
}

const id = (value: string) => encodeURIComponent(value)

export interface Paging {
  limit?: number
  offset?: number
}

// ── Feeds ────────────────────────────────────────────────────────────────

export type FeedKind = "for-you" | "following" | "trending" | "unanswered"

export async function fetchFeed(kind: FeedKind, { limit = PAGE_SIZE, offset = 0 }: Paging = {}): Promise<AskQuestionSummary[]> {
  return parseQuestionSummaries(await get(`${Q}/feed/${kind}`, { limit, offset }))
}

// ── Questions ────────────────────────────────────────────────────────────

export type QuestionSort = "recent" | "votes" | "trending" | "unanswered"

export async function fetchQuestions(
  { topic, sort = "recent", status, limit = PAGE_SIZE, offset = 0 }: Paging & { topic?: string; sort?: QuestionSort; status?: string } = {},
): Promise<AskQuestionPage> {
  return parseQuestionPage(await get(`${Q}/questions`, { topic, sort, status, limit, offset }))
}

export async function fetchQuestion(questionId: string): Promise<AskQuestion> {
  return parseQuestion(await get(`${Q}/questions/${id(questionId)}`))
}

export async function createQuestion(body: CreateQuestionRequest): Promise<AskQuestion> {
  return parseQuestion(await post(`${Q}/questions`, body))
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await del(`${Q}/questions/${id(questionId)}`)
}

export async function closeQuestion(questionId: string, reason: string): Promise<void> {
  await post(`${Q}/questions/${id(questionId)}/close`, { reason })
}

export async function fetchMyQuestions({ limit = PAGE_SIZE, offset = 0 }: Paging = {}): Promise<AskQuestionSummary[]> {
  return parseQuestionSummaries(await get(`${Q}/questions/my`, { limit, offset }))
}

export async function fetchSimilar(title: string, limit = SIMILAR_LIMIT): Promise<AskQuestionSummary[]> {
  return parseQuestionSummaries(await get(`${Q}/questions/similar`, { title, limit }))
}

export async function searchQuestions(q: string, { limit = PAGE_SIZE, offset = 0 }: Paging = {}): Promise<AskQuestionSummary[]> {
  return parseQuestionSummaries(await get(`${Q}/search`, { q, limit, offset }))
}

// ── Answers and comments ─────────────────────────────────────────────────

export type AnswerSort = "votes" | "newest"

export async function fetchAnswers(
  questionId: string,
  { sort = "votes", limit = 50, offset = 0 }: Paging & { sort?: AnswerSort } = {},
): Promise<AskAnswer[]> {
  return parseAnswers(await get(`${Q}/questions/${id(questionId)}/answers`, { sort, limit, offset }))
}

export async function createAnswer(questionId: string, body: CreateAnswerRequest): Promise<AskAnswer> {
  return parseAnswer(await post(`${Q}/questions/${id(questionId)}/answers`, body))
}

export async function selectBestAnswer(questionId: string, answerId: string): Promise<void> {
  await post(`${Q}/questions/${id(questionId)}/best-answer`, { answer_id: answerId })
}

export async function fetchComments(answerId: string): Promise<AskComment[]> {
  return parseComments(await get(`${Q}/answers/${id(answerId)}/comments`))
}

export async function createComment(answerId: string, body: string): Promise<AskComment> {
  return parseComment(await post(`${Q}/answers/${id(answerId)}/comments`, { body }))
}

// ── Votes: `null` clears, which is a DELETE ──────────────────────────────

export async function voteQuestion(questionId: string, vote: QAVoteType | null): Promise<void> {
  const path = `${Q}/questions/${id(questionId)}/vote`
  if (vote === null) await del(path)
  else await post(path, { vote_type: vote })
}

export async function voteAnswer(answerId: string, vote: QAVoteType | null): Promise<void> {
  const path = `${Q}/answers/${id(answerId)}/vote`
  if (vote === null) await del(path)
  else await post(path, { vote_type: vote })
}

// ── Follow and save ──────────────────────────────────────────────────────

export async function setQuestionFollowed(questionId: string, followed: boolean): Promise<void> {
  const path = `${Q}/questions/${id(questionId)}/follow`
  if (followed) await post(path)
  else await del(path)
}

export async function setQuestionSaved(questionId: string, saved: boolean): Promise<void> {
  const path = `${Q}/questions/${id(questionId)}/save`
  if (saved) await post(path)
  else await del(path)
}

export async function fetchSavedQuestions({ limit = PAGE_SIZE, offset = 0 }: Paging = {}): Promise<AskQuestionSummary[]> {
  return parseQuestionSummaries(await get(`${Q}/saved/questions`, { limit, offset }))
}

// ── Topics ───────────────────────────────────────────────────────────────

export async function fetchTopics({ featured, limit = 50, offset = 0 }: Paging & { featured?: boolean } = {}): Promise<AskTopic[]> {
  return parseTopics(await get(`${Q}/topics`, { featured, limit, offset }))
}

export async function fetchTopic(topicId: string): Promise<AskTopic> {
  return parseTopic(await get(`${Q}/topics/${id(topicId)}`))
}

export type TopicSort = "newest" | "votes"

export async function fetchTopicQuestions(
  topicId: string,
  { sort = "newest", limit = PAGE_SIZE, offset = 0 }: Paging & { sort?: TopicSort } = {},
): Promise<AskQuestionSummary[]> {
  return parseQuestionSummaries(await get(`${Q}/topics/${id(topicId)}/questions`, { sort, limit, offset }))
}

export async function setTopicFollowed(topicId: string, followed: boolean): Promise<void> {
  const path = `${Q}/topics/${id(topicId)}/follow`
  if (followed) await post(path)
  else await del(path)
}

// ── Know It settings ─────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<QASettings> {
  return parseSettings(await get(`${Q}/settings`))
}

/** PUT replaces the whole object, so all sixteen fields are always sent. */
export async function saveSettings(settings: QASettings): Promise<QASettings> {
  const body = settingsPutBody(settings)
  const data = await put(`${Q}/settings`, body)
  return data == null ? body : parseSettings(data)
}

// ── Reporting ────────────────────────────────────────────────────────────

export async function report(body: CreateReportRequest): Promise<void> {
  await post(`${Q}/reports`, body)
}
