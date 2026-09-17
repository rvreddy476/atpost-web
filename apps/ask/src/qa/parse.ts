/**
 * Pure decoders for qa-service payloads.
 *
 * Tolerant by design: the service omits `omitempty` fields and answers `null`
 * for an empty listing, so a missing key becomes a neutral default instead of
 * a crash. The golden-fixture tests in ./parse.test.ts are what catch real
 * drift. Every function takes `unknown` — the `data` of the envelope.
 */
import type {
  AskAnswer,
  AskComment,
  AskQuestion,
  AskQuestionPage,
  AskQuestionSummary,
  AskTopic,
  QAAuthor,
  QASettings,
  QAVoteType,
} from "./wire"

type Row = Record<string, unknown>

function obj(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {}
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function optStr(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function bool(value: unknown): boolean {
  return value === true
}

function optBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

function list<T>(value: unknown, parse: (row: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(parse) : []
}

function vote(value: unknown): QAVoteType | null {
  return value === "up" || value === "down" ? value : null
}

export function parseAuthor(value: unknown): QAAuthor | null {
  if (value === null || typeof value !== "object") return null
  const row = obj(value)
  const author = {
    user_id: str(row.user_id),
    username: str(row.username),
    display_name: str(row.display_name),
  }
  return author.user_id || author.username || author.display_name ? author : null
}

export function parseTopic(value: unknown): AskTopic {
  const row = obj(value)
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    description: str(row.description),
    icon_url: str(row.icon_url),
    parent_topic_id: optStr(row.parent_topic_id),
    question_count: num(row.question_count),
    follower_count: num(row.follower_count),
    is_featured: bool(row.is_featured),
    created_at: str(row.created_at),
    is_following: optBool(row.is_following),
  }
}

export function parseTopics(value: unknown): AskTopic[] {
  return list(value, parseTopic)
}

export function parseQuestionSummary(value: unknown): AskQuestionSummary {
  const row = obj(value)
  const anonymous = bool(row.is_anonymous)
  return {
    id: str(row.id),
    author_id: str(row.author_id),
    community_id: optStr(row.community_id),
    title: str(row.title),
    slug: str(row.slug),
    status: str(row.status),
    vote_score: num(row.vote_score),
    answer_count: num(row.answer_count),
    view_count: num(row.view_count),
    is_answered: bool(row.is_answered),
    created_at: str(row.created_at),
    tags: strings(row.tags),
    excerpt: str(row.excerpt),
    // Never read a name off an anonymous post, even if one leaks onto the wire.
    author: anonymous ? null : parseAuthor(row.author),
    is_anonymous: anonymous,
    is_pinned: bool(row.is_pinned) || bool(row.pinned),
  }
}

export function parseQuestionSummaries(value: unknown): AskQuestionSummary[] {
  return list(value, parseQuestionSummary)
}

/** `GET /v1/qa/questions`: `{questions, pagination}`. */
export function parseQuestionPage(value: unknown): AskQuestionPage {
  const row = obj(value)
  const pagination = obj(row.pagination)
  return {
    questions: parseQuestionSummaries(row.questions),
    pagination: {
      limit: num(pagination.limit),
      offset: num(pagination.offset),
      has_more: bool(pagination.has_more),
    },
  }
}

export function parseQuestion(value: unknown): AskQuestion {
  const row = obj(value)
  const anonymous = bool(row.is_anonymous)
  return {
    id: str(row.id),
    author_id: str(row.author_id),
    community_id: optStr(row.community_id),
    title: str(row.title),
    body: str(row.body),
    body_html: str(row.body_html),
    slug: str(row.slug),
    status: str(row.status),
    visibility: str(row.visibility),
    language: str(row.language),
    vote_score: num(row.vote_score),
    upvote_count: num(row.upvote_count),
    downvote_count: num(row.downvote_count),
    answer_count: num(row.answer_count),
    view_count: num(row.view_count),
    follow_count: num(row.follow_count),
    is_answered: bool(row.is_answered),
    best_answer_id: optStr(row.best_answer_id),
    closed_reason: optStr(row.closed_reason),
    closed_by: optStr(row.closed_by),
    merged_into_id: optStr(row.merged_into_id),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
    deleted_at: optStr(row.deleted_at),
    topics: parseTopics(row.topics),
    tags: strings(row.tags),
    author: anonymous ? null : parseAuthor(row.author),
    viewer_vote: vote(row.viewer_vote),
    is_saved: bool(row.is_saved),
    is_following: bool(row.is_following),
    is_anonymous: anonymous,
    is_pinned: bool(row.is_pinned) || bool(row.pinned),
    media_ids: strings(row.media_ids),
  }
}

export function parseAnswer(value: unknown): AskAnswer {
  const row = obj(value)
  const anonymous = bool(row.is_anonymous)
  return {
    id: str(row.id),
    question_id: str(row.question_id),
    author_id: str(row.author_id),
    body: str(row.body),
    body_html: str(row.body_html),
    vote_score: num(row.vote_score),
    upvote_count: num(row.upvote_count),
    downvote_count: num(row.downvote_count),
    is_best: bool(row.is_best),
    is_accepted: bool(row.is_accepted),
    comment_count: num(row.comment_count),
    reference_count: num(row.reference_count),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
    deleted_at: optStr(row.deleted_at),
    author: anonymous ? null : parseAuthor(row.author),
    viewer_vote: vote(row.viewer_vote),
    is_saved: bool(row.is_saved),
    is_anonymous: anonymous,
    media_ids: strings(row.media_ids),
  }
}

export function parseAnswers(value: unknown): AskAnswer[] {
  return list(value, parseAnswer)
}

export function parseComment(value: unknown): AskComment {
  const row = obj(value)
  return {
    id: str(row.id),
    answer_id: str(row.answer_id),
    author_id: str(row.author_id),
    body: str(row.body),
    vote_score: num(row.vote_score),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
    deleted_at: optStr(row.deleted_at),
    author: parseAuthor(row.author),
  }
}

export function parseComments(value: unknown): AskComment[] {
  return list(value, parseComment)
}

/**
 * The sixteen Ask settings, in wire order — the PUT body's order and the
 * table the settings screen and its test iterate.
 */
export const SETTINGS_KEYS = [
  "inbox_answers",
  "inbox_followed_answers",
  "inbox_best_answer",
  "inbox_answer_requests",
  "inbox_comments",
  "inbox_votes",
  "push_answers",
  "push_followed_answers",
  "push_best_answer",
  "push_answer_requests",
  "push_comments",
  "push_votes",
  "email_answers",
  "email_followed_answers",
  "email_best_answer",
  "email_topic_digest",
] as const satisfies readonly (keyof QASettings)[]

export type SettingKey = (typeof SETTINGS_KEYS)[number]

/** The server's defaults (settings_get_200_defaults.json). */
export const DEFAULT_SETTINGS: QASettings = {
  inbox_answers: true,
  inbox_followed_answers: true,
  inbox_best_answer: true,
  inbox_answer_requests: true,
  inbox_comments: true,
  inbox_votes: true,
  push_answers: true,
  push_followed_answers: true,
  push_best_answer: true,
  push_answer_requests: true,
  push_comments: true,
  push_votes: false,
  email_answers: true,
  email_followed_answers: true,
  email_best_answer: true,
  email_topic_digest: false,
}

/** A missing key takes the server default, never a guess. */
export function parseSettings(value: unknown): QASettings {
  const row = obj(value)
  const out = { ...DEFAULT_SETTINGS }
  for (const key of SETTINGS_KEYS) {
    const v = row[key]
    if (typeof v === "boolean") out[key] = v
  }
  return out
}

/** The PUT body: the whole object, all sixteen keys, nothing else. */
export function settingsPutBody(settings: QASettings): QASettings {
  const out = { ...DEFAULT_SETTINGS }
  for (const key of SETTINGS_KEYS) out[key] = settings[key] === true
  return out
}
