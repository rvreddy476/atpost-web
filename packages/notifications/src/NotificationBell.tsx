"use client"

/**
 * The bell, and the panel under it.
 *
 * ── Two components, and the seam is where the network is ──────────────────
 * `NotificationBell` owns the open state, the hook and the three behaviours a
 * popover needs (Escape, click outside, focus back on the button).
 * `NotificationBellView` is a pure function of props and draws everything.
 * The split exists so the markup can be tested with react-dom/server, the way
 * this repo tests its other controls (there is no jsdom here and a bell is
 * not worth dragging a browser runtime in for): the view is rendered closed
 * with a count, and open with rows, without a server behind it.
 *
 * ── A dialog, not a menu ──────────────────────────────────────────────────
 * The profile menu beside this is `role="menu"` because it is a list of
 * commands. This is a list of THINGS, each with its own destination and its
 * own read state, plus a "Mark all as read" control and a "Load more". That
 * is a small document, so `role="dialog"` with a label; the arrow-key
 * contract a menu promises would be a lie over a list of links.
 *
 * ── Kept mounted, `hidden` when closed ────────────────────────────────────
 * Same as the profile menu, same reason: out of the a11y tree, out of the
 * focus order, out of find-in-page, and the markup stays stable enough to
 * render on the server.
 *
 * ── Rows are plain anchors, and never next/link ───────────────────────────
 * A deep link is an absolute site path that may belong to another zone.
 * `hrefOf` in ./inbox.ts has the argument; the short form is that from
 * /tube, next/link would ask for /tube/u/abc. A plain `<a href>` is a full
 * page load, and the shell's rewrite table routes it.
 *
 * ── The badge is cyan, not ember ──────────────────────────────────────────
 * tokens.css measures #0D0C14 on ember red at 4.03, which is LARGE-TEXT-ONLY,
 * and an unread count is 11px bold. The same sheet measures the same ink on
 * cyan at 8.01 (the RoleSwitcher chip), so the badge is cyan and the number
 * is legible. The dot on an unread ROW is purple, because tokens.css gives
 * purple exactly one job, "presence: live, unread, mine", and it is a
 * non-text mark so the contrast floor does not apply.
 */

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react"
import { Bell } from "lucide-react"
import { Avatar } from "@momentum/content"
import { actorName, describe, hrefOf, relativeTime, type InboxNotification } from "./inbox"
import { useInbox } from "./useInbox"

export interface NotificationBellProps {
  /** The shell's answer. Nothing is drawn, and nothing is fetched, while false. */
  signedIn: boolean
  className?: string
}

export function NotificationBell({ signedIn, className }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const inbox = useInbox({ signedIn, open })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
    }
  }, [open, close])

  // Focus moves INTO the dialog when it opens, so Escape works at once and a
  // screen reader announces the label. Never while closed: focusing a hidden
  // subtree is how a popover traps somebody.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // Sign-out while open: the panel would show a list that is no longer the
  // viewer's. The hook has already emptied it; this closes the lid.
  useEffect(() => {
    if (!signedIn) setOpen(false)
  }, [signedIn])

  if (!signedIn) return null

  return (
    <NotificationBellView
      open={open}
      unread={inbox.unread}
      rows={inbox.rows}
      loading={inbox.loading}
      loadingMore={inbox.loadingMore}
      hasMore={inbox.hasMore}
      error={inbox.error}
      className={className}
      wrapperRef={wrapperRef}
      buttonRef={buttonRef}
      panelRef={panelRef}
      onToggle={() => (open ? close(false) : setOpen(true))}
      onClose={close}
      onRowClick={inbox.markRead}
      onMarkAllRead={inbox.markAllRead}
      onLoadMore={inbox.loadMore}
      onRetry={inbox.refresh}
    />
  )
}

/* ── The view ───────────────────────────────────────────────────────────── */

export interface NotificationBellViewProps {
  open: boolean
  unread: number
  rows: InboxNotification[]
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  error?: string | null
  /** The clock `relativeTime` ages against. A prop so a test is deterministic. */
  now?: number
  className?: string
  wrapperRef?: RefObject<HTMLDivElement | null>
  buttonRef?: RefObject<HTMLButtonElement | null>
  panelRef?: RefObject<HTMLDivElement | null>
  onToggle: () => void
  onClose: (returnFocus: boolean) => void
  onRowClick: (n: InboxNotification) => void
  onMarkAllRead: () => void
  onLoadMore: () => void
  onRetry: () => void
}

/** Why the class is a constant: the test asserts the unread row wears it. */
export const UNREAD_ROW_CLASS = "bg-mo-surface"

const ROW =
  "flex w-full items-start gap-3 rounded-mo-sm px-3 py-2.5 text-left text-sm transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:bg-mo-raised focus-visible:outline-none"

export function NotificationBellView({
  open,
  unread,
  rows,
  loading = false,
  loadingMore = false,
  hasMore = false,
  error = null,
  now,
  className,
  wrapperRef,
  buttonRef,
  panelRef,
  onToggle,
  onClose,
  onRowClick,
  onMarkAllRead,
  onLoadMore,
  onRetry,
}: NotificationBellViewProps) {
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const titleId = `${baseId}-title`
  const anyUnreadRow = rows.some((r) => !r.read)

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Notifications, ${unread} unread`}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault()
            onClose(true)
          }
        }}
        // 40x40: the same square as the profile trigger and the upload glyph
        // beside it, and the smallest one a thumb reliably hits.
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-surface hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unread > 0 && (
          // aria-hidden: the count is already in the button's name, and a
          // badge read out after it would say the number twice.
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-mo-pill bg-mo-cyan px-1 text-center text-[11px] font-bold leading-[18px] text-mo-bg"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label="Notifications"
        aria-labelledby={titleId}
        tabIndex={-1}
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onClose(true)
          }
        }}
        className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-mo border border-mo bg-mo-overlay shadow-mo-lift focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-mo px-4 py-3">
          <h2 id={titleId} className="font-mo-display text-base font-semibold text-mo-ink">
            Notifications
          </h2>
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unread === 0 && !anyUnreadRow}
            className="rounded-mo-pill px-2 py-1 text-xs font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-surface disabled:cursor-default disabled:text-mo-body disabled:hover:bg-transparent"
          >
            Mark all as read
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-mo-bad">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 font-semibold text-mo-cyan hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading && rows.length === 0 ? (
          <p role="status" className="px-4 py-8 text-center text-sm text-mo-body">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mo-body">
            {error ? "" : "Nothing yet"}
          </p>
        ) : (
          <ul className="max-h-[min(70vh,32rem)] overflow-y-auto p-1">
            {rows.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} now={now} onClick={onRowClick} />
              </li>
            ))}
          </ul>
        )}

        {hasMore && rows.length > 0 && (
          <div className="border-t border-mo p-1">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full rounded-mo-sm px-3 py-2 text-center text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:cursor-progress disabled:text-mo-body"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One row. A link when the deep link is one this site can follow, and a
 * button that only marks itself read when it is not; both are operable and
 * both are announced by their sentence.
 *
 * No `aria-current` anywhere: a notification is never "the current page", and
 * the unread state is carried by the sentence's weight, the purple dot, and
 * the "Unread" that a screen reader gets before the sentence.
 */
function NotificationRow({
  n,
  now,
  onClick,
}: {
  n: InboxNotification
  now?: number
  onClick: (n: InboxNotification) => void
}) {
  const href = hrefOf(n)
  const line = describe(n)
  const when = relativeTime(n.createdAt, now)
  const className = `${ROW} ${n.read ? "" : UNREAD_ROW_CLASS}`

  const body = (
    <>
      <Avatar name={n.actor ? actorName(n) : undefined} id={n.actorId ?? n.id} size="sm" />
      <span className="min-w-0 flex-1">
        <span className={`block leading-snug ${n.read ? "text-mo-body" : "font-semibold text-mo-ink"}`}>
          {!n.read && <span className="sr-only">Unread: </span>}
          {line}
        </span>
        {when && (
          <time dateTime={n.createdAt ?? undefined} className="block text-xs text-mo-body">
            {when}
          </time>
        )}
      </span>
      {!n.read && (
        <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-mo-pill bg-mo-purple" />
      )}
    </>
  )

  if (href) {
    return (
      <a href={href} data-unread={!n.read} onClick={() => onClick(n)} className={className}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" data-unread={!n.read} onClick={() => onClick(n)} className={className}>
      {body}
    </button>
  )
}
