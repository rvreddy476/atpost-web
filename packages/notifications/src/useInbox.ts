"use client"

/**
 * The inbox as React state: a count that stays current, a list that is
 * fetched when somebody asks for it, and two writes that answer before the
 * server does.
 *
 * ── The count is polled; the list is not ──────────────────────────────────
 * `GET /v1/notifications/unread-count` is one Redis read behind the gateway.
 * Once a minute, per open tab, that is cheap enough to keep the badge honest
 * without the SSE stream (`/v1/notifications/stream` exists, and the day the
 * web wants toasts it is the right transport; a badge does not need it). The
 * LIST is fetched only when the panel opens, because a page of twenty
 * hydrated rows a minute for a panel nobody has opened is the wrong trade.
 *
 * ── Only while visible, and refreshed the moment it is visible again ──────
 * A background tab polling for an hour is sixty requests to redraw a badge
 * nobody can see. So a tick returns early when `document.visibilityState` is
 * not "visible", and `visibilitychange` back to visible triggers one at once,
 * so switching back to the tab does not mean waiting up to a minute for the
 * number to catch up. The timer itself keeps running rather than being torn
 * down and rebuilt, which is simpler and costs nothing: browsers already
 * throttle a hidden tab's timers to once a minute or slower.
 *
 * ── `signedIn` is a prop, on purpose ──────────────────────────────────────
 * The obvious version calls `useSession()` here. It is not done because this
 * package is mounted by two shells with two different ideas of the viewer
 * (the chrome's AppFrame and Tube's own frame), and every one of the four
 * routes is a 401 for an anonymous browser. Asking anyway would put a
 * guaranteed failure in the console every minute of every signed-out page,
 * which is how a real error stops being noticed. The shell already knows;
 * it says so.
 *
 * ── Optimistic, and honest about failure ──────────────────────────────────
 * Marking read answers on the click: the row loses its emphasis and the
 * badge drops by one before the request is sent. Same argument as
 * @momentum/interactions' toggle: a like that waits for a round trip feels
 * broken. When the write fails the change is put back AND `error` is set,
 * because a rollback nobody is told about is worse than no optimism at all.
 * For a row that is a link the failure is invisible (the page is already
 * navigating away), and the honest outcome is that the row comes back
 * unread next time, which is what the server believes.
 *
 * ── Stale answers are dropped, not merged ─────────────────────────────────
 * Open, close, open again inside one round trip and two first pages are in
 * flight. A generation counter on the list makes every response check that
 * it is still the one being waited for; the loser is discarded rather than
 * appended, which is the difference between a list and a list with every row
 * twice.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  fetchInboxPage,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api"
import { applyRead, applyReadAll, type InboxNotification } from "./inbox"

export const POLL_INTERVAL_MS = 60_000

export const LOAD_ERROR = "Notifications could not be loaded."
export const WRITE_ERROR = "That could not be saved. Try again."

export interface InboxOptions {
  /** The shell's answer, not this package's question. See the header. */
  signedIn: boolean
  /** Whether the panel is open; the first page is fetched on the rising edge. */
  open: boolean
  /** How often the count is refreshed while the tab is visible. */
  pollMs?: number
}

export interface Inbox {
  unread: number
  rows: InboxNotification[]
  hasMore: boolean
  /** The first page is in flight and there is nothing to show yet. */
  loading: boolean
  /** A further page is in flight; the rows already shown stay. */
  loadingMore: boolean
  /** Non-null after a failed load or a failed write. Render it. */
  error: string | null
  /** Fetch the first page again. What "Retry" and reopening both do. */
  refresh: () => void
  loadMore: () => void
  markRead: (n: InboxNotification) => void
  markAllRead: () => void
}

export function useInbox({ signedIn, open, pollMs = POLL_INTERVAL_MS }: InboxOptions): Inbox {
  const [unread, setUnread] = useState(0)
  const [rows, setRows] = useState<InboxNotification[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  /* ── The count ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!signedIn) {
      setUnread(0)
      return
    }
    let cancelled = false
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      fetchUnreadCount()
        .then((count) => {
          if (!cancelled) setUnread(count)
        })
        .catch(() => {
          // A missed poll is not an error the viewer can act on; the badge
          // keeps its last honest value and the next tick tries again.
        })
    }
    tick()
    const timer = setInterval(tick, pollMs)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [signedIn, pollMs])

  /* ── The list ─────────────────────────────────────────────────────────── */

  const refresh = useCallback(() => {
    if (!signedIn) return
    const mine = ++generation.current
    setLoading(true)
    setError(null)
    fetchInboxPage(null)
      .then((page) => {
        if (mine !== generation.current) return
        setRows(page.rows)
        setNextCursor(page.nextCursor)
        setLoading(false)
      })
      .catch(() => {
        if (mine !== generation.current) return
        setError(LOAD_ERROR)
        setLoading(false)
      })
  }, [signedIn])

  // The first page on every open, not only the first open: a panel reopened
  // ten minutes later should show what arrived in between, and the badge has
  // been saying so.
  useEffect(() => {
    if (open && signedIn) refresh()
  }, [open, signedIn, refresh])

  // Signed out: the list is somebody else's now. Drop it rather than let a
  // sign-in as a different account briefly show the previous one's inbox.
  useEffect(() => {
    if (signedIn) return
    generation.current++
    setRows([])
    setNextCursor(null)
    setLoading(false)
    setLoadingMore(false)
    setError(null)
  }, [signedIn])

  const loadMore = useCallback(() => {
    if (!signedIn || !nextCursor || loadingMore) return
    const mine = generation.current
    setLoadingMore(true)
    setError(null)
    fetchInboxPage(nextCursor)
      .then((page) => {
        if (mine !== generation.current) return
        setRows((prev) => {
          // The cursor is a position in time, so a page cannot overlap the
          // one before it; the guard is against a double-fire, not the server.
          const seen = new Set(prev.map((r) => r.id))
          return [...prev, ...page.rows.filter((r) => !seen.has(r.id))]
        })
        setNextCursor(page.nextCursor)
        setLoadingMore(false)
      })
      .catch(() => {
        if (mine !== generation.current) return
        setError(LOAD_ERROR)
        setLoadingMore(false)
      })
  }, [signedIn, nextCursor, loadingMore])

  /* ── The writes ───────────────────────────────────────────────────────── */

  const markRead = useCallback(
    (n: InboxNotification) => {
      if (n.read) return
      setRows((prev) => applyRead(prev, [n.id]))
      setUnread((u) => Math.max(0, u - 1))
      markNotificationRead(n).catch(() => {
        setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, read: false } : r)))
        setUnread((u) => u + 1)
        setError(WRITE_ERROR)
      })
    },
    []
  )

  const markAllRead = useCallback(() => {
    let before: InboxNotification[] = []
    let beforeCount = 0
    setRows((prev) => {
      before = prev
      return applyReadAll(prev)
    })
    setUnread((u) => {
      beforeCount = u
      return 0
    })
    markAllNotificationsRead().catch(() => {
      setRows(before)
      setUnread(beforeCount)
      setError(WRITE_ERROR)
    })
  }, [])

  return {
    unread,
    rows,
    hasMore: nextCursor !== null,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  }
}
