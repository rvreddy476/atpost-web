"use client"

/**
 * "Report", and the two presses behind it.
 *
 * One component, used in two places on the watch page — under the video and on
 * every comment — because a person who has learned the flow once should not
 * meet a second one a few hundred pixels down the page.
 *
 * ── Two steps INSIDE the control, not on top of it ────────────────────────
 * Picking a reason replaces the button with the list rather than opening a
 * dialog. Copied from ../menu/VideoCardMenu.tsx, which copied it from the
 * social menu, which copied it from the phone: the two presses feel like one
 * act with a change of mind possible in between, and a dialog stacked over a
 * playing video is one dismissal too many.
 *
 * ── Only "Other" asks for words ───────────────────────────────────────────
 * `reportNeedsDetails` is the phone's rule and the reasons are trust-safety-
 * service's own allowlist (`REPORT_REASONS`), not free text. A textarea on
 * every reason would ask somebody to explain "Spam".
 *
 * ── What it says afterwards ───────────────────────────────────────────────
 * "Reported" and nothing else. Not "we will review this within 24 hours",
 * which is a promise this surface cannot keep, and not a count of anything.
 * A second report of the same thing answers 409 ACTIVE_REPORT_EXISTS, which
 * the api layer reports as success — because an open report is the state the
 * person was trying to reach.
 */

import { useEffect, useRef, useState } from "react"
import { Check, ChevronLeft, Flag, Loader2 } from "lucide-react"
import { REPORT_REASONS, reportNeedsDetails, type ReportReason } from "@momentum/content"

export interface ReportControlProps {
  /** For the accessible name: "Report this comment", "Report this video". */
  label: string
  /** Already filed in this session — the control says so and does nothing. */
  reported?: boolean
  onReport: (reason: ReportReason, details: string) => Promise<boolean>
  /** `compact` is the comment row's; `default` is the action bar's. */
  size?: "compact" | "default"
}

const TRIGGER =
  "inline-flex min-h-11 items-center gap-1.5 rounded-mo-pill px-3 text-mo-body " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"

const REASON_ROW =
  "flex w-full items-center justify-between gap-3 rounded-mo px-3 py-2 text-left text-sm " +
  "text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"

export function ReportControl({
  label,
  reported = false,
  onReport,
  size = "default",
}: ReportControlProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(reported)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => setDone(reported), [reported])

  /**
   * Escape closes it and gives focus back.
   *
   * Without the second half, closing a panel leaves focus on a detached node
   * and the next Tab starts from the top of the document — on this page, that
   * is the whole of the left rail before you are back at the video.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const node = panelRef.current
    node?.addEventListener("keydown", onKey)
    return () => node?.removeEventListener("keydown", onKey)
  }, [open])

  const text = size === "compact" ? "text-xs" : "text-sm"

  if (done) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-mo-body ${text}`}>
        <Check aria-hidden className="h-3.5 w-3.5" />
        Reported
      </span>
    )
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true)
          setReason(null)
          setDetails("")
        }}
        className={`${TRIGGER} ${text}`}
      >
        <Flag aria-hidden className="h-3.5 w-3.5" />
        <span>Report</span>
        <span className="sr-only">{label}</span>
      </button>
    )
  }

  const needsWords = reason !== null && reportNeedsDetails(reason)

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={label}
      className="mt-2 w-full max-w-sm rounded-mo border border-mo bg-mo-overlay p-2 shadow-mo"
    >
      {reason === null ? (
        <>
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-mo-eyebrow text-mo-body">
            Why are you reporting this?
          </p>
          <ul className="flex flex-col">
            {REPORT_REASONS.map((row) => (
              <li key={row.value}>
                <button
                  type="button"
                  className={REASON_ROW}
                  onClick={() => {
                    setReason(row.value)
                    // A reason that needs no words is sent on this press. The
                    // second screen exists only for "Other".
                    if (!reportNeedsDetails(row.value)) {
                      setSending(true)
                      void onReport(row.value, "").then((ok) => {
                        setSending(false)
                        setOpen(false)
                        setDone(ok)
                        if (!ok) setReason(null)
                      })
                    }
                  }}
                >
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              triggerRef.current?.focus()
            }}
            className="mt-1 w-full rounded-mo px-3 py-2 text-left text-sm text-mo-body hover:bg-mo-raised"
          >
            Cancel
          </button>
        </>
      ) : (
        <div className="p-1">
          <button
            type="button"
            onClick={() => setReason(null)}
            className="mb-2 inline-flex items-center gap-1 text-sm text-mo-body hover:text-mo-ink"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            Back
          </button>
          {needsWords && (
            <label className="block">
              <span className="text-sm text-mo-ink">What is wrong with it?</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full resize-y rounded-mo bg-mo-sunken p-2 text-sm text-mo-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
              />
            </label>
          )}
          <button
            type="button"
            disabled={sending || (needsWords && details.trim().length === 0)}
            onClick={() => {
              setSending(true)
              void onReport(reason, details.trim()).then((ok) => {
                setSending(false)
                setOpen(false)
                setDone(ok)
                if (!ok) setReason(null)
              })
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan hover:bg-mo-raised disabled:opacity-60"
          >
            {sending && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            Send report
          </button>
        </div>
      )}
    </div>
  )
}
