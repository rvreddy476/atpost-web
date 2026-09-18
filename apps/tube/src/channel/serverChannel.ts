/**
 * One channel, fetched on the SERVER, for the sake of link previews.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS, AND WHY THE FILE IT SERVES USED TO SAY THE OPPOSITE
 *
 * `app/channel/[handle]/page.tsx` carried a note saying the channel's real
 * name "would be better and is deliberately not fetched: it would be a
 * blocking request on every render of this page to change a browser tab."
 * That reasoning was sound and its premise was too small. A browser tab is
 * not what `generateMetadata` is for. Everything that unfurls a link — a
 * message, a post, a chat preview, a search result — reads the SERVER's HTML,
 * and this page is `"use client"` from the first element down, so a shared
 * channel link previews as nothing at all. A request per render is a fair
 * price for a channel page that looks like something when somebody sends it
 * to a friend; a tab title was not.
 *
 * ── This does NOT go through the api-client ───────────────────────────────
 * `@atpost/api-client` is a browser axios instance: it points at the zone's
 * own same-origin proxy (`/tube/v1/*`), it carries `withCredentials`, and it
 * echoes a CSRF cookie. None of that exists here — a server render has no
 * origin to be same to, and asking this app's own proxy from inside this app
 * would be a request that leaves the process, re-enters it and then makes the
 * upstream call anyway. So this reads `API_GATEWAY_URL` directly, which is
 * the same variable `@atpost/api-client/proxy` forwards to, with the same
 * `http://localhost:8080` default.
 *
 * `@atpost/api-client/server` is the other thing that sounds like this and is
 * not: it reads the session cookie so a layout can seed `SessionProvider`. It
 * makes no requests.
 *
 * ── No cookie is forwarded, and that is deliberate ────────────────────────
 * `GET /v1/channels/{ref}` is PUBLIC — verified against the running gateway
 * on 2026-09-09 with no cookie jar at all. Metadata is the one response most
 * likely to be cached and re-served (by Next, by a CDN, by whatever crawler
 * asked), so it must be the SAME for everybody. Sending the viewer's session
 * would let a per-viewer field like `is_subscribed` land in a shared cache,
 * which is how one person's state ends up in another person's page.
 *
 * ── It can never break the page ───────────────────────────────────────────
 * Every failure — a refused connection, a timeout, a 500, a body that is not
 * the shape expected — returns null, and the caller falls back to the
 * zone-level defaults. A channel page that 500s because its Open Graph
 * description could not be read would be a worse page than one with a generic
 * description, by a wide margin. Only a 404 is a fact rather than a failure,
 * and the caller uses it: an unknown handle gets a real not-found page.
 */

import type { TubeChannel } from "@/tube/channels"

/** Where the proxy forwards to, and where this reads from. Same default. */
const API_GATEWAY = process.env.API_GATEWAY_URL || "http://localhost:8080"

/**
 * How long a link preview may hold up a page render.
 *
 * Deliberately far shorter than the proxy's 30s. This request is decoration
 * on a page that renders without it, so the ceiling is "before anybody
 * notices" rather than "before the upstream gives up": a dead gateway must
 * cost this route two seconds and a generic title, not thirty seconds of a
 * white screen.
 */
const METADATA_TIMEOUT_MS = 2_000

/**
 * How long Next may re-serve a channel's metadata.
 *
 * Five minutes. A channel's name, handle and about change rarely and matter
 * little when they are a few minutes stale, while a crawler storm on a
 * popular channel otherwise becomes one gateway request per hit.
 */
const METADATA_REVALIDATE_S = 300

/** What a server-side channel read can conclude. */
export type ServerChannelResult =
  /** The channel exists and here it is. */
  | { status: "found"; channel: TubeChannel }
  /** The gateway said 404. This handle belongs to nobody. */
  | { status: "missing" }
  /** The request did not come back, or came back unreadable. NOT "missing". */
  | { status: "error" }

/**
 * `GET /v1/channels/{ref}` from the server, for metadata only.
 *
 * `ref` is a bare handle or a user id — the route takes either — and it is
 * expected to have been normalised by `bareHandle` already, because that is
 * what the page does before it calls this.
 *
 * The three-way result is the whole point of the return type. Collapsing
 * "missing" and "error" would show a not-found page for a channel that exists
 * whenever the gateway hiccups, which is the single worst answer available:
 * it tells a creator their channel is gone.
 */
export async function fetchChannelOnServer(ref: string): Promise<ServerChannelResult> {
  const key = ref.trim()
  if (!key) return { status: "missing" }

  try {
    const res = await fetch(`${API_GATEWAY}/v1/channels/${encodeURIComponent(key)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      next: { revalidate: METADATA_REVALIDATE_S },
    })
    if (res.status === 404) return { status: "missing" }
    if (!res.ok) return { status: "error" }

    // The gateway's envelope: {data, error, meta}. Never unwrapped for you.
    const body = (await res.json()) as { data?: TubeChannel } | null
    const channel = body?.data
    // A 200 whose body is not a channel is a broken response, not an absent
    // channel — the same distinction the 404 branch above is protecting.
    if (!channel || typeof channel.user_id !== "string" || !channel.user_id) {
      return { status: "error" }
    }
    return { status: "found", channel }
  } catch {
    // AbortSignal.timeout, a refused connection, malformed JSON. All the same
    // thing from here: we could not read it, and the page still renders.
    return { status: "error" }
  }
}
