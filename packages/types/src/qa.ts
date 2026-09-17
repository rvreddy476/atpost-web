/**
 * qa-service (`/v1/qa`) wire shapes.
 *
 * Aligned with the service's golden contract fixtures
 * (`qa-service/internal/http/testdata/contracts/*.json`) and the Android
 * client's QaDtos.kt. The service omits `omitempty` fields and answers `null`
 * rather than `[]` for an empty listing, so optional here means "may be
 * absent on the wire", and consumers parse defensively.
 */

export interface QAProfile {
  user_id: string
  display_name: string
  bio: string
  expertise_areas: string[]
  reputation_score: number
  question_count: number
  answer_count: number
  best_answer_count: number
  is_verified: boolean
  created_at: string
  updated_at: string
}

/**
 * The byline on a question, answer or comment: names only. Absent on
 * anonymous content AND wherever the server could not look the user up —
 * which is not the same thing. "Anonymous" comes from `is_anonymous` only.
 */
export interface QAAuthor {
  user_id: string
  username: string
  display_name: string
}

export interface QACommunityScope {
  id: string
  name: string
  visibility: string
  community_type: string
}

export interface QATopic {
  id: string
  name: string
  slug: string
  description: string
  icon_url: string
  parent_topic_id?: string | null
  question_count: number
  follower_count: number
  is_featured: boolean
  created_at: string
  /** Absent when the caller is signed out. */
  is_following?: boolean | null
}

/**
 * The list shape (feeds, search, topic questions, saved, my questions, and
 * the rows of `GET /questions`). `author_id` is the empty UUID and `author`
 * absent whenever `is_anonymous` is true, except for the author themself.
 */
export interface QuestionSummary {
  id: string
  author_id: string
  title: string
  slug: string
  status: string
  vote_score: number
  answer_count: number
  view_count: number
  is_answered: boolean
  created_at: string
  tags?: string[] | null
  excerpt?: string
  author?: QAAuthor | null
  follow_count?: number
  is_following?: boolean
  community_id?: string | null
  community?: QACommunityScope | null
  is_anonymous?: boolean
  is_pinned?: boolean
  /** @deprecated the server sends `is_pinned`. */
  pinned?: boolean
}

export interface Question {
  id: string
  author_id: string
  title: string
  body: string
  /** Server-rendered HTML. Never render it as HTML on the web. */
  body_html: string
  slug: string
  status: string
  visibility: string
  language: string
  vote_score: number
  upvote_count: number
  downvote_count: number
  answer_count: number
  view_count: number
  follow_count: number
  is_answered: boolean
  best_answer_id?: string | null
  closed_reason?: string | null
  closed_by?: string | null
  merged_into_id?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  topics?: QATopic[] | null
  tags?: string[] | null
  author?: QAAuthor | null
  /** "up", "down", or absent when the viewer has not voted or is signed out. */
  viewer_vote?: QAVoteType | null
  is_saved?: boolean | null
  is_following?: boolean | null
  community_id?: string | null
  community?: QACommunityScope | null
  is_anonymous?: boolean
  is_pinned?: boolean
  /** @deprecated the server sends `is_pinned`. */
  pinned?: boolean
  /** media-service asset ids, in display order. */
  media_ids?: string[] | null
}

export interface Answer {
  id: string
  question_id: string
  author_id: string
  body: string
  body_html: string
  vote_score: number
  upvote_count: number
  downvote_count: number
  is_best: boolean
  is_accepted: boolean
  comment_count: number
  reference_count: number
  created_at: string
  updated_at: string
  deleted_at?: string | null
  references?: AnswerReference[] | null
  author?: QAAuthor | null
  viewer_vote?: QAVoteType | null
  is_saved?: boolean | null
  is_anonymous?: boolean
  media_ids?: string[] | null
}

export interface AnswerReference {
  id: string
  answer_id: string
  url: string
  title: string
  description: string
  sort_order: number
}

export interface AnswerComment {
  id: string
  answer_id: string
  author_id: string
  body: string
  vote_score: number
  created_at: string
  updated_at: string
  deleted_at?: string | null
  author?: QAAuthor | null
}

export type QAVoteType = "up" | "down"

export interface QAPagination {
  limit: number
  offset: number
  has_more: boolean
}

/** `GET /v1/qa/questions` wraps its list; the feed routes return a bare array. */
export interface QuestionListPage {
  questions: QuestionSummary[] | null
  pagination?: QAPagination | null
}

export interface QAStatusResponse {
  status: string
}

/**
 * Ask's own notification and email settings (`GET`/`PUT /v1/qa/settings`).
 * Separate from the app-wide notification preferences. `PUT` replaces the
 * whole object, so a client always sends all sixteen fields.
 */
export interface QASettings {
  inbox_answers: boolean
  inbox_followed_answers: boolean
  inbox_best_answer: boolean
  inbox_answer_requests: boolean
  inbox_comments: boolean
  inbox_votes: boolean
  push_answers: boolean
  push_followed_answers: boolean
  push_best_answer: boolean
  push_answer_requests: boolean
  push_comments: boolean
  push_votes: boolean
  email_answers: boolean
  email_followed_answers: boolean
  email_best_answer: boolean
  email_topic_digest: boolean
}

// Request bodies

export interface CreateQuestionRequest {
  title: string
  body: string
  topic_ids: string[]
  tags: string[]
  is_anonymous: boolean
  community_id?: string
}

export interface CreateAnswerRequest {
  body: string
  is_anonymous: boolean
}

export interface VoteRequest {
  vote_type: QAVoteType
}

export interface CreateCommentRequest {
  body: string
}

export interface CloseQuestionRequest {
  reason: string
}

export interface SelectBestAnswerRequest {
  answer_id: string
}

export interface CreateReportRequest {
  target_type: "question" | "answer" | "comment" | "user"
  target_id: string
  reason: string
  details: string
}

/** The error envelope. qa-service always sends `meta`; the gateway gate does not. */
export interface QAErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown } | null
  meta?: unknown
}

export interface ReputationEvent {
  id: string
  user_id: string
  event_type: string
  points: number
  source_type: string
  source_id?: string
  created_at: string
}

export interface ContributorBadge {
  id: string
  user_id: string
  badge_type: string
  badge_name: string
  awarded_at: string
}

export interface ModerationReport {
  id: string
  reporter_id: string
  target_type: string
  target_id: string
  reason: string
  details: string
  status: string
  reviewed_by?: string
  resolved_at?: string
  created_at: string
}

export interface AnswerRequest {
  id: string
  question_id: string
  requester_id: string
  requested_user_id: string
  status: string
  created_at: string
  question_title?: string
}

// API response wrappers
export interface QAListResponse<T> {
  data: T[]
}
export interface QASingleResponse<T> {
  data: T
}

// Community Q&A settings
export type CommunityQAPermission = 'everyone' | 'members' | 'moderators'

export interface CommunityQASettings {
  community_id: string
  qa_enabled: boolean
  ask_permission: CommunityQAPermission
  answer_permission: CommunityQAPermission
  auto_suggest_topics: boolean
  require_approval: boolean
  anonymity_enabled: boolean
  welcome_message?: string
  updated_at?: string
}

// Drafts
export interface QuestionDraft {
  id: string
  user_id?: string
  community_id?: string
  title: string
  body: string
  body_html?: string
  topic_ids?: string[]
  tags?: string[]
  is_anonymous?: boolean
  created_at: string
  updated_at: string
}

export interface AnswerDraft {
  id: string
  user_id?: string
  question_id: string
  body: string
  body_html?: string
  created_at: string
  updated_at: string
}
