/**
 * One column or two, decided from the space the page was actually given.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS MEASURED AND NOT A `lg:` BREAKPOINT
 *
 * A media query asks about the VIEWPORT. This page needs to know about its
 * CONTAINER, and on this surface the two do not track each other.
 *
 * @momentum/chrome's AppFrame puts every zone's content in a fixed centre
 * track — `minmax(0, 600px)`, with a 268px left rail and a 300px right rail
 * beside it — and caps `<main>` at 600px inside that. A 1440px viewport
 * therefore hands this page 600px, and `lg:grid-cols-2` would draw a
 * recommendations rail by squeezing a 16:9 player down to about 360px wide.
 * The picture is the thing this page exists to show; nothing may take half of
 * it away because the WINDOW is wide.
 *
 * Widening that track is the application shell's decision and not this page's.
 * So this measures what it was handed and lights the second column up the
 * moment there is room for it — which is the behaviour that is correct whether
 * the frame stays at 600px or is widened tomorrow, with no change here.
 *
 * The pure half is this file. ./useColumns.ts is the ResizeObserver.
 */

/**
 * The rail's own width when it is drawn.
 *
 * 340px, matching the order of the thumbnail rail every long-video site uses
 * (YouTube's is 402 at its widest, 300 at its narrowest). Each row is a 16:9
 * poster about 168px wide with the title beside it, which is legible at this
 * size and stops being so much below it.
 */
export const RAIL_WIDTH_PX = 340

/**
 * The narrowest the player column may become before the rail is dropped.
 *
 * 560px. Below this the player is smaller than the single-column player would
 * have been at the same container width, which makes the two-column layout a
 * straight downgrade rather than a trade.
 */
export const MIN_PLAYER_COLUMN_PX = 560

/** The gap between the two columns, in the same units. */
export const COLUMN_GAP_PX = 24

/**
 * The container width at which the second column starts paying for itself.
 *
 * Derived rather than typed, so the three numbers above cannot drift out of
 * agreement with it: 560 + 24 + 340 = 924.
 */
export const SPLIT_MIN_WIDTH_PX = MIN_PLAYER_COLUMN_PX + COLUMN_GAP_PX + RAIL_WIDTH_PX

export type WatchColumns = "stacked" | "split"

/**
 * How to lay the watch page out in `containerWidth` pixels.
 *
 * `0` — which is what a ResizeObserver reports before its first measurement,
 * and what the server has — is "stacked". That is the safe first paint: a
 * stacked page that widens into two columns reflows once, while a split page
 * that collapses has already drawn a rail beside a 200px player.
 */
export function watchColumns(containerWidth: number): WatchColumns {
  if (!Number.isFinite(containerWidth)) return "stacked"
  return containerWidth >= SPLIT_MIN_WIDTH_PX ? "split" : "stacked"
}

/**
 * The grid template for the outer element.
 *
 * `minmax(0, 1fr)` for the player column and not `1fr`: a grid item defaults to
 * `min-width: auto`, which refuses to shrink below its content, and one wide
 * child — a long unbroken title, a chapter thumbnail — would push the rail off
 * the page instead of wrapping. The same reason AppFrame's own tracks are
 * `minmax(0, …)`.
 */
export function gridTemplateColumns(columns: WatchColumns): string {
  return columns === "split" ? `minmax(0, 1fr) ${RAIL_WIDTH_PX}px` : "minmax(0, 1fr)"
}
