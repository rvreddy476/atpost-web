export interface DigitalWellbeing {
  user_id: string
  daily_limit_mins: number
  focus_mode_enabled: boolean
  focus_mode_start?: string
  focus_mode_end?: string
  bedtime_enabled: boolean
  bedtime_start?: string
  bedtime_end?: string
  hide_like_counts: boolean
  hide_view_counts: boolean
  break_reminders_enabled: boolean
  break_interval_mins: number
  created_at: string
  updated_at: string
}

export interface ScreenTimeLog {
  date: string
  minutes_active: number
}

export interface ScreenTimeResponse {
  logs: ScreenTimeLog[]
  total_minutes: number
}
