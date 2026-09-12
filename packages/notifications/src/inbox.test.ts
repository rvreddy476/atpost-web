import { describe as suite, expect, it } from "vitest"
import {
  FALLBACK_LINE,
  applyRead,
  applyReadAll,
  describe,
  hrefOf,
  parseNotification,
  parsePage,
  parseUnreadCount,
  relativeTime,
  type InboxNotification,
} from "./inbox"

/**
 * The wire row, as notification-service actually sends it (scylla
 * Notification + the hydrated actor). Every other fixture here is this one
 * with something removed, because "tolerant of missing fields" is only a
 * claim until each field is removed in turn.
 */
const WIRE = {
  user_id: "0b6f1c2e-0000-4000-8000-000000000001",
  bucket: 202609,
  ts: "6c1a0f60-8f8a-11f1-8000-000000000002",
  notification_id: "5f1a4b90-1f2d-4a3e-9c6b-0d5a6e7f8a90",
  type: "creator_uploaded_video",
  actor_user_id: "0b6f1c2e-0000-4000-8000-000000000003",
  entity_type: "post",
  entity_id: "0b6f1c2e-0000-4000-8000-000000000004",
  deep_link: "/tube/watch/0b6f1c2e-0000-4000-8000-000000000004",
  is_read: false,
  created_at: "2026-09-12T10:00:00Z",
  actor: {
    id: "0b6f1c2e-0000-4000-8000-000000000003",
    username: "ada",
    display_name: "Ada Lovelace",
  },
}

function row(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return { ...(parseNotification(WIRE) as InboxNotification), ...overrides }
}

suite("parseNotification", () => {
  it("reads the service's row, field for field", () => {
    const n = parseNotification(WIRE)
    expect(n).toEqual({
      id: WIRE.notification_id,
      bucket: 202609,
      ts: WIRE.ts,
      type: "creator_uploaded_video",
      actorId: WIRE.actor_user_id,
      actor: { id: WIRE.actor.id, username: "ada", displayName: "Ada Lovelace" },
      entityType: "post",
      entityId: WIRE.entity_id,
      deepLink: WIRE.deep_link,
      title: null,
      read: false,
      createdAt: WIRE.created_at,
    })
  })

  it("survives a row with only an id and a type", () => {
    const n = parseNotification({ notification_id: "x", type: "post.liked" })
    expect(n).toMatchObject({
      id: "x",
      type: "post.liked",
      bucket: null,
      ts: null,
      actor: null,
      deepLink: null,
      read: false,
      createdAt: null,
    })
  })

  it("keys a row by bucket:ts when notification_id is absent", () => {
    const { notification_id: _dropped, ...rest } = WIRE
    expect(parseNotification(rest)?.id).toBe(`202609:${WIRE.ts}`)
  })

  it("drops a row it could neither list nor mark read", () => {
    expect(parseNotification({ type: "post.liked" })).toBeNull()
    expect(parseNotification(null)).toBeNull()
    expect(parseNotification("nope")).toBeNull()
  })

  it("treats a nil actor the way the service says clients must", () => {
    expect(parseNotification({ ...WIRE, actor: undefined })?.actor).toBeNull()
    expect(parseNotification({ ...WIRE, actor: null })?.actor).toBeNull()
    expect(parseNotification({ ...WIRE, actor: { id: WIRE.actor.id } })?.actor).toBeNull()
  })

  it("reads is_read, and the two spellings a rename would produce", () => {
    expect(parseNotification({ ...WIRE, is_read: true })?.read).toBe(true)
    const { is_read: _a, ...noFlag } = WIRE
    expect(parseNotification({ ...noFlag, read: true })?.read).toBe(true)
    expect(parseNotification({ ...noFlag, read_at: "2026-09-12T10:01:00Z" })?.read).toBe(true)
    expect(parseNotification({ ...noFlag, read_at: null })?.read).toBe(false)
    expect(parseNotification(noFlag)?.read).toBe(false)
  })
})

suite("describe", () => {
  const cases: Array<[string, string]> = [
    ["post.liked", "Ada Lovelace liked your post"],
    ["post.super_liked", "Ada Lovelace super liked your post"],
    ["post.commented", "Ada Lovelace commented on your post"],
    ["comment.replied", "Ada Lovelace replied to your comment"],
    ["mention.created", "Ada Lovelace mentioned you"],
    ["post.shared", "Ada Lovelace shared your post"],
    ["post.reposted", "Ada Lovelace reposted your post"],
    ["post_reposted", "Ada Lovelace reposted your post"],
    ["live.started", "Ada Lovelace is live now"],
    ["creator_went_live", "Ada Lovelace is live now"],
    ["user.followed", "Ada Lovelace followed you"],
    ["user.friend_request", "Ada Lovelace wants to join your Circle"],
    ["user.friend_accepted", "Ada Lovelace accepted your Circle invite"],
    ["group.post.published", "New post in your group"],
    ["group.invite.received", "Ada Lovelace invited you to a group"],
    ["channel.update.published", "Ada Lovelace posted an update"],
    ["channel.urgent.critical", "Critical alert from a channel you follow"],
    ["creator_uploaded_video", "Ada Lovelace uploaded a video"],
    ["creator_uploaded_flick", "Ada Lovelace uploaded a flick"],
    ["community.post.published", "Ada Lovelace posted in your community"],
    ["community.mention", "Ada Lovelace mentioned you in a community"],
    ["system.login_alert", "New login to your account"],
    ["system.report_result", "Your report has been reviewed"],
    ["commerce.order.shipped", "Your order is on its way"],
    ["commerce.seller.new_order", "You have a new order"],
  ]

  it.each(cases)("%s", (type, expected) => {
    expect(describe(row({ type }))).toBe(expected)
  })

  it("appends the title when a row carries one", () => {
    expect(describe(row({ title: "Bridges of Venice" }))).toBe(
      "Ada Lovelace uploaded: Bridges of Venice"
    )
    expect(describe(row({ type: "channel.update.published", title: "Week 3" }))).toBe(
      "Ada Lovelace posted: Week 3"
    )
    // A title on a type with no titled sentence changes nothing.
    expect(describe(row({ type: "post.liked", title: "ignored" }))).toBe(
      "Ada Lovelace liked your post"
    )
  })

  it("falls back to the handle, then to Someone, when hydration was partial or skipped", () => {
    expect(describe(row({ actor: { id: "a", username: "ada", displayName: "" } }))).toBe(
      "ada liked your post".replace("liked your post", "uploaded a video")
    )
    expect(describe(row({ actor: null }))).toBe("Someone uploaded a video")
  })

  it("never crashes on a type it has not heard of", () => {
    expect(describe(row({ type: "qa.answer.rewarded" }))).toBe(FALLBACK_LINE)
    expect(describe(row({ type: "" }))).toBe(FALLBACK_LINE)
    expect(FALLBACK_LINE).toBe("New notification")
  })
})

suite("hrefOf", () => {
  it("accepts an absolute site path, whichever zone owns it", () => {
    expect(hrefOf(row())).toBe("/tube/watch/0b6f1c2e-0000-4000-8000-000000000004")
    expect(hrefOf(row({ deepLink: "/u/abc" }))).toBe("/u/abc")
    expect(hrefOf(row({ deepLink: "/reels/abc?from=inbox" }))).toBe("/reels/abc?from=inbox")
    expect(hrefOf(row({ deepLink: "  /post/abc  " }))).toBe("/post/abc")
  })

  it("rejects anything carrying a host", () => {
    expect(hrefOf(row({ deepLink: "https://momentum.example/tube/watch/abc" }))).toBeNull()
    expect(hrefOf(row({ deepLink: "http://evil.example/" }))).toBeNull()
    expect(hrefOf(row({ deepLink: "//evil.example/tube" }))).toBeNull()
    expect(hrefOf(row({ deepLink: "/\\evil.example/tube" }))).toBeNull()
  })

  it("rejects a relative path and a scheme", () => {
    expect(hrefOf(row({ deepLink: "watch/abc" }))).toBeNull()
    expect(hrefOf(row({ deepLink: "atpost://post/abc" }))).toBeNull()
    expect(hrefOf(row({ deepLink: "javascript:alert(1)" }))).toBeNull()
  })

  it("is null when there is no link at all", () => {
    expect(hrefOf(row({ deepLink: null }))).toBeNull()
    expect(hrefOf(row({ deepLink: "   " }))).toBeNull()
  })
})

suite("relativeTime", () => {
  const now = Date.parse("2026-09-12T12:00:00Z")
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const table: Array<[string, string]> = [
    [ago(0), "just now"],
    [ago(59_000), "just now"],
    [ago(-30_000), "just now"],
    [ago(60_000), "1m"],
    [ago(5 * 60_000), "5m"],
    [ago(59 * 60_000 + 59_000), "59m"],
    [ago(60 * 60_000), "1h"],
    [ago(2 * 3_600_000), "2h"],
    [ago(23 * 3_600_000 + 59 * 60_000), "23h"],
    [ago(24 * 3_600_000), "1d"],
    [ago(3 * 86_400_000), "3d"],
    [ago(6 * 86_400_000 + 23 * 3_600_000), "6d"],
  ]

  it.each(table)("%s -> %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected)
  })

  it("shows a date past a week, and the year only when it differs", () => {
    const week = new Date(now - 7 * 86_400_000)
    // Local calendar, so the expectation is built with the same getters.
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    expect(relativeTime(week.toISOString(), now)).toBe(`${week.getDate()} ${MONTHS[week.getMonth()]}`)

    const lastYear = new Date("2025-03-04T12:00:00Z")
    expect(relativeTime(lastYear.toISOString(), now)).toBe(
      `${lastYear.getDate()} ${MONTHS[lastYear.getMonth()]} 2025`
    )
  })

  it("is empty for nothing and for garbage", () => {
    expect(relativeTime(null, now)).toBe("")
    expect(relativeTime(undefined, now)).toBe("")
    expect(relativeTime("not a date", now)).toBe("")
  })
})

suite("applyRead", () => {
  const a = row({ id: "a" })
  const b = row({ id: "b" })
  const c = row({ id: "c", read: true })

  it("marks the named rows read and leaves the rest as the same objects", () => {
    const out = applyRead([a, b, c], ["b"])
    expect(out[0]).toBe(a)
    expect(out[1]).not.toBe(b)
    expect(out[1].read).toBe(true)
    expect(out[2]).toBe(c)
    expect(b.read).toBe(false)
  })

  it("is the identity for an empty set and for ids that are not there", () => {
    const rows = [a, b, c]
    expect(applyRead(rows, [])).toBe(rows)
    expect(applyRead(rows, ["zzz"])).toEqual(rows)
    expect(applyRead(rows, new Set(["c"]))[2]).toBe(c)
  })

  it("applyReadAll reads everything and keeps already-read rows by identity", () => {
    const out = applyReadAll([a, b, c])
    expect(out.every((r) => r.read)).toBe(true)
    expect(out[2]).toBe(c)
  })
})

suite("parsePage", () => {
  it("reads rows and the next cursor", () => {
    const page = parsePage({ data: [WIRE, { ...WIRE, notification_id: "two" }], meta: { next_cursor: "202609:abc" } })
    expect(page.rows.map((r) => r.id)).toEqual([WIRE.notification_id, "two"])
    expect(page.nextCursor).toBe("202609:abc")
  })

  it("treats an absent meta as the last page, which is what the handler means by it", () => {
    expect(parsePage({ data: [WIRE] }).nextCursor).toBeNull()
    expect(parsePage({ data: [WIRE], meta: {} }).nextCursor).toBeNull()
    expect(parsePage({ data: [WIRE], meta: { next_cursor: "" } }).nextCursor).toBeNull()
  })

  it("is empty for a body with nothing in it, rather than throwing", () => {
    expect(parsePage(null)).toEqual({ rows: [], nextCursor: null })
    expect(parsePage({})).toEqual({ rows: [], nextCursor: null })
    expect(parsePage({ data: null })).toEqual({ rows: [], nextCursor: null })
    expect(parsePage({ data: "nope" })).toEqual({ rows: [], nextCursor: null })
  })

  it("skips a row it cannot key and keeps the others", () => {
    const page = parsePage({ data: [{ type: "post.liked" }, WIRE, 42] })
    expect(page.rows.map((r) => r.id)).toEqual([WIRE.notification_id])
  })
})

suite("parseUnreadCount", () => {
  it("reads {data:{count}} and clamps everything else to zero", () => {
    expect(parseUnreadCount({ data: { count: 7 } })).toBe(7)
    expect(parseUnreadCount({ data: { count: "3" } })).toBe(3)
    expect(parseUnreadCount({ data: { count: -2 } })).toBe(0)
    expect(parseUnreadCount({ data: {} })).toBe(0)
    expect(parseUnreadCount(null)).toBe(0)
  })
})
