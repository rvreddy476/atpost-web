"use client"

/**
 * What this zone draws instead of the player's transport: a playhead that is
 * always visible, a speaker that is always visible, and the two affordances a
 * full-screen short needs that a feed card does not.
 *
 * ── Everything here sits over VIDEO, which can be white ───────────────────
 * The same constraint Reel.tsx is built around and the same answer: white
 * glyphs inside a scrim or on an opaque plate, never a hairline and never a
 * tinted label. The palette's contrast measurements are all against Momentum's
 * violet-black ground and none of them apply to a control on a frame of
 * somebody's white kitchen.
 */

import { Pause, Play, Volume2, VolumeX } from "lucide-react"
import { muteLabel, positionLabel, progressFraction } from "./transport"

/**
 * The playhead. Slim, at the very bottom, and draggable.
 *
 * ── It is a real slider, not a div with a click handler ───────────────────
 * `role="slider"` with the three `aria-value*` attributes is what makes the
 * position readable and the arrows meaningful to anyone who moves to it. The
 * alternative — an `<input type="range">` — cannot be styled into a 3px line
 * with a hit area four times its height in any engine without vendor
 * pseudo-elements, and the hit area is the requirement: a 3px target is not
 * touchable, so the element is 16px tall with 3px of paint in it.
 *
 * ── Pointer capture, and the drag off the end ─────────────────────────────
 * The element captures the pointer on the way down, so a drag that leaves the
 * bar — which is most drags, because the bar is 3px tall — keeps arriving
 * here. `seekFraction` clamps, so dragging past the left edge means "the
 * beginning" rather than "stop seeking".
 */
export function ProgressBar({
  currentSeconds,
  durationSeconds,
  onSeek,
  label,
}: {
  currentSeconds: number
  durationSeconds: number
  /** A fraction in [0, 1]. */
  onSeek: (fraction: number) => void
  /** Which short this belongs to, for the accessible name. */
  label: string
}) {
  const fraction = progressFraction(currentSeconds, durationSeconds)

  /**
   * Whole seconds for the ARIA attributes, and never NaN.
   *
   * `Math.max(0, Math.round(NaN))` is NaN — neither of them rejects it — so
   * without this the slider renders `aria-valuemax="NaN"` for the whole time
   * between the element mounting and its metadata arriving, and a screen reader
   * reads that out. `progressFraction` already refuses the same input one line
   * above, which is exactly why the attributes were the one place it survived:
   * the bar LOOKED right and only the announcement was wrong.
   */
  const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

  const seekFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
  }

  const step = (delta: number) => {
    // `NaN <= 0` is FALSE, so the bare comparison this used to make let a
    // pre-metadata arrow through and handed `onSeek` a NaN fraction.
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return
    onSeek(Math.min(1, Math.max(0, (currentSeconds + delta) / durationSeconds)))
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`Seek ${label}`}
      aria-valuemin={0}
      aria-valuemax={whole(durationSeconds)}
      aria-valuenow={whole(currentSeconds)}
      // The spoken position, so a screen reader says "12 seconds of 58" rather
      // than "12". The live region elsewhere on this surface deliberately says
      // nothing about the playhead — see ./transport.ts — so this is the only
      // place the position is available, and it is available on demand.
      aria-valuetext={positionLabel(currentSeconds, durationSeconds)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        seekFromEvent(event)
      }}
      onPointerMove={(event) => {
        // `buttons` and not a boolean of our own: a pointer that was released
        // outside the window never sends an up, and a drag flag set from
        // `pointerdown` would leave the bar following the mouse for ever.
        if (event.buttons > 0) seekFromEvent(event)
      }}
      onKeyDown={(event) => {
        // Five seconds, which is the step the player uses for the same keys.
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          event.stopPropagation()
          step(-5)
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          event.stopPropagation()
          step(5)
        }
      }}
      // 16px of target around 3px of paint. The scrim above it is what makes a
      // white line legible over a bright frame.
      className="group absolute inset-x-0 bottom-0 z-20 flex h-4 cursor-pointer items-end outline-none"
    >
      <div className="relative h-[3px] w-full bg-white/25 transition-[height] duration-150 ease-mo group-hover:h-[5px] group-focus-visible:h-[5px]">
        <div
          className="absolute inset-y-0 left-0 bg-white"
          style={{ width: `${fraction * 100}%` }}
        />
        {/* The handle appears under the pointer and under keyboard focus, and
            is `aria-hidden` because the slider above it is the control. */}
        <span
          aria-hidden
          className="absolute top-1/2 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-mo-sm group-hover:block group-focus-visible:block"
          style={{ left: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}

/**
 * The speaker. Top-right, on its own, and nowhere else ever.
 *
 * One place is the whole requirement: it is the control people reach for most
 * on this surface and the one that must never move. It is opaque rather than a
 * bare glyph because it sits at the top of the picture where there is no scrim
 * to carry the contrast.
 */
export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      // The ACTION, not the state — `aria-pressed` carries the state, which is
      // what it is for. "Muted" as a name leaves you guessing what pressing it
      // does.
      aria-label={muteLabel(muted)}
      className="absolute right-3 top-14 z-20 inline-flex h-11 w-11 items-center justify-center rounded-mo-pill bg-black/55 text-white transition-colors duration-150 ease-mo hover:bg-black/75"
    >
      {muted ? (
        <VolumeX aria-hidden className="h-5 w-5" />
      ) : (
        <Volume2 aria-hidden className="h-5 w-5" />
      )}
    </button>
  )
}

/**
 * The paused affordance.
 *
 * ── A centre glyph here, where the feed player deliberately has none ──────
 * `MomentumVideo` removed its centre button on purpose: a 56px disc in the
 * middle of a feed video sits where a person is trying to look and does the
 * same job as pressing the picture behind it. That argument is about a control
 * that is visible WHILE PLAYING. This one is drawn only while paused, which is
 * the opposite case — the picture is frozen, nothing is happening, and the one
 * thing a person needs to know is that the video is stopped rather than
 * broken. A frozen frame with no mark on it is indistinguishable from a video
 * that failed to start, which is the single loudest complaint this surface has
 * ever had.
 *
 * It is `aria-hidden` and not a button: the whole picture behind it is already
 * the play control, and a second one on top would be two tab stops for one
 * act.
 */
export function PausedMark({ paused }: { paused: boolean }) {
  if (!paused) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white"
    >
      <Play className="h-8 w-8 fill-current" />
    </span>
  )
}

/**
 * The heart a double-tap leaves behind.
 *
 * ── It does not exist under reduced motion ────────────────────────────────
 * Not "a gentler heart": none. The whole of this mark is an animation — it has
 * no state to convey that the rail's own heart does not already carry — so
 * under `prefers-reduced-motion` the caller passes `false` and the like is
 * announced in the live region instead. That is the accessible reading of the
 * setting: the information survives, the motion does not.
 */
export function LikeBurst({ shown }: { shown: boolean }) {
  if (!shown) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 animate-ping text-mo-bad"
    >
      <Heart />
    </span>
  )
}

/** The glyph, at the size the burst wants, in one place. */
function Heart() {
  return (
    <svg viewBox="0 0 24 24" className="h-24 w-24 fill-current drop-shadow" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-8.4C.7 9.3 2.2 5.7 5.4 4.8 7.5 4.2 9.6 5 12 7.4 14.4 5 16.5 4.2 18.6 4.8c3.2.9 4.7 4.5 3 7.8C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}

/**
 * The play/pause state, as a control for people who cannot press a picture.
 *
 * The picture itself toggles playback — that is the gesture everybody knows —
 * but a picture is not a button, cannot be tabbed to, and announces nothing.
 * This is the same act as a real control, in the bottom-left corner where a
 * transport belongs, so the keyboard and a screen reader have a way in that
 * does not depend on knowing the gesture exists.
 */
export function PlayPauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? "Play" : "Pause"}
      className="absolute bottom-6 left-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-mo-pill bg-black/55 text-white transition-colors duration-150 ease-mo hover:bg-black/75"
    >
      {paused ? (
        <Play aria-hidden className="h-5 w-5 fill-current" />
      ) : (
        <Pause aria-hidden className="h-5 w-5 fill-current" />
      )}
    </button>
  )
}
