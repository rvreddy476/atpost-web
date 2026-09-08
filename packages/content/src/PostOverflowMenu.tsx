"use client"

/**
 * The "more" control, and everything behind it.
 *
 * ── What was missing ──────────────────────────────────────────────────────
 * There was no overflow on a web card at all. Every negative signal the
 * product has — not interested, don't recommend this account, report — lives
 * behind this control on the phone, so a feed without it is a feed a person
 * cannot steer and cannot report anything from. The rows are the phone's, from
 * `UsPostMoreState.kt`'s `rowGroups()`; which of them appear is computed in
 * `postMenu.ts` and tested there.
 *
 * ── A menu, where the phone has a bottom sheet ────────────────────────────
 * This is the one deliberate divergence and it is not a small one. Android
 * opens `UsPostMoreSheet`, a modal bottom sheet with 52dp rows. A bottom sheet
 * is the right answer for a thumb reaching up from the bottom of a phone; on a
 * desktop it is a panel that slides in from an edge nowhere near the control
 * you pressed, over a page that did not need covering.
 *
 * So on the web it is an anchored menu with the platform's own semantics —
 * `role="menu"`, arrow keys, Escape, focus returned to the trigger — because
 * that is what a cursor and a keyboard already know how to drive, and it is
 * what a screen reader will announce as a menu. The CONTENTS and the ORDER are
 * identical to the phone's, which is the part that has to match.
 *
 * ── Report steps INSIDE the menu ──────────────────────────────────────────
 * Also copied: choosing Report replaces the rows with the reason list rather
 * than opening a second surface. The phone does this so that the two taps feel
 * like one act with a change of mind possible in between, and a dialog on top
 * of a menu on the web would be two dismissals deep for the same thing.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  Bookmark,
  Check,
  ChevronLeft,
  Flag,
  Info,
  Link as LinkIcon,
  MoreVertical,
  Share2,
  ThumbsDown,
  ThumbsUp,
  UserX,
} from "lucide-react"
import {
  REPORT_REASONS,
  postMenuGroups,
  reportNeedsDetails,
  saveLabel,
  type PostMenuInput,
  type PostMenuRow,
  type PostMenuRowId,
  type ReportReason,
} from "./postMenu"

/**
 * `can` is deliberately NOT in here.
 *
 * Which rows are possible is a function of which handlers arrived, and asking
 * a caller to state that separately is asking it to keep two lists in step —
 * the classic way a menu grows a row that does nothing. It is derived below,
 * in one place, from the handlers themselves.
 */
export interface PostOverflowMenuProps extends Omit<PostMenuInput, "can"> {
  /** For the accessible name, so a screen reader hears which post. */
  label?: string
  /** The server's sentence for why this is here. Shown by the "why" row. */
  reasonText?: string
  isSaved?: boolean
  onSave?: () => void
  onCopyLink?: () => void
  onShare?: () => void
  /** "interested" and "not_interested" are the only signals the endpoint takes. */
  onFeedback?: (signal: "interested" | "not_interested", target: "post" | "author") => void
  onReport?: (reason: ReportReason, details: string) => void
}

/** One row of the menu. A real `menuitem`, so the keys below mean something. */
const ROW =
  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-mo-ink " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised focus:bg-mo-raised " +
  "focus:outline-none"

const ICON = "h-[18px] w-[18px] shrink-0"

export function PostOverflowMenu({
  label,
  reasonText,
  isSaved = false,
  onSave,
  onCopyLink,
  onShare,
  onFeedback,
  onReport,
  ...input
}: PostOverflowMenuProps) {
  const [open, setOpen] = useState(false)
  /** "rows" is the menu; "report" is the reason list it steps into. */
  const [view, setView] = useState<"rows" | "report">("rows")
  const [whyOpen, setWhyOpen] = useState(false)
  const [pendingReason, setPendingReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  /** The transient confirmations the phone shows as a floating pill. */
  const [notice, setNotice] = useState("")

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setView("rows")
    setWhyOpen(false)
    setPendingReason(null)
    setDetails("")
    // Focus goes back where it came from. Without this a keyboard user is
    // returned to the top of the document every time they close a menu, which
    // in an infinite feed means losing their place entirely.
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
    const first = panelRef.current?.querySelector<HTMLElement>("[data-menuitem]")
    first?.focus()
  }, [open, view])

  /** The transient "Link copied" pill. Cleared on unmount, never left behind. */
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(""), 2_000)
    return () => window.clearTimeout(id)
  }, [notice])

  /**
   * Roving focus, the ARIA menu convention.
   *
   * Held on the DOM rather than in state: the rows are re-rendered when the
   * view changes, and a remembered index would point at a row that is no
   * longer there. Querying at the moment of the key press cannot go stale.
   */
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return
    }
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-menuitem]") ?? [])
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    let next = current
    if (event.key === "Home") next = 0
    else if (event.key === "End") next = items.length - 1
    else if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length
    else next = current <= 0 ? items.length - 1 : current - 1
    items[next]?.focus()
  }, [])

  /* ── Rows ───────────────────────────────────────────────────────────────── */

  const groups = postMenuGroups({
    ...input,
    hasReason: input.hasReason && Boolean(reasonText),
    can: {
      save: Boolean(onSave),
      copyLink: Boolean(onCopyLink),
      share: Boolean(onShare),
      feedback: Boolean(onFeedback),
      report: Boolean(onReport),
    },
  })

  // Nothing to offer is nothing to press. The trigger is not rendered rather
  // than rendered-and-empty, for the same reason the action bar drops a
  // control the author switched off.
  if (groups.length === 0) return null

  const activate = (id: PostMenuRowId) => {
    switch (id) {
      case "why":
        // Unfolds in place, as it does on the phone. The menu stays open
        // because the sentence is the answer, not a destination.
        setWhyOpen((v) => !v)
        break
      case "save":
        onSave?.()
        close()
        break
      case "copy-link":
        onCopyLink?.()
        setNotice("Link copied")
        break
      case "share":
        onShare?.()
        close()
        break
      case "interested":
        onFeedback?.("interested", "post")
        close()
        break
      case "not-interested":
        onFeedback?.("not_interested", "post")
        close()
        break
      case "mute-author":
        onFeedback?.("not_interested", "author")
        close()
        break
      case "report":
        setView("report")
        break
    }
  }

  const iconFor = (row: PostMenuRow) => {
    switch (row.id) {
      case "why":
        return <Info aria-hidden="true" className={ICON} />
      case "save":
        return (
          <Bookmark
            aria-hidden="true"
            className={`${ICON} ${isSaved ? "fill-current text-mo-cyan" : ""}`}
          />
        )
      case "copy-link":
        return <LinkIcon aria-hidden="true" className={ICON} />
      case "share":
        return <Share2 aria-hidden="true" className={ICON} />
      case "interested":
        return <ThumbsUp aria-hidden="true" className={ICON} />
      case "not-interested":
        return <ThumbsDown aria-hidden="true" className={ICON} />
      case "mute-author":
        return <UserX aria-hidden="true" className={ICON} />
      case "report":
        return <Flag aria-hidden="true" className={ICON} />
    }
  }

  const suffix = label ? ` on ${label}` : ""

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`More${suffix}`}
        className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
      >
        <MoreVertical aria-hidden="true" className="h-5 w-5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={`More${suffix}`}
          onKeyDown={onKeyDown}
          // `--mo-overlay` is the token for exactly this — menus, tooltips,
          // popovers — and it needs the hairline and the shadow to read as a
          // layer above a card that is itself only 1.19:1 above the ground.
          className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-mo border border-mo bg-mo-overlay py-1 shadow-mo-lift"
        >
          {view === "rows" ? (
            groups.map((group, index) => (
              <div key={group[0]?.id ?? index}>
                {index > 0 && <div role="separator" className="my-1 border-t border-mo" />}
                {group.map((row) => (
                  <div key={row.id}>
                    <button
                      type="button"
                      role="menuitem"
                      data-menuitem=""
                      // Roving focus: only the focused item is in the tab
                      // order, so Tab leaves the menu rather than walking it.
                      tabIndex={-1}
                      onClick={() => activate(row.id)}
                      aria-expanded={row.id === "why" ? whyOpen : undefined}
                      className={`${ROW} ${row.destructive ? "text-mo-bad" : ""}`}
                    >
                      {iconFor(row)}
                      <span className="flex-1">{row.id === "save" ? saveLabel(isSaved) : row.label}</span>
                    </button>
                    {row.id === "why" && whyOpen && reasonText && (
                      <p className="px-3 pb-2.5 pl-[42px] text-xs leading-relaxed text-mo-body">
                        {reasonText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <ReportView
              pendingReason={pendingReason}
              details={details}
              onDetails={setDetails}
              onPick={setPendingReason}
              onBack={() => {
                setView("rows")
                setPendingReason(null)
                setDetails("")
              }}
              onSubmit={() => {
                if (!pendingReason) return
                onReport?.(pendingReason, details.trim())
                close()
              }}
            />
          )}

          {/*
            The phone's floating confirmation pill, in the place a menu can put
            one. `role="status"` rather than `alert`: worth hearing, but it
            must not interrupt what is already being read.
          */}
          {notice && (
            <p role="status" className="border-t border-mo px-3 py-2 text-xs text-mo-good">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The reason list, inside the same menu.
 *
 * Radio semantics rather than menu items: picking a reason does not do
 * anything yet — "Other" still has to be typed into and every choice has to be
 * confirmed — and a `menuitemradio` that silently filed a report on the first
 * press would be a one-key mistake with a person on the other end of it.
 */
function ReportView({
  pendingReason,
  details,
  onDetails,
  onPick,
  onBack,
  onSubmit,
}: {
  pendingReason: ReportReason | null
  details: string
  onDetails: (value: string) => void
  onPick: (reason: ReportReason) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const needsDetails = pendingReason !== null && reportNeedsDetails(pendingReason)
  const ready = pendingReason !== null && (!needsDetails || details.trim().length > 0)

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-mo px-2 py-1.5">
        <button
          type="button"
          role="menuitem"
          data-menuitem=""
          tabIndex={-1}
          onClick={onBack}
          aria-label="Back to the post menu"
          className="inline-flex h-7 w-7 items-center justify-center rounded-mo-pill text-mo-body hover:bg-mo-raised hover:text-mo-ink focus:bg-mo-raised focus:outline-none"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-mo-ink">Report this post</span>
      </div>

      <div role="radiogroup" aria-label="Reason" className="max-h-56 overflow-y-auto py-1">
        {REPORT_REASONS.map((reason) => {
          const chosen = pendingReason === reason.value
          return (
            <button
              key={reason.value}
              type="button"
              role="radio"
              aria-checked={chosen}
              data-menuitem=""
              tabIndex={-1}
              onClick={() => onPick(reason.value)}
              className={ROW}
            >
              <span className="flex-1">{reason.label}</span>
              {chosen && <Check aria-hidden="true" className={`${ICON} text-mo-cyan`} />}
            </button>
          )
        })}
      </div>

      {needsDetails && (
        <div className="border-t border-mo px-3 py-2">
          <label className="block text-xs text-mo-body" htmlFor="report-details">
            What happened?
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(event) => onDetails(event.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full resize-none rounded-mo-sm border border-mo bg-mo-sunken px-2 py-1.5 text-sm text-mo-ink placeholder:text-mo-muted-lg focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-mo"
            placeholder="Add a little detail"
          />
        </div>
      )}

      <div className="border-t border-mo p-2">
        <button
          type="button"
          data-menuitem=""
          tabIndex={-1}
          disabled={!ready}
          onClick={onSubmit}
          // The ember, and the only ember on a feed card. A report is a
          // deliberate act with a person on the other end, and the one moment
          // on this surface that earns the product's primary treatment.
          className="w-full rounded-mo-pill bg-mo-ember px-3 py-2 text-sm font-semibold text-mo-on-primary transition-opacity duration-150 ease-mo hover:bg-mo-ember-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
        >
          Submit report
        </button>
      </div>
    </div>
  )
}
