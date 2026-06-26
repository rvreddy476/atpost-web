// ── Auth ────────────────────────────────────────────────────────
export interface PostMatchUser {
  id: string
  phone_e164?: string
  email?: string
  role: string
  status: string
  onboarding_status: 'new' | 'profile_created' | 'photos_uploaded' | 'preferences_set' | 'ready'
  created_at: string
  updated_at: string
}

export interface SendOTPPayload {
  channel: 'phone' | 'email'
  phone_e164: string
}

export interface VerifyOTPPayload {
  channel: 'phone' | 'email'
  phone_e164: string
  otp: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: PostMatchUser
}

// ── Profile ────────────────────────────────────────────────────
export type Gender = 'male' | 'female' | 'non_binary' | 'other'
export type LookingFor = 'male' | 'female' | 'everyone'
export type RelationshipIntent = 'long_term' | 'marriage' | 'casual' | 'figuring_out'

export interface PostMatchProfile {
  user_id: string
  first_name: string
  date_of_birth: string
  gender: Gender
  looking_for: LookingFor
  bio?: string
  occupation?: string
  company?: string
  education?: string
  city?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
  height_cm?: number
  religion?: string
  community?: string
  relationship_intent: RelationshipIntent
  drinking?: string
  smoking?: string
  exercise?: string
  diet?: string
  wants_children?: string
  family_plans?: string
  visible_to_public: boolean
  blur_mode_enabled: boolean
  profile_completion_percent: number
  created_at: string
  updated_at: string
}

export interface ProfileInput {
  first_name: string
  date_of_birth: string
  gender: Gender
  looking_for: LookingFor
  bio?: string
  occupation?: string
  company?: string
  education?: string
  city?: string
  state?: string
  country?: string
  latitude?: number
  longitude?: number
  height_cm?: number
  religion?: string
  community?: string
  relationship_intent: RelationshipIntent
  drinking?: string
  smoking?: string
  exercise?: string
  diet?: string
  wants_children?: string
  family_plans?: string
}

// ── Preferences ────────────────────────────────────────────────
export interface PostMatchPreferences {
  user_id: string
  min_age: number
  max_age: number
  distance_km: number
  interested_in_gender: LookingFor
  relationship_intent?: RelationshipIntent
  religion?: string
  community?: string
  smoking_pref?: string
  drinking_pref?: string
  wants_children_pref?: string
  blur_mode_preference: boolean
  dealbreakers: string[]
  updated_at: string
}

export interface PreferencesInput {
  min_age: number
  max_age: number
  distance_km: number
  interested_in_gender: LookingFor
  relationship_intent?: RelationshipIntent
  religion?: string
  community?: string
  smoking_pref?: string
  drinking_pref?: string
  wants_children_pref?: string
  blur_mode_preference?: boolean
  dealbreakers?: string[]
}

// ── Media / Photos ─────────────────────────────────────────────
export interface PostMatchPhoto {
  id: string
  user_id: string
  media_key: string
  media_url?: string
  thumbnail_url?: string
  sort_order: number
  is_primary: boolean
  visibility: 'public' | 'blurred' | 'private' | 'reveal_after_match'
  moderation_status: string
  created_at: string
}

export interface InitUploadResponse {
  media_id: string
  upload_url: string
  media_key: string
}

// ── Discovery ──────────────────────────────────────────────────
export interface FeedItem {
  user_id: string
  first_name: string
  age: number
  city?: string
  bio_preview?: string
  compatibility_score: number
  trust_level: string
  primary_photo?: { url: string; blurred: boolean }
  relationship_intent?: string
  occupation?: string
  /**
   * Phase 1 — surfaced by dating-service candidate payload to drive the
   * <TrustBadge /> component. Both fields are optional: older builds of
   * the deck endpoint don't include them.
   */
  trust_tier?: 'none' | 'email' | 'phone' | 'aadhaar' | 'vouched' | string
  verification_state?: string[] | Record<string, boolean>
}

/**
 * Match list row payload — the matches endpoint surfaces the same trust
 * fields under `other_user`, so the badge can render there too.
 */
export interface MatchOtherUserTrust {
  trust_tier?: string
  verification_state?: string[] | Record<string, boolean>
}

export interface DecisionPayload {
  target_user_id: string
  decision: 'like' | 'pass' | 'super_like'
}

export interface DecisionResult {
  result: 'matched' | 'liked' | 'passed'
  match_id?: string
  conversation_id?: string
}

// ── Matches ────────────────────────────────────────────────────
export interface PostMatchMatch {
  id: string
  user_a_id: string
  user_b_id: string
  status: string
  matched_at?: string
  created_at: string
  conversation_id?: string
  other_user?: {
    user_id: string
    first_name: string
    photo_url?: string
  }
}

// ── Chat ───────────────────────────────────────────────────────
export interface PostMatchConversation {
  id: string
  type: string
  match_id?: string
  status: string
  created_at: string
  last_message?: PostMatchMessage
  other_user?: {
    user_id: string
    first_name: string
  }
}

export interface PostMatchMessage {
  id: string
  conversation_id: string
  sender_user_id: string
  message_type: 'text' | 'image' | 'icebreaker'
  body_text?: string
  media_key?: string
  moderation_status: string
  created_at: string
}

export interface SendMessagePayload {
  message_type: 'text' | 'image' | 'icebreaker'
  body_text?: string
  media_key?: string
}

// ── Moderation ─────────────────────────────────────────────────
export interface ReportPayload {
  reported_user_id?: string
  reported_message_id?: string
  category: string
  details?: string
}

export interface LikeReceived {
  user_id: string
  first_name: string
  photo_url?: string
  liked_at: string
}

export interface BlockPayload {
  blocked_user_id: string
  reason?: string
}

// ── Phase 1 — My Reports list ─────────────────────────────────────
export interface MyReportEntry {
  id: string
  target_user_id: string
  target_name?: string
  category: string
  status: 'submitted' | 'under_review' | 'investigating' | 'actioned' | 'resolved' | 'dismissed' | 'closed_no_action' | string
  details?: string
  created_at?: string
  updated_at?: string
  resolution_note?: string
}

export interface MyReportsResult {
  items: MyReportEntry[]
  /**
   * `false` when dating-service hasn't shipped `GET /v1/dating/safety/reports/me`
   * yet — the UI uses it to render a "pending endpoint" banner instead of an
   * empty state.
   */
  endpoint_available: boolean
}
