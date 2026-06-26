export interface UserProfile {
    id: string
    username: string
    display_name: string
    first_name?: string
    last_name?: string
    preferred_name?: string
    pronouns?: string
    bio: string
    avatar_media_id?: string
    cover_media_id?: string
    category?: string
    profession?: string
    website?: string
    location?: string
    gender?: string
    dob?: string
    badge_flags: number
    is_verified: boolean
    verification_level?: string
    status_text?: string
    status_emoji?: string
    status_expires_at?: string
    profile_theme_color?: string
    intro_media_url?: string
    intro_media_type?: string
    cta_label?: string
    cta_url?: string
    member_since_badge?: boolean
    timezone?: string
    follower_count: number
    following_count: number
    friend_count: number
    post_count: number
    created_at: string
    updated_at: string
}

export interface UserLink {
    platform: string
    url: string
    display_label?: string
    sort_order: number
}

export interface ProfileLink {
    id: string
    profile_id: string
    title: string
    url: string
    icon?: string
    category?: string
    sort_order: number
    click_count: number
    is_pinned: boolean
    visibility: string
    created_at: string
}

export interface Follow {
    id: string
    follower_id: string
    following_id: string
    status: string
    created_at: string
}

export interface GraphCounts {
    follower_count: number
    following_count: number
    friend_count: number
}

export interface ContentCounts {
    post: number
    reel: number
    video: number
    total: number
}

export interface ProfileData {
    profile: UserProfile
    links: UserLink[]
    stats: GraphCounts & ContentCounts
    relationship: Relationship | null
}

export interface Relationship {
    // Follow axis (asymmetric)
    following: boolean
    followed_by: boolean
    // Connection axis (mutual, requires acceptance) — canonical graph-service
    // fields. The backend renamed "friend" → "connection" (spec §3.2/§19);
    // `connection_status` is one of: none, pending_sent, pending_received, accepted.
    is_connection?: boolean
    connection_status?: "none" | "pending_sent" | "pending_received" | "accepted"
    // Circle axis (legacy/aggregated-profile shape, kept for UI compatibility)
    in_circle: boolean
    circle_request_sent: boolean
    circle_request_received: boolean
    // Block
    blocked: boolean
    blocked_by: boolean
    // Mute
    is_muted?: boolean
    // Derived permissions (gated by circle)
    can_dm: boolean
    can_see_online: boolean
    can_add_to_group: boolean
    // Mutual circle count
    mutual_circle_count: number
}

export interface UserProfileBatchResponse {
    profiles: UserProfile[]
}

export interface RelationshipBatchResponse {
    relationships: Record<string, Relationship>
}

/**
 * Backend content types for posts (matches post-service validation).
 * - post: text/photo/article posts
 * - poll: poll posts
 * - reel: short videos (<=90s)
 * - video: long-form videos (>90s)
 */
export const POST_CONTENT_TYPES = {
    POST: "post",
    POLL: "poll",
    REEL: "reel",
    VIDEO: "video",
} as const

export type PostContentType = (typeof POST_CONTENT_TYPES)[keyof typeof POST_CONTENT_TYPES]

/** UI-level content filter — values must match backend content_type column values. */
export type ContentType = "all" | "post" | "reel" | "video" | "photo"
export type AppPlatform = "postboek" | "posttube" | "postgram"
export type ProfileTab =
    | "posts"
    | "media"
    | "about"
    | "connections"
    | "videos"
    | "flicks"
    | "stashed"
    | "portfolio"
    | "qa"
    | "orders"
    | "bookings"

export interface PollOption {
    id: string
    label: string
    vote_count: number
    percentage: number
}

export interface PollData {
    question: string
    allows_multiple: boolean
    ends_at?: string | null
    options: PollOption[]
    total_votes: number
    viewer_votes?: string[]
    has_ended: boolean
}

export interface CommentItem {
    id: string
    post_id: string
    author_id: string
    body: string
    text?: string
    like_count: number
    dislike_count: number
    reply_count: number
    is_reply: boolean
    created_at: string
    updated_at: string
    reply?: CommentItem | null
}

export interface PostDetail {
    id: string
    author_id: string
    text: string
    visibility: string
    content_type: string
    is_pinned: boolean
    feeling?: string | null
    activity?: string | null
    activity_detail?: string | null
    no_comments?: boolean
    no_likes?: boolean
    created_at: string
    updated_at: string
    media?: { media_id: string; kind: string }[]
    cover_media_id?: string
    counts?: { likes: number; comments: number; shares?: number }
    /** Display view count from analytics-service (videos/reels). */
    view_count?: number
    viewer_reaction?: string | null
    location?: string | null
    location_name?: string | null
    location_lat?: number | null
    location_lng?: number | null
    hashtags?: string[]
    mentions?: string[]
    post_type?: string
    app_origin?: string
    is_bookmarked?: boolean
    poll?: PollData | null
    embed_ref?: Record<string, unknown> | null
    title?: string
    video_metadata?: {
        duration_seconds: number
        width?: number
        height?: number
        thumbnail_url?: string
        playback_url?: string
        upload_status: string
        final_category: string
    }
    // Rich text / styling metadata (stored as JSONB)
    rich_text?: {
        background?: string
        text_color?: string
    } | null
    // Repost metadata — set when this feed entry is a repost
    is_repost?: boolean
    reposted_by?: string
    feed_content_type?: string
    // Tier 3c — Membership gating. tier_required_id != null means
    // this post is members-only at that tier (or higher). When
    // body_redacted is true, the heavy fields (text, rich_text,
    // media, poll) are blanked by the backend; render a paywall
    // preview instead.
    tier_required_id?: string | null
    body_redacted?: boolean
}

// --- Stories ---

export interface Story {
    id: string
    author_id: string
    media_url: string
    media_type: "image" | "video"
    caption: string
    visibility: "public" | "followers" | "close_friends"
    view_count: number
    expires_at: string
    is_highlight: boolean
    highlight_group?: string | null
    created_at: string
}

// --- Multi-Reactions ---

export type ReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry"

export interface ReactionCounts {
    like: number
    love: number
    haha: number
    wow: number
    sad: number
    angry: number
    total: number
}

export interface ReactionToggleResult {
    reaction_type: string
    is_set: boolean
    counts: ReactionCounts
}

// --- Saved Items ---

export interface SavedItem {
    id: string
    user_id: string
    target_type: string
    target_id: string
    collection_name: string
    created_at: string
}

export interface SavedCollection {
    name: string
    count: number
}

// --- About ---

export type AboutSection = "basic_info" | "contact" | "location" | "life_entry" | "interests" | "services"
export type AboutVisibility = "public" | "followers" | "friends" | "only_me"

export interface AboutItem {
    user_id: string
    section: AboutSection
    item_id: string
    data: Record<string, unknown>
    visibility: AboutVisibility
    sort_order: number
    created_at: string
    updated_at: string
}

export interface WorkData {
    company: string
    title: string
    start_year?: number
    end_year?: number | null
    is_current?: boolean
}

export interface EducationData {
    school: string
    degree?: string
    start_year?: number
    end_year?: number
}

export interface HobbyData {
    name: string
    description?: string
}

export type HobbyInterestType = "hobby" | "interest"

export interface HobbyInterestData {
    name: string
    type: HobbyInterestType
    category?: string
    description?: string
}

export interface HobbyInterestCategory {
    id: string
    label: string
    color: string
}

export interface FamilyData {
    relation: string
    name: string
    user_id?: string
}

export interface ContactData {
    type: string
    value: string
}

export interface LifeEventData {
    title: string
    description?: string
    date?: string
}

// --- Channels ---

export interface ChannelLink {
    id: string
    channel_id: string
    title: string
    url: string
    icon?: string
    sort_order: number
}

export interface ChannelMilestone {
    id: string
    channel_id: string
    title: string
    description?: string
    reached_at: string
    subscriber_count?: number
}

export interface Channel {
    id: string
    owner_id: string
    handle: string
    name: string
    description?: string
    avatar_media_id?: string
    banner_media_id?: string
    category?: string
    subscriber_count: number
    is_verified: boolean
    is_default?: boolean
    created_at: string
    updated_at: string
}

export interface ChannelDetail extends Channel {
    links: ChannelLink[]
    milestones: ChannelMilestone[]
    language?: string
    location?: string
    watermark_media_id?: string
    theme_color?: string
    settings?: ChannelSettings
}

export interface ChannelSettings {
    comments_mode: "everyone" | "followers" | "none"
    allow_remix: boolean
    allow_download: boolean
    blocked_words: string[]
}

export interface HandleCheckResult {
    available: boolean
    suggestion?: string
    reason?: string
}

export interface HandleChangeRequest {
    new_handle: string
    confirmation_checked: boolean
    cooldown_notice_seen: boolean
}

// --- Business Pages ---

export interface BusinessPage {
    id: string
    user_id: string
    page_handle: string
    page_name: string
    category: string
    description: string
    address?: string
    lat?: number
    lng?: number
    business_hours?: unknown
    phone?: string
    whatsapp?: string
    business_email?: string
    services?: unknown
    price_range?: string
    booking_url?: string
    menu_urls?: unknown
    website?: string
    cover_media_id?: string
    avatar_media_id?: string
    is_verified: boolean
    avg_rating: number
    review_count: number
    follower_count: number
    is_following?: boolean
    faq?: unknown
    status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended' | 'disabled'
    seller_id?: string
    // Follow-Only Pages lifecycle fields.
    page_type?: string
    verification_status?: string
    rejection_reason?: string
    // Computed envelope fields (returned by GET /v1/pages/:slug).
    displayType?: string
    viewerRole?: 'visitor' | 'owner' | 'admin' | 'editor' | 'viewer'
    isOwner?: boolean
    bannerMessage?: string
    actions?: PageActions
    actionButtons?: PageActionButton[]
    created_at: string
    updated_at: string
}

export interface BusinessReview {
    id: string
    page_id: string
    reviewer_id: string
    rating: number
    review_text: string
    created_at: string
}

export interface PageActions {
    canFollow: boolean
    canUnfollow: boolean
    canManage: boolean
    canMessage: boolean
    canAddFriend: boolean // always false on a page
    canEdit: boolean
    canUploadDocument: boolean
    canSubmitForReview: boolean
}

export interface PageActionButton {
    id: string
    label: string
    primary?: boolean
    gated: boolean
}

export interface PageDocument {
    id: string
    page_id: string
    document_type: string
    document_url: string
    status: 'pending' | 'approved' | 'rejected'
    rejection_reason?: string
    created_at: string
}

// --- Reputation & Endorsements ---

export interface SkillEndorsementSummary {
    skill_tag: string
    count: number
    recent_endorsers: string[]
}

export interface UserReputation {
    user_id: string
    reputation: number
    endorsement_summary: SkillEndorsementSummary[]
}

export interface Endorsement {
    id: string
    endorser_id: string
    endorsee_id: string
    skill_tag: string
    message?: string
    endorser_display_name?: string
    endorser_avatar_media_id?: string
    created_at: string
}

// --- Status / Mood ---

export interface StatusMood {
    status_text: string
    status_emoji: string
    expires_at?: string | null
}

// --- Compatibility ---

export interface CompatibilityScore {
    user_id: string
    target_user_id: string
    compatibility_score: number
}

// --- Link Analytics ---

export interface LinkAnalytics {
    link_id: string
    platform: string
    total_clicks: number
    clicks_today: number
    clicks_this_week: number
    clicks_this_month: number
    top_referrers: { referrer: string; count: number }[]
}

// --- Module Profiles (Cross-Post v3) ---

export type ModuleName = "postbook" | "posttube" | "postgram"

export interface ModuleProfile {
    id: string
    user_id: string
    module: ModuleName
    use_global_identity: boolean
    name_override?: string | null
    avatar_override_url?: string | null
    banner_url?: string | null
    watermark_url?: string | null
    links: unknown[]
    defaults: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface UpsertModuleProfileParams {
    use_global_identity?: boolean
    name_override?: string | null
    avatar_override_url?: string | null
    banner_url?: string | null
    watermark_url?: string | null
    links?: unknown[]
    defaults?: Record<string, unknown>
}

export interface CrosspostLink {
    id: string
    source_module: string
    source_post_id: string
    target_module: string
    target_post_id: string
    created_at: string
    deleted_at?: string | null
}

export interface UploadDetail {
    id: string
    author_id: string
    text: string
    content_type: string
    title?: string
    cover_media_id?: string
    created_at: string
    updated_at: string
    media?: { media_id: string; kind: string }[]
    counts?: { likes: number; comments: number; shares?: number }
    video_metadata?: {
        duration_seconds: number
        width?: number
        height?: number
        thumbnail_url?: string
        playback_url?: string
        upload_status: string
        final_category: string
    }
}

export interface UploadCounts {
    videos: number
    flicks: number
    posts: number
}

// Badge flag constants (bitmask)
export const BADGE_VERIFIED = 1
export const BADGE_CREATOR = 2
export const BADGE_BUSINESS = 4

export function getBadges(flags: number): string[] {
    const badges: string[] = []
    if (flags & BADGE_VERIFIED) badges.push("verified")
    if (flags & BADGE_CREATOR) badges.push("creator")
    if (flags & BADGE_BUSINESS) badges.push("business")
    return badges
}

export interface ProfilePin {
    id: string
    user_id: string
    content_type: string
    content_id: string
    display_order: number
    created_at: string
}

export interface PortfolioItem {
    id: string
    user_id: string
    title: string
    description?: string
    url?: string
    media_url?: string
    item_type: string
    display_order: number
    created_at: string
    updated_at: string
}

export interface ProfileQRCode {
    id: string
    user_id: string
    qr_url: string
    profile_url: string
    scan_count: number
    created_at: string
}
