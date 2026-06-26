// Shape of the search-service multi-entity ranked search API.
//
// GET /v1/search?q=...&types=posts,users,hashtags,products,communities,channels
// returns one bucket per requested entity. Each bucket has its own
// `next_cursor` (opaque, pass back on the corresponding cursor.<type>
// query param). The top-level `query_id` is the analytics handle —
// pass it to POST /v1/search/click on every result tap.
//
// Legacy single-type calls (`?type=users` etc.) still return the old
// flat `{items:[...]}` shape and are deliberately not modeled here.

export type EntityType =
    | "posts"
    | "users"
    | "hashtags"
    | "products"
    | "communities"
    | "channels"

export const ALL_ENTITY_TYPES: EntityType[] = [
    "posts",
    "users",
    "hashtags",
    "products",
    "communities",
    "channels",
]

// ─── Per-entity hit shapes (mirror search-service OpenSearch docs) ──────────

export interface PostHit {
    post_id: string
    author_id: string
    author_username?: string
    text: string
    hashtags?: string[]
    visibility?: string
    like_count: number
    comment_count: number
    share_count?: number
    bookmark_count?: number
    post_type?: string
    app_origin?: string
    engagement_score: number
    created_at: string
}

export interface UserHit {
    user_id: string
    username: string
    display_name: string
    bio?: string
    avatar_media_id?: string
    is_verified: boolean
    follower_count?: number
    post_count?: number
    engagement_score: number
}

export interface HashtagHit {
    hashtag: string
    hashtag_search?: string
    use_count: number
    engagement_score: number
    created_at?: string
}

export interface ProductHit {
    product_id: string
    seller_id: string
    title: string
    description?: string
    category?: string
    price?: number
    city?: string
    status?: string
    view_count?: number
    order_count?: number
    engagement_score: number
    created_at?: string
}

export interface CommunityHit {
    community_id: string
    owner_id: string
    handle: string
    name: string
    description?: string
    community_type: string
    category?: string
    topic_tags?: string[]
    member_count: number
    is_verified: boolean
    engagement_score: number
    created_at?: string
}

export interface ChannelHit {
    channel_id: string
    owner_id: string
    handle: string
    name: string
    description?: string
    channel_type: string
    category?: string
    subscriber_count: number
    is_verified: boolean
    engagement_score: number
    created_at?: string
}

// Map of entity → hit type, used to keep generic code typed.
export interface EntityHitMap {
    posts: PostHit
    users: UserHit
    hashtags: HashtagHit
    products: ProductHit
    communities: CommunityHit
    channels: ChannelHit
}

// One per-entity bucket.
export interface EntityBucket<T> {
    items: T[]
    next_cursor: string | null
}

// Full multi-entity response (the `data` payload after the API envelope
// is unwrapped). `results` matches the search-service handler exactly;
// individual buckets are optional because the caller can request a
// subset via `?types=`.
export interface MultiEntitySearchData {
    query_id?: string
    results: Partial<{
        posts: EntityBucket<PostHit>
        users: EntityBucket<UserHit>
        hashtags: EntityBucket<HashtagHit>
        products: EntityBucket<ProductHit>
        communities: EntityBucket<CommunityHit>
        channels: EntityBucket<ChannelHit>
    }>
}

// ─── Autocomplete ─────────────────────────────────────────────────────────

// AutocompleteItem matches search-service's AutocompleteResult. `kind`
// is the discriminator; only the fields relevant to that kind are set.
// Legacy users-only callers can still treat each entry as
// `{user_id, username, display_name}`.
export interface AutocompleteItem {
    kind: "user" | "hashtag" | "community"
    // user
    user_id?: string
    username?: string
    display_name?: string
    // hashtag
    hashtag?: string
    // community
    community_id?: string
    handle?: string
    name?: string
}
