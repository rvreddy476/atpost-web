"use client"

/**
 * Choosing one of your own videos — the only way a target is ever set here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THERE IS NO RAW ID FIELD ON THIS SCREEN, AND THAT IS A CORRECTNESS DECISION
 *
 * `target_id` is not validated by the server in any way. `"not-a-uuid"`
 * answers `200 {"saved":1}` — verified — and a UUID for a post that does not
 * exist is equally accepted. Either way the watch page builds a link out of it
 * and somebody lands on a 404 wearing this app's chrome. A text field for an
 * id is a field whose most likely contents are wrong, and whose wrongness is
 * invisible until a viewer finds it.
 *
 * Picking from a list of the creator's own videos makes the whole class of
 * failure unreachable: every id this editor can write is one it read back from
 * the server minutes earlier.
 *
 * ── Which also bounds what can be linked, and that is said on screen ──────
 * You cannot link to somebody else's video from here, and you cannot link to
 * your own video from further back than `MAX_LIBRARY_PAGES`. The first is a
 * product decision worth making deliberately; the second is a limit of this
 * screen and the picker says so rather than appearing to be a complete list.
 *
 * ── No posters, and it is not an omission ─────────────────────────────────
 * These rows come from `GET /v1/posts/by-author`, which returns partly
 * hydrated posts: no `variants`, so `videoPoster` has nothing to read, and no
 * `blurhash` to soften the gap either. `fetchAuthorVideos` in
 * ../tube/channelApi.ts records the exact shortfall. A row is therefore a
 * title, a length and a date — which is enough to tell two of your own videos
 * apart, and is honest about what it knows.
 */

import { useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { relativeTime } from "@momentum/content"
import { chapterClock } from "@/watch/timeline"
import type { LibraryVideo } from "./useLinkEditor"

export interface VideoPickerProps {
  /** The videos to choose from. */
  videos: readonly LibraryVideo[]
  /** The chosen id, or "" for none. */
  value: string
  onChange: (video: LibraryVideo) => void
  onClear?: () => void
  /** Ids that must not be offered — the subject video, and already-used ones. */
  exclude?: readonly string[]
  /** The label the trigger announces. Required: several of these share a page. */
  label: string
  /** True when the list is known to be incomplete. */
  truncated?: boolean
  /** Shown when nothing is chosen. */
  placeholder?: string
}

export function VideoPicker({
  videos,
  value,
  onChange,
  onClear,
  exclude = [],
  label,
  truncated = false,
  placeholder = "Choose a video",
}: VideoPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const chosen = videos.find((v) => v.id === value) ?? null
  const excluded = useMemo(() => new Set(exclude), [exclude])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return videos
      .filter((v) => !excluded.has(v.id) || v.id === value)
      .filter((v) => !needle || v.title.toLowerCase().includes(needle))
  }, [videos, excluded, value, query])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((was) => !was)
          // Focus the search when opening, so a creator with twenty videos
          // types rather than scrolls. Deferred a frame because the input does
          // not exist until the panel renders.
          requestAnimationFrame(() => searchRef.current?.focus())
        }}
        aria-expanded={open}
        aria-label={chosen ? `${label}: ${chosen.title}. Change it.` : `${label}. ${placeholder}.`}
        className="flex w-full items-center justify-between gap-2 rounded-mo border border-mo bg-mo-surface px-3 py-2 text-left text-[14px] text-mo-ink transition-colors duration-150 ease-mo hover:border-mo-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <span className={chosen ? "truncate" : "truncate text-mo-body"}>
          {chosen?.title ?? placeholder}
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-mo-body" />
      </button>

      {chosen && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className="absolute right-9 top-1/2 -translate-y-1/2 rounded-mo p-1 text-mo-body transition-colors duration-150 ease-mo hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-mo border border-mo bg-mo-raised p-2 shadow-mo">
          <div className="flex items-center gap-2 rounded-mo border border-mo bg-mo-surface px-2 py-1.5">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-mo-body" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation()
                  setOpen(false)
                }
              }}
              placeholder="Search your videos"
              aria-label={`Search your videos for ${label}`}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-mo-ink outline-none placeholder:text-mo-body"
            />
          </div>

          <ul className="mt-2 max-h-64 overflow-y-auto" role="listbox" aria-label={label}>
            {results.length === 0 && (
              <li className="px-2 py-3 text-[13px] text-mo-body">
                {query.trim()
                  ? "None of your videos match that."
                  : "You have no other videos to link to yet."}
              </li>
            )}
            {results.map((video) => {
              const isChosen = video.id === value
              return (
                <li key={video.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isChosen}
                    onClick={() => {
                      onChange(video)
                      setOpen(false)
                      setQuery("")
                    }}
                    className="flex w-full items-start gap-2 rounded-mo px-2 py-2 text-left transition-colors duration-150 ease-mo hover:bg-mo-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
                  >
                    <span aria-hidden className="mt-0.5 w-4 shrink-0 text-mo-cyan">
                      {isChosen && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-mo-ink">{video.title}</span>
                      <span className="mt-0.5 block text-[12px] text-mo-body">
                        {/* "Length unknown" rather than "0:00": a post whose
                            media is still transcoding has no duration_ms
                            anywhere, and 0:00 would read as an empty video. */}
                        {video.durationMs > 0
                          ? chapterClock(video.durationMs)
                          : "Length unknown"}
                        {" · "}
                        {relativeTime(video.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {truncated && (
            <p className="mt-2 border-t border-mo px-2 pt-2 text-[12px] text-mo-body">
              This list is the most recent of your videos, not all of them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
