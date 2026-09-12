"use client"

/**
 * Step four: the last look, and the button.
 *
 * ── A review step exists here for one reason ──────────────────────────────
 * Every field is permanent. On a form whose mistakes are fixable a review
 * step is friction; on one whose mistakes are not, it is the only place the
 * whole decision is visible at once. So this restates the audience, the two
 * declarations, the schedule and the cover — the four things that cannot be
 * corrected and would be expensive to get wrong — and does not restate the
 * description, which is long and harmless.
 *
 * ── Publish is disabled until the ASSET is ready, not until the form is ───
 * `canPublish(state)` is the whole gate on the media side, and it is `phase
 * === "ready"` and nothing else. The form's own validity is a separate
 * question with a separate message, because the two fail differently: an
 * invalid form is fixed in two seconds and a transcode is fixed by waiting.
 * Collapsing them into one disabled button would tell somebody to "wait for
 * processing" when what is actually wrong is that they have not picked a
 * category.
 */

import { Loader2 } from "lucide-react"
import {
  publishButtonLabel,
  publishSummary,
  type DraftIssue,
  type VideoDraft,
  VISIBILITY_OPTIONS,
} from "./fields"
import { canPublish, type UploadState } from "./machine"
import type { CoverStudio } from "./useCoverStudio"

interface Props {
  draft: VideoDraft
  issues: DraftIssue[]
  state: UploadState
  cover: CoverStudio
  publishing: boolean
  publishError: string | null
  /** The chosen series' name, when the draft names one and the list has it. */
  seriesTitle: string | null
  onPublish: () => void
  onGoToStep: (step: "details" | "settings") => void
}

export function StepReview({
  draft,
  issues,
  state,
  cover,
  publishing,
  publishError,
  seriesTitle,
  onPublish,
  onGoToStep,
}: Props) {
  const assetReady = canPublish(state)
  const formValid = issues.length === 0
  const audience =
    VISIBILITY_OPTIONS.find((o) => o.value === draft.visibility)?.label ?? draft.visibility

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="rounded-mo border border-mo bg-mo-surface p-5 shadow-mo">
          <h3 className="font-mo-display text-sm uppercase tracking-mo-eyebrow text-mo-body">
            Ready to post
          </h3>
          <p className="mt-3 font-mo-display text-xl tracking-mo-display text-mo-ink">
            {draft.title.trim() || "Untitled"}
          </p>
          <p className="mt-2 text-sm text-mo-body">{publishSummary(draft)}</p>

          <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="Audience" value={audience} />
            <Row
              label="Made for children"
              value={
                draft.madeForKids === null
                  ? "Not answered"
                  : draft.madeForKids
                    ? "Yes"
                    : "No"
              }
              tone={draft.madeForKids === null ? "bad" : "normal"}
            />
            <Row label="Paid promotion" value={draft.paidPromotion ? "Declared" : "None"} />
            <Row label="Altered content" value={draft.alteredContent ? "Declared" : "None"} />
            <Row label="Category" value={draft.category || "Not chosen"} tone={draft.category ? "normal" : "bad"} />
            {/* Restated here although it is the one thing on this page that
                IS fixable later, because the episode write happens after the
                post and a wrong number replaces somebody's episode. */}
            <Row
              label="Series"
              value={
                draft.seriesId
                  ? `Episode ${draft.seriesEpisodeNum ?? "?"} of ${seriesTitle ?? "the series"}`
                  : "Not in a series"
              }
            />
            <Row
              label="Cover"
              value={
                cover.uploading
                  ? "Uploading"
                  : cover.mediaId
                    ? cover.source === "upload"
                      ? "Uploaded image"
                      : "Frame from the video"
                    : "Generated from the video"
              }
            />
          </dl>

          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <button
              type="button"
              className="text-mo-body underline underline-offset-2 hover:text-mo-ink"
              onClick={() => onGoToStep("details")}
            >
              Edit details
            </button>
            <button
              type="button"
              className="text-mo-body underline underline-offset-2 hover:text-mo-ink"
              onClick={() => onGoToStep("settings")}
            >
              Edit visibility and compliance
            </button>
          </div>
        </section>

        {/* The two blockers, named separately because they are fixed
            differently. */}
        {!formValid ? (
          <section
            className="rounded-mo border border-mo-bad/60 bg-mo-surface p-5"
            aria-labelledby="blockers"
          >
            <h3 id="blockers" className="text-sm font-semibold text-mo-ink">
              {issues.length === 1 ? "One thing left" : `${issues.length} things left`}
            </h3>
            <ul className="mt-2 space-y-1">
              {issues.map((issue) => (
                <li key={issue.field} className="text-sm text-mo-bad">
                  <button
                    type="button"
                    className="text-left underline underline-offset-2"
                    onClick={() =>
                      onGoToStep(issue.step === "settings" ? "settings" : "details")
                    }
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {formValid && !assetReady && state.phase !== "failed" ? (
          <p className="text-sm text-mo-body">
            Everything is filled in. Posting unlocks the moment the video finishes processing.
          </p>
        ) : null}

        {publishError ? (
          <p role="alert" className="text-sm text-mo-bad">
            {publishError}
          </p>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3 rounded-mo border border-mo bg-mo-surface p-5 shadow-mo">
          {cover.previewUrl ? (
            /* A local data:/blob: URL from this browser's own canvas — see
               ./CoverPicker.tsx for why next/image cannot help with one. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.previewUrl}
              alt=""
              className="aspect-video w-full rounded-mo object-cover"
            />
          ) : (
            <div className="aspect-video w-full rounded-mo bg-mo-sunken" />
          )}
          <button
            type="button"
            className="mo-btn-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-mo-pill px-6"
            disabled={!assetReady || !formValid || publishing || cover.uploading}
            onClick={onPublish}
          >
            {publishing ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            {publishButtonLabel(draft)}
          </button>
          <p className="text-center text-xs text-mo-body">
            {/*
              One sentence, and it names the ACTUAL blocker rather than a
              generic "complete the form". Order matters: the asset is the
              slow one, so a form problem is mentioned first because it is the
              one somebody can act on right now.
            */}
            {!formValid
              ? "Fix the items on the left first."
              : cover.uploading
                ? "Waiting for the cover to finish uploading."
                : !assetReady
                  ? state.phase === "failed"
                    ? "This upload cannot be posted."
                    : "Waiting for the video to finish processing."
                  : publishSummary(draft)}
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone = "normal",
}: {
  label: string
  value: string
  tone?: "normal" | "bad"
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-mo-eyebrow text-mo-body">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm ${tone === "bad" ? "text-mo-bad" : "text-mo-ink"}`}>
        {value}
      </dd>
    </div>
  )
}
