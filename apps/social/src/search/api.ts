/**
 * The one URL this feature knows.
 *
 * Third sibling of `src/feed/api.ts` and `@momentum/chrome`'s own api.ts, and separate for
 * the reason both of those give: the packages under packages/ are network-free
 * so reels, tube and a profile grid can reuse them, which only means anything
 * if the wiring they are free OF lives somewhere findable. Search's endpoint is
 * search's.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance with a cookie/CSRF request
 * interceptor and a 401-refresh response interceptor; it does not touch the
 * body. Every gateway response is `{data, error, meta}`, so a caller reads
 * `res.data.data`.
 *
 * ── The route, verified against the running gateway rather than guessed ───
 *   GET /v1/search ?q &types &limit &cursor.<type>
 *
 * Two things about it were checked because getting either wrong is silent:
 *
 *   · `types` (plural) selects the grouped, pageable response. `type`
 *     (singular) is a DIFFERENT branch of the same handler with a different
 *     body — flat, no hashtags, no cursors. A typo between them does not
 *     error; it returns a shape whose fields are simply all undefined.
 *
 *   · The endpoint does NOT require a session. Verified: the same query
 *     returns the same rows with no cookie jar at all. A signed-out visitor
 *     therefore gets real results, which is why this page renders for one.
 *     (What the viewer's session buys is the follow-graph affinity boost and
 *     the block filter, not access.)
 */

import api from "@atpost/api-client"
import {
  SEARCH_KINDS,
  type SearchKind,
  type SearchResponse,
} from "./contract"

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

/**
 * How many rows to ask for.
 *
 * The "all" view is a PREVIEW — enough of each kind to answer "what sort of
 * thing did I find?" without any one kind burying the others — and a single
 * kind is a list you read. The service clamps to 100 either way.
 */
export const PREVIEW_LIMIT = 5
export const LIST_LIMIT = 20

/**
 * A search failure, classified.
 *
 * The page has to tell "nothing matched" from "the search broke", and those
 * are the same HTTP call — so the distinction is drawn here, once, rather than
 * at three call sites. A 200 with empty buckets is NOT an error and never
 * reaches this type.
 */
export class SearchFailure extends Error {
  readonly status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = "SearchFailure"
    this.status = status
  }
}

/**
 * A sentence for the person reading, not for the log.
 *
 * The gateway's own `error.message` is used when there is one, because on this
 * endpoint it is written for a human ("query too long: maximum 500
 * characters") and is more specific than anything composable here. Everything
 * else is bucketed by what the reader can DO about it, which is the only
 * distinction that earns different wording.
 */
function describe(status: number | undefined, serverMessage: string | undefined): string {
  if (serverMessage) return serverMessage
  if (status === undefined) return "We could not reach the server. Check your connection and try again."
  if (status === 429) return "Too many searches too quickly. Wait a moment and try again."
  if (status >= 500) return "Search is having trouble right now. Trying again usually works."
  return "That search could not be run."
}

export interface SearchRequest {
  query: string
  /** Which buckets to ask for. Order here does not affect the response. */
  kinds: readonly SearchKind[]
  limit: number
  /** Per-kind offsets from a previous `next_cursor`. Absent = first page. */
  cursors?: Partial<Record<SearchKind, string | null>>
  signal?: AbortSignal
}

/**
 * Run one search.
 *
 * Throws `SearchFailure` for anything that is not a usable answer, and returns
 * the (possibly empty) buckets otherwise. An aborted request rethrows the
 * abort untouched so the caller can tell "superseded" from "broken" — a page
 * that renders an error because the person typed a second query would be
 * worse than one that renders nothing.
 */
export async function runSearch({
  query,
  kinds,
  limit,
  cursors,
  signal,
}: SearchRequest): Promise<SearchResponse> {
  const params: Record<string, string | number> = {
    q: query,
    // Ordered by SEARCH_KINDS rather than by the caller's array so the request
    // URL for a given search is stable — which is what makes it cacheable by
    // anything in front of it, and readable in a network log.
    types: SEARCH_KINDS.filter((kind) => kinds.includes(kind)).join(","),
    limit,
  }
  for (const kind of SEARCH_KINDS) {
    const cursor = cursors?.[kind]
    if (cursor) params[`cursor.${kind}`] = cursor
  }

  try {
    const res = await api.get<Envelope<SearchResponse>>("/v1/search", { params, signal })
    const body = res.data?.data
    // A 200 whose envelope carries no `data` is not an empty result set — it
    // is a response this client cannot read, and rendering "no results" for it
    // would blame the query for a broken server.
    if (!body || typeof body !== "object") {
      throw new SearchFailure("Search answered in a shape this page does not understand.")
    }
    return body
  } catch (err: unknown) {
    if (err instanceof SearchFailure) throw err
    const e = err as {
      code?: string
      name?: string
      response?: { status?: number; data?: { error?: { message?: string } } }
    }
    // Axios reports an aborted request as ERR_CANCELED; let it through so the
    // caller can ignore it rather than paint a failure over a newer query.
    if (e.code === "ERR_CANCELED" || e.name === "CanceledError" || e.name === "AbortError") throw err
    const status = e.response?.status
    throw new SearchFailure(describe(status, e.response?.data?.error?.message), status)
  }
}
