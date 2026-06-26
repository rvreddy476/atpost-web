export interface Group {
  id: string
  name: string
  description: string
  avatar_media_id?: string
  cover_media_id?: string
  creator_id: string
  visibility: 'public' | 'private'
  is_archived: boolean
  chat_conversation_id?: string
  member_count: number
  post_count: number
  created_at: string
  updated_at: string
  // V2 fields
  handle?: string
  category?: string
  privacy_level?: 'public' | 'restricted' | 'private'
  join_mode?: 'open' | 'request' | 'invite_only'
  who_can_post?: 'all_members' | 'admins_mods' | 'admins_only'
  who_can_invite?: 'all_members' | 'admins_mods' | 'admins_only'
  location?: string
  language?: string
  status?: 'active' | 'archived' | 'deleted'
  pending_request_count?: number
  viewer_role?: 'owner' | 'admin' | 'moderator' | 'member' | 'pending' | 'outsider' | 'banned'
  is_mature?: boolean
  // Discover personalization (GET /v1/groups/discover)
  friends_in_group?: number
  reasons?: string[]
}

export interface GroupMember {
  group_id: string
  user_id: string
  role: 'owner' | 'admin' | 'moderator' | 'member'
  joined_at: string
  display_name?: string
  username?: string
  avatar_media_id?: string
  id?: string
  invited_by_user_id?: string
  status?: 'active' | 'left' | 'removed' | 'banned'
  removal_reason?: string
}

export interface GroupInvite {
  id: string
  group_id: string
  inviter_id: string
  invitee_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  updated_at: string
  expires_at?: string
}

export interface GroupInviteDetail extends GroupInvite {
  group_name: string
  group_avatar_media_id?: string
  group_member_count: number
}

export interface GroupPost {
  group_id: string
  post_id: string
  author_id: string
  created_at: string
}

export interface GroupPostV2 {
  id: string
  group_id: string
  channel_id?: string
  author_id: string
  content_type: string
  title?: string
  body?: string
  body_html?: string
  type_payload?: Record<string, unknown>
  attachments?: string[]
  needs_approval: boolean
  is_pinned: boolean
  is_announcement: boolean
  status: string
  spark_count: number
  comment_count: number
  echo_count: number
  view_count: number
  created_at: string
  updated_at: string
  // Enriched by frontend
  author_name?: string
  author_avatar_url?: string
  channel_name?: string
}

export interface GroupPostComment {
  id: string
  post_id: string
  user_id: string
  body: string
  parent_id?: string
  is_pinned: boolean
  spark_count: number
  created_at: string
  updated_at?: string
}

export interface GroupJoinRequest {
  id: string
  group_id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by_user_id?: string
  created_at: string
  reviewed_at?: string
}

export interface GroupRule {
  id: string
  group_id: string
  rule_order: number
  title: string
  description: string
  created_at: string
}

export type GroupTab = 'feed' | 'members' | 'about' | 'media' | 'rules' | 'events'
