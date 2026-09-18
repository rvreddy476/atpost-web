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

import { useId } from "react"
import { CoverPicker } from "./CoverPicker"
import {
  FALLBACK_CATEGORIES,
  HASHTAG_MAX_LENGTH,
  HASHTAGS_MAX,
  LANGUAGE_OPTIONS,
  MENTION_MAX_LENGTH,
  MENTIONS_MAX,
  normaliseCategory,
  normaliseHashtag,
  normaliseMention,
  runeLength,
  SEO_TITLE_MAX,
  TAG_MAX_LENGTH,
  TAGS_MAX,
  TITLE_MAX,
  type DraftIssue,
  type VideoDraft,
} from "./fields"
import { SeriesField } from "./SeriesField"
import {
  StudioCard,
  StudioChipInput,
  StudioField,
  studioInputClass,
} from "./StudioControls"
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
            <CategoryField
              value={draft.category}
              options={options}
              error={errorFor("category")}
              onChange={(category) => patch({ category })}
            />

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

          <div className="mt-5 space-y-5">
            <StudioChipInput
              label="Tags"
              description="Words that describe the video. They are not shown on it."
              placeholder="Add a tag"
              values={draft.tags}
              max={TAGS_MAX}
              onChange={(tags) => patch({ tags })}
              normalise={normaliseTagEntry}
              rejection={`A tag is up to ${TAG_MAX_LENGTH} characters.`}
              error={errorFor("tags")}
            />

            <StudioChipInput
              label="Hashtags"
              description="Shown on the video and on their own hashtag pages. A # typed into the description counts too."
              placeholder="Add a hashtag"
              prefix="#"
              values={draft.hashtags}
              max={HASHTAGS_MAX}
              onChange={(hashtags) => patch({ hashtags })}
              normalise={normaliseHashtag}
              rejection={`Letters, digits and underscores only, up to ${HASHTAG_MAX_LENGTH} characters.`}
              error={errorFor("hashtags")}
            />

            <StudioChipInput
              label="Mentions"
              description="Usernames to notify when this goes live."
              placeholder="Add a username"
              prefix="@"
              values={draft.mentions}
              max={MENTIONS_MAX}
              onChange={(mentions) => patch({ mentions })}
              normalise={normaliseMention}
              rejection={`Letters, digits, dots and underscores only, up to ${MENTION_MAX_LENGTH} characters.`}
              error={errorFor("mentions")}
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
 * A tag, as the wire will carry it: `#` dropped, trimmed, truncated.
 *
 * TRUNCATED rather than refused, unlike a hashtag, and the difference is the
 * server's. `tags` is `binding:"max=20,dive,max=50"` on a plain string — no
 * alphabet, so nothing about a tag can be *wrong*, only long — while a
 * hashtag outside `^[\p{L}\p{M}\p{N}_]+$` is a 400 for the whole create. So a
 * long tag is quietly shortened and a malformed hashtag is handed back.
 */
function normaliseTagEntry(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "").trim().slice(0, TAG_MAX_LENGTH)
  return tag || null
}

/* ── Category ─────────────────────────────────────────────────────────────── */

/**
 * The taxonomy as a list, and anything else as text.
 *
 * ── A `<datalist>` combobox, not a `<select>` and not a bare input ────────
 * `resolveCreateCategory` holds a FLICK to the closed taxonomy and lets a
 * LONG VIDEO carry free text — so a select would refuse values the server
 * takes, and a bare text box would refill `posts.category` with the four
 * spellings of "tech" that migration 047 was written to clean up. A native
 * combobox is both: the eighteen ids are one keystroke away, and somebody with
 * a genuinely different subject can type it.
 *
 * No custom listbox, no portal, no keyboard handling of our own. `<datalist>`
 * is one element, it is announced correctly, it works on a phone, and the
 * filtering is the browser's.
 *
 * ── It normalises as you type, and shows you the result ───────────────────
 * `NormalizeCategory` runs server-side on every write. Typing "Home Repair"
 * and storing `home-repair` without saying so is a form that lies about its
 * own value, so the box holds the normalised text and the hint under it names
 * the rule. Typing is still comfortable: a space becomes a hyphen as it is
 * typed, which is the same keystroke count and no surprise at the end.
 */
function CategoryField({
  value,
  options,
  error,
  onChange,
}: {
  value: string
  options: { id: string; label: string }[]
  error: string | null
  onChange: (next: string) => void
}) {
  const listId = useId()
  const known = options.find((o) => o.id === value)

  return (
    <StudioField
      label="Category"
      error={error}
      description={
        known
          ? `Filed under ${known.label}.`
          : value
            ? `Filed under "${value}" — your own category, stored exactly like this.`
            : "Pick one, or type your own. Lower case, and spaces become hyphens."
      }
    >
      {({ id, describedBy }) => (
        <>
          <input
            id={id}
            aria-describedby={describedBy}
            list={listId}
            className={studioInputClass}
            value={value}
            placeholder="Required"
            autoComplete="off"
            // Not `normaliseCategory` directly: it trims, so typing a space
            // between two words would delete the space and glue them
            // together as the next letter arrived. Whitespace becomes the
            // hyphen immediately — same keystroke, visible result — and the
            // trim happens on blur, where nothing is mid-word.
            onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            onBlur={(e) => onChange(normaliseCategory(e.target.value).replace(/^-+|-+$/g, ""))}
          />
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </datalist>
        </>
      )}
    </StudioField>
  )
}
