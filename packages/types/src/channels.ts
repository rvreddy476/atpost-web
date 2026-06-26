export interface BroadcastChannel {
  id: string
  owner_id: string
  handle: string
  name: string
  description: string
  avatar_media_id?: string
  banner_media_id?: string
  channel_type: 'public' | 'private' | 'creator' | 'brand' | 'education' | 'official' | 'topic' | 'paid'
  category: string
  language: string
  comment_mode: 'enabled' | 'moderated' | 'subscribers_only' | 'disabled'
  reaction_mode: 'enabled' | 'disabled'
  forward_allowed: boolean
  paid_access: boolean
  subscription_price_cents: number
  subscriber_count: number
  update_count: number
  is_verified: boolean
  status: string
  viewer_role?: string
  created_at: string
  updated_at: string
}

export interface ChannelMember {
  channel_id: string
  user_id: string
  role: string
  notify_on: string
  subscribed_at: string
}

export interface ChannelUpdate {
  id: string
  channel_id: string
  author_id: string
  update_type: 'announcement' | 'image' | 'video' | 'audio' | 'poll' | 'event' | 'commerce' | 'alert' | 'digest'
  title?: string
  body: string
  media_ids: string[]
  metadata?: Record<string, unknown>
  is_pinned: boolean
  scheduled_at?: string
  published_at?: string
  status: string
  view_count: number
  reaction_count: number
  comment_count: number
  forward_count: number
  created_at: string
}
