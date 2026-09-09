"use client"

/**
 * The chapter list — a video's table of contents, and a way into the middle.
 *
 * ── A list of BUTTONS, not links ──────────────────────────────────────────
 * A chapter does not navigate. It moves the playhead of a video that is already
 * playing, which is why `expand.ts` exists at all: a route change here would
 * tear down hls.js and split one measured view into two. `<button>` is what
 * that act is, it is in the tab order for free, and Enter and Space both work
 * without a keydown handler of our own.
 *
 * ── The active row is marked twice, on purpose ────────────────────────────
 * `aria-current="true"` for a screen reader and a visible band for everybody
 * else. Colour alone would not survive a monochrome display and would say
 * nothing at all to somebody who cannot see it — and "which chapter am I in" is
 * the one question this list exists to answer continuously.
 */

import { Play } from "lucide-react"
import type { Chapter } from "./api"
import { activeChapterIndex, chapterClock, chapterSeekMs } from "./timeline"

export interface ChaptersProps {
  chapters: Chapter[]
  positionMs: number
  durationMs: number
  onSeek: (ms: number) => void
  /** The fetch failed outright — say so instead of showing nothing. */
  unavailable?: boolean
  /** These rows are ./fixtures.ts, not the server's. Say that too. */
  isPreview?: boolean
}

export function Chapters({
  chapters,
  positionMs,
  durationMs,
  onSeek,
  unavailable,
  isPreview,
}: ChaptersProps) {
  // Nothing to say. A heading over an empty box is worse than no heading: it
  // tells somebody the video has a feature it does not have.
  if (chapters.length === 0 && !unavailable) return null

  const active = activeChapterIndex(chapters, positionMs)

  return (
    <section aria-labelledby="tube-chapters" className="mt-6">
      <div className="flex items-center gap-2">
        <h2
          id="tube-chapters"
          className="font-mo-display text-sm font-semibold tracking-mo-display text-mo-ink"
        >
          Chapters
        </h2>
        {isPreview && <PreviewBadge />}
      </div>

      {unavailable ? (
        /* Not "this video has no chapters" — we do not know that. The endpoint
           answered 500 (see ./api.ts: it does so for every post today), and
           saying the video has none would be inventing a fact from a failure. */
        <p className="mt-2 text-sm text-mo-body">Chapters could not be loaded.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-0.5">
          {chapters.map((chapter, index) => {
            const current = index === active
            return (
              <li key={`${chapter.chapter_index}-${chapter.start_ms}`}>
                <button
                  type="button"
                  onClick={() => onSeek(chapterSeekMs(chapter.start_ms, durationMs))}
                  aria-current={current ? "true" : undefined}
                  className={[
                    "group flex w-full items-center gap-3 rounded-mo px-2 py-2 text-left",
                    "transition-colors duration-150 ease-mo hover:bg-mo-raised",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan",
                    current ? "bg-mo-raised" : "",
                  ].join(" ")}
                >
                  {/* The thumbnail is drawn only when the row carries one.
                      `thumbnail_url` is nullable and nothing in the product
                      writes it, so a placeholder frame would be a grey box on
                      every chapter of every video. */}
                  {chapter.thumbnail_url ? (
                    /* `<img>` and not next/image: a chapter still is an
                       arbitrary absolute URL from the row, which next/image
                       would need a configured remote pattern for — and there is
                       no host list to configure, because nothing in the product
                       writes this field yet. The browse grid's card carries the
                       same decision for signed variant URLs. */
                    // eslint-disable-next-line @next/next/no-img-element -- see above.
                    <img
                      src={chapter.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="h-10 w-[72px] shrink-0 rounded-[4px] bg-mo-sunken object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className={[
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-mo-pill",
                        current ? "bg-mo-cyan/15 text-mo-cyan" : "text-mo-body",
                      ].join(" ")}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1 truncate text-sm text-mo-ink">
                    {chapter.title}
                  </span>

                  {/* Tabular figures so a column of timestamps lines up rather
                      than jittering as the digits change width. */}
                  <span className="shrink-0 font-mono text-xs tabular-nums text-mo-body">
                    {chapterClock(chapter.start_ms)}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/**
 * The badge that says "this is not real data".
 *
 * Shared by every surface that can draw fixtures. It is deliberately plain and
 * deliberately in the flow rather than a subtle tint: the failure it prevents
 * is a screenshot of invented content being read later as evidence that the
 * feature has data.
 */
export function PreviewBadge() {
  return (
    <span className="rounded-mo-pill border border-mo-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-mo-body">
      Sample data
    </span>
  )
}
