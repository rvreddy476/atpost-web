/**
 * The inbox, as pure functions of what the wire sends.
 *
 * Nothing in this file touches the network or React. That is what lets every
 * rule about a notification row be tested as a table rather than through a
 * rendered bell, and it is why the bell itself is thin: describing a row,
 * deciding whether it is a link, ageing a timestamp and marking a set of rows
 * read are all decisions about DATA, and they are made here, once.
 *
 * ── What a row actually carries, read off the service and not assumed ─────
 * notification-service answers `GET /v1/notifications` with its Scylla row
 * (internal/store/scylla/notifications.go), hydrated with the actor at read
 * time (internal/service/actor_hydration.go):
 *
 *     notification_id, type, actor_user_id, entity_type, entity_id,
 *     deep_link?, is_read, created_at, bucket, ts,
 *     actor?: { id, username, display_name }
 *
 * Three things about that shape decide the design below.
 *
 *   · There is NO title and NO body on the row. The service's templates
 *     (internal/service/templates.go) say "{channel} uploaded: {title}", but
 *     the title lives on the push payload and the job, never in the inbox
 *     row. So `describe` works from the type and the actor alone, and only
 *     APPENDS a title when a row happens to carry one. A future column will
 *     improve the line without anyone editing this file's fallbacks.
 *
 *   · `actor` is nil when hydration was skipped or failed; the service's own
 *     comment says clients must render a fallback. "Someone" is that fallback.
 *
 *   · The row is marked read by its CLUSTERING KEY, `(bucket, ts)`, not by
 *     `notification_id`: `POST /v1/notifications/read` binds
 *     `{bucket, ts}` with both required (internal/http/handler.go,
 *     MarkReadRequest). So the parsed row keeps both alongside its id, and
 *     `applyRead` keys on the id because that is what a LIST is keyed by.
 */

export interface NotificationActor {
  id: string
  username: string
  displayName: string
}

export interface InboxNotification {
  /** `notification_id`, or `bucket:ts` when the id is absent. Never empty. */
  id: string
  /** The Scylla clustering key, which is what the read endpoint wants. */
  bucket: number | null
  ts: string | null
  type: string
  actorId: string | null
  actor: NotificationActor | null
  entityType: string | null
  entityId: string | null
  /** An absolute site path when present. Vetted by `hrefOf`, not here. */
  deepLink: string | null
  /** Not on the row today. Kept so a future column renders without a change here. */
  title: string | null
  read: boolean
  /** ISO-8601, or null when the row had none. */
  createdAt: string | null
}

export interface InboxPage {
  rows: InboxNotification[]
  /** `bucket:timeuuid`, passed back verbatim as `?cursor=`. Opaque here. */
  nextCursor: string | null
}

type Row = Record<string, unknown>

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

function parseActor(v: unknown, actorId: string | null): NotificationActor | null {
  if (!v || typeof v !== "object") return null
  const a = v as Row
  const id = str(a.id) ?? actorId
  const username = str(a.username) ?? ""
  const displayName = str(a.display_name) ?? str(a.displayName) ?? ""
  // A hydrated actor with neither a name nor a handle is no better than an
  // absent one, and rendering it would put an empty string where a name goes.
  if (!id || (!username && !displayName)) return null
  return { id, username, displayName }
}

/**
 * One wire row as one inbox row. Tolerant of every missing field but one: a
 * row with neither an id nor a `(bucket, ts)` cannot be listed (nothing to key
 * it by) or marked read (nothing to send), so it is dropped, and `parsePage`
 * skips it rather than the page failing.
 *
 * `read` accepts the service's `is_read`, and also `read` and `read_at`, so a
 * rename on the server turns into nothing rather than into every row unread.
 */
export function parseNotification(row: unknown): InboxNotification | null {
  if (!row || typeof row !== "object") return null
  const r = row as Row

  const bucket = num(r.bucket)
  const ts = str(r.ts)
  const id = str(r.notification_id) ?? str(r.id) ?? (bucket !== null && ts ? `${bucket}:${ts}` : null)
  if (!id) return null

  const actorId = str(r.actor_user_id) ?? str(r.actor_id)
  const read =
    typeof r.is_read === "boolean"
      ? r.is_read
      : typeof r.read === "boolean"
        ? r.read
        : r.read_at != null

  return {
    id,
    bucket,
    ts,
    type: str(r.type) ?? str(r.event_type) ?? "",
    actorId,
    actor: parseActor(r.actor, actorId),
    entityType: str(r.entity_type),
    entityId: str(r.entity_id),
    deepLink: str(r.deep_link),
    title: str(r.title),
    read,
    createdAt: str(r.created_at),
  }
}

/**
 * The `{data, error, meta}` envelope as a page. `meta` is omitted entirely on
 * the last page (the handler only attaches it when there is a next cursor),
 * so its absence is the normal end and not a defect to work around.
 */
export function parsePage(body: unknown): InboxPage {
  const env = body && typeof body === "object" ? (body as Row) : {}
  const data = Array.isArray(env.data) ? env.data : []
  const meta = env.meta && typeof env.meta === "object" ? (env.meta as Row) : {}
  const rows: InboxNotification[] = []
  for (const raw of data) {
    const n = parseNotification(raw)
    if (n) rows.push(n)
  }
  return { rows, nextCursor: str(meta.next_cursor) }
}

/** `GET /v1/notifications/unread-count` answers `{data: {count}}`. */
export function parseUnreadCount(body: unknown): number {
  const env = body && typeof body === "object" ? (body as Row) : {}
  const data = env.data && typeof env.data === "object" ? (env.data as Row) : {}
  const count = num(data.count)
  return count !== null && count > 0 ? Math.floor(count) : 0
}

/* ── Describing a row ───────────────────────────────────────────────────── */

/**
 * One line per type the service knows how to emit, keyed exactly as
 * templates.go keys them (including the legacy short names the social and
 * live consumers still send: `post_reposted`, `creator_went_live`).
 *
 * The lines are the service's own titles with every placeholder the row
 * cannot fill removed: the row has no `{group}`, `{channel}`, `{community}`,
 * `{order_number}` or `{title}`, so "New post in {group}" becomes "New post in
 * your group" rather than "New post in undefined". Where a row DOES carry a
 * title, `WITH_TITLE` has the fuller sentence.
 *
 * `{actor}` is the only placeholder, filled from the hydrated actor or
 * "Someone" when hydration was skipped.
 */
const LINES: Record<string, string> = {
  "post.liked": "{actor} liked your post",
  "post.super_liked": "{actor} super liked your post",
  "post.commented": "{actor} commented on your post",
  "comment.replied": "{actor} replied to your comment",
  "mention.created": "{actor} mentioned you",
  "post.shared": "{actor} shared your post",
  "post.reposted": "{actor} reposted your post",
  post_reposted: "{actor} reposted your post",

  "live.started": "{actor} is live now",
  creator_went_live: "{actor} is live now",

  "user.followed": "{actor} followed you",
  "user.friend_request": "{actor} wants to join your Circle",
  "user.friend_accepted": "{actor} accepted your Circle invite",

  "group.post.published": "New post in your group",
  "group.post.submitted": "{actor} submitted a post for approval",
  "group.post.approved": "Your group post was approved",
  "group.post.rejected": "Your group post was not approved",
  "group.announcement": "Announcement from your group",
  "group.member.joined": "{actor} joined your group",
  "group.invite.received": "{actor} invited you to a group",
  "group.join_request": "{actor} wants to join your group",
  "group.join_approved": "You have been accepted to a group",
  "group.event.created": "New event in your group",
  "group.event.reminder": "A group event is starting soon",
  "group.poll.created": "New poll in your group",

  "channel.update.published": "{actor} posted an update",
  "channel.urgent.info": "Update from a channel you follow",
  "channel.urgent.warning": "Warning from a channel you follow",
  "channel.urgent.critical": "Critical alert from a channel you follow",
  "channel.event.created": "New event from a channel you follow",
  "channel.event.reminder": "A channel event is starting soon",

  creator_uploaded_video: "{actor} uploaded a video",
  creator_uploaded_flick: "{actor} uploaded a flick",

  "community.post.published": "{actor} posted in your community",
  "community.announcement": "Announcement from your community",
  "community.mention": "{actor} mentioned you in a community",
  "community.answer_accepted": "Your answer was accepted",
  "community.expert_answer": "An expert answered your question",
  "community.invite": "You are invited to a community",
  "community.join_approved": "Welcome to your new community",

  "system.login_alert": "New login to your account",
  "system.verification": "Your verification status changed",
  "system.report_result": "Your report has been reviewed",

  "commerce.order.created": "Your order was placed",
  "commerce.order.paid": "Payment received for your order",
  "commerce.order.shipped": "Your order is on its way",
  "commerce.order.delivered": "Your order was delivered",
  "commerce.invoice.issued": "Your invoice is ready",
  "commerce.seller.new_order": "You have a new order",
  "commerce.return.requested": "A return was requested",
}

const WITH_TITLE: Record<string, string> = {
  creator_uploaded_video: "{actor} uploaded: {title}",
  creator_uploaded_flick: "{actor} uploaded: {title}",
  "channel.update.published": "{actor} posted: {title}",
  "group.announcement": "Announcement from your group: {title}",
  "community.announcement": "Announcement from your community: {title}",
  "group.event.created": "New event in your group: {title}",
  "channel.event.created": "New event from a channel you follow: {title}",
}

/** The service's own default for a type it does not know. Same words here. */
export const FALLBACK_LINE = "New notification"

export function actorName(n: Pick<InboxNotification, "actor">): string {
  return n.actor?.displayName || n.actor?.username || "Someone"
}

/**
 * One line for a row. Never throws and never returns an empty string: a type
 * this file has not heard of renders as the service's own fallback, which is
 * what keeps a new notification type from being a blank row or a crash.
 */
export function describe(n: Pick<InboxNotification, "type" | "actor" | "title">): string {
  const line = (n.title && WITH_TITLE[n.type]) || LINES[n.type]
  if (!line) return FALLBACK_LINE
  return line.replace("{actor}", actorName(n)).replace("{title}", n.title ?? "")
}

/* ── Where a row goes ───────────────────────────────────────────────────── */

/**
 * The row's `deep_link` as an href, or null when it is not one this page can
 * follow.
 *
 * A deep link is an ABSOLUTE SITE PATH (`/tube/watch/{id}`, `/u/{id}`,
 * `/orders/{id}`) that may well belong to another zone. That is why the bell
 * renders it as a plain `<a href>` and never `next/link`: from the tube zone,
 * next/link would resolve `/u/abc` against this zone's basePath and ask for
 * `/tube/u/abc`, which is exactly the bug that once sent the reels back
 * control to /reels/social. A plain anchor is a full page load, and the
 * shell's rewrite table routes it to whichever zone owns the prefix.
 *
 * The same argument is why this REJECTS anything else. A host-prefixed value
 * (`https://…`, `//evil.example/…`) would carry the viewer off the site on a
 * click labelled as a notification; a relative value (`watch/abc`) would be
 * resolved against whatever page the bell happens to be open on. Neither is
 * what a deep link means, so neither is a link, and the row is rendered as a
 * button that marks itself read and goes nowhere.
 */
export function hrefOf(n: Pick<InboxNotification, "deepLink">): string | null {
  const link = n.deepLink?.trim()
  if (!link) return null
  if (!link.startsWith("/")) return null
  // "//host/path" is protocol-relative: a host, wearing a path's first byte.
  if (link.startsWith("//")) return null
  // Backslashes are normalised to slashes by browsers, so "/\evil.example"
  // becomes "//evil.example". Refuse the raw form rather than the outcome.
  if (link.includes("\\")) return null
  return link
}

/* ── Ageing a timestamp ─────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * "just now", "5m", "2h", "3d", then a date. The compact form because a row
 * has one line and the sentence is the interesting half of it.
 *
 * Under a minute is "just now" in BOTH directions: a row stamped a few seconds
 * in the future is clock skew between the browser and the service, not news
 * from tomorrow, and "-3s" is a bug report nobody can act on.
 *
 * Past a week the day and month are shown, and the year only when it is not
 * this one; a viewer's own local calendar, because the question "when was
 * this" is asked where they are sitting.
 */
export function relativeTime(iso: string | null | undefined, now: number | Date = Date.now()): string {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ""
  const nowMs = typeof now === "number" ? now : now.getTime()
  const diff = nowMs - t

  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "just now"
  if (diff < hour) return `${Math.floor(diff / minute)}m`
  if (diff < day) return `${Math.floor(diff / hour)}h`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`

  const then = new Date(t)
  const label = `${then.getDate()} ${MONTHS[then.getMonth()]}`
  return then.getFullYear() === new Date(nowMs).getFullYear() ? label : `${label} ${then.getFullYear()}`
}

/* ── Marking read ───────────────────────────────────────────────────────── */

/**
 * The rows with the named ids marked read. Rows that were already read, and
 * rows not named, come back as the SAME objects, so a list keyed on identity
 * re-renders only what changed.
 */
export function applyRead(rows: InboxNotification[], ids: Iterable<string>): InboxNotification[] {
  const set = ids instanceof Set ? ids : new Set(ids)
  if (set.size === 0) return rows
  return rows.map((row) => (set.has(row.id) && !row.read ? { ...row, read: true } : row))
}

/** Every row read. The client half of `PATCH /v1/notifications/read-all`. */
export function applyReadAll(rows: InboxNotification[]): InboxNotification[] {
  return rows.map((row) => (row.read ? row : { ...row, read: true }))
}
