import { cookies } from "next/headers"

/**
 * What a zone's server render knows about the session, before any JS runs.
 *
 * Reached as `@atpost/api-client/server`, from a SERVER component only — it
 * imports `next/headers`, which throws anywhere else. Its whole job is to let
 * a root layout seed `<SessionProvider initialSignedIn={…}>` so the first
 * paint is already the right shape and nobody sees a signed-out header flash
 * past on a signed-in account.
 *
 * ── Why `csrf_token` and not `access_token` ───────────────────────────────
 *
 * The server can read both; the browser can read only `csrf_token`. If this
 * read the HttpOnly access token, the server and the client would answer
 * differently the moment that token expired — the server would say "signed
 * out" while the browser, holding a perfectly good refresh token, is one
 * request away from being signed in. That is a hydration mismatch AND the
 * wrong answer. Both sides read the cookie both sides can read.
 *
 * The two are set and cleared in the same responses (`setAuthCookies` /
 * `clearAuthCookies` in auth-service), so presence is the same question either
 * way; only the expiries differ, and the longer-lived one is the better
 * predictor of "will be authenticated a moment from now".
 *
 * ── The cost, stated plainly ──────────────────────────────────────────────
 *
 * Calling this opts the route into dynamic rendering — a layout that reads a
 * cookie cannot be prerendered, by definition. For an authenticated product
 * whose every page already fetches its data per-request that is the right
 * trade, but it IS a trade, and a zone with genuinely public, cacheable pages
 * should call this lower down the tree rather than in its root layout.
 */
export async function readServerSession(): Promise<{ signedIn: boolean }> {
  const jar = await cookies()
  return { signedIn: !!jar.get("csrf_token")?.value }
}
