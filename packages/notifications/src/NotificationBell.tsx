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
 * ── The badge is the ACCENT, not cyan, and not ember ──────────────────────
 * It was cyan, and the reason given was a measurement: tokens.css puts #0D0C14
 * on ember red at 4.03, which is LARGE-TEXT-ONLY, and an unread count is 11px
 * bold, whereas the same ink on cyan is 8.01. That measurement is still true
 * and is no longer the question. tokens.css now hands --mo-accent a closed list
 * of jobs — "unread and notification marks, 'new' and 'live' pills, count
 * bubbles, and the active tab's indicator or underline" — and a count bubble is
 * the third item, named. The sanctioned form is the FILL form, `bg-mo-accent
 * text-mo-on-accent`, which is 4.72 and therefore legal at any size, so an 11px
 * bold number is fine. Cyan in a light zone means --mo-info, a notice, which is
 * not what an unread count is.
 *
 * The dot on an unread ROW stays purple, because tokens.css gives purple
 * exactly one job, "presence: live, unread, mine", and it is a non-text mark so
 * the contrast floor does not apply.
 *
 * ── The four cyan sites, and where each went ───────────────────────────────
 * The count badge above, and three PRESSABLE words: "Mark all as read",
 * "Retry", "Load more". Those three are now `text-brand-accent`, the alias that
 * follows the scope — #06B6D4 in :root, #0B6B37 under `.mo-light` — the same
 * move `packages/chrome` and `packages/interactions` made, for the same reason:
 * cyan stopped being the interactive colour when the zone went light, and a
 * cyan button on a page whose every other pressable thing is green reads as a
 * notice. Measured on the panel's own ground: 5.15 dark, 6.61 light; on the
 * hover fill, 5.86 and 5.97.
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

/**
 * Why the class is a constant: the test asserts the unread row wears it.
 *
 * `--mo-raised`, not `--mo-surface`. The panel's ground is `--mo-overlay`, and
 * the old fill worked only by accident of the dark theme having five tones:
 * #1F1D33 on #332F55 is 1.30, a real if faint "this one is new". In a light
 * zone --mo-surface IS #FFFFFF, the same white as the panel behind it — 1.00,
 * no fill at all, and the only thing left marking an unread row was the purple
 * dot. --mo-raised is the token whose documented job is exactly this, a nested
 * step, and it reads on both: 1.13 dark and 1.10 light. Small numbers, because
 * a row wash is meant to be one; the difference is that neither is 1.00. The
 * sentence on it stays AAA either way — #F1EEF8 on #2A2745 is 12.42, #0F1A14 on
 * #F1F4F2 is 16.09 — and the timestamp clears AA at 5.40 and 7.11.
 *
 * KNOWN GAP, not fixed here: ROW's hover and focus fills are also --mo-raised,
 * so an unread row no longer changes under the pointer. Closing it needs a tone
 * one step from raised that exists in BOTH scopes, and there isn't one — the
 * light block has three tones where the dark block has five, so the only deeper
 * step is --mo-sunken, which is #08070E in a dark zone and would flash a
 * near-black row inside a #332F55 panel. That is a tokens.css decision.
 */
export const UNREAD_ROW_CLASS = "bg-mo-raised"

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
        // 44x44: the WCAG 2.2 target-size floor, and the number the
        // accessibility brief names. It was 40, described as "the smallest one
        // a thumb reliably hits" — 44 is the size that claim is actually made
        // about. The glyph inside is unchanged, so it grows by padding only and
        // sits on the same centre line as the trigger beside it.
        //
        // The hover fill moved from --mo-surface to --mo-raised for the reason
        // written out at UNREAD_ROW_CLASS: the header's ground is --mo-bg, and
        // --mo-surface is the SAME white as it under `.mo-light`, so the hover
        // state simply did not exist there. --mo-raised is 1.36 against the
        // dark header and 1.10 against the white one.
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unread > 0 && (
          // aria-hidden: the count is already in the button's name, and a
          // badge read out after it would say the number twice.
          //
          // The plain fill form, which is the sanctioned one: `bg-mo-accent
          // text-mo-on-accent` is 4.72 under `.mo-light` and 8.01 under a bare
          // `.mo-root`, so an 11px bold number is legal in either.
          //
          // It used to carry a defensive `var(--mo-accent, var(--mo-cyan))`
          // chain, because the accent pair was declared only inside
          // `.mo-light` and this package is not a zone — `apps/tube` renders
          // this exact bell under `.mo-root`, where `bg-mo-accent` measured
          // `rgba(0, 0, 0, 0)` and the count was simply gone. tokens.css now
          // declares the pair in `:root` as well, with the dark theme's own
          // values, so the chain has nothing left to defend against and the
          // badge renders the same cyan it always did, to the pixel.
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-mo-pill bg-mo-accent px-1 text-center text-[11px] font-bold leading-[18px] text-mo-on-accent"
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
            className="rounded-mo-pill px-2 py-1 text-xs font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:cursor-default disabled:text-mo-body disabled:hover:bg-transparent"
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
              className="shrink-0 font-semibold text-brand-accent hover:underline"
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
              className="w-full rounded-mo-sm px-3 py-2 text-center text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:cursor-progress disabled:text-mo-body"
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
