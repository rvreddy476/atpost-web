"use client"

/**
 * The description panel.
 *
 * It was four clamped lines of plain text with a "Show more". Two things were
 * missing from that and both of them are the reason a long video HAS a
 * description: the chapter list somebody typed by hand was not clickable, and
 * the tags and links in it were not either.
 *
 * ── The control is a <button>, and the panel is not one ───────────────────
 * The whole panel is clickable on YouTube and that is a genuinely bad idea
 * here: the text now contains controls of its own — timestamps, hashtags,
 * links — so a click handler on the container would fire on every press of
 * every one of them, and collapsing the panel under somebody's finger as they
 * seek is a page fighting them. One explicit control, in the tab order, which
 * is also the only way it is reachable by keyboard.
 *
 * ── `line-clamp` rather than a height ─────────────────────────────────────
 * A pixel height has to guess the line height and is wrong at every other font
 * size; `line-clamp-4` counts lines, which is what "four lines" means. The
 * trade is that it cannot animate, and an animated reveal of an arbitrary
 * amount of text is a jump either way.
 *
 * ── The first line stays visible while it is collapsed ────────────────────
 * Which it does for free: the clamp keeps the first four lines, and a
 * description that begins with its chapter list therefore shows its first
 * chapters as working controls before anybody expands anything.
 */

import { useState } from "react"
import { RichText } from "./RichText"

export interface DescriptionProps {
  text: string
  /** The video's length, so a number past the end stays text. See linkify.ts. */
  durationMs: number
  onSeek: (ms: number) => void
  /** The meta line the panel carries at its top — views and the date. */
  meta?: React.ReactNode
}

export function Description({ text, durationMs, onSeek, meta }: DescriptionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-5 rounded-mo bg-mo-surface p-4">
      {meta && <div className="mb-2 text-sm font-semibold text-mo-ink">{meta}</div>}

      {/* `whitespace-pre-wrap` because an author's paragraph breaks are
          content: a description written as a list of chapters collapses into
          one run-on paragraph without it. */}
      <RichText
        text={text}
        durationMs={durationMs}
        onSeek={onSeek}
        className={`block whitespace-pre-wrap text-sm leading-relaxed text-mo-body ${
          open ? "" : "line-clamp-4"
        }`}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 text-sm font-semibold text-mo-cyan underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  )
}
