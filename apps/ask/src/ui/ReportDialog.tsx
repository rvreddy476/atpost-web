"use client"

import { useState } from "react"
import { Dialog, Textarea } from "@atpost/ui"
import { REPORT_REASONS, reportNeedsDetails, type ReportReason } from "@momentum/content"
import type { CreateReportRequest } from "@atpost/types/qa"
import { report } from "@/qa/api"
import { COPY } from "@/qa/copy"
import { errorMessage } from "@/qa/errors"
import { PILL_ACTION } from "./styles"

/**
 * Report a question, answer or comment: `POST /v1/qa/reports`. The reason
 * list is the product's one moderation taxonomy (@momentum/content), and
 * "Other" asks for words, as the phone's sheet does.
 */
export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  onReported,
}: {
  open: boolean
  onClose: () => void
  targetType: CreateReportRequest["target_type"]
  targetId: string
  onReported: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const needsWords = reason !== null && reportNeedsDetails(reason)
  const ready = reason !== null && (!needsWords || details.trim().length > 0) && !busy

  const submit = async () => {
    if (!ready || reason === null) return
    setBusy(true)
    setFailure(null)
    try {
      await report({ target_type: targetType, target_id: targetId, reason, details: details.trim() })
      setReason(null)
      setDetails("")
      onReported()
      onClose()
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`${COPY.reportTitle} ${targetType}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-4"
      >
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-mo-ink">{COPY.reportReasonLabel}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REPORT_REASONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-mo-sm px-2 py-1.5 text-sm text-mo-ink hover:bg-mo-raised">
                <input
                  type="radio"
                  name="ask-report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => setReason(option.value)}
                  className="accent-[rgb(var(--mo-cyan))]"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {reason !== null ? (
          <Textarea
            label={COPY.reportDetailsLabel}
            value={details}
            onChange={setDetails}
            required={needsWords}
            maxLength={1000}
            minRows={2}
          />
        ) : null}
        {failure ? (
          <p role="alert" className="text-sm text-mo-bad">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button type="submit" disabled={!ready} className={PILL_ACTION}>
            {busy ? "Sending…" : COPY.reportSubmit}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
