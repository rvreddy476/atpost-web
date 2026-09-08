/**
 * Every URL the chrome around the feed knows.
 *
 * The sibling of `src/feed/api.ts`, and kept separate for the same reason that
 * file exists at all: the packages under packages/ are network-free so reels
 * and tube can reuse them, which only means anything if the wiring they are
 * free OF lives somewhere findable. The feed's endpoints are the feed's; the
 * rails' endpoints are these. Two short files beat one long one whose name is
 * a lie about half its contents.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * Same as the feed's: `@atpost/api-client` is a plain axios instance and does
 * not touch the body, so every gateway response is `{data, error, meta}` and a
 * caller reads `res.data.data`.
 *
 * ── Routes verified against the running gateway, not guessed ──────────────
 *   GET  /v1/profiles/me            -> the viewer's profile AND their counts
 *   GET  /v1/suggestions            ?type=friend|follow&limit&surface
 *   POST /v1/graph/connection-request  {user_id, source}  -> {status}
 *
 * Three things about those are easy to get wrong and were checked rather than
 * assumed:
 *
 *   · `/v1/auth/me` is NOT the profile. It answers the identity — id, email,
 *     roles, account status — and carries no display name, no avatar and no
 *     counts. `/v1/profiles/me` is the profile-service row and is the only
 *     one of the two with a name in it. The rail needs both, and useSession()
 *     already owns the first.
 *
 *   · The suggestion route is a FRIEND route by default. `type` accepts only
 *     "friend" and "follow" (anything else is a 400 with a bare
 *     `{"error": …}`, not the house envelope), and the mixed legacy endpoint
 *     tags `friend` items `entityType: "user"`.
 *
 *   · The action on a person is therefore a FRIEND REQUEST, not a follow.
 *     `POST /v1/graph/follow` answers 400 WRONG_ENTITY_TYPE — "follow is only
 *     valid against a page" — so wiring the obvious-looking route to a list of
 *     people would have produced a button that fails every time it is pressed.
 *     `POST /v1/graph/connection-request` is the one that takes a user.
 */

import api from "@atpost/api-client"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/* ── The viewer ───────────────────────────────────────────────────────────── */

/**
 * What `/v1/profiles/me` sends. A subset of `@atpost/types/profile`'s
 * `UserProfile`, narrowed to what the rail actually reads.
 *
 * It is a subset ON PURPOSE rather than the full type: the response has no
 * `username` field — usernames live in app.users behind user-service, not in
 * profile-service — and typing this as `UserProfile` would promise a handle
 * this endpoint cannot deliver, which is exactly the kind of thing that ships
 * as an "@undefined" under someone's name.
 */
export interface ViewerProfile {
  user_id: string
  display_name: string
  bio: string
  avatar_media_id?: string
  is_verified: boolean
  follower_count: number
  following_count: number
  friend_count: number
  post_count: number
}

export async function fetchViewerProfile(): Promise<ViewerProfile | null> {
  const res = await api.get<Envelope<ViewerProfile>>("/v1/profiles/me")
  const body = res.data?.data
  return body && typeof body.user_id === "string" ? body : null
}

/* ── Suggestions ──────────────────────────────────────────────────────────── */

/**
 * One row of `/v1/suggestions`.
 *
 * `candidate_user_id` is the id whatever this is, even when `entityType` says
 * "page" — the field is named for the friend case and was never renamed. It is
 * modelled as it is sent rather than as it should have been called, because a
 * client that renames a wire field is a client whose bugs cannot be found by
 * grepping for the field.
 */
export interface Suggestion {
  entityType: "user" | "page" | "community" | string
  candidate_user_id: string
  display_name: string
  avatar_media_id?: string
  /** Why the ranker chose it, already written as a sentence for display. */
  explain_text?: string
  reason_codes?: string[]
  mutual_friend_count?: number
}

/**
 * People the ranker thinks the viewer knows.
 *
 * `type=friend`, which is the default and the only one with candidates behind
 * it today: `/v1/suggestions/hubs` returns a deliberately empty list until a
 * page-candidate pipeline ships (the handler says so in as many words), and
 * `type=follow` on the mixed route returns the SAME user rows tagged as
 * "page" — a caveat its own handler records. Asking for follow suggestions
 * here would render people under a heading that says pages.
 */
export async function fetchSuggestions(limit = 5): Promise<Suggestion[]> {
  const res = await api.get<Envelope<{ items?: Suggestion[] }>>("/v1/suggestions", {
    params: { type: "friend", limit, surface: "home" },
  })
  const items = res.data?.data?.items
  return Array.isArray(items) ? items : []
}

/** What the graph says happened. */
export type ConnectionStatus = "request_sent" | "unknown"

/**
 * Ask to connect.
 *
 * `source` is free text the service stores for attribution; "web_suggestions"
 * says where the request came from, which is the only way anyone will ever be
 * able to tell whether this rail is worth its space.
 *
 * The service answers 200 `{"status":"request_sent"}`, 429 RATE_LIMITED when
 * someone works down the list too fast, and 400 WRONG_ENTITY_TYPE if the row
 * was not a user. None of those are caught here — the caller shows the
 * failure, because a request that silently did nothing is worse than one that
 * says it failed.
 */
export async function sendConnectionRequest(userId: string): Promise<ConnectionStatus> {
  const res = await api.post<Envelope<{ status?: string }>>("/v1/graph/connection-request", {
    user_id: userId,
    source: "web_suggestions",
  })
  return res.data?.data?.status === "request_sent" ? "request_sent" : "unknown"
}
