"use client"

/**
 * Step two: what the video IS. Title, description, cover, category, tags.
 *
 * This is the step the creator spends the upload's minutes on, which is the
 * whole reason the transfer starts before it. Nothing here blocks on the
 * upload and nothing here waits for it — the cover picker reads the LOCAL
 * file, so it works while the same bytes are still going out.
 *
 * ── Every field on this page is permanent ─────────────────────────────────
 * There is no post-update endpoint. The banner on ./StepSettings.tsx says so
 * where the consequences are worst; here the counters and the required marks
 * do the same job quietly, by making it hard to get to the end with something
 * missing.
 */

import { useCallback, useState } from "react"
import { X } from "lucide-react"
import { CoverPicker } from "./CoverPicker"
import {
  FALLBACK_CATEGORIES,
  LANGUAGE_OPTIONS,
  runeLength,
  SEO_TITLE_MAX,
  TAG_MAX_LENGTH,
  TAGS_MAX,
  TITLE_MAX,
  type DraftIssue,
  type VideoDraft,
} from "./fields"
import { SeriesField } from "./SeriesField"
import { StudioCard, StudioField, studioInputClass } from "./StudioControls"
import type { CoverStudio } from "./useCoverStudio"
import type { SeriesPicker } from "./useSeriesPicker"

interface Props {
  draft: VideoDraft
  patch: (change: Partial<VideoDraft>) => void
  issues: DraftIssue[]
  cover: CoverStudio
  categories: { id: string; label: string }[]
  series: SeriesPicker
}

export function StepDetails({ draft, patch, issues, cover, categories, series }: Props) {
  const errorFor = (field: string) => issues.find((i) => i.field === field)?.message ?? null
  const options = categories.length > 0 ? categories : FALLBACK_CATEGORIES

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <StudioCard title="Details">
          <div className="space-y-5">
            <StudioField
              label="Title"
              hint={`${runeLength(draft.title)}/${TITLE_MAX}`}
              error={errorFor("title")}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  className={studioInputClass}
                  value={draft.title}
                  placeholder="Title"
                  onChange={(e) => patch({ title: e.target.value })}
                  // NO maxLength. The browser counts UTF-16 units and the
                  // server counts code points, so a hard cap here would cut a
                  // 100-emoji title off at 50 — a title the server would have
                  // taken. The counter above uses `runeLength` and the
                  // validator refuses the real overrun.
                />
              )}
            </StudioField>

            <StudioField
              label="Description"
              description="What the video is about. Shown under the player."
            >
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  className={`${studioInputClass} min-h-32 resize-y`}
                  value={draft.description}
                  placeholder="Describe your video…"
                  onChange={(e) => patch({ description: e.target.value })}
                />
              )}
            </StudioField>

            <StudioField
              label="Search title"
              hint={`${runeLength(draft.seoTitle)}/${SEO_TITLE_MAX}`}
              error={errorFor("seoTitle")}
              description="Optional. Used where a shorter or plainer title reads better than yours."
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  className={studioInputClass}
                  value={draft.seoTitle}
                  onChange={(e) => patch({ seoTitle: e.target.value })}
                />
              )}
            </StudioField>
          </div>
        </StudioCard>

        <StudioCard
          title="Filing"
          description="How this video is found. The category is what the chip rail on the home grid filters by."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <StudioField label="Category" error={errorFor("category")}>
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  className={studioInputClass}
                  value={draft.category}
                  onChange={(e) => patch({ category: e.target.value })}
                >
                  <option value="">Required</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </StudioField>

            <StudioField label="Language">
              {({ id }) => (
                <select
                  id={id}
                  className={studioInputClass}
                  value={draft.language}
                  onChange={(e) => patch({ language: e.target.value })}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </StudioField>
          </div>

          <div className="mt-5">
            <TagsField
              tags={draft.tags}
              onChange={(tags) => patch({ tags })}
              error={errorFor("tags")}
            />
          </div>
        </StudioCard>

        <SeriesField draft={draft} patch={patch} series={series} error={errorFor("series")} />

        <StudioCard
          title="Where and when it was made"
          description="Optional. Shown on the video, and used by nothing else."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <StudioField label="Recording date">
              {({ id }) => (
                <input
                  id={id}
                  type="date"
                  className={studioInputClass}
                  value={draft.recordingDate}
                  onChange={(e) => patch({ recordingDate: e.target.value })}
                />
              )}
            </StudioField>
            <StudioField label="Recording location">
              {({ id }) => (
                <input
                  id={id}
                  className={studioInputClass}
                  value={draft.recordingLocation}
                  placeholder="Where was this?"
                  onChange={(e) => patch({ recordingLocation: e.target.value })}
                />
              )}
            </StudioField>
          </div>
        </StudioCard>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-mo border border-mo bg-mo-surface p-5 shadow-mo">
          <CoverPicker cover={cover} />
        </div>
      </div>
    </div>
  )
}

/* ── Tags ─────────────────────────────────────────────────────────────────── */

/**
 * ── Enter and comma both commit, and a stray `#` is stripped ──────────────
 * People type `#howto` because that is what a tag looks like on every other
 * platform, and they separate them with commas because that is what a list
 * looks like. Neither is wrong; both are normalised in ./fields.ts on the way
 * to the wire, and doing it here as well means what is on screen matches what
 * will be sent.
 */
function TagsField({
  tags,
  onChange,
  error,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  error: string | null
}) {
  const [entry, setEntry] = useState("")

  const commit = useCallback(
    (raw: string) => {
      const tag = raw.trim().replace(/^#+/, "").trim().slice(0, TAG_MAX_LENGTH)
      if (!tag) return
      if (tags.length >= TAGS_MAX) return
      if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return
      onChange([...tags, tag])
    },
    [onChange, tags]
  )

  const full = tags.length >= TAGS_MAX

  return (
    <StudioField label="Tags" hint={`${tags.length}/${TAGS_MAX}`} error={error}>
      {({ id, describedBy }) => (
        <div>
          {tags.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag}>
                  <span className="inline-flex items-center gap-1.5 rounded-mo-pill border border-mo bg-mo-raised py-1 pl-3 pr-1.5 text-xs text-mo-ink">
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      className="rounded-mo-pill p-0.5 text-mo-body hover:text-mo-ink"
                      onClick={() => onChange(tags.filter((t) => t !== tag))}
                    >
                      <X aria-hidden className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            id={id}
            aria-describedby={describedBy}
            className={studioInputClass}
            value={entry}
            disabled={full}
            placeholder={full ? "That's the limit" : "Add tags"}
            onChange={(e) => {
              const value = e.target.value
              if (value.includes(",")) {
                for (const part of value.split(",")) commit(part)
                setEntry("")
                return
              }
              setEntry(value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commit(entry)
                setEntry("")
              } else if (e.key === "Backspace" && entry === "" && tags.length > 0) {
                onChange(tags.slice(0, -1))
              }
            }}
            onBlur={() => {
              // Committed on blur too. A tag typed and left in the box when
              // somebody moves to the next step is a tag they meant to add,
              // and silently dropping it is the kind of loss nobody notices
              // until the video has no tags.
              commit(entry)
              setEntry("")
            }}
          />
        </div>
      )}
    </StudioField>
  )
}
