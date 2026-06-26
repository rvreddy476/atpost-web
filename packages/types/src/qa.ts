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

export interface QATopic {
  id: string
  name: string
  slug: string
  description: string
  icon_url: string
  parent_topic_id?: string
  question_count: number
  follower_count: number
  is_featured: boolean
  created_at: string
  is_following?: boolean
}

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
  tags?: string[]
  author?: QAProfile
  follow_count?: number
  is_following?: boolean
  community_id?: string
  is_anonymous?: boolean
  pinned?: boolean
}

export interface Question {
  id: string
  author_id: string
  title: string
  body: string
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
  best_answer_id?: string
  closed_reason?: string
  closed_by?: string
  merged_into_id?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  topics?: QATopic[]
  tags?: string[]
  author?: QAProfile
  viewer_vote?: string
  is_saved?: boolean
  is_following?: boolean
  community_id?: string
  is_anonymous?: boolean
  pinned?: boolean
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
  deleted_at?: string
  references?: AnswerReference[]
  author?: QAProfile
  viewer_vote?: string
  is_saved?: boolean
  is_anonymous?: boolean
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
  deleted_at?: string
  author?: QAProfile
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
