export interface AIJob {
  id: string
  job_type: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  ref_type: string
  ref_id: string
  result_json?: Record<string, unknown>
  error_message?: string
  created_at: string
  updated_at: string
}

export interface CaptionSuggestion {
  captions: string[]
}

export interface HashtagSuggestion {
  hashtags: string[]
}

export interface SmartReply {
  replies: string[]
}

export interface ModerationResult {
  ref_id: string
  ref_type: string
  is_safe: boolean
  flagged_categories: string[]
  confidence: number
  reviewed_at: string
}
