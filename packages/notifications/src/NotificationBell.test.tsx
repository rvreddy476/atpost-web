import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { parseNotification, type InboxNotification } from "./inbox"
import { NotificationBellView, UNREAD_ROW_CLASS } from "./NotificationBell"

/**
 * Rendered with react-dom/server rather than a testing-library, the way the
 * RoleSwitcher and SubscribeControls tests are: this repo has neither jsdom
 * nor @testing-library and a bell is not worth dragging a browser runtime in
 * for. The view is a pure function of its props, so closed-with-a-count and
 * open-with-rows are each one render. What server rendering cannot see is
 * the polling, the optimistic write and the focus return, which live in
 * ./useInbox.ts and the container's effects and are checked by hand.
 */

const noop = () => undefined
const NOW = Date.parse("2026-09-12T12:00:00Z")

function wire(overrides: Record<string, unknown>): InboxNotification {
  const n = parseNotification({
    bucket: 202609,
    ts: "6c1a0f60-8f8a-11f1-8000-000000000002",
    notification_id: "n1",
    type: "creator_uploaded_video",
    actor_user_id: "u-ada",
    entity_type: "post",
    entity_id: "p1",
    deep_link: "/tube/watch/p1",
    is_read: false,
    created_at: new Date(NOW - 5 * 60_000).toISOString(),
    actor: { id: "u-ada", username: "ada", display_name: "Ada Lovelace" },
    ...overrides,
  })
  if (!n) throw new Error("fixture did not parse")
  return n
}

const UPLOAD = wire({})
const FOLLOW = wire({
  notification_id: "n2",
  type: "user.followed",
  deep_link: "/u/u-grace",
  is_read: true,
  actor_user_id: "u-grace",
  actor: { id: "u-grace", username: "grace", display_name: "Grace Hopper" },
  created_at: new Date(NOW - 3 * 86_400_000).toISOString(),
})

const handlers = {
  onToggle: noop,
  onClose: noop,
  onRowClick: noop,
  onMarkAllRead: noop,
  onLoadMore: noop,
  onRetry: noop,
}

describe("NotificationBellView, closed", () => {
  it("names itself with the unread count and wears the badge", () => {
    const html = renderToStaticMarkup(
      <NotificationBellView open={false} unread={3} rows={[]} {...handlers} />
    )
    expect(html).toContain('aria-label="Notifications, 3 unread"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toMatch(/aria-hidden="true"[^>]*>3</)
    // The panel is in the markup and hidden, not absent. The boolean
    // attribute, specifically: `overflow-hidden` in the class list also
    // contains the word, and a looser pattern matched that.
    expect(html).toContain('role="dialog"')
    expect(html).toMatch(/<div[^>]*role="dialog"[^>]*\shidden(=""|\s|>)/)
  })

  it("draws no badge at zero, and says so in the name", () => {
    const html = renderToStaticMarkup(
      <NotificationBellView open={false} unread={0} rows={[]} {...handlers} />
    )
    expect(html).toContain('aria-label="Notifications, 0 unread"')
    expect(html).not.toMatch(/aria-hidden="true"[^>]*>0</)
  })

  it("caps the badge at 99+ without capping the name", () => {
    const html = renderToStaticMarkup(
      <NotificationBellView open={false} unread={140} rows={[]} {...handlers} />
    )
    expect(html).toContain('aria-label="Notifications, 140 unread"')
    expect(html).toContain(">99+<")
  })
})

describe("NotificationBellView, open with two rows", () => {
  const html = renderToStaticMarkup(
    <NotificationBellView open unread={1} rows={[UPLOAD, FOLLOW]} now={NOW} {...handlers} />
  )

  it("is a labelled dialog that is no longer hidden", () => {
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="Notifications"')
    expect(html).not.toMatch(/<div[^>]*role="dialog"[^>]*\shidden(=""|\s|>)/)
  })

  it("renders each deep link as a plain anchor to its absolute site path", () => {
    expect(html).toContain('href="/tube/watch/p1"')
    expect(html).toContain('href="/u/u-grace"')
    expect(html).toContain("Ada Lovelace uploaded a video")
    expect(html).toContain("Grace Hopper followed you")
    expect(html).toContain(">5m<")
    expect(html).toContain(">3d<")
  })

  it("marks the unread row and only the unread row", () => {
    expect(html).toContain('data-unread="true"')
    expect(html).toContain('data-unread="false"')
    const unreadRow = html.slice(html.indexOf('data-unread="true"') - 400, html.indexOf('data-unread="true"'))
    expect(unreadRow).toContain(UNREAD_ROW_CLASS)
    expect(html).toContain("Unread: ")
    expect(html).not.toContain("aria-current")
  })

  it("offers Mark all as read", () => {
    expect(html).toContain(">Mark all as read<")
  })

  it("offers Load more only when there is more", () => {
    expect(html).not.toContain(">Load more<")
    const more = renderToStaticMarkup(
      <NotificationBellView open unread={1} rows={[UPLOAD]} hasMore now={NOW} {...handlers} />
    )
    expect(more).toContain(">Load more<")
  })

  it("renders a row with no usable link as a button, not a dead anchor", () => {
    const offsite = wire({ notification_id: "n3", deep_link: "https://evil.example/x" })
    const out = renderToStaticMarkup(
      <NotificationBellView open unread={1} rows={[offsite]} now={NOW} {...handlers} />
    )
    expect(out).not.toContain("evil.example")
    expect(out).toMatch(/<button[^>]*data-unread="true"/)
  })
})

describe("NotificationBellView, the other states", () => {
  it("says Nothing yet when the list is empty", () => {
    const html = renderToStaticMarkup(
      <NotificationBellView open unread={0} rows={[]} {...handlers} />
    )
    expect(html).toContain("Nothing yet")
  })

  it("says Loading while the first page is in flight", () => {
    const html = renderToStaticMarkup(
      <NotificationBellView open unread={0} rows={[]} loading {...handlers} />
    )
    expect(html).toContain('role="status"')
    expect(html).toContain("Loading")
    expect(html).not.toContain("Nothing yet")
  })

  it("shows the error and a Retry, and not Nothing yet under it", () => {
    const html = renderToStaticMarkup(
      <NotificationBellView open unread={0} rows={[]} error="Notifications could not be loaded." {...handlers} />
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain("Notifications could not be loaded.")
    expect(html).toContain(">Retry<")
    expect(html).not.toContain("Nothing yet")
  })
})
