/**
 * What the chip rail selects, and what that means on the wire.
 *
 * Pure — no React, no network — for the same reason ../tube/video.ts is: the
 * translation from "which chip is pressed" to "which parameters go on the
 * request" is the part that fails SILENTLY. An ignored parameter is a filter
 * that did nothing; `following_only` sent by accident is an empty page with
 * no explanation; a category slug the taxonomy does not carry is a
 * `400 INVALID_CATEGORY`. None of those throw, and all of them are arithmetic
 * that can be asserted without a browser.
 *
 * It is also split from ./TubeCategories.tsx because that file is
 * `"use client"`, and this way the rules can be imported anywhere — including
 * by a server component — without dragging a client boundary along.
 */

import type { TubeCategory } from "@/tube/channelApi"

/** What the grid is currently asking for. */
export type TubeChip = { kind: "all" } | { kind: "following" } | { kind: "category"; id: string }

export const ALL_CHIP: TubeChip = { kind: "all" }

/** The chip's stable key, for React and for the current-mark. */
export function chipKey(chip: TubeChip): string {
  return chip.kind === "category" ? `category:${chip.id}` : chip.kind
}

/**
 * The chip as feed arguments.
 *
 * Exactly one narrowing at a time, and never both: the endpoint accepts
 * `category` and `following_only` together, but the rail is a single-select
 * and offering a state the rail cannot express would be a filter nobody could
 * turn off from the page they are on.
 */
export function chipQuery(chip: TubeChip): { category?: string; followingOnly?: boolean } {
  if (chip.kind === "following") return { followingOnly: true }
  if (chip.kind === "category") return { category: chip.id }
  return {}
}

/**
 * The word on the chip — and the word the empty state uses.
 *
 * A category whose slug is not in the taxonomy falls back to the slug itself
 * rather than to "Unknown". That case arrives when the server's taxonomy call
 * failed but a chip was somehow already selected, and a raw slug is a worse
 * label and a better clue.
 */
export function chipLabel(chip: TubeChip, categories: readonly TubeCategory[]): string {
  if (chip.kind === "all") return "All"
  if (chip.kind === "following") return "Following"
  return categories.find((category) => category.id === chip.id)?.label ?? chip.id
}
