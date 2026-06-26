/**
 * Chat / conversation domain types.
 *
 * Conversation message shapes live in `src/services/messageService.ts`
 * (kept there to colocate with the WS framing). This file is for
 * higher-level conversation metadata returned by REST endpoints — e.g.
 * the per-conversation presence rollup from the M1 backend.
 */

/**
 * Response shape for `GET /v1/conversations/:id/presence`.
 *
 * - `active_count` is always set.
 * - `active_users` and `typing_users` are populated for direct chats and
 *   for groups with ≤100 members. For larger groups the server omits
 *   them (privacy + payload size) and sets `is_big_group = true`; the UI
 *   should fall back to rendering just the count in that case.
 */
export interface ConversationPresence {
    active_count: number
    active_users: string[]
    typing_users: string[]
    is_big_group: boolean
}
