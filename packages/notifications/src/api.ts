/**
 * Every URL the inbox knows. Four of them, and this is the whole list.
 *
 * ── The second package that reaches the network, and why ──────────────────
 * @momentum/chrome's api.ts states the rule: @momentum/* packages are
 * network-free, and the chrome is the one exception because its subject IS
 * the viewer. This package is the second, on the same argument. A bell is
 * drawn in the chrome header AND in Tube's own top bar, and the inbox behind
 * it is the viewer's, byte-identical in both. A prop-driven version would be
 * these four requests threaded through two shells the same way, which is the
 * duplication a package exists to remove.
 *
 * The exception stays narrow: `api` from @atpost/api-client and the four
 * routes below. NOT `useSession`. Who is signed in is the shell's question,
 * and it is passed in as a prop so that this package couples to no zone's
 * session plumbing.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `api` is a plain axios instance with a cookie/CSRF request interceptor and
 * a 401-refresh response interceptor; it does not touch the body. Every
 * gateway response is `{data, error, meta}` and ./inbox.ts reads it.
 *
 * ── Routes, read off notification-service's handler.go and not guessed ────
 *   GET   /v1/notifications              ?limit&cursor[&category] -> [row], meta.next_cursor
 *   GET   /v1/notifications/unread-count                          -> {count}
 *   POST  /v1/notifications/read         {bucket, ts}             -> {status:"ok"}
 *   PATCH /v1/notifications/read-all                              -> {status:"ok"}
 *
 * The gateway proxies the `/v1/notifications` prefix straight through
 * (api-gateway/cmd/server/main.go) and stamps X-User-Id from the cookie
 * session, so nothing here asserts an identity.
 *
 * ── Read takes ONE row, by clustering key ─────────────────────────────────
 * `POST /v1/notifications/read` binds `MarkReadRequest{Bucket int, TS string}`
 * with both required. There is no `ids` array on that route: a row is
 * identified by its Scylla clustering key `(bucket, ts)`, and the service
 * decrements the Redis unread counter by one per call. So this sends one
 * request per row, and the only caller is a click on one row.
 */

import api from "@atpost/api-client"
import { parsePage, parseUnreadCount, type InboxNotification, type InboxPage } from "./inbox"

export const INBOX_PATH = "/v1/notifications"

/**
 * Twenty is the handler's own default and the panel is a dropdown, not a
 * page: the first twenty are what fit before "Load more" is the honest
 * control.
 */
export const PAGE_SIZE = 20

export async function fetchInboxPage(cursor?: string | null): Promise<InboxPage> {
  const res = await api.get<unknown>(INBOX_PATH, {
    params: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  })
  return parsePage(res.data)
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await api.get<unknown>(`${INBOX_PATH}/unread-count`)
  return parseUnreadCount(res.data)
}

/**
 * Mark one row read.
 *
 * Sent through the fetch adapter with `keepalive`, and this is not a
 * preference: the row that triggers it is usually an `<a href>` to another
 * zone, so the click that fires this request ALSO starts a full page load,
 * and a browser aborts an ordinary XHR the moment the document unloads. A
 * keepalive fetch is the one request shape allowed to outlive its page.
 * `navigator.sendBeacon` cannot carry the X-CSRF-Token header the gateway
 * requires on a POST, so it is not an option; the axios interceptors still
 * run under the fetch adapter, so the header goes out the usual way.
 *
 * A row without its clustering key cannot be marked on the server. That is
 * resolved rather than thrown: the caller has already marked it read
 * locally, and the honest outcome is that it comes back unread next time,
 * which is what the server believes.
 */
export async function markNotificationRead(n: Pick<InboxNotification, "bucket" | "ts">): Promise<void> {
  if (n.bucket === null || !n.ts) return
  await api.post(
    `${INBOX_PATH}/read`,
    { bucket: n.bucket, ts: n.ts },
    { adapter: "fetch", fetchOptions: { keepalive: true } }
  )
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch(`${INBOX_PATH}/read-all`)
}
