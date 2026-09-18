/**
 * Class strings shared across Know It screens, all in the Momentum vocabulary.
 *
 * Cyan is the interactive colour and carries small text; the ember gradient
 * is reserved for THE primary action of a screen (`mo-btn-primary`, which
 * applies the ≥18.66px bold label rule itself); purple marks "mine".
 */

export const CARD = "rounded-mo border border-mo bg-mo-surface p-4 shadow-mo sm:p-5"

/** A secondary action: outlined pill, cyan label. */
export const PILL_ACTION =
  "inline-flex items-center gap-1.5 rounded-mo-pill border border-mo-strong px-3 py-1.5 text-sm font-semibold " +
  "text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:cursor-not-allowed disabled:opacity-50"

/** A quiet action: no border, body-coloured until hovered. */
export const GHOST_ACTION =
  "inline-flex items-center gap-1.5 rounded-mo-pill px-2.5 py-1.5 text-sm font-semibold text-mo-body " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink disabled:cursor-not-allowed disabled:opacity-50"

/** A pressed toggle (following, saved, voted). */
export const PILL_ACTION_ON =
  "inline-flex items-center gap-1.5 rounded-mo-pill border border-mo px-3 py-1.5 text-sm font-semibold " +
  "text-mo-ink bg-mo-raised transition-colors duration-150 ease-mo hover:bg-mo-overlay disabled:cursor-not-allowed disabled:opacity-50"

export const PRIMARY = "mo-btn-primary"

export const H1 = "font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink"
export const H2 = "font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink"

export const INPUT =
  "w-full rounded-mo-sm border border-mo bg-mo-sunken px-3 py-2 text-sm text-mo-ink placeholder:text-mo-body " +
  "focus-visible:border-mo-focus"

export const CHIP =
  "inline-flex max-w-full items-center truncate rounded-mo-pill border border-mo bg-mo-raised px-2.5 py-0.5 text-xs font-semibold text-mo-ink"
