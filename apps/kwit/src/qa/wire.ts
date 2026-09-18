/**
 * The shapes the Know It screens work with.
 *
 * Wire field names are kept (snake_case) so a row read in devtools matches
 * the code. The source of truth is `@atpost/types/qa`, aligned with the
 * qa-service golden fixtures; these are the same types with every
 * "may be absent on the wire" field made definite by ./parse.ts, so a screen
 * never has to write `?? []`.
 */
import type {
  Answer as WireAnswer,
  AnswerComment as WireComment,
  QAAuthor,
  QAPagination,
  QASettings,
  QATopic,
  QAVoteType,
  Question as WireQuestion,
  QuestionSummary as WireQuestionSummary,
} from "@atpost/types/qa"

export type { QAAuthor, QAPagination, QASettings, QAVoteType }

export type AskTopic = Omit<QATopic, "is_following" | "parent_topic_id"> & {
  parent_topic_id: string | null
  is_following: boolean | null
}

export type AskQuestionSummary = Omit<
  WireQuestionSummary,
  "tags" | "author" | "excerpt" | "is_anonymous" | "is_pinned" | "pinned" | "community" | "community_id"
> & {
  community_id: string | null
  tags: string[]
  excerpt: string
  author: QAAuthor | null
  is_anonymous: boolean
  is_pinned: boolean
}

export type AskQuestion = Omit<
  WireQuestion,
  | "topics"
  | "tags"
  | "media_ids"
  | "author"
  | "is_anonymous"
  | "is_pinned"
  | "pinned"
  | "viewer_vote"
  | "is_saved"
  | "is_following"
  | "best_answer_id"
  | "closed_reason"
  | "closed_by"
  | "merged_into_id"
  | "deleted_at"
  | "community"
  | "community_id"
> & {
  community_id: string | null
  topics: AskTopic[]
  tags: string[]
  media_ids: string[]
  author: QAAuthor | null
  is_anonymous: boolean
  is_pinned: boolean
  viewer_vote: QAVoteType | null
  is_saved: boolean
  is_following: boolean
  best_answer_id: string | null
  closed_reason: string | null
  closed_by: string | null
  merged_into_id: string | null
  deleted_at: string | null
}

export type AskAnswer = Omit<
  WireAnswer,
  "author" | "is_anonymous" | "viewer_vote" | "is_saved" | "media_ids" | "references" | "deleted_at"
> & {
  author: QAAuthor | null
  is_anonymous: boolean
  viewer_vote: QAVoteType | null
  is_saved: boolean
  media_ids: string[]
  deleted_at: string | null
}

export type AskComment = Omit<WireComment, "author" | "deleted_at"> & {
  author: QAAuthor | null
  deleted_at: string | null
}

export interface AskQuestionPage {
  questions: AskQuestionSummary[]
  pagination: QAPagination
}

/** The empty UUID the server puts in `author_id` of an anonymous post. */
export const EMPTY_UUID = "00000000-0000-0000-0000-000000000000"

export const STATUS_OPEN = "open"
export const STATUS_CLOSED = "closed"
