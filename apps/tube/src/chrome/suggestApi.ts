/**
 * The two calls behind the search box's dropdown.
 *
 * Kept beside the box that makes them, for the reason ../history/api.ts gives
 * about itself: each has exactly one call site, so a correction to the
 * contract is one line in one file. The SHAPES they answer are parsed by
 * ./suggest.ts, which is pure and tested; this is the transport.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ OFF search-service, 2026-09-18 (internal/http/handler.go)
 *
 *   GET    /v1/search/autocomplete?q=&limit=&kinds=   PUBLIC
 *          → {data:{results:[{kind,user_id,username,display_name,hashtag,
 *                             community_id,handle,name}]}}
 *          429 RATE_LIMITED with Retry-After: 60, at 60 req/min per caller
 *   GET    /v1/search/history?limit=                  SESSION
 *          → {data:{items:[{id,user_id,query,searched_at}]}}   limit clamped to 20
 *   DELETE /v1/search/history                         SESSION
 *          → {data:{status:"cleared"}}   the WHOLE list; there is no per-row route
 *
 * ── Every failure here is silence, never an error state ───────────────────
 * All three swallow. A suggestion list is an ACCELERATOR: the box works
 * perfectly without it, Enter still searches, and a red message under a search
 * field about a request the person never asked for is worse than no
 * suggestions at all. The 429 in particular is expected traffic rather than a
 * fault — the endpoint fails closed on a Redis blip by design, because it is
 * the cheapest user-enumeration vector on the platform and the service would
 * rather drop a typeahead than leave that door open.
 */

import api from "@atpost/api-client"
import { parseRecent, parseSuggestions, type TubeSuggestion } from "./suggest"

/**
 * Eight, under the server's own ceiling of 20.
 *
 * The listbox shows eight (`visibleSuggestions`' default), so asking for more
 * would be fetching rows to throw away — and this endpoint is rate limited
 * per caller, which makes a wasted row a real cost rather than a tidy one.
 */
const SUGGEST_LIMIT = 8

/**
 * Suggestions for a prefix. PUBLIC, so this works signed out.
 *
 * `kinds` is left at the server's default ("all"), which mixes users, hashtags
 * and communities. The alternative, `kinds=users`, is what the @mention picker
 * sends and it is wrong here: somebody typing into a video app's search box is
 * looking for a SUBJECT at least as often as a person, and a tag is the only
 * thing in this index that is one.
 *
 * `signal` is an AbortSignal, and it is the whole reason this takes one: a
 * person typing "cats" fires a request at "ca" and another at "cat", and
 * without cancellation the first can land last and put stale rows under a
 * newer query. The box aborts the previous request on every keystroke.
 */
export async function fetchSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<TubeSuggestion[]> {
  try {
    const res = await api.get<unknown>("/v1/search/autocomplete", {
      params: { q: query, limit: SUGGEST_LIMIT },
      signal,
    })
    return parseSuggestions(res.data)
  } catch {
    // Including the 429, and including an abort. See the header: no
    // suggestions is the correct rendering of every one of these.
    return []
  }
}

/**
 * The viewer's recent searches, newest first. 401 without a session.
 *
 * Never asked for while signed out — the box checks — because each 401 drags
 * a failed token refresh behind it, which is the cost ../tube/useTubeFeed.ts
 * records paying six times in nine seconds before it was fixed there.
 */
export async function fetchRecentSearches(): Promise<TubeSuggestion[]> {
  try {
    const res = await api.get<unknown>("/v1/search/history", { params: { limit: 20 } })
    return parseRecent(res.data)
  } catch {
    return []
  }
}

/**
 * Clear the whole recent list.
 *
 * ── There is no per-row delete, and that is why this is "Clear" ───────────
 * `DELETE /v1/search/history` takes no id and removes every row.
 * `DELETE /v1/search/saved/{id}` exists and is a DIFFERENT feature — saved
 * searches, which this app does not have — so wiring it here would delete
 * something the person never created.
 *
 * A cross on each row would therefore have to call this, wiping nineteen other
 * searches to remove one, which is the worst possible way to find that out.
 * So the control says Clear, sits once under the list, and does exactly what
 * it says. A per-row delete is in the handover as a route the backend would
 * need to add.
 *
 * Returns whether it worked, because this one is a deliberate act with a
 * visible result: silence would leave the list on screen with no explanation.
 */
export async function clearRecentSearches(): Promise<boolean> {
  try {
    await api.delete("/v1/search/history")
    return true
  } catch {
    return false
  }
}
