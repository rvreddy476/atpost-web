"use client"

/**
 * The three-dot control on a video card, and everything behind it.
 *
 * ── A menu, where the phone has a bottom sheet ────────────────────────────
 * The same deliberate divergence @momentum/content's PostOverflowMenu records,
 * for the same reason: a bottom sheet is right for a thumb reaching up from
 * the bottom of a phone, and on a desktop it is a panel sliding in from an
 * edge nowhere near the control that was pressed. So this is an anchored menu
 * with the platform's own semantics — `role="menu"`, arrow keys, Escape,
 * focus returned to the trigger — because that is what a cursor and a keyboard
 * already know how to drive.
 *
 * ── Two steps INSIDE the menu, not on top of it ───────────────────────────
 * "Save to playlist" and "Report" both replace the rows rather than opening a
 * second surface. Copied from the social menu, which copied it from the phone:
 * the two presses feel like one act with a change of mind possible in between,
 * and a dialog stacked on a menu is two dismissals deep for one thing.
 *
 * ── The ROWS live in ./cardMenu.ts and are tested there ───────────────────
 * Which rows exist, in which groups, for which viewer, is arithmetic. This
 * file is the keyboard, the focus and the network, none of which a table can
 * assert and all of which are checked by hand.
 *
 * ── Every row is a real route ─────────────────────────────────────────────
 *   Save to Watch later   GET /v1/creators/{me}/playlists  → POST /v1/playlists
 *                         → POST /v1/playlists/{id}/items  (../playlists/api.ts)
 *   Save to playlist      the same two writes, against a chosen list
 *   Save                  POST|DELETE /v1/posts/{id}/bookmark
 *   Share                 navigator.share, else the clipboard
 *   Not interested        POST /v1/feed/feedback {post_id, not_interested}
 *   Don't recommend       POST /v1/feed/feedback {author_id, not_interested}
 *   Report                POST /v1/reports
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  Bookmark,
  Check,
  ChevronLeft,
  Clock,
  Flag,
  ListPlus,
  Loader2,
  MoreVertical,
  Share2,
  ThumbsDown,
  UserX,
} from "lucide-react"
import { REPORT_REASONS, reportNeedsDetails, type ReportReason } from "@momentum/content"
import type { TubePlaylist } from "@/playlists/playlists"
import {
  cardMenuGroups,
  saveLabel,
  watchLaterLabel,
  type CardMenuRow,
  type CardMenuRowId,
} from "./cardMenu"

const ROW =
  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-mo-ink " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised focus:bg-mo-raised focus:outline-none"

const ICON = "h-[18px] w-[18px] shrink-0"

/** What the card hands in. Every handler is optional; absent means no row. */
export interface VideoCardMenuProps {
  /** For the accessible name, so a screen reader hears which video. */
  label: string
  isOwn?: boolean
  inWatchLater?: boolean
  isSaved?: boolean
  /** The viewer's playlists, for the "Save to playlist" step. */
  playlists?: readonly TubePlaylist[]
  playlistsLoading?: boolean
  onWatchLater?: () => Promise<void> | void
  onSaveToPlaylist?: (playlistId: string) => Promise<void> | void
  onCreatePlaylist?: (title: string) => Promise<void> | void
  onSaveBookmark?: () => Promise<void> | void
  onShare?: () => void
  onFeedback?: (target: "post" | "author") => void
  onReport?: (reason: ReportReason, details: string) => void
  /**
   * The menu is being opened.
   *
   * This is how the viewer's playlists and their Watch later contents get
   * fetched at all. Loading them on mount would be two requests on every page
   * with a grid on it, for a menu most visits never open; loading them here
   * means somebody who never presses the control never pays for it, and
   * somebody who does waits once. ./useCardActions.ts is the other half.
   */
  onOpen?: () => void
}

export function VideoCardMenu({
  label,
  isOwn = false,
  inWatchLater = false,
  isSaved = false,
  playlists = [],
  playlistsLoading = false,
  onWatchLater,
  onSaveToPlaylist,
  onCreatePlaylist,
  onSaveBookmark,
  onShare,
  onFeedback,
  onReport,
  onOpen,
}: VideoCardMenuProps) {
  const [open, setOpen] = useState(false)
  /** "rows" is the menu; the other two are the steps it walks into. */
  const [view, setView] = useState<"rows" | "playlists" | "report">("rows")
  const [pendingReason, setPendingReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [busy, setBusy] = useState(false)
  /** The transient confirmation, the phone's floating pill. */
  const [notice, setNotice] = useState("")

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setView("rows")
    setPendingReason(null)
    setDetails("")
    setNewTitle("")
    // Focus goes back where it came from. Without this a keyboard user is
    // returned to the top of the document every time they close a menu, which
    // in an infinite grid means losing their place entirely.
    triggerRef.current?.focus()
  }, [])

  /* ── Dismissal ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const node = event.target as Node
      if (panelRef.current?.contains(node)) return
      if (triggerRef.current?.contains(node)) return
      // Not `close()`: a click elsewhere on the page is going somewhere, and
      // yanking focus back to this trigger would fight it.
      setOpen(false)
      setView("rows")
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        close()
      }
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  /** Opening puts focus on the first row, which is what makes it a menu. */
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>("[data-menuitem]")?.focus()
  }, [open, view])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(""), 2_000)
    return () => window.clearTimeout(id)
  }, [notice])

  /**
   * Roving focus, held on the DOM rather than in state.
   *
   * The rows are re-rendered when the view changes, so a remembered index
   * would point at a row that is no longer there. Querying at the moment of
   * the key press cannot go stale. The arithmetic itself is `nextMenuIndex`
   * in ./cardMenu.ts, where it is tested; this reads the live list and applies
   * it.
   */
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("[data-menuitem]") ?? []
    )
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next = current
    if (key === "Home") next = 0
    else if (key === "End") next = items.length - 1
    else if (key === "ArrowDown") next = current < 0 || current >= items.length - 1 ? 0 : current + 1
    else next = current <= 0 ? items.length - 1 : current - 1
    items[next]?.focus()
  }, [])

  /* ── Rows ───────────────────────────────────────────────────────────────── */

  const groups = cardMenuGroups({
    isOwn,
    inWatchLater,
    isSaved,
    can: {
      watchLater: Boolean(onWatchLater),
      savePlaylist: Boolean(onSaveToPlaylist),
      saveBookmark: Boolean(onSaveBookmark),
      share: Boolean(onShare),
      feedback: Boolean(onFeedback),
      report: Boolean(onReport),
    },
  })

  // Nothing to offer is nothing to press. The trigger is not rendered rather
  // than rendered-and-empty, the same rule the action bar follows for a
  // control the author switched off.
  if (groups.length === 0) return null

  /**
   * Run a write, keep the menu open while it is in flight, and say what
   * happened.
   *
   * The menu stays open on purpose: a "Save to Watch later" that closed the
   * moment it was pressed would give somebody on a slow connection no idea
   * whether it worked, and the card underneath does not change to tell them.
   */
  const run = async (work: () => Promise<void> | void, done: string, failed: string) => {
    setBusy(true)
    try {
      await work()
      setNotice(done)
    } catch {
      setNotice(failed)
    } finally {
      setBusy(false)
    }
  }

  const activate = (id: CardMenuRowId) => {
    switch (id) {
      case "watch-later":
        void run(
          () => onWatchLater?.(),
          inWatchLater ? "Removed from Watch later" : "Saved to Watch later",
          "Watch later could not be changed"
        )
        break
      case "save-playlist":
        setView("playlists")
        break
      case "save-bookmark":
        void run(
          () => onSaveBookmark?.(),
          isSaved ? "Removed from Saved" : "Saved",
          "That could not be saved"
        )
        break
      case "share":
        onShare?.()
        close()
        break
      case "not-interested":
        onFeedback?.("post")
        close()
        break
      case "mute-channel":
        onFeedback?.("author")
        close()
        break
      case "report":
        setView("report")
        break
    }
  }

  const iconFor = (row: CardMenuRow) => {
    switch (row.id) {
      case "watch-later":
        return (
          <Clock
            aria-hidden="true"
            className={`${ICON} ${inWatchLater ? "text-mo-cyan" : ""}`}
          />
        )
      case "save-playlist":
        return <ListPlus aria-hidden="true" className={ICON} />
      case "save-bookmark":
        return (
          <Bookmark
            aria-hidden="true"
            className={`${ICON} ${isSaved ? "fill-current text-mo-cyan" : ""}`}
          />
        )
      case "share":
        return <Share2 aria-hidden="true" className={ICON} />
      case "not-interested":
        return <ThumbsDown aria-hidden="true" className={ICON} />
      case "mute-channel":
        return <UserX aria-hidden="true" className={ICON} />
      case "report":
        return <Flag aria-hidden="true" className={ICON} />
    }
  }

  const name = `More options for ${label}`

  /** The back row both steps carry, so neither is a one-way door. */
  const backRow = (to: string) => (
    <button
      type="button"
      role="menuitem"
      data-menuitem=""
      tabIndex={-1}
      onClick={() => {
        setView("rows")
        setPendingReason(null)
      }}
      className={`${ROW} font-semibold`}
    >
      <ChevronLeft aria-hidden="true" className={ICON} />
      <span className="flex-1">{to}</span>
    </button>
  )

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            close()
            return
          }
          setOpen(true)
          onOpen?.()
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={name}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
      >
        <MoreVertical aria-hidden="true" className="h-5 w-5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={name}
          onKeyDown={onKeyDown}
          // `--mo-overlay` is the token for exactly this — menus, tooltips,
          // popovers — and it needs the hairline and the shadow to read as a
          // layer above a card that is itself only 1.19:1 above the ground.
          className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-mo border border-mo bg-mo-overlay py-1 shadow-mo-lift"
        >
          {view === "rows" &&
            groups.map((group, index) => (
              <div key={group[0]?.id ?? index}>
                {index > 0 && <div role="separator" className="my-1 border-t border-mo" />}
                {group.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    role="menuitem"
                    data-menuitem=""
                    // Roving focus: only the focused item is in the tab order,
                    // so Tab leaves the menu rather than walking it.
                    tabIndex={-1}
                    disabled={busy}
                    onClick={() => activate(row.id)}
                    className={`${ROW} ${row.destructive ? "text-mo-bad" : ""} disabled:opacity-60`}
                  >
                    {iconFor(row)}
                    <span className="flex-1">
                      {row.id === "watch-later"
                        ? watchLaterLabel(inWatchLater)
                        : row.id === "save-bookmark"
                          ? saveLabel(isSaved)
                          : row.label}
                    </span>
                    {busy && <Loader2 aria-hidden="true" className={`${ICON} animate-spin`} />}
                  </button>
                ))}
              </div>
            ))}

          {view === "playlists" && (
            <div>
              {backRow("Save to playlist")}
              <div role="separator" className="my-1 border-t border-mo" />

              {playlistsLoading ? (
                <p className="px-3 py-2.5 text-sm text-mo-body">Loading your playlists…</p>
              ) : playlists.length === 0 ? (
                <p className="px-3 py-2 text-sm text-mo-body">
                  You have no playlists yet. Name one below and this video goes in it.
                </p>
              ) : (
                playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    role="menuitem"
                    data-menuitem=""
                    tabIndex={-1}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => onSaveToPlaylist?.(playlist.id),
                        `Saved to ${playlist.title}`,
                        "That could not be saved"
                      )
                    }
                    className={`${ROW} disabled:opacity-60`}
                  >
                    <ListPlus aria-hidden="true" className={ICON} />
                    <span className="flex-1 truncate">{playlist.title}</span>
                  </button>
                ))
              )}

              {onCreatePlaylist && (
                <>
                  <div role="separator" className="my-1 border-t border-mo" />
                  {/* A form, so Enter submits — a person typing a name and
                      pressing Enter expects the list to be made, and a lone
                      text field with a button beside it does not do that. */}
                  <form
                    className="flex items-center gap-2 px-3 py-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const title = newTitle.trim()
                      if (!title) return
                      void run(
                        async () => {
                          await onCreatePlaylist(title)
                          setNewTitle("")
                        },
                        `Saved to ${title}`,
                        "That playlist could not be created"
                      )
                    }}
                  >
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      maxLength={120}
                      aria-label="New playlist name"
                      placeholder="New playlist"
                      className="min-w-0 flex-1 rounded-mo-sm border border-mo bg-mo-sunken px-2 py-1.5 text-sm text-mo-ink outline-none placeholder:text-mo-body focus-visible:border-mo-focus"
                    />
                    <button
                      type="submit"
                      disabled={busy || newTitle.trim().length === 0}
                      className="shrink-0 rounded-mo-pill border border-mo-strong px-3 py-1.5 text-xs font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-50"
                    >
                      Create
                    </button>
                  </form>
                  {/* Stated once, where the choice is made. New playlists are
                      private by default — see createPlaylist in
                      ../playlists/api.ts for why that inverts the server's. */}
                  <p className="px-3 pb-2 text-xs leading-snug text-mo-body">
                    New playlists are private. You can change that on the
                    playlist itself.
                  </p>
                </>
              )}
            </div>
          )}

          {view === "report" && (
            <div>
              {backRow("Report this video")}
              <div role="separator" className="my-1 border-t border-mo" />
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={pendingReason === reason.value}
                  data-menuitem=""
                  tabIndex={-1}
                  onClick={() => {
                    // "Other" is the only reason that asks for words, exactly
                    // as the phone's sheet does. Everything else files at once.
                    if (reportNeedsDetails(reason.value)) {
                      setPendingReason(reason.value)
                      return
                    }
                    onReport?.(reason.value, "")
                    setNotice("Report sent")
                    setView("rows")
                  }}
                  className={ROW}
                >
                  <span className="flex-1">{reason.label}</span>
                  {pendingReason === reason.value && (
                    <Check aria-hidden="true" className={`${ICON} text-mo-cyan`} />
                  )}
                </button>
              ))}

              {pendingReason && reportNeedsDetails(pendingReason) && (
                <form
                  className="px-3 py-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onReport?.(pendingReason, details.trim())
                    setNotice("Report sent")
                    setDetails("")
                    setPendingReason(null)
                    setView("rows")
                  }}
                >
                  <label htmlFor={`${menuId}-details`} className="text-xs text-mo-body">
                    What is wrong with it?
                  </label>
                  <textarea
                    id={`${menuId}-details`}
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    rows={2}
                    maxLength={500}
                    className="mt-1 w-full rounded-mo-sm border border-mo bg-mo-sunken px-2 py-1.5 text-sm text-mo-ink outline-none focus-visible:border-mo-focus"
                  />
                  <button
                    type="submit"
                    className="mt-2 w-full rounded-mo-pill border border-mo-strong px-3 py-1.5 text-xs font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
                  >
                    Send report
                  </button>
                </form>
              )}
            </div>
          )}

          {/* `role="status"` and not a toast: the confirmation belongs where
              the act happened, and a screen reader hears it without the menu
              having to move focus to it. */}
          {notice && (
            <p role="status" className="border-t border-mo px-3 py-2 text-xs text-mo-body">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
