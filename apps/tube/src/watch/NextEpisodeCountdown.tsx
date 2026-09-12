"use client"

/**
 * The card that says the next episode is about to start, and lets somebody
 * stop it.
 *
 * ── Centred, and it obeys the overlay rule ────────────────────────────────
 * Every overlay on this player (see the header of ./Overlays.tsx) keeps its
 * container `pointer-events-none` and turns events back on only for the card
 * itself, so the transport, the speaker and "Full video" stay reachable
 * around it. Centred rather than cornered because, unlike a card or an end
 * screen, this one is about to DO something on its own, and a thing about to
 * act without being asked should be in the middle of the picture where it
 * cannot be missed.
 *
 * ── Not a dialog, no focus trap ───────────────────────────────────────────
 * Same argument as the other overlays: a modal over a player steals the
 * keyboard from the transport. It is `role="status"` with `aria-live=
 * "polite"` instead, so a screen reader hears "Up next, episode 3, in ten
 * seconds" once, and the controls are ordinary buttons in the tab order.
 *
 * ── The ring is CSS, and it stands still under reduced motion ─────────────
 * The stroke offset is set from `secondsLeft` and the transition draws the
 * second in between, so the ring moves smoothly on a one-second clock. Under
 * `motion-reduce` the transition is dropped and the ring steps; the number in
 * the middle is the real information either way.
 */

import { useId } from "react"
import { SkipForward, X } from "lucide-react"
import { AUTOPLAY_NEXT_SECONDS, countdownProgress, type AutoplayTarget } from "./autoplayNext"

export interface NextEpisodeCountdownProps {
  target: AutoplayTarget
  secondsLeft: number
  autoplayNext: boolean
  onAutoplayNextChange: (next: boolean) => void
  onPlayNow: () => void
  onCancel: () => void
}

const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

export function NextEpisodeCountdown({
  target,
  secondsLeft,
  autoplayNext,
  onAutoplayNextChange,
  onPlayNow,
  onCancel,
}: NextEpisodeCountdownProps) {
  const title = target.title?.trim() || ""
  const offset = RING_C * (1 - countdownProgress(secondsLeft))

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-sm rounded-mo bg-black/85 p-4 text-white shadow-mo backdrop-blur-sm"
      >
        <div className="flex items-center gap-4">
          <div className="relative h-12 w-12 shrink-0" aria-hidden>
            <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
              <circle cx="22" cy="22" r={RING_R} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/20" />
              <circle
                cx="22"
                cy="22"
                r={RING_R}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={offset}
                className="text-mo-cyan transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
              {Math.max(0, Math.min(AUTOPLAY_NEXT_SECONDS, secondsLeft))}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-mo-eyebrow text-white/70">
              Up next · Episode {target.episode_num}
            </p>
            {title && (
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
            )}
            <p className="sr-only">
              Starting in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPlayNow}
            className="inline-flex items-center gap-1.5 rounded-mo-pill bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition-colors duration-150 ease-mo hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
          >
            <SkipForward aria-hidden className="h-4 w-4" />
            Play now
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-mo-pill border border-white/40 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors duration-150 ease-mo hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X aria-hidden className="h-4 w-4" />
            Cancel
          </button>
        </div>

        <div className="mt-3 border-t border-white/15 pt-3">
          <AutoplayNextSwitch checked={autoplayNext} onChange={onAutoplayNextChange} onDark />
        </div>
      </div>
    </div>
  )
}

/**
 * The "Autoplay next episode" switch.
 *
 * A real `<input type="checkbox" role="switch">` under a drawn track, for the
 * reason ../studio/StudioControls.tsx gives for its own: the native input is
 * what makes the label click, the space key, focus order and every assistive
 * technology work without a line of JavaScript. Not imported from there
 * because the studio's control is drawn on a light surface and this one has
 * to sit on black over a video; the two share a shape, not a skin.
 *
 * Drawn twice on the page, on the countdown card and in the series rail's
 * header, and it is the same preference in both places.
 */
export function AutoplayNextSwitch({
  checked,
  onChange,
  onDark = false,
  compact = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Over the player, on a black card. */
  onDark?: boolean
  /** In a heading row: label smaller, no vertical padding. */
  compact?: boolean
}) {
  const id = useId()
  const labelInk = onDark ? "text-white/85" : "text-mo-body"
  const track = checked
    ? onDark
      ? "border-mo-cyan/60 bg-mo-cyan/40"
      : "border-mo-strong bg-mo-cyan/30"
    : onDark
      ? "border-white/30 bg-white/10"
      : "border-mo bg-mo-raised"
  const knob = onDark ? "bg-white" : "bg-mo-ink"
  const ring = onDark ? "peer-focus-visible:ring-white" : "peer-focus-visible:ring-mo"

  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? "" : "py-1"}`}>
      <label
        htmlFor={id}
        className={`min-w-0 cursor-pointer ${compact ? "text-xs" : "text-[13px]"} ${labelInk}`}
      >
        Autoplay next episode
      </label>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className={`h-5 w-9 rounded-mo-pill border transition-colors duration-150 ease-mo peer-focus-visible:ring-2 ${ring} ${track}`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1 h-3 w-3 rounded-mo-pill transition-all duration-150 ease-mo ${knob} ${
            checked ? "left-5" : "left-1"
          }`}
        />
      </span>
    </div>
  )
}
