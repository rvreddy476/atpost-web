export type AppStatus = 'pending' | 'approved' | 'live' | 'suspended'
export type AppCategory = 'games' | 'booking' | 'learning' | 'shopping' | 'tools' | 'entertainment'

export interface MiniApp {
  id: string
  developer_id: string
  name: string
  description: string
  icon_url?: string
  manifest_url: string
  permissions: string[]
  status: AppStatus
  category?: AppCategory
  install_count: number
  created_at: string
}

export interface AppInstallation {
  app_id: string
  user_id: string
  granted_permissions: string[]
  installed_at: string
}
