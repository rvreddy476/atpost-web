// Video Analytics Event Types

export type Surface = 'reels_feed' | 'home_feed' | 'search_results' | 'profile' | 'share_link' | 'recommended_next'
export type ContentType = 'reel' | 'long_video'
export type EndReason = 'swipe_next' | 'back' | 'ended' | 'background' | 'error'
export type NetworkType = 'wifi' | '4g' | '5g' | 'ethernet' | 'unknown'

export interface VideoEventCommon {
  event_id: string
  event_name: string
  timestamp_ms: number
  content_id: string
  creator_id: string
  viewer_user_id: string
  session_id: string
  surface: Surface
  position: number
  country: string
  language: string
  device_id_hash: string
  app_version: string
  os: string
  network_type: NetworkType
  is_autoplay: boolean
}

export interface ImpressionEvent extends VideoEventCommon {
  event_name: 'impression'
  visible_ms: number
}

export interface PlayStartEvent extends VideoEventCommon {
  event_name: 'play_start'
  content_duration_ms: number
  content_type: ContentType
  start_method: 'autoplay' | 'tap' | 'resume'
  is_muted: boolean
  time_to_first_frame_ms: number
  initial_buffer_ms: number
}

export interface WatchHeartbeatEvent extends VideoEventCommon {
  event_name: 'watch_heartbeat'
  watched_ms_increment: number
  watched_ms_total: number
  playhead_position_ms: number
  buffering_ms_increment: number
  seek_count_increment: number
  playback_speed: number
}

export interface MilestoneEvent extends VideoEventCommon {
  event_name: 'milestone'
  milestone_type: string
  watched_ms: number
}

export interface PlayEndEvent extends VideoEventCommon {
  event_name: 'play_end'
  end_reason: EndReason
  watched_ms_total: number
  max_continuous_watch_ms: number
  content_duration_ms: number
  content_type: ContentType
  percent_viewed: number
  loop_count: number
}

// Dashboard types
export interface ViewCounts {
  display: number
  views_1s: number
  views_3s: number
  views_10s: number
  views_30s: number
  views_60s: number
}

export interface ContentMetrics {
  content_id: string
  creator_id: string
  content_type: ContentType
  impressions: number
  plays: number
  views_display: number
  unique_viewers: number
  watch_time_total_ms: number
  avg_watch_time_ms: number
  avg_percent_viewed: number
  completion_rate: number
  rewatch_rate: number
  skip_rate: number
  early_swipe_rate: number
  likes: number
  comments: number
  shares: number
  saves: number
  follows_from_content: number
  not_interested: number
  reports: number
  blocks: number
  view_score_total: number
  vqs_avg: number
  content_quality_score: number
}

export interface CreatorOverview {
  total_views: number
  total_watch_time_ms: number
  avg_cqs: number
  total_likes: number
  total_shares: number
  trend: DailyDataPoint[]
  top_content: ContentSummary[]
}

export interface ContentSummary {
  content_id: string
  content_type: ContentType
  views_display: number
  watch_time_total_ms: number
  avg_percent_viewed: number
  content_quality_score: number
  likes: number
  shares: number
  created_at: string
}

export interface DailyDataPoint {
  date: string
  views: number
  watch_time_ms: number
  cqs: number
}

export interface HourlyDataPoint {
  hour: string
  views: number
  plays: number
  watch_time_ms: number
}

export interface RetentionPoint {
  second: number
  viewers_remaining_pct: number
}
