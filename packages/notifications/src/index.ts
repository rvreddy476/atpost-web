/**
 * @momentum/notifications, the bell and the inbox behind it.
 *
 *   import { NotificationBell } from "@momentum/notifications"
 *   <NotificationBell signedIn={signedIn} />
 *
 * One control, mounted by the chrome's AppHeader and by Tube's own top bar,
 * so the same inbox is the same inbox in every zone. It takes `signedIn`
 * from the shell rather than asking a session hook itself; ./useInbox.ts has
 * the argument. It is the second package allowed to import
 * @atpost/api-client, on the chrome's own reasoning; ./api.ts restates it so
 * the exception is not mistaken for a precedent.
 */

export { NotificationBell, NotificationBellView, UNREAD_ROW_CLASS } from "./NotificationBell"
export type { NotificationBellProps, NotificationBellViewProps } from "./NotificationBell"

export { useInbox, LOAD_ERROR, POLL_INTERVAL_MS, WRITE_ERROR } from "./useInbox"
export type { Inbox, InboxOptions } from "./useInbox"

/**
 * The pure half, for a surface that wants to draw its own rows (a full
 * /notifications page, one day) from the same parsing and the same sentences.
 */
export {
  FALLBACK_LINE,
  actorName,
  applyRead,
  applyReadAll,
  describe,
  hrefOf,
  parseNotification,
  parsePage,
  parseUnreadCount,
  relativeTime,
} from "./inbox"
export type { InboxNotification, InboxPage, NotificationActor } from "./inbox"

export {
  INBOX_PATH,
  PAGE_SIZE,
  fetchInboxPage,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api"
