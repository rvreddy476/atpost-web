"use client"

/**
 * The "…" menu, and the report flow behind it.
 *
 * ── A sheet, not a popover, and the reason is the scroller ────────────────
 * Every short is `overflow-hidden` — it has to be, or a caption would bleed
 * into the next one — so a panel anchored to a button inside it is clipped by
 * its own parent. Portalling out would fix the clipping and reintroduce the
 * harder problem: the anchor is inside a snap scroller, so the menu would have
 * to track an element that moves under a flick. A sheet owned by the viewer
 * has neither problem, and on a full-screen surface it is also the shape the
 * founder's references use.
 *
 * ── Report is a second view of the same sheet, not a second sheet ─────────
 * Stepping into the reason list in place keeps one dialog, one focus trap and
 * one Escape. Two stacked dialogs is where focus restoration stops being
 * describable.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { REPORT_REASONS, reportNeedsDetails, type ReportReason } from "@momentum/content"
import { reelMenuGroups, type ReelMenuRowId } from "./menu"

const FOCUSABLE = 'button:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface ReelMenuProps {
  open: boolean
  onClose: () => void
  /** Names the sheet, so a screen reader hears which short it is about. */
  label: string
  isOwn: boolean
  canWrite: boolean
  onRow: (row: Exclude<ReelMenuRowId, "report">) => void
  onReport: (reason: ReportReason, details: string) => void
}

export function ReelMenu({
  open,
  onClose,
  label,
  isOwn,
  canWrite,
  onRow,
  onReport,
}: ReelMenuProps) {
  const [view, setView] = useState<"rows" | "report">("rows")
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    setView("rows")
    setReason(null)
    setDetails("")
    const focus = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    }, 0)
    return () => {
      window.clearTimeout(focus)
      // Back to the "…" that opened it. Restoring the ELEMENT rather than
      // looking one up is what makes this right whichever short it was.
      restoreFocus.current?.focus?.()
    }
  }, [open])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Every letter on the surface behind this is a shortcut. Nothing typed
      // in here may reach it.
      event.stopPropagation()
      if (event.key === "Escape") {
        event.preventDefault()
        // Escape from the reason list goes BACK, not out. Somebody three taps
        // into a report has not asked to abandon it.
        if (view === "report") setView("rows")
        else onClose()
        return
      }
      if (event.key !== "Tab") return
      const root = panelRef.current
      if (!root) return
      const stops = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (stops.length === 0) return
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose, view]
  )

  if (!open) return null

  const groups = reelMenuGroups({ isOwn, canWrite })

  return (
    <>
      {/* The scrim closes it, which is the gesture people try first on a sheet.
          It is also what stops a press landing on the video underneath and
          pausing it on the way out. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 z-40 cursor-default bg-black/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={[
          "absolute z-50 flex max-h-[70%] flex-col overflow-hidden bg-mo-surface shadow-mo-lift",
          "inset-x-0 bottom-0 rounded-t-mo-lg border-t border-mo",
          // On a wide window it settles into a card in the middle rather than
          // stretching a four-row menu across 1400px.
          "md:inset-x-auto md:bottom-1/2 md:left-1/2 md:w-[360px] md:-translate-x-1/2 md:translate-y-1/2 md:rounded-mo-lg md:border",
        ].join(" ")}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-mo px-2 py-2">
          {view === "report" && (
            <button
              type="button"
              onClick={() => setView("rows")}
              aria-label="Back"
              className="inline-flex h-8 w-8 items-center justify-center rounded-mo-pill text-mo-body hover:bg-mo-raised hover:text-mo-ink"
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
          )}
          <h2 id={titleId} className="px-2 text-sm font-semibold text-mo-ink">
            {view === "report" ? "Why are you reporting this?" : "More"}
            <span className="sr-only"> — {label}</span>
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {view === "rows" ? (
            groups.map((group, at) => (
              <div key={at} className={at > 0 ? "border-t border-mo" : undefined}>
                {group.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      if (row.id === "report") {
                        setView("report")
                        return
                      }
                      onRow(row.id)
                      onClose()
                    }}
                    className={[
                      "flex w-full items-center px-4 py-3 text-left text-sm font-medium",
                      "transition-colors duration-150 ease-mo hover:bg-mo-raised focus:bg-mo-raised focus:outline-none",
                      row.destructive ? "text-mo-bad" : "text-mo-ink",
                    ].join(" ")}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            ))
          ) : (
            <>
              {REPORT_REASONS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => {
                    // Some reasons are useless to a moderator without a
                    // sentence — `reportNeedsDetails` is the server's own list
                    // — so those step to a box instead of filing immediately.
                    if (reportNeedsDetails(entry.value)) {
                      setReason(entry.value)
                      return
                    }
                    onReport(entry.value, "")
                    onClose()
                  }}
                  aria-pressed={reason === entry.value}
                  className={[
                    "flex w-full items-center px-4 py-3 text-left text-sm font-medium text-mo-ink",
                    "transition-colors duration-150 ease-mo hover:bg-mo-raised focus:bg-mo-raised focus:outline-none",
                    reason === entry.value ? "bg-mo-raised" : "",
                  ].join(" ")}
                >
                  {entry.label}
                </button>
              ))}

              {reason && (
                <div className="border-t border-mo p-4">
                  <label className="block text-xs font-semibold text-mo-body" htmlFor={`${titleId}-details`}>
                    Tell us a little more
                  </label>
                  <textarea
                    id={`${titleId}-details`}
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-mo border border-mo bg-mo-sunken px-3 py-2 text-sm text-mo-ink focus:border-mo-focus focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onReport(reason, details.trim())
                      onClose()
                    }}
                    disabled={details.trim().length === 0}
                    className="mt-3 w-full rounded-mo-pill bg-mo-raised px-4 py-2 text-sm font-semibold text-mo-bad hover:bg-mo-sunken disabled:text-mo-body"
                  >
                    Send report
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
