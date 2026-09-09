"use client"

/**
 * Step three: who can see it, what it declares, and when it goes live.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BANNER AT THE TOP OF THIS STEP IS THE MOST IMPORTANT SENTENCE IN THE
 * STUDIO.
 *
 * There is no post-update endpoint on this gateway. Not a restricted one, not
 * one behind a scope — none. `PATCH /v1/videos/{id}/category` moves a single
 * column and nothing moves the rest. So every control on this page is a
 * one-shot decision, and a creator who ticks the wrong compliance box fixes it
 * by deleting the video and uploading it again.
 *
 * Saying that out loud costs one line and saves somebody a re-upload. Leaving
 * it out would be building a settings page that behaves like every other
 * settings page they have ever used and is not one.
 *
 * ── What is NOT on this page, and why ─────────────────────────────────────
 * `access`, `required_tier_id`, `premiere_at` and `is_branded` are real
 * columns that accept no value from a client — a control for any of them
 * would move nothing. And AGE RESTRICTION does not exist anywhere in this
 * codebase: it is not modelled, not stored, not enforced. A checkbox claiming
 * to age-restrict a video would be worse than no checkbox, because a creator
 * would rely on it and a fourteen-year-old would watch the video.
 */

import { AlertTriangle } from "lucide-react"
import {
  COMMENT_ACCESS_OPTIONS,
  COMMENT_MODERATION_OPTIONS,
  LICENSE_OPTIONS,
  REMIX_OPTIONS,
  VISIBILITY_OPTIONS,
  type DraftIssue,
  type ScheduleMode,
  type VideoDraft,
  type Visibility,
} from "./fields"
import {
  StudioCard,
  StudioField,
  studioInputClass,
  StudioRadioGroup,
  StudioSwitch,
} from "./StudioControls"

interface Props {
  draft: VideoDraft
  patch: (change: Partial<VideoDraft>) => void
  issues: DraftIssue[]
}

export function StepSettings({ draft, patch, issues }: Props) {
  const errorFor = (field: string) => issues.find((i) => i.field === field)?.message ?? null

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-mo border border-mo-strong bg-mo-raised p-4">
        <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mo-warn" />
        <p className="text-sm text-mo-body">
          <span className="font-semibold text-mo-ink">These cannot be changed later.</span> Momentum
          has no way to edit a video&apos;s audience, declarations or interaction settings after it
          is posted — changing any of them means deleting the video and uploading it again.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <StudioCard title="Audience">
          <StudioRadioGroup<Visibility>
            legend="Who can watch this"
            options={VISIBILITY_OPTIONS}
            value={draft.visibility}
            onChange={(visibility) => patch({ visibility })}
          />
          {/*
            The publish call is `UPDATE posts SET visibility='public'`. If
            somebody picks a narrower audience the studio does NOT call it —
            see `publishAction` — and this is where that is stated, next to
            the choice it affects, rather than left as a surprise on the
            review step.
          */}
          {draft.visibility !== "public" && draft.scheduleMode === "now" ? (
            <p className="mt-3 text-xs text-mo-body">
              This video will be posted at this audience and will not be made public.
            </p>
          ) : null}
        </StudioCard>

        <StudioCard
          title="Declarations"
          description="Momentum and the law both need these answered honestly."
        >
          <div className="space-y-5">
            <StudioRadioGroup<"yes" | "no">
              legend="Is this made for children?"
              description="Videos made for children are treated differently across the platform. This is a declaration you are making, not a guess the studio makes for you."
              options={[
                { value: "yes", label: "Yes, it is made for children" },
                { value: "no", label: "No, it is not made for children" },
              ]}
              value={draft.madeForKids === null ? null : draft.madeForKids ? "yes" : "no"}
              onChange={(next) => patch({ madeForKids: next === "yes" })}
              error={errorFor("madeForKids")}
            />

            <div className="divide-y divide-mo border-t border-mo pt-1">
              <StudioSwitch
                label="Contains paid promotion"
                description="A sponsorship, a product placement, or anything else you were paid for."
                checked={draft.paidPromotion}
                onChange={(paidPromotion) => patch({ paidPromotion })}
              />
              <StudioSwitch
                label="Contains altered or synthetic content"
                description="Realistic footage that was generated or materially edited — including AI."
                checked={draft.alteredContent}
                onChange={(alteredContent) => patch({ alteredContent })}
              />
            </div>

            <StudioField label="Licence">
              {({ id }) => (
                <select
                  id={id}
                  className={studioInputClass}
                  value={draft.license}
                  onChange={(e) => patch({ license: e.target.value })}
                >
                  {LICENSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </StudioField>
          </div>
        </StudioCard>

        <StudioCard title="Interaction">
          <div className="divide-y divide-mo">
            {/* The four the phone has, in the phone's words. */}
            <StudioSwitch
              label="Allow comments"
              checked={draft.allowComments}
              onChange={(allowComments) => patch({ allowComments })}
            />
            <StudioSwitch
              label="Allow likes"
              checked={draft.allowLikes}
              onChange={(allowLikes) => patch({ allowLikes })}
            />
            <StudioSwitch
              label="Hide share button"
              checked={draft.hideShare}
              onChange={(hideShare) => patch({ hideShare })}
            />
            <StudioSwitch
              label="Allow download"
              checked={draft.allowDownload}
              onChange={(allowDownload) => patch({ allowDownload })}
            />
            <StudioSwitch
              label="Allow embedding"
              description="Let this video play on other sites."
              checked={draft.allowEmbedding}
              onChange={(allowEmbedding) => patch({ allowEmbedding })}
            />
            <StudioSwitch
              label="Show in the main feed"
              description="Off keeps it on your channel and out of the home timeline."
              checked={draft.publishToFeed}
              onChange={(publishToFeed) => patch({ publishToFeed })}
            />
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <StudioField label="Who can comment">
              {({ id }) => (
                <select
                  id={id}
                  className={studioInputClass}
                  value={draft.commentAccess}
                  disabled={!draft.allowComments}
                  onChange={(e) => patch({ commentAccess: e.target.value })}
                >
                  {COMMENT_ACCESS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </StudioField>
            <StudioField label="Comment moderation">
              {({ id }) => (
                <select
                  id={id}
                  className={studioInputClass}
                  value={draft.commentModeration}
                  disabled={!draft.allowComments}
                  onChange={(e) => patch({ commentModeration: e.target.value })}
                >
                  {COMMENT_MODERATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </StudioField>
            <StudioField label="Remixing">
              {({ id }) => (
                <select
                  id={id}
                  className={studioInputClass}
                  value={draft.remixSetting}
                  onChange={(e) => patch({ remixSetting: e.target.value })}
                >
                  {REMIX_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </StudioField>
          </div>
        </StudioCard>

        <StudioCard title="When it goes live">
          <StudioRadioGroup<ScheduleMode>
            legend="Publishing"
            options={[
              { value: "now", label: "Post now" },
              { value: "at", label: "Schedule", hint: "Up to 30 days ahead." },
            ]}
            value={draft.scheduleMode}
            onChange={(scheduleMode) => patch({ scheduleMode })}
          />
          {draft.scheduleMode === "at" ? (
            <div className="mt-4">
              <StudioField
                label="Date and time"
                error={errorFor("scheduleAt")}
                description="At least 5 minutes from now, and within the next 30 days. Your own time zone."
              >
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    type="datetime-local"
                    className={studioInputClass}
                    value={draft.scheduleAt}
                    onChange={(e) => patch({ scheduleAt: e.target.value })}
                  />
                )}
              </StudioField>
            </div>
          ) : null}
        </StudioCard>
      </div>
    </div>
  )
}
